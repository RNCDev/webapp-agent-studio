// @ts-check
// Booting the app the studio is about to drive, when nothing answers at baseURL.
//
// "HAVE YOUR APP RUNNING IN ANOTHER TERMINAL" WAS THE BIGGEST INTEGRATION STEP, and this
// removes it: `start: 'npm run dev'` in studio.config.mjs lets `run` and `verify` boot the
// app, wait for it to answer, and tear it down afterwards. An app that is ALREADY running
// is used as-is and never touched — the studio only stops what it started, so a dev
// server someone is working against survives every run.
//
// Everything that goes wrong here is the studio's failure, not the app's: a start command
// that dies, or an app that never answers, is a StudioError and exit 2.

import { spawn } from 'node:child_process';
import { StudioError } from './exit.mjs';

/**
 * The config field, normalized: a bare string is a command, the object form adds a ready
 * timeout and a working directory.
 *
 * @param {unknown} start
 * @returns {{command: string, readyTimeout: number, cwd: string | undefined} | null}
 */
export function normalizeStart(start) {
  if (start === undefined || start === null) return null;
  if (typeof start === 'string') {
    return { command: start, readyTimeout: 60_000, cwd: undefined };
  }
  const raw = /** @type {{command?: unknown, readyTimeout?: unknown, cwd?: unknown}} */ (start);
  if (typeof raw.command !== 'string' || raw.command === '') {
    throw new Error("`start` must be a command string, or an object with a `command`");
  }
  return {
    command: raw.command,
    readyTimeout: typeof raw.readyTimeout === 'number' ? raw.readyTimeout : 60_000,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
  };
}

/** @param {string} baseURL @param {number} timeoutMs */
async function answers(baseURL, timeoutMs = 1_000) {
  try {
    const response = await fetch(baseURL, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.arrayBuffer().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Make sure something answers at config.baseURL, starting the configured command if
 * nothing does. Callers must `await stop()` when the work is done — it is a no-op unless
 * this call actually started the app.
 *
 * @param {{baseURL: string, root?: string, start?: unknown}} config
 * @param {{log?: (line: string) => void}} [options]
 * @returns {Promise<{started: boolean, stop: () => Promise<void>}>}
 */
export async function ensureAppRunning(config, options = {}) {
  const log = options.log ?? ((/** @type {string} */ line) => console.log(line));
  const start = normalizeStart(config.start);

  // Already up — use it, own nothing. This is also the no-start-configured path: a dead
  // port with no way to start the app stays the runner's legible exit-2.
  if (await answers(config.baseURL)) return { started: false, stop: async () => {} };
  if (start === null) return { started: false, stop: async () => {} };

  log(`starting the app: ${start.command}`);
  // detached, so the child leads its own process group and `kill(-pid)` reaches the whole
  // tree — `npm run dev` is a shell that spawns npm that spawns the real server, and
  // killing only the shell would orphan the port.
  const child = spawn(start.command, {
    shell: true,
    detached: true,
    cwd: start.cwd ?? config.root ?? process.cwd(),
    stdio: 'ignore',
  });
  /** @type {number | null} */
  let exited = null;
  child.on('exit', (code) => {
    exited = code ?? -1;
  });

  async function stop() {
    if (child.pid === undefined || exited !== null) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      return;
    }
    const deadline = Date.now() + 5_000;
    while (exited === null && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (exited === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }

  const deadline = Date.now() + start.readyTimeout;
  for (;;) {
    if (exited !== null) {
      throw new StudioError(
        `the start command exited with code ${exited} before the app answered at ` +
          `${config.baseURL} — it was: ${start.command}`,
      );
    }
    if (await answers(config.baseURL, 500)) break;
    if (Date.now() > deadline) {
      await stop();
      throw new StudioError(
        `the app never answered at ${config.baseURL} within ${start.readyTimeout}ms of ` +
          `running '${start.command}' — raise start.readyTimeout, or check the command ` +
          'serves that URL',
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  log(`the app answers at ${config.baseURL}`);
  return { started: true, stop };
}
