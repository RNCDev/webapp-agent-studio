// @ts-check
// ONE browser, N sessions.
//
// A context gives the same isolation a second browser process would — its own cookies,
// storage, and color scheme — for roughly two seconds less per session. A loop driving
// four identities used to pay four browser launches; it now pays one.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createSequence, collectErrors } from './errors.mjs';
import { createSession, ensureDir } from './session.mjs';
import { identityFor } from './config.mjs';
import { waitForSettled } from './waits.mjs';

// From the resolved package file, not a CDN <script>: scans must work offline, and a
// remote script would also be a third party seeing the page under test. Read once at
// module load — every context shares the same axe build.
const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * Should the harness visit baseURL before handing over to the auth provider?
 *
 * Normally yes. But a provider that navigates itself — a token in a URL fragment, an SSO
 * callback path — has that visit cancelled out from under it, and the cancelled page load
 * is collected as a genuine failed request and scored against `errorBudget`: a failure
 * caused by the test, in a package that never filters errors. Such a provider declares
 * `navigates`, and this is where that is honoured.
 *
 * ONLY A SESSION THAT IS SIGNING IN MAY SKIP IT. A signed-out session has nothing else to
 * navigate it and would settle against about:blank — which looks like a hanging app. An
 * explicit `goto` from the caller always wins over both.
 *
 * @param {{goto?: boolean, signIn: boolean, auth?: import('./auth/provider.mjs').AuthProvider | null}} args
 */
export function shouldVisitFirst({ goto, signIn, auth }) {
  if (goto !== undefined) return goto;
  return !(signIn && auth?.navigates === true);
}

/**
 * @param {object} options
 * @param {import('./config.mjs').ResolvedConfig} options.config
 * @param {string} options.outDir where screenshots and JSON land
 * @param {boolean} [options.headed]
 * @param {boolean} [options.trace] record a Playwright trace per context
 */
export async function startStudio(options) {
  const { config, outDir, headed = config.headed, trace = false } = options;
  ensureDir(outDir);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !headed });

  const sequence = createSequence();
  /** @type {import('./errors.mjs').CollectedError[]} */
  const errors = [];
  /** @type {{name: string, path: string, seq: number, ts: string}[]} */
  const screenshots = [];
  /** @type {{file: string, violations: string[], session: string}[]} */
  const axeRuns = [];
  /** @type {import('./session.mjs').Session[]} */
  const sessions = [];
  /** @type {Map<string, unknown>} */
  const clients = new Map();

  let sessionCount = 0;

  /**
   * A new context, signed in, settled, and collecting.
   *
   * @param {object} [args]
   * @param {string} [args.identity] name of an identity in studio.config.mjs
   * @param {'light' | 'dark'} [args.colorScheme]
   * @param {string} [args.name] label for this session in errors and the report
   * @param {boolean} [args.signIn] set false for a public, signed-out session
   * @param {string} [args.storageState] path to a saved storageState to reuse
   * @param {boolean} [args.goto] navigate to baseURL before signing in. Defaults to true,
   *   except when the auth provider declares `navigates` — a provider that lands the
   *   browser itself would otherwise have this visit cancelled out from under it, and the
   *   cancelled request scored against the error budget. An explicit value always wins.
   */
  async function session(args = {}) {
    const {
      identity: identityName,
      colorScheme = 'light',
      signIn = config.auth !== null && config.auth !== undefined,
      storageState,
    } = args;
    const goto = shouldVisitFirst({ goto: args.goto, signIn, auth: config.auth });
    const name = args.name ?? identityName ?? `session-${++sessionCount}`;

    // Everything past the context creation can throw — a sign-in failure, a goto against a
    // dead port, the settle wait timing out — and NONE of it may leak what it opened. On a
    // throw here the caller never receives a session to close, so this is the only place
    // left that can clean up.
    let context;
    try {
      context = await browser.newContext({
        viewport: config.viewport,
        colorScheme,
        ...(storageState !== undefined ? { storageState } : {}),
      });
      if (trace) {
        await context.tracing.start({ screenshots: true, snapshots: true });
      }
      // Injected once per context rather than re-evaluated per axe() call. Runs at
      // document start on every navigation, so it survives the app's own routing.
      await context.addInitScript({ content: AXE_SOURCE });

      const page = await context.newPage();
      collectErrors(page, { sequence, sessionName: name, sink: errors });

      if (goto) await page.goto(config.baseURL);

      if (signIn) {
        const provider = config.auth;
        if (provider === null || provider === undefined) {
          throw new Error(
            'this session asked to sign in but studio.config.mjs sets `auth: null` — ' +
              'either configure an auth provider or pass `signIn: false`',
          );
        }
        const identity = identityFor(config, identityName);
        if (identity === undefined) {
          throw new Error(
            'this session asked to sign in but no identity is configured — add one to ' +
              '`identities` in studio.config.mjs',
          );
        }
        await provider.signIn({ page, context, identity, config });
      }

      await waitForSettled(page, config.settle, config.settleTimeout);

      const made = createSession({
        context,
        page,
        config,
        name,
        outDir,
        sequence,
        errors,
        screenshots,
        axeRuns,
      });
      sessions.push(made);
      return made;
    } catch (err) {
      if (context !== undefined && trace) {
        await context.tracing
          .stop({ path: join(outDir, `trace-${name}-failed.zip`) })
          .catch(() => {});
      }
      // Best-effort: closing a context that failed to fully start must not mask the
      // original error.
      await context?.close().catch(() => {});
      throw err;
    }
  }

  /**
   * The auth provider's HTTP client for an identity, if it has one. Cached per identity —
   * a provisioning hook and a data probe in the same run share one sign-in.
   *
   * @param {string} [identityName]
   */
  async function client(identityName) {
    const provider = config.auth;
    if (provider === null || provider === undefined || provider.client === undefined) {
      throw new Error(
        `the configured auth provider ${provider === null || provider === undefined ? '(none)' : `'${provider.kind}'`} ` +
          'exposes no HTTP client — use betterAuthProvider, or pass a `client` to ' +
          'customAuthProvider',
      );
    }
    const identity = identityFor(config, identityName);
    if (identity === undefined) throw new Error('no identity configured for a client');
    const key = identity.name;
    if (!clients.has(key)) clients.set(key, await provider.client(identity, config));
    return clients.get(key);
  }

  /**
   * @param {{keepTraces?: boolean}} [options] `keepTraces: false` stops tracing without
   *   writing the zips — how the runner discards traces after a green run.
   */
  async function close(options = {}) {
    const { keepTraces = true } = options;
    for (const s of sessions) {
      if (trace) {
        await s.context.tracing
          .stop(keepTraces ? { path: join(outDir, `trace-${s.name}.zip`) } : {})
          .catch(() => {});
      }
      await s.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }

  return {
    browser,
    session,
    client,
    close,
    sequence,
    errors,
    screenshots,
    axeRuns,
    outDir,
    config,
    /** Save a context's storage so a later run can skip the sign-in. Opt-in, off by default. */
    /** @param {import('./session.mjs').Session} s @param {string} path */
    saveStorageState: (s, path) => s.context.storageState({ path }),
  };
}

/** @typedef {Awaited<ReturnType<typeof startStudio>>} Studio */
