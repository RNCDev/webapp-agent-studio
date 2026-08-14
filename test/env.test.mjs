// @ts-check
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envFileKeys, loadEnvFile, resetLoadedEnvFiles } from '../src/env.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'was-env-'));
  resetLoadedEnvFiles();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.WAS_TEST_ONE;
  delete process.env.WAS_TEST_TWO;
  delete process.env.WAS_TEST_SHADOWED;
});

describe('envFileKeys', () => {
  it('reads the names a file assigns, ignoring comments and blanks', () => {
    expect(
      envFileKeys('# a comment\n\nFOO=1\nexport BAR=2\n  BAZ = 3\nnot a line\n'),
    ).toEqual(['FOO', 'BAR', 'BAZ']);
  });

  it('is not confused by a value containing an equals sign', () => {
    expect(envFileKeys('TOKEN=a=b=c\n')).toEqual(['TOKEN']);
  });
});

describe('loadEnvFile', () => {
  it('loads values into the environment', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'WAS_TEST_ONE=from_file\nWAS_TEST_TWO=also\n');
    const result = loadEnvFile(file);
    expect(result.loaded).toBe(true);
    expect(process.env.WAS_TEST_ONE).toBe('from_file');
    expect(process.env.WAS_TEST_TWO).toBe('also');
  });

  it('reports a variable the environment already had, because the file cannot win', () => {
    // The trap this exists for: Node never lets an env file overwrite an existing
    // variable, so a stale shell value silently beats the file and surfaces as an
    // authentication failure pointing at nothing.
    process.env.WAS_TEST_SHADOWED = 'from_shell';
    const file = join(dir, '.env');
    writeFileSync(file, 'WAS_TEST_SHADOWED=from_file\nWAS_TEST_ONE=fresh\n');

    const result = loadEnvFile(file);

    expect(result.shadowed).toEqual(['WAS_TEST_SHADOWED']);
    expect(process.env.WAS_TEST_SHADOWED).toBe('from_shell');
    expect(process.env.WAS_TEST_ONE).toBe('fresh');
  });

  it('throws exit-2 style when a named file is not there', () => {
    // Named and missing is a path typo, and continuing would fail later as a missing
    // credential whose real cause is nowhere near the message.
    expect(() => loadEnvFile(join(dir, 'nope.env'))).toThrow(/no env file at/);
  });

  it('is silent about a missing file that was only a convention', () => {
    const result = loadEnvFile(join(dir, 'nope.env'), { required: false });
    expect(result.loaded).toBe(false);
    expect(result.shadowed).toEqual([]);
  });

  it('resolves a relative path against the given root', () => {
    writeFileSync(join(dir, '.env'), 'WAS_TEST_ONE=rooted\n');
    expect(loadEnvFile('.env', { root: dir }).loaded).toBe(true);
    expect(process.env.WAS_TEST_ONE).toBe('rooted');
  });

  it('loads a file once, so a second call is a no-op', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'WAS_TEST_ONE=first\n');
    expect(loadEnvFile(file).loaded).toBe(true);
    expect(loadEnvFile(file).loaded).toBe(false);
  });
});
