#!/usr/bin/env node
// @ts-check
// The CLI.
//
// EVERY COMMAND ENDS BY PRINTING THE PATHS IT WROTE. A caller — a person, a script, an
// agent session — should never have to guess where the output went or compute which run
// was newest. `--json` prints the summary as one object for parsing.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.mjs';
import { runLoop } from '../src/runner.mjs';
import { ensureAppRunning } from '../src/start.mjs';
import { verify } from '../src/verify.mjs';
import { rerenderReport } from '../src/report/html.mjs';
import { diffRuns } from '../src/report/diff.mjs';
import { fileJudgment } from '../src/judgments.mjs';
import {
  advanceFinding,
  loadFindings,
  openFindings,
  saveFindings,
} from '../src/findings.mjs';
import { latestRun, listRuns, readResults } from '../src/runs.mjs';
import { EXIT_CHECKS_FAILED, EXIT_OK, EXIT_STUDIO_BROKEN, StudioError } from '../src/exit.mjs';
import {
  appendOnce,
  configTemplate,
  detectFramework,
  directivesTemplate,
  ensureDir,
  ensureGitignore,
  ensureScripts,
  ignoreLinesFor,
  loopTemplate,
  pointerBlock,
} from '../src/scaffold.mjs';

const USAGE = `webapp-agent-studio <command>

  init [--sync] [--dry-run]             set this project up: config, .gitignore, scripts,
       [--force] [--base-url <url>]     and a pointer block for agent sessions. Safe to
                                        re-run: it derives the ignore rules and the
                                        pointer block from the config as it now stands,
                                        so a project that later moved \`loopsDir\` gets
                                        them corrected. --sync skips writing the config
  verify [--start "<command>"]          drive the app once and assert on the artifacts
         [--env-file <path>]
  run <loop...> [--only <check>]        run one or more loops. Traces are kept on failing
                [--from <check>] [--trace] [--no-trace] [--require-judgments] [--json]
                [--start "<command>"]   runs by default; --trace keeps them always,
                [--env-file <path>]     --no-trace never records them. --start (or the
                                        config's \`start\`) boots the app when nothing
                                        answers at baseURL, and stops it afterwards.
                                        --env-file overrides the config's \`envFile\`
  report <runDir>                       re-render report.html from the JSON on disk
  diff <runDirA> <runDirB>              compare two runs
  new-loop <NNN-name>                   scaffold a loop directory
  judge <runDir> <name> <pass|fail|unknown> [--note "..."] [--by <who>]
  finding <loop> <slug> --status <open|fix-directed|verified-fixed|accepted>
                [--note "..."] [--by <who>]
  status                                open findings and pending judgments, all loops

Exit codes: 0 the eval was green, 1 checks failed (the app), 2 the studio could not run.
`;

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { positional, flags };
}

/** @param {Record<string, string | boolean>} flags @param {string} key */
function stringFlag(flags, key) {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

/** @param {import('../src/config.mjs').ResolvedConfig} config @param {string} name */
function loopDirFor(config, name) {
  return resolve(config.root, config.loopsDir ?? 'loops', name);
}

/**
 * Load the config, honouring `--env-file`, and say out loud when the env file could not
 * set something.
 *
 * Node never lets an env file overwrite a variable the environment already holds — true
 * of `--env-file` and of `process.loadEnvFile` alike. A stale value inherited from the
 * shell therefore wins silently, and what the operator sees is an authentication failure
 * that points at nothing. Naming the shadowed variables here turns an hour into a second.
 *
 * @param {Record<string, string|boolean>} [flags]
 */
async function configFor(flags = {}) {
  const config = await loadConfig({ envFile: stringFlag(flags, 'env-file') });
  for (const file of config.envFiles) {
    if (!file.loaded) continue;
    console.log(`loaded env from ${file.path}`);
    if (file.shadowed.length > 0) {
      console.log(
        `  note: ${file.shadowed.join(', ')} ${file.shadowed.length === 1 ? 'was' : 'were'} ` +
          'already set in the environment, so the file did not change ' +
          `${file.shadowed.length === 1 ? 'it' : 'them'} — an env file never overwrites ` +
          'an existing variable. Unset it if you meant the file to win.',
      );
    }
  }
  return config;
}

/** @param {string} loopDir */
async function importLoop(loopDir) {
  const file = join(loopDir, 'loop.mjs');
  if (!existsSync(file)) {
    throw new StudioError(
      `no loop.mjs in ${loopDir} — scaffold one with \`webapp-agent-studio new-loop ${basename(loopDir)}\``,
    );
  }
  const module = await import(pathToFileURL(file).href);
  const loop = module.default;
  if (loop === undefined) {
    throw new StudioError(`${file} has no default export — it must export defineLoop(...)`);
  }
  return loop;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  if (command === undefined || command === 'help' || flags.help === true) {
    console.log(USAGE);
    return EXIT_OK;
  }

  switch (command) {
    case 'init':
      return await cmdInit(positional, flags);
    case 'verify':
      return await cmdVerify(flags);
    case 'run':
      return await cmdRun(positional, flags);
    case 'report':
      return cmdReport(positional);
    case 'diff':
      return cmdDiff(positional);
    case 'new-loop':
      return await cmdNewLoop(positional);
    case 'judge':
      return cmdJudge(positional, flags);
    case 'finding':
      return await cmdFinding(positional, flags);
    case 'status':
      return await cmdStatus();
    default:
      console.error(`unknown command '${command}'\n\n${USAGE}`);
      return EXIT_STUDIO_BROKEN;
  }
}

/**
 * Set a project up, or reconcile a project that has drifted.
 *
 * INIT IS RE-RUNNABLE, AND EVERY PATH IT WRITES IS DERIVED FROM THE CONFIG rather than
 * assumed. The first version hardcoded `loops/*​/runs/`, but `init` necessarily runs
 * before anyone has customised `loopsDir` — so a project that moved its loops afterwards
 * was left with run artifacts untracked but NOT ignored, i.e. screenshots of a signed-in
 * application sitting in `git status` waiting to be committed by accident. Running it
 * again now fixes that instead of reporting "already there".
 *
 * @param {string[]} positional @param {Record<string, string|boolean>} flags
 */
async function cmdInit(positional, flags) {
  const root = process.cwd();
  const configPath = join(root, 'studio.config.mjs');
  const dryRun = flags['dry-run'] === true;
  const syncOnly = flags.sync === true;
  const name = stringFlag(flags, 'name') ?? basename(root);
  if (dryRun) console.log('dry run — nothing will be written\n');

  if (existsSync(configPath)) {
    if (flags.force === true && !syncOnly) {
      const detected = detectFramework(root);
      const baseURL = stringFlag(flags, 'base-url') ?? detected?.baseURL ?? 'http://localhost:5173';
      if (!dryRun) writeFileSync(configPath, configTemplate({ name, baseURL, start: detected?.start }));
      console.log(`${dryRun ? 'would overwrite' : 'overwrote'} ${configPath}`);
    } else {
      console.log(
        `studio.config.mjs is already here — reconciling everything else against it` +
          (syncOnly ? '' : ' (pass --force to overwrite it)'),
      );
    }
  } else if (syncOnly) {
    throw new StudioError(
      `no studio.config.mjs at ${configPath} — there is nothing to sync against. ` +
        'Run `webapp-agent-studio init` without --sync to write one.',
    );
  } else {
    // A recognised framework pre-fills the baseURL and the dev command; an explicit
    // --base-url always wins over the detection.
    const detected = detectFramework(root);
    const baseURL = stringFlag(flags, 'base-url') ?? detected?.baseURL ?? 'http://localhost:5173';
    if (detected !== undefined) {
      console.log(`detected ${detected.label} — baseURL ${baseURL}, start '${detected.start}'`);
    }
    if (!dryRun) writeFileSync(configPath, configTemplate({ name, baseURL, start: detected?.start }));
    console.log(`${dryRun ? 'would write' : 'wrote'} ${configPath}`);
  }

  // Read back what is actually on disk — the template we just wrote, or the edited config
  // this project has been using — so the layout below is the real one. On a dry run with
  // no config yet there is nothing to read, so fall back to the template's own defaults.
  let layout = { loopsDir: 'loops', artifactsDir: '.studio-artifacts', name };
  if (existsSync(configPath)) {
    try {
      const config = await loadConfig({ cwd: root, envFile: stringFlag(flags, 'env-file') });
      layout = {
        loopsDir: config.loopsDir ?? 'loops',
        artifactsDir: config.artifactsDir ?? '.studio-artifacts',
        name: config.name ?? name,
      };
    } catch (err) {
      // A config that cannot be loaded is worth saying out loud, but it must not stop the
      // rest: the ignore rules matter most exactly when something else is broken.
      console.log(
        `could not read studio.config.mjs, so using the default layout — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(`layout: loopsDir '${layout.loopsDir}', artifactsDir '${layout.artifactsDir}'`);

  const ignored = ensureGitignore(root, ignoreLinesFor(layout), { dryRun });
  console.log(
    ignored.length > 0
      ? `${dryRun ? 'would add to' : 'added to'} .gitignore: ${ignored.join(', ')}`
      : '.gitignore already covers the run artifacts',
  );

  const scripts = ensureScripts(root, { dryRun });
  console.log(
    scripts.length > 0
      ? `${dryRun ? 'would add' : 'added'} npm scripts: ${scripts.join(', ')}`
      : 'npm scripts already present (or no package.json here)',
  );

  // The pointer block goes wherever this project already keeps its agent instructions, so
  // a future session discovers the studio without being told it exists.
  const target = existsSync(join(root, 'CLAUDE.md'))
    ? 'CLAUDE.md'
    : existsSync(join(root, 'AGENTS.md'))
      ? 'AGENTS.md'
      : 'CLAUDE.md';
  const outcome = appendOnce(
    join(root, target),
    pointerBlock(layout.name, layout),
    'webapp-agent-studio',
    { dryRun },
  );
  console.log(`${target}: ${dryRun && outcome !== 'already there' ? `would be ${outcome}` : outcome}`);

  if (!dryRun) ensureDir(join(root, layout.loopsDir));
  console.log(`\nNext: \`npx playwright install chromium\`, then \`npx webapp-agent-studio verify\`.`);
  return EXIT_OK;
}

/** @param {Record<string, string|boolean>} flags */
async function cmdVerify(flags) {
  const config = await configFor(flags);
  const app = await ensureAppRunning(withStartFlag(config, flags));
  try {
    const result = await verify({ config });
    return result.exitCode;
  } finally {
    await app.stop();
  }
}

/**
 * `--start "<command>"` overrides the config's `start` for this invocation.
 * @template {{start?: unknown}} T
 * @param {T} config @param {Record<string, string|boolean>} flags
 */
function withStartFlag(config, flags) {
  const command = stringFlag(flags, 'start');
  return command === undefined ? config : { ...config, start: command };
}

/** @param {string[]} positional @param {Record<string, string|boolean>} flags */
async function cmdRun(positional, flags) {
  if (positional.length === 0) {
    throw new StudioError('`run` needs at least one loop name — see `webapp-agent-studio status`');
  }
  const config = await configFor(flags);
  const only = stringFlag(flags, 'only');
  const from = stringFlag(flags, 'from');

  /** @type {any[]} */
  const summaries = [];
  let worst = EXIT_OK;

  const app = await ensureAppRunning(withStartFlag(config, flags), {
    ...(flags.json === true ? { log: () => {} } : {}),
  });
  try {
    // ONE CHROMIUM FOR ALL OF THEM. Each loop still opens its own contexts; the browser
    // process is what gets shared, and it is the expensive part.
    for (const name of positional) {
      const loopDir = loopDirFor(config, name);
      const loop = await importLoop(loopDir);
      const result = await runLoop({
        loopDir,
        loopName: name,
        loop,
        config,
        options: {
          ...(only !== undefined ? { only: only.split(',').map((s) => s.trim()) } : {}),
          ...(from !== undefined ? { from } : {}),
          // Default (neither flag): 'on-fail' — traces are recorded and kept only on failure.
          ...(flags['no-trace'] === true
            ? { trace: /** @type {const} */ (false) }
            : flags.trace === true
              ? { trace: /** @type {const} */ (true) }
              : {}),
          requireJudgments: flags['require-judgments'] === true,
          log: flags.json === true ? () => {} : undefined,
        },
      });
      summaries.push({
        loop: name,
        run: result.run,
        runDir: result.runDir,
        report: result.reportPath,
        tally: result.results.tally,
        pendingJudgments: result.results.pendingJudgments,
        exitCode: result.exitCode,
      });
      if (result.exitCode > worst) worst = result.exitCode;
    }
  } finally {
    await app.stop();
  }

  if (flags.json === true) {
    console.log(JSON.stringify({ loops: summaries, exitCode: worst }, null, 2));
  }
  return worst;
}

/** @param {string[]} positional */
function cmdReport(positional) {
  const runDir = resolve(positional[0] ?? '');
  const loopDir = resolve(runDir, '..', '..');
  const findings = existsSync(join(loopDir, 'findings.json'))
    ? loadFindings(loopDir).findings
    : [];
  const path = rerenderReport(runDir, { findings });
  console.log(`report: ${path}`);
  return EXIT_OK;
}

/** @param {string[]} positional */
function cmdDiff(positional) {
  const [a, b] = positional;
  if (a === undefined || b === undefined) {
    throw new StudioError('`diff` needs two run directories');
  }
  const previous = readResults(resolve(a));
  const current = readResults(resolve(b));
  if (previous === undefined || current === undefined) {
    throw new StudioError('both arguments must be run directories holding a results.json');
  }
  console.log(JSON.stringify(diffRuns(previous, current), null, 2));
  return EXIT_OK;
}

/** @param {string[]} positional */
async function cmdNewLoop(positional) {
  const name = positional[0];
  if (name === undefined) {
    throw new StudioError('`new-loop` needs a name, conventionally NNN-something');
  }
  if (!/^\d{3}-[a-z0-9-]+$/.test(name)) {
    // Not refused — the numbering is a convention, and a project may have its own — but
    // said out loud, because the numbering is what makes lineage readable later.
    console.log(
      `note: '${name}' is not NNN-name (e.g. 007-checkout). The number is what makes ` +
        'lineage and `supersedes` readable later.',
    );
  }
  const config = await loadConfig();
  const loopDir = loopDirFor(config, name);
  ensureDir(loopDir);
  ensureDir(join(loopDir, 'runs'));
  const loopFile = join(loopDir, 'loop.mjs');
  if (existsSync(loopFile)) throw new StudioError(`${loopFile} already exists`);
  writeFileSync(loopFile, loopTemplate(name));
  writeFileSync(join(loopDir, 'directives.md'), directivesTemplate(name));
  console.log(`created ${loopDir}`);
  console.log(`  loop.mjs        the definition — stable across iterations`);
  console.log(`  directives.md   what to do next, written after each run`);
  console.log(`  runs/           this loop's runs`);
  console.log(`\nRun it: webapp-agent-studio run ${name}`);
  return EXIT_OK;
}

/** @param {string[]} positional @param {Record<string, string|boolean>} flags */
function cmdJudge(positional, flags) {
  const [runDirArg, name, verdict] = positional;
  if (runDirArg === undefined || name === undefined || verdict === undefined) {
    throw new StudioError('`judge` needs <runDir> <judgment> <pass|fail|unknown>');
  }
  const runDir = resolve(runDirArg);
  const { results } = fileJudgment(runDir, name, {
    verdict,
    ...(stringFlag(flags, 'note') !== undefined ? { note: String(flags.note) } : {}),
    ...(stringFlag(flags, 'by') !== undefined ? { by: String(flags.by) } : {}),
  });
  const loopDir = resolve(runDir, '..', '..');
  const findings = existsSync(join(loopDir, 'findings.json'))
    ? loadFindings(loopDir).findings
    : [];
  const path = rerenderReport(runDir, { findings });
  console.log(`${name}: ${verdict}`);
  console.log(
    `${results.pendingJudgments} judgment(s) still pending in run ${results.run}`,
  );
  console.log(`report: ${path}`);
  return EXIT_OK;
}

/** @param {string[]} positional @param {Record<string, string|boolean>} flags */
async function cmdFinding(positional, flags) {
  const [loopName, slug] = positional;
  const status = stringFlag(flags, 'status');
  if (loopName === undefined || slug === undefined || status === undefined) {
    throw new StudioError('`finding` needs <loop> <slug> --status <state>');
  }
  const config = await loadConfig();
  const loopDir = loopDirFor(config, loopName);
  const findings = loadFindings(loopDir);
  const current = latestRun(loopDir);
  const finding = advanceFinding(findings, slug, {
    status: /** @type {any} */ (status),
    ...(stringFlag(flags, 'note') !== undefined ? { note: String(flags.note) } : {}),
    ...(stringFlag(flags, 'by') !== undefined ? { by: String(flags.by) } : {}),
    ...(current !== undefined ? { run: current.run } : {}),
  });
  const path = saveFindings(loopDir, findings);
  console.log(`${finding.slug}: ${finding.status}`);
  console.log(`findings: ${path}`);
  if (status === 'fix-directed') {
    console.log(
      `\nWrite the directive in ${join(loopDir, 'directives.md')}, then re-run the loop — ` +
        'the next report says whether it was verified fixed.',
    );
  }
  return EXIT_OK;
}

async function cmdStatus() {
  const config = await loadConfig();
  const loopsRoot = resolve(config.root, config.loopsDir ?? 'loops');
  if (!existsSync(loopsRoot)) {
    console.log(`no loops directory at ${loopsRoot}`);
    return EXIT_OK;
  }
  const { readdirSync } = await import('node:fs');
  const loops = readdirSync(loopsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  let anything = false;
  for (const name of loops) {
    const loopDir = join(loopsRoot, name);
    if (!existsSync(join(loopDir, 'loop.mjs'))) continue;
    const runs = listRuns(loopDir);
    const findings = existsSync(join(loopDir, 'findings.json'))
      ? loadFindings(loopDir)
      : { findings: [] };
    const open = openFindings(findings);
    const current = latestRun(loopDir);
    const results = current === undefined ? undefined : readResults(current.path);
    const pending =
      results === undefined
        ? 0
        : results.judgments.filter((/** @type {any} */ j) => j.verdict === 'unknown').length;

    console.log(
      `${name}  ${runs.length} run(s)` +
        (results === undefined
          ? '  — never run'
          : `  latest ${results.run}: ${results.tally.pass} pass, ${results.tally.fail} fail, ${results.tally.unknown} unknown`),
    );
    for (const f of open) {
      anything = true;
      console.log(`    ${f.status.padEnd(13)} ${f.slug} — ${f.title}`);
    }
    if (pending > 0) {
      anything = true;
      console.log(`    ${'judgment'.padEnd(13)} ${pending} pending a verdict in run ${results.run}`);
    }
  }
  if (!anything) console.log('\nNothing open — no findings awaiting a decision, no judgments pending.');
  return EXIT_OK;
}

main()
  .then((code) => {
    process.exitCode = code ?? EXIT_OK;
  })
  .catch((err) => {
    // A StudioError is "the studio could not run" and exits 2. Anything else unexpected is
    // also the studio's own failure — a real check failure never reaches here, because the
    // runner records it and returns.
    const exitCode = err instanceof StudioError ? err.exitCode : EXIT_STUDIO_BROKEN;
    console.error(`${err instanceof Error ? err.message : String(err)}`);
    if (exitCode === EXIT_STUDIO_BROKEN && !(err instanceof StudioError) && err?.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    process.exitCode = exitCode;
  });

export { EXIT_CHECKS_FAILED };
