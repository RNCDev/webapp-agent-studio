// @ts-check
// Loading a project's .env before anything reads a secret out of the environment.
//
// Sign-in almost always needs a credential, and almost every project keeps its
// credentials in a `.env` that is not committed. Without this, the CLI cannot be used at
// all by such a project: the consumer has to bypass `webapp-agent-studio` and invoke
// `node --env-file=.env node_modules/webapp-agent-studio/bin/...` by hand, which throws
// away `npx` and hardcodes a path into node_modules.
//
// THE TRAP THIS REPORTS. Node's env-file loading — both `--env-file` and
// `process.loadEnvFile` — does NOT overwrite a variable that is already set. A stale
// value inherited from the shell therefore silently wins over the file, and what the
// operator sees is an authentication failure pointing at nothing. So this records which
// names the file tried to set and could not, and the CLI prints them.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { StudioError } from './exit.mjs';

/** Files already loaded this process, so a second call is a no-op rather than a re-read. */
const loaded = new Set();

/**
 * The names a env file assigns, in order. Deliberately minimal: this is used only to
 * report which of them the environment already had, never to assign anything — Node does
 * the actual loading, so a disagreement between this parse and Node's cannot produce a
 * wrong value, only a slightly wrong report.
 *
 * @param {string} text
 */
export function envFileKeys(text) {
  /** @type {string[]} */
  const keys = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match !== null) keys.push(match[1]);
  }
  return keys;
}

/**
 * Load `file` into `process.env`, once.
 *
 * A file named explicitly and then not found is an exit-2 problem, not a silent skip:
 * the operator asked for it, and continuing would fail later as a missing credential
 * whose real cause is a path typo. Discovery of the conventional `.env` passes
 * `required: false`, because absence there means "this project keeps no env file".
 *
 * @param {string} file
 * @param {{root?: string, required?: boolean}} [options]
 * @returns {{path: string, loaded: boolean, shadowed: string[]}}
 */
export function loadEnvFile(file, options = {}) {
  const { root = process.cwd(), required = true } = options;
  const path = isAbsolute(file) ? file : resolve(root, file);

  if (!existsSync(path)) {
    if (required) {
      throw new StudioError(
        `no env file at ${path} — \`envFile\` in studio.config.mjs (or --env-file) names ` +
          'a file that is not there',
      );
    }
    return { path, loaded: false, shadowed: [] };
  }
  if (loaded.has(path)) return { path, loaded: false, shadowed: [] };

  // Which names the environment ALREADY has, read before loading: those are exactly the
  // ones the file cannot set, and the ones worth telling the operator about.
  let shadowed = /** @type {string[]} */ ([]);
  try {
    shadowed = envFileKeys(readFileSync(path, 'utf8')).filter(
      (key) => process.env[key] !== undefined && process.env[key] !== '',
    );
  } catch {
    // An unreadable file is Node's error to raise below, with its own message.
    shadowed = [];
  }

  process.loadEnvFile(path);
  loaded.add(path);
  return { path, loaded: true, shadowed };
}

/** Test seam: forget what has been loaded. */
export function resetLoadedEnvFiles() {
  loaded.clear();
}
