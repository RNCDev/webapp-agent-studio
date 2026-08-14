// @ts-check
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendOnce,
  ensureGitignore,
  ensureScripts,
  ignoreLinesFor,
  pointerBlock,
} from '../src/scaffold.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'was-scaffold-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ignoreLinesFor', () => {
  it('uses the default layout when nothing is configured', () => {
    expect(ignoreLinesFor()).toEqual(['loops/*/runs/', '.studio-artifacts/']);
  });

  it('follows a moved loopsDir, which is the whole point', () => {
    // A project that moved its loops after `init` was previously left with run artifacts
    // untracked but NOT ignored — screenshots of a signed-in app one `git add .` from
    // being committed.
    expect(
      ignoreLinesFor({ loopsDir: 'test/browser/loops', artifactsDir: 'test/browser/.scratch' }),
    ).toEqual(['test/browser/loops/*/runs/', 'test/browser/.scratch/']);
  });

  it('tidies a leading ./ and a trailing slash, so the rule still matches', () => {
    expect(ignoreLinesFor({ loopsDir: './e2e/loops/', artifactsDir: './e2e/tmp/' })).toEqual([
      'e2e/loops/*/runs/',
      'e2e/tmp/',
    ]);
  });
});

describe('ensureGitignore', () => {
  it('adds only what is missing', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\nloops/*/runs/\n');
    const added = ensureGitignore(dir, ignoreLinesFor());
    expect(added).toEqual(['.studio-artifacts/']);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.studio-artifacts/');
  });

  it('adds the corrected rules when a project has moved its loops', () => {
    writeFileSync(join(dir, '.gitignore'), 'loops/*/runs/\n.studio-artifacts/\n');
    const added = ensureGitignore(dir, ignoreLinesFor({ loopsDir: 'e2e/loops' }));
    expect(added).toEqual(['e2e/loops/*/runs/']);
  });

  it('writes nothing on a dry run, but still reports what it would add', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    const before = readFileSync(join(dir, '.gitignore'), 'utf8');

    const added = ensureGitignore(dir, ignoreLinesFor(), { dryRun: true });

    expect(added).toEqual(['loops/*/runs/', '.studio-artifacts/']);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(before);
  });
});

describe('ensureScripts', () => {
  it('adds the three studio scripts and leaves existing ones alone', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest', 'studio:run': 'mine' } }),
    );

    const added = ensureScripts(dir);

    expect(added).toEqual(['studio:verify', 'studio:status']);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['studio:run']).toBe('mine');
    expect(pkg.scripts.test).toBe('vitest');
  });

  it('leaves the scripts plain, because envFile is what supplies credentials now', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: {} }));
    ensureScripts(dir);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['studio:verify']).toBe('webapp-agent-studio verify');
    expect(pkg.scripts['studio:verify']).not.toContain('node_modules');
  });

  it('writes nothing on a dry run', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: {} }));
    const added = ensureScripts(dir, { dryRun: true });
    expect(added.length).toBe(3);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts).toEqual({});
  });
});

describe('pointerBlock', () => {
  it('names the configured loops directory, not the default', () => {
    expect(pointerBlock('my-app', { loopsDir: 'e2e/loops' })).toContain('`e2e/loops/<loop>/runs/');
  });
});

describe('appendOnce', () => {
  it('writes nothing on a dry run but reports the outcome', () => {
    const file = join(dir, 'CLAUDE.md');
    writeFileSync(file, '# Existing\n');

    expect(appendOnce(file, '\n## Block\n', 'marker', { dryRun: true })).toBe('appended');
    expect(readFileSync(file, 'utf8')).toBe('# Existing\n');
  });

  it('is idempotent once the marker is there', () => {
    const file = join(dir, 'CLAUDE.md');
    writeFileSync(file, '# Existing\n');
    appendOnce(file, '\n## webapp-agent-studio\n', 'webapp-agent-studio');
    expect(appendOnce(file, '\n## webapp-agent-studio\n', 'webapp-agent-studio')).toBe(
      'already there',
    );
  });
});
