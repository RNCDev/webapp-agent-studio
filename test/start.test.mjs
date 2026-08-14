// @ts-check
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureAppRunning, normalizeStart } from '../src/start.mjs';
import { StudioError } from '../src/exit.mjs';

/** Ask the OS for a port, then let it go. */
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

/** @type {(() => Promise<void> | void)[]} */
const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A config stub — ensureAppRunning reads baseURL, root, and start. */
const configFor = (
  /** @type {string} */ baseURL,
  /** @type {any} */ start,
  /** @type {string} */ root = process.cwd(),
) => /** @type {any} */ ({ baseURL, root, start });

describe('normalizeStart', () => {
  it('accepts a bare command string', () => {
    expect(normalizeStart('npm run dev')).toEqual({
      command: 'npm run dev',
      readyTimeout: 60_000,
      cwd: undefined,
    });
  });

  it('accepts the object form and keeps its fields', () => {
    expect(normalizeStart({ command: 'make serve', readyTimeout: 5_000, cwd: '/x' })).toEqual({
      command: 'make serve',
      readyTimeout: 5_000,
      cwd: '/x',
    });
  });

  it('normalizes nothing to null', () => {
    expect(normalizeStart(undefined)).toBeNull();
    expect(normalizeStart(null)).toBeNull();
  });
});

describe('ensureAppRunning', () => {
  it('starts nothing when the app already answers', async () => {
    const port = await freePort();
    const server = createServer((_, res) => res.end('ok'));
    await new Promise((r) => server.listen(port, '127.0.0.1', () => r(undefined)));
    cleanups.push(() => new Promise((r) => server.close(() => r(undefined))));

    const app = await ensureAppRunning(
      configFor(`http://127.0.0.1:${port}`, 'this-command-would-fail'),
      { log: () => {} },
    );
    expect(app.started).toBe(false);
    await app.stop();
    // stop() of an app the studio did not start must leave it running.
    const response = await fetch(`http://127.0.0.1:${port}`);
    expect(response.ok).toBe(true);
  });

  it('does nothing when no start command is configured', async () => {
    const port = await freePort();
    const app = await ensureAppRunning(configFor(`http://127.0.0.1:${port}`, null), {
      log: () => {},
    });
    expect(app.started).toBe(false);
    await app.stop();
  });

  it('boots the app, waits until it answers, and tears it down on stop()', async () => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), 'was-start-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(
      join(dir, 'server.mjs'),
      `import { createServer } from 'node:http';
createServer((_, res) => res.end('ok')).listen(${port}, '127.0.0.1');`,
    );

    const app = await ensureAppRunning(
      configFor(`http://127.0.0.1:${port}`, {
        command: `"${process.execPath}" server.mjs`,
        cwd: dir,
        readyTimeout: 10_000,
      }),
      { log: () => {} },
    );
    cleanups.push(() => app.stop());
    expect(app.started).toBe(true);
    const response = await fetch(`http://127.0.0.1:${port}`);
    expect(response.ok).toBe(true);

    await app.stop();
    await expect(
      fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) }),
    ).rejects.toThrow();
  });

  it('is a StudioError when the command dies before the app answers', async () => {
    const port = await freePort();
    await expect(
      ensureAppRunning(
        configFor(`http://127.0.0.1:${port}`, {
          command: `"${process.execPath}" -e "process.exit(3)"`,
          readyTimeout: 10_000,
        }),
        { log: () => {} },
      ),
    ).rejects.toThrow(StudioError);
  });

  it('is a StudioError when the app never answers inside readyTimeout', async () => {
    const port = await freePort();
    await expect(
      ensureAppRunning(
        configFor(`http://127.0.0.1:${port}`, {
          command: `"${process.execPath}" -e "setInterval(function () {}, 1000)"`,
          readyTimeout: 1_000,
        }),
        { log: () => {} },
      ),
    ).rejects.toThrow(/never answered/);
  });
});
