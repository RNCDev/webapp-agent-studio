// @ts-check
// The package driving its own fixture app, end to end, through the real CLI.
//
// NOT NAMED *.test.mjs ON PURPOSE. That naming rule is the whole of what keeps `npm test`
// free of browser launches: unit tests stay pure and fast, and this runs when asked.
//
// What it proves, in order: a green run writes real artifacts and redacts a planted
// secret; a second run diffs against the first; a failing run exits 1 and drafts a
// finding; directing that finding and fixing it produces `verified-fixed`; a judgment
// filed with `judge` leaves `unknown`; and a dead app exits 2 rather than reporting
// failing checks.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANTED_SECRET } from '../../fixture/server.mjs';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CLI = join(REPO, 'bin', 'webapp-agent-studio.mjs');

/** @type {string[]} */
const failures = [];
let checks = 0;

/** @param {string} label @param {boolean} condition @param {string} [detail] */
function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ok   - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail === '' ? '' : ` (${detail})`}`);
    failures.push(label);
  }
}

/**
 * The fixture runs in ITS OWN PROCESS.
 *
 * `spawnSync` below blocks this process's event loop for the whole of each CLI run, so a
 * server living here would accept the connection and never answer it — every command would
 * fail with the studio's own "nothing is answering" message and the run would look like a
 * dead app. The child is the fix, and it is also more honest: the app under test is always
 * a separate process in real use.
 */
async function startFixtureProcess() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(REPO, 'fixture', 'server.mjs')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`the fixture app never came up on ${url}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    url,
    close: async () => {
      child.kill('SIGKILL');
      // Wait for the port to actually free, so the dead-app step is genuinely dead.
      const gone = Date.now() + 5_000;
      for (;;) {
        try {
          await fetch(`${url}/health`, { signal: AbortSignal.timeout(200) });
        } catch {
          return;
        }
        if (Date.now() > gone) return;
        await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}

/** Ask the OS for a port, then let it go. A small race, and the alternative is a guess. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

/**
 * @param {string} cwd @param {string[]} args @param {Record<string,string>} [env]
 */
function cli(cwd, args, env = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** @param {string} dir @param {string} needle */
function filesContaining(dir, needle) {
  /** @type {string[]} */
  const hits = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) hits.push(...filesContaining(path, needle));
    else if (readFileSync(path).includes(needle)) hits.push(path);
  }
  return hits;
}

const CONFIG = (/** @type {string} */ baseURL) => `
import { defineConfig, env } from 'webapp-agent-studio';
import { formAuthProvider } from 'webapp-agent-studio/auth/form';

export default defineConfig({
  name: 'fixture',
  baseURL: '${baseURL}',
  // .app-nav exists in the DOM from the start but is hidden until sign-in resolves, so a
  // visibility wait is what distinguishes the settled screen from the flash.
  settle: '.app-nav',
  settleTimeout: 10000,
  auth: formAuthProvider(),
  identities: {
    member: { email: env('E2E_EMAIL'), password: env('E2E_PASSWORD') },
  },
  redact: { maskSelectors: ['.secret', 'input[type="password"]'] },
  verify: { plantedSecret: '${PLANTED_SECRET}' },
  history: { keepRuns: 10 },
});
`;

const GREEN_LOOP = `
import { defineLoop } from 'webapp-agent-studio';
import { waitForRows } from 'webapp-agent-studio';

export default defineLoop({
  task: 'Drive the fixture app as a member and capture every screen',
  session: { identity: 'member' },
  eval: {
    checks: [
      {
        name: 'lands-signed-in',
        run: async ({ page, capture }) => {
          await capture('landing');
          const nav = await page.locator('.app-nav').count();
          return nav === 1
            ? { status: 'pass', detail: 'the member nav is on screen' }
            : { status: 'fail', detail: 'no .app-nav after sign-in' };
        },
      },
      {
        name: 'table-has-rows',
        run: async ({ page }) => {
          await waitForRows(page, '#rows tbody tr', { count: 3 });
          const n = await page.locator('#rows tbody tr').count();
          return { status: n === 3 ? 'pass' : 'fail', detail: \`\${n} row(s)\` };
        },
      },
      {
        name: 'masks-the-secret',
        run: async ({ capture }) => {
          // requireMask asserts the selector is actually present, so a screen that
          // silently stopped rendering the secret cannot pass as "masked".
          await capture('masked', { mask: ['.secret'], requireMask: true });
          return { status: 'pass', detail: 'captured with the secret masked' };
        },
      },
      {
        name: 'attributes-an-error-to-this-check',
        run: async ({ page }) => {
          await page.evaluate(() => { console.error('fixture: error from inside a check'); });
          await page.waitForTimeout(100);
          return { status: 'pass', detail: 'fired one console error on purpose' };
        },
      },
      {
        name: 'returns-nothing-on-purpose',
        run: async () => {},
      },
    ],
    errorBudget: 10,
    judgments: [
      { name: 'reads-clearly', instruction: 'Does the signed-in screen read clearly?',
        artifacts: ['01-landing.png'] },
    ],
  },
  remediation: { mode: 'human' },
});
`;

const RED_LOOP = `
import { defineLoop } from 'webapp-agent-studio';

export default defineLoop({
  task: 'A loop with a check that fails until it is fixed',
  session: { identity: 'member' },
  eval: {
    checks: [
      {
        name: 'always-passes',
        run: async ({ capture }) => {
          await capture('red-landing');
          return { status: 'pass', detail: 'this one is fine' };
        },
      },
      {
        name: 'the-broken-one',
        run: async () => {
          if (process.env.E2E_FIXED === '1') {
            return { status: 'pass', detail: 'fixed' };
          }
          return { status: 'fail', detail: 'this check fails until E2E_FIXED is set' };
        },
      },
    ],
  },
  remediation: { mode: 'human' },
});
`;

async function main() {
  const fixture = await startFixtureProcess();
  const project = mkdtempSync(join(tmpdir(), 'was-e2e-'));
  const env = { E2E_EMAIL: 'member@example.com', E2E_PASSWORD: 'hunter2' };

  try {
    // A symlink rather than an install: the CLI, the config's imports and the loops' all
    // resolve the real package, so this exercises the path a consumer walks.
    mkdirSync(join(project, 'node_modules'), { recursive: true });
    symlinkSync(REPO, join(project, 'node_modules', 'webapp-agent-studio'), 'dir');
    writeFileSync(join(project, 'studio.config.mjs'), CONFIG(fixture.url));
    mkdirSync(join(project, 'loops', '001-green'), { recursive: true });
    writeFileSync(join(project, 'loops', '001-green', 'loop.mjs'), GREEN_LOOP);
    mkdirSync(join(project, 'loops', '002-red'), { recursive: true });
    writeFileSync(join(project, 'loops', '002-red', 'loop.mjs'), RED_LOOP);

    console.log('\n1. verify');
    const verified = cli(project, ['verify'], env);
    check('verify exits 0 against a live app', verified.code === 0, verified.stderr || verified.stdout);
    check(
      'verify proves redaction with the planted secret',
      /planted secret does not appear/.test(verified.stdout),
    );

    console.log('\n2. a green run');
    const green1 = cli(project, ['run', '001-green', '--json'], env);
    check('a green run exits 0', green1.code === 0, green1.stderr);
    const runDir1 = join(project, 'loops', '001-green', 'runs', '001');
    const results1 = JSON.parse(readFileSync(join(runDir1, 'results.json'), 'utf8'));
    check('results.json carries the v1 schema', results1.schema === 'webapp-agent-studio/results@1');
    // Five: the loop's four passing checks, plus the error budget, which is scored as a
    // check of its own so it lands in the tally, the diff and the exit code like the rest.
    check('five checks passed', results1.tally.pass === 5, JSON.stringify(results1.tally));
    check(
      'a check that returned nothing is unknown, not pass',
      results1.checks.find((/** @type {any} */ c) => c.name === 'returns-nothing-on-purpose')
        ?.status === 'unknown',
    );
    check('report.html was written', existsSync(join(runDir1, 'report.html')));
    check('errors.json was written', existsSync(join(runDir1, 'errors.json')));
    check('diff.json was written', existsSync(join(runDir1, 'diff.json')));
    check(
      'latest.json names the newest run',
      JSON.parse(readFileSync(join(project, 'loops', '001-green', 'runs', 'latest.json'), 'utf8'))
        .run === '001',
    );

    const shots = readdirSync(runDir1).filter((f) => f.endsWith('.png'));
    check('screenshots were written', shots.length >= 2, `${shots.length} png(s)`);
    check(
      'a screenshot is a real screen, not a blank page',
      shots.every((f) => statSync(join(runDir1, f)).size > 5000),
    );

    console.log('\n3. error collection and attribution');
    const errors1 = JSON.parse(readFileSync(join(runDir1, 'errors.json'), 'utf8'));
    check(
      'the deliberate console error was collected',
      errors1.some((/** @type {any} */ e) => /deliberate console error/.test(e.text ?? '')),
    );
    check(
      'the deliberate 404 was collected',
      errors1.some((/** @type {any} */ e) => e.kind === 'response' && e.status === 404),
    );
    const attributed = results1.checks.find(
      (/** @type {any} */ c) => c.name === 'attributes-an-error-to-this-check',
    );
    check(
      'an error fired inside a check is attributed to that check',
      attributed.errors.some((/** @type {any} */ e) => /from inside a check/.test(e.text ?? '')),
      JSON.stringify(attributed.errors),
    );
    check(
      'an error fired before any check is reported as unattributed, not dropped',
      results1.unattributedErrors.length > 0,
    );

    console.log('\n4. redaction, on the files the run actually wrote');
    const leaks = filesContaining(runDir1, PLANTED_SECRET);
    check(
      'the planted secret appears in no artifact at all',
      leaks.length === 0,
      leaks.join(', '),
    );
    check(
      'the 404 URL was redacted rather than dropped',
      JSON.stringify(errors1).includes('[REDACTED]'),
    );

    console.log('\n5. a second run, and the diff');
    const green2 = cli(project, ['run', '001-green'], env);
    check('the second run exits 0', green2.code === 0, green2.stderr);
    const runDir2 = join(project, 'loops', '001-green', 'runs', '002');
    const diff2 = JSON.parse(readFileSync(join(runDir2, 'diff.json'), 'utf8'));
    check('the second run diffs against the first', diff2.previousRun === '001');
    check('nothing regressed between two identical runs', diff2.regressed.length === 0);

    console.log('\n6. filtering a run');
    const only = cli(project, ['run', '001-green', '--only', 'lands-signed-in'], env);
    check('a filtered run exits 0', only.code === 0, only.stderr);
    const results3 = JSON.parse(
      readFileSync(join(project, 'loops', '001-green', 'runs', '003', 'results.json'), 'utf8'),
    );
    check(
      'checks that did not run are unknown, so a partial run cannot pass for a full one',
      results3.checks.filter((/** @type {any} */ c) => c.status === 'unknown').length === 4,
      JSON.stringify(results3.tally),
    );

    console.log('\n7. judgments');
    check('the run left a judgment pending', results1.pendingJudgments === 1);
    const judged = cli(project, ['judge', runDir1, 'reads-clearly', 'pass', '--by', 'e2e'], env);
    check('judge exits 0', judged.code === 0, judged.stderr);
    const afterJudge = JSON.parse(readFileSync(join(runDir1, 'results.json'), 'utf8'));
    check('the verdict was recorded with its author', afterJudge.judgments[0].by === 'e2e');
    check('nothing is pending afterwards', afterJudge.pendingJudgments === 0);
    check(
      'the report was re-rendered',
      readFileSync(join(runDir1, 'report.html'), 'utf8').includes('e2e'),
    );

    console.log('\n8. a failing run, and the finding lifecycle');
    const red1 = cli(project, ['run', '002-red'], env);
    check('a run with a failing check exits 1, not 2', red1.code === 1, `exit ${red1.code}`);
    const findingsPath = join(project, 'loops', '002-red', 'findings.json');
    const findings1 = JSON.parse(readFileSync(findingsPath, 'utf8'));
    check(
      'the runner drafted a finding for the failing check',
      findings1.findings.some((/** @type {any} */ f) => f.slug === 'the-broken-one'),
    );
    check(
      'the drafted finding is open',
      findings1.findings.find((/** @type {any} */ f) => f.slug === 'the-broken-one')?.status ===
        'open',
    );

    const directed = cli(
      project,
      ['finding', '002-red', 'the-broken-one', '--status', 'fix-directed', '--by', 'e2e'],
      env,
    );
    check('finding --status fix-directed exits 0', directed.code === 0, directed.stderr);

    const red2 = cli(project, ['run', '002-red'], { ...env, E2E_FIXED: '1' });
    check('the fixed run exits 0', red2.code === 0, red2.stderr);
    const findings2 = JSON.parse(readFileSync(findingsPath, 'utf8'));
    check(
      'a directed finding whose check now passes is verified-fixed',
      findings2.findings.find((/** @type {any} */ f) => f.slug === 'the-broken-one')?.status ===
        'verified-fixed',
    );
    const redReport = readFileSync(
      join(project, 'loops', '002-red', 'runs', '002', 'report.html'),
      'utf8',
    );
    check('the report says it was verified fixed', /Verified fixed/.test(redReport));

    console.log('\n9. status');
    const status = cli(project, ['status'], env);
    check('status exits 0 and lists the loops', status.code === 0 && /001-green/.test(status.stdout));

    console.log('\n10. the app goes away');
    await fixture.close();
    const dead = cli(project, ['run', '001-green'], env);
    check(
      'an unreachable app exits 2, not 1 — "the harness is broken" never reads as "the app is broken"',
      dead.code === 2,
      `exit ${dead.code}: ${dead.stderr.trim()}`,
    );
    check(
      'and it says which URL was dead',
      /nothing is answering at/.test(dead.stderr),
      dead.stderr.trim(),
    );
    const deadVerify = cli(project, ['verify'], env);
    check('verify against a dead port also exits 2', deadVerify.code === 2, `exit ${deadVerify.code}`);
  } finally {
    await fixture.close().catch(() => {});
    rmSync(project, { recursive: true, force: true });
  }

  console.log(
    `\n${checks - failures.length}/${checks} checks passed` +
      (failures.length === 0 ? '' : ` — FAILED: ${failures.join('; ')}`),
  );
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`e2e aborted: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
});
