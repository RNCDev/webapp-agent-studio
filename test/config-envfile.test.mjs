// @ts-check
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { resetLoadedEnvFiles } from '../src/env.mjs';

/** @type {string} */
let dir;

/** @param {string} body */
function writeConfig(body) {
  writeFileSync(join(dir, 'studio.config.mjs'), body);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'was-cfg-'));
  resetLoadedEnvFiles();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.WAS_CFG_SECRET;
  delete process.env.WAS_CFG_TOPLEVEL;
});

describe('loadConfig + envFile', () => {
  it('loads the env file a config declares', async () => {
    writeFileSync(join(dir, '.env'), 'WAS_CFG_SECRET=shh\n');
    writeConfig(`export default { baseURL: 'http://localhost:3000', envFile: '.env' };`);

    const config = await loadConfig({ cwd: dir });

    expect(process.env.WAS_CFG_SECRET).toBe('shh');
    expect(config.envFiles.map((f) => f.loaded)).toEqual([true]);
  });

  it('re-imports the config so a top-level process.env read sees the file', async () => {
    // The chicken-and-egg this covers: `envFile` is declared INSIDE the module whose
    // import we are trying to inform. A config reading process.env at its top level — a
    // very common shape — would otherwise see undefined on the only import that happens.
    writeFileSync(join(dir, '.env'), 'WAS_CFG_TOPLEVEL=from_file\n');
    writeConfig(
      `export default { baseURL: 'http://localhost:3000', envFile: '.env',` +
        ` name: process.env.WAS_CFG_TOPLEVEL ?? 'unset' };`,
    );

    const config = await loadConfig({ cwd: dir });

    expect(config.name).toBe('from_file');
  });

  it('lets an explicit envFile option win, and loads it before the config imports', async () => {
    writeFileSync(join(dir, 'other.env'), 'WAS_CFG_TOPLEVEL=from_other\n');
    writeConfig(
      `export default { baseURL: 'http://localhost:3000',` +
        ` name: process.env.WAS_CFG_TOPLEVEL ?? 'unset' };`,
    );

    const config = await loadConfig({ cwd: dir, envFile: 'other.env' });

    expect(config.name).toBe('from_other');
  });

  it('fails loudly when the declared env file is not there', async () => {
    writeConfig(`export default { baseURL: 'http://localhost:3000', envFile: '.env' };`);
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/no env file at/);
  });

  it('loads nothing, and reports nothing, when no env file is declared', async () => {
    writeConfig(`export default { baseURL: 'http://localhost:3000' };`);
    const config = await loadConfig({ cwd: dir });
    expect(config.envFiles).toEqual([]);
  });
});
