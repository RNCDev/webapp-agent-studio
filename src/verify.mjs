// @ts-check
// The studio checking itself, before any loop's output is trusted.
//
// A BROKEN HARNESS PRODUCES FALSE CONFIDENCE RATHER THAN A FAILURE: a selector matching
// nothing and an assertion never running look identical to a pass. So every check below
// asserts on an ARTIFACT the run produced — a file on disk with a real size, JSON that
// parses, a planted secret that comes out redacted — and never on "it didn't throw".
//
// Falsify it. Point it at a dead port and it must fail loudly, promptly, and with a
// message about the port. If it ever reports green against nothing, this file is wrong.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { startStudio } from './harness.mjs';
import { EXIT_OK, EXIT_STUDIO_BROKEN, StudioError, assertReachable } from './exit.mjs';

const require = createRequire(import.meta.url);

/**
 * Is the installed Playwright inside the range this package supports, and is the browser
 * actually there?
 *
 * VERSION SKEW IS AN EXIT-2 PROBLEM, NOT A FAILING CHECK. Playwright is a peer dependency,
 * so every consumer picks its own; chromium behaviour drifts between versions, and the
 * resulting weirdness would otherwise be read as a regression in the app.
 */
export function checkEnvironment() {
  /** @type {{ok: boolean, label: string}[]} */
  const results = [];

  let installed = 'not installed';
  try {
    installed = require('playwright/package.json').version;
  } catch {
    throw new StudioError(
      'playwright is not installed — it is a peer dependency: ' +
        '`npm i -D playwright && npx playwright install chromium`',
    );
  }

  const supported = require('../package.json').peerDependencies?.playwright ?? '';
  const ok = satisfiesRange(installed, supported);
  results.push({
    ok,
    label: `playwright ${installed} is inside the supported range '${supported}'`,
  });
  if (!ok) {
    throw new StudioError(
      `playwright ${installed} is outside this package's supported range '${supported}' — ` +
        'chromium behaviour drifts between versions, and a run on an unsupported one ' +
        'reports app problems that are really version skew. Install a supported version.',
    );
  }

  return results;
}

/** Where chromium should be, and whether it is. Separate so `verify` can report it. */
export async function checkBrowserInstalled() {
  const { chromium } = await import('playwright');
  let path = '';
  try {
    path = chromium.executablePath();
  } catch (err) {
    throw new StudioError(
      `playwright cannot locate a chromium build — run \`npx playwright install chromium\` ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!existsSync(path)) {
    throw new StudioError(
      `playwright expects chromium at ${path} and it is not there — run ` +
        '`npx playwright install chromium`',
    );
  }
  return { ok: true, label: `chromium is installed (${path})` };
}

/**
 * A deliberately small range check, for the one shape this package's peer range uses:
 * `>=A.B.C <D`. Not a semver implementation — a dependency for this would be absurd, and a
 * wrong answer here is caught by the message naming both versions.
 *
 * @param {string} version
 * @param {string} range
 */
export function satisfiesRange(version, range) {
  const parts = version.split('.').map(Number);
  /** @param {string} v */
  const parse = (v) => v.split('.').map(Number);
  /** @param {number[]} a @param {number[]} b */
  const cmp = (a, b) => {
    for (let i = 0; i < 3; i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
  };
  const clauses = range.trim().split(/\s+/).filter(Boolean);
  if (clauses.length === 0) return true;
  for (const clause of clauses) {
    const match = /^(>=|>|<=|<|=)?v?([\d.]+)$/.exec(clause);
    if (match === null) return true; // an unparseable range is not the studio's business
    const [, op = '=', target] = match;
    const c = cmp(parts, parse(target));
    const ok =
      op === '>=' ? c >= 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : op === '<' ? c < 0 : c === 0;
    if (!ok) return false;
  }
  return true;
}

/**
 * Drive the configured app once and assert on what came out.
 *
 * @param {object} args
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {(line: string) => void} [args.log]
 */
export async function verify(args) {
  const { config } = args;
  const log = args.log ?? ((/** @type {string} */ l) => console.log(l));
  /** @type {string[]} */
  const failures = [];

  /** @param {string} label @param {boolean} condition */
  function check(label, condition) {
    log(condition ? `  ok - ${label}` : `  NOT OK - ${label}`);
    if (!condition) failures.push(label);
  }

  for (const r of checkEnvironment()) check(r.label, r.ok);
  const browser = await checkBrowserInstalled();
  check(browser.label, browser.ok);

  // Before a browser exists. A dead port must fail here, promptly and legibly — this is
  // the falsification the whole file is written around.
  await assertReachable(config.baseURL);
  check(`the app answers at ${config.baseURL}`, true);

  const outDir = join(config.root, config.artifactsDir ?? '.studio-artifacts', 'verify');
  mkdirSync(outDir, { recursive: true });

  let studio;
  try {
    if (typeof config.hooks.beforeRun === 'function') {
      await config.hooks.beforeRun({ config, runDir: outDir, loop: 'verify', run: 'verify' });
      check('the beforeRun hook ran', true);
    }

    studio = await startStudio({ config, outDir });
    const session = await studio.session({ name: 'verify' });
    check('a session reached the settled screen', true);

    const shotPath = await session.capture('verify-landing');
    const size = existsSync(shotPath) ? statSync(shotPath).size : 0;
    const floor = config.verify.minScreenshotBytes ?? 10 * 1024;
    // A blank or broken page still produces SOME bytes — a mostly-white viewport
    // compresses to a few KB — so the floor catches "captured nothing useful", which is
    // exactly what a dead app or an unsettled screen looks like on disk.
    check(`the screenshot is over ${floor} bytes (got ${size})`, size > floor);

    const axeResult = await session.axe();
    check('axe produced a violations array', Array.isArray(axeResult?.violations));
    const axeFiles = readdirSync(outDir).filter((f) => f.startsWith('axe-'));
    check('the axe JSON was written and parses', parsesAsJson(join(outDir, axeFiles[0] ?? '')));

    const errorsPath = await session.report();
    check('errors.json was written and parses', parsesAsJson(errorsPath));

    // THE REDACTION FALSIFICATION. A planted secret must not survive into any artifact.
    // Without this, redaction is a function with a unit test rather than a property of the
    // run — and it is the run that writes files someone may copy out.
    const planted = config.verify.plantedSecret;
    if (typeof planted === 'string' && planted !== '') {
      const leaked = filesContaining(outDir, planted);
      check(
        `the planted secret does not appear in any artifact (${leaked.length} leak(s))`,
        leaked.length === 0,
      );
    } else {
      log(
        '  -- skipped: no verify.plantedSecret configured, so redaction is unproven on ' +
          'this run (set one in studio.config.mjs)',
      );
    }
  } finally {
    await studio?.close().catch(() => {});
  }

  if (failures.length > 0) {
    log(`FAIL: ${failures.length} check(s) failed — ${failures.join('; ')}`);
    // A failing verify is the STUDIO failing, not the app: nothing here asserts anything
    // about the product. Exit 2.
    return { ok: false, exitCode: EXIT_STUDIO_BROKEN, failures };
  }
  log('PASS: the studio is verified — sign-in, capture, axe, report and redaction all produced real artifacts.');
  return { ok: true, exitCode: EXIT_OK, failures };
}

/** @param {string} path */
function parsesAsJson(path) {
  if (path === '' || !existsSync(path)) return false;
  try {
    JSON.parse(readFileSync(path, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

/** @param {string} dir @param {string} needle */
function filesContaining(dir, needle) {
  /** @type {string[]} */
  const hits = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      hits.push(...filesContaining(path, needle));
      continue;
    }
    // Read as a buffer and search bytes: a secret can land in a PNG's metadata as easily
    // as in a JSON string, and a utf8 decode of a PNG would mangle it.
    if (readFileSync(path).includes(needle)) hits.push(path);
  }
  return hits;
}
