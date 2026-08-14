// @ts-check
// What `init` and `new-loop` write.
//
// EACH OF THESE REMOVES A PLACE WHERE A NEW PROJECT OR A FRESH AGENT SESSION WOULD
// OTHERWISE HAVE TO ALREADY KNOW SOMETHING. The config is annotated because the field list
// is the documentation people actually read; the pointer block goes into CLAUDE.md because
// an agent session that does not know the studio exists will not use it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What framework this project is, read off its package.json — so `init` can pre-fill the
 * baseURL, the dev command, and nothing else. Remix is checked before Vite because a Remix
 * app depends on Vite too, and "Vite on port 5173" would be the wrong answer for it.
 *
 * @param {string} root
 * @returns {{framework: string, label: string, baseURL: string, start: string} | undefined}
 */
export function detectFramework(root) {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return undefined;
  /** @type {Record<string, string>} */
  let deps;
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return undefined;
  }
  const has = (/** @type {string} */ name) => deps[name] !== undefined;
  if (has('next')) {
    return { framework: 'next', label: 'Next.js', baseURL: 'http://localhost:3000', start: 'npm run dev' };
  }
  if (Object.keys(deps).some((d) => d.startsWith('@remix-run/'))) {
    return { framework: 'remix', label: 'Remix', baseURL: 'http://localhost:3000', start: 'npm run dev' };
  }
  if (has('vite')) {
    return { framework: 'vite', label: 'Vite', baseURL: 'http://localhost:5173', start: 'npm run dev' };
  }
  return undefined;
}

/** @param {{name: string, baseURL: string, start?: string}} args */
export function configTemplate(args) {
  return `// The studio's adapter for this project — everything project-shaped lives here.
// Every field is present and commented; most are already defaulted. Delete what you do
// not need. Only \`baseURL\` is required.
//
// Docs: the package README, and AGENT-GUIDE.md for driving this from an agent session.

import { defineConfig, env } from 'webapp-agent-studio';
import { formAuthProvider } from 'webapp-agent-studio/auth/form';

export default defineConfig({
  name: '${args.name}',

  // Where the app is. A run fails fast and legibly if nothing answers here.
  baseURL: process.env.STUDIO_BASE_URL ?? '${args.baseURL}',

  // How to boot the app when nothing answers at baseURL. When it is already running, the
  // studio uses that and starts nothing. Also takes { command, readyTimeout, cwd }.
  ${args.start === undefined ? `// start: 'npm run dev',` : `start: '${args.start}',`}

  // The API, if project code (hooks, probes) calls it directly. Point it at the same
  // origin the browser uses, so it exercises the path the browser exercises.
  // apiBase: 'http://localhost:5173/v1',

  // A file of environment variables to load before the run. Uncomment it if signing in
  // needs a credential you keep in .env — that is what lets you run
  // \`npx webapp-agent-studio verify\` directly instead of \`node --env-file=.env ...\`.
  // Note that Node never lets a file overwrite a variable the environment ALREADY has, so
  // a stale value inherited from your shell quietly wins; the CLI names any it finds.
  // envFile: '.env',

  // Where loop directories live.
  loopsDir: 'loops',

  // Scratch space for \`verify\`. Add it to .gitignore (init did that for you).
  artifactsDir: '.studio-artifacts',

  viewport: { width: 1440, height: 900 },

  // THE SETTLE WAIT, AND IT IS THE FIELD MOST WORTH GETTING RIGHT. A single-page app
  // paints its signed-out shell first and only moves once an async session restore
  // resolves; page.goto() returns well before that. Name a selector that exists ONLY
  // after the app has settled — never one that is also on the pre-settle screen, or every
  // capture catches the flash. A function is allowed here for anything more involved.
  settle: 'body',
  settleTimeout: 10_000,

  // How a session signs in. \`null\` for a public app — captures, error collection and axe
  // all work with no auth at all. Other adapters, each at webapp-agent-studio/auth/<name>:
  // betterAuthProvider, nextAuthProvider, supabaseAuthProvider, clerkAuthProvider,
  // tokenAuthProvider, customAuthProvider.
  auth: formAuthProvider({
    emailLabel: 'Email',
    passwordLabel: 'Password',
    submitName: 'Sign in',
  }),

  // Named identities. Each secret is an env() getter that throws AT THE POINT OF USE,
  // naming the variable — so a loop that never signs in as admin never needs the admin
  // password set.
  identities: {
    // member: {
    //   email: env('STUDIO_TEST_EMAIL', 'add it to .env.local'),
    //   password: env('STUDIO_TEST_PASSWORD', 'add it next to STUDIO_TEST_EMAIL'),
    // },
  },

  // Prefix for disposable accounts a run creates, so a purge can find them.
  emailPrefix: 'zz-e2e',

  redact: {
    // Shipped patterns: long-token, jwt, auth-header, vendor-key, password-field.
    presets: ['long-token', 'jwt', 'auth-header', 'vendor-key'],
    // Project-shaped secrets. Must carry the g flag.
    patterns: [],
    // Painted over BEFORE the pixel is taken, so a live secret never enters the file.
    maskSelectors: ['input[type="password"]'],
  },

  // Project code, called by the studio. All optional, all async.
  hooks: {
    // beforeRun: async ({ config }) => { /* provision fixtures */ },
    // afterRun: async ({ config }) => {},
    // purge: async ({ config }) => { /* delete what runs created */ },
  },

  verify: {
    // A blank page still produces some bytes; this floor catches "captured nothing".
    minScreenshotBytes: 10 * 1024,
    // Plant a fake secret somewhere the app renders it, and verify proves redaction end
    // to end rather than trusting a unit test.
    // plantedSecret: 'fake-secret-do-not-use-a-real-one',
  },

  history: {
    // Old runs are pruned to this many. Findings and directives survive pruning.
    keepRuns: 10,
  },
});
`;
}

export function loopTemplate(/** @type {string} */ name) {
  return `// Loop ${name}.
//
// A loop is a question. Runs are iterations of the SAME question — mint a new loop number
// only when the task or the eval changes, and point the new loop's \`supersedes\` at this
// one when it replaces it.

import { defineLoop } from 'webapp-agent-studio';

export default defineLoop({
  task: 'TODO: one sentence — what this drives, and what it is watching for',

  // The session every check shares. \`null\` opens none; a check can always open more with
  // studio.session().
  session: { identity: undefined, colorScheme: 'light' },

  // Optional: runs once before the checks, and puts shared state on ctx.
  // setup: async ({ page, ctx }) => { ctx.data = await page.evaluate(() => 1); },

  eval: {
    checks: [
      {
        name: 'todo-rename-me',
        // A check RETURNS A VERDICT. Returning nothing records \`unknown\`, never \`pass\` —
        // a check that quietly did nothing must not read as a success.
        run: async ({ page, capture }) => {
          await capture('landing');
          const title = await page.title();
          if (title === '') {
            return { status: 'fail', detail: 'the page has no title' };
          }
          return { status: 'pass', detail: \`title: \${title}\` };
        },
      },
    ],

    // Optional budgets, scored as checks so they land in the tally and the diff.
    // axe: { maxViolations: 0 },
    // errorBudget: 0,

    // Judged by a reader, not a program. Recorded as \`unknown\` until someone files a
    // verdict with \`judge\`; name the evidence so the reader opens the right image.
    judgments: [
      // { name: 'looks-right', instruction: 'Does the landing screen read clearly?',
      //   artifacts: ['01-landing.png'] },
    ],
  },

  remediation: { mode: 'human' },
  // supersedes: '001-old-loop',
});
`;
}

export function directivesTemplate(/** @type {string} */ name) {
  return `# Directives — ${name}

After each run: read the report, decide what to do, and write it here. One entry per run.
End a line with the finding slugs it targets, in backticks, and the next run's report can
draw the line from directive to finding to verified-fixed by itself.

Advance the finding when you write the directive:

    webapp-agent-studio finding ${name} <slug> --status fix-directed --note "..."

## Run 001

_Nothing directed yet._
`;
}

/**
 * The block appended to CLAUDE.md / AGENTS.md.
 * @param {string} name @param {{loopsDir?: string}} [config]
 */
export function pointerBlock(name, config = {}) {
  const loopsDir = (config.loopsDir ?? 'loops').replace(/\/+$/, '');
  return `
## Driving the app in a browser — webapp-agent-studio

This project has a browser studio. It drives the real app, writes screenshots and error
logs to disk, and keeps a record of what was found and whether it got fixed. Use it to
check that a change actually works in the app, not only in the tests.

    npm run studio:verify              # is the studio itself working?
    npm run studio:run <loop>          # run a loop
    npm run studio:status              # what is open across all loops

Artifacts land in \`${loopsDir}/<loop>/runs/<NNN>/\`: \`report.html\` (start here),
\`results.json\`, \`errors.json\`, and the screenshots. \`runs/latest.json\` names the newest
run, so nothing has to compute it. Exit codes: 0 green, 1 checks failed, 2 the studio
could not run.

Full instructions for an agent session: \`node_modules/webapp-agent-studio/AGENT-GUIDE.md\`.
Config for ${name}: \`studio.config.mjs\`.
`;
}

/**
 * Append a block to a file if it is not already there.
 * @param {string} path @param {string} block @param {string} marker
 * @param {{dryRun?: boolean}} [options]
 */
export function appendOnce(path, block, marker, options = {}) {
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current.includes(marker)) return 'already there';
    if (options.dryRun !== true) writeFileSync(path, `${current.trimEnd()}\n${block}`);
    return 'appended';
  }
  if (options.dryRun !== true) writeFileSync(path, block.trimStart());
  return 'created';
}

/**
 * The .gitignore lines for a config's ACTUAL layout.
 *
 * These must be derived, never assumed. `init` runs before anyone has customised
 * `loopsDir`, so a hardcoded `loops/*​/runs/` silently leaves the run artifacts of a
 * project that moved its loops untracked-but-not-ignored — which means screenshots of a
 * signed-in application sitting in `git status` waiting to be committed by accident. That
 * is the same harm "mask before the pixel" exists to prevent, arriving by a different
 * door, so `init` is re-runnable and reconciles these against the config as it now stands.
 *
 * @param {{loopsDir?: string, artifactsDir?: string}} [config]
 */
export function ignoreLinesFor(config = {}) {
  const { loopsDir = 'loops', artifactsDir = '.studio-artifacts' } = config;
  /** @param {string} p */
  const tidy = (p) => p.replace(/^\.\//, '').replace(/\/+$/, '');
  return [`${tidy(loopsDir)}/*/runs/`, `${tidy(artifactsDir)}/`];
}

/**
 * Add lines to .gitignore that are not in it.
 * @param {string} root @param {string[]} lines @param {{dryRun?: boolean}} [options]
 */
export function ensureGitignore(root, lines, options = {}) {
  const path = join(root, '.gitignore');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const missing = lines.filter((l) => !current.split(/\r?\n/).includes(l));
  if (missing.length === 0 || options.dryRun === true) return missing;
  writeFileSync(
    path,
    `${current.trimEnd()}\n\n# webapp-agent-studio run artifacts — screenshots of a signed-in app\n${missing.join('\n')}\n`,
  );
  return missing;
}

/**
 * Add the studio scripts to package.json without disturbing what is there.
 *
 * The scripts stay plain — no `node --env-file=...` wrapper — because `envFile` in
 * studio.config.mjs is what supplies credentials now, and a script that hardcoded a path
 * into node_modules would break the moment the package moved.
 *
 * @param {string} root @param {{dryRun?: boolean}} [options]
 */
export function ensureScripts(root, options = {}) {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return [];
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.scripts ??= {};
  /** @type {string[]} */
  const added = [];
  const wanted = {
    'studio:verify': 'webapp-agent-studio verify',
    'studio:run': 'webapp-agent-studio run',
    'studio:status': 'webapp-agent-studio status',
  };
  for (const [key, value] of Object.entries(wanted)) {
    if (pkg.scripts[key] === undefined) {
      pkg.scripts[key] = value;
      added.push(key);
    }
  }
  if (added.length > 0 && options.dryRun !== true) {
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return added;
}

/** @param {string} dir */
export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}
