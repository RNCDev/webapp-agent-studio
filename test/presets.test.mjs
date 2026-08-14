// @ts-check
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configTemplate, detectFramework } from '../src/scaffold.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, unknown>} pkg */
function projectWith(pkg) {
  const dir = mkdtempSync(join(tmpdir(), 'was-preset-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}

describe('detectFramework', () => {
  it('detects Next.js and its default port', () => {
    const root = projectWith({ dependencies: { next: '^15.0.0', react: '^19' } });
    expect(detectFramework(root)).toEqual({
      framework: 'next',
      label: 'Next.js',
      baseURL: 'http://localhost:3000',
      start: 'npm run dev',
    });
  });

  it('detects Remix before Vite — Remix runs on Vite, so the order matters', () => {
    const root = projectWith({
      dependencies: { '@remix-run/react': '^2' },
      devDependencies: { vite: '^6' },
    });
    expect(detectFramework(root)?.framework).toBe('remix');
  });

  it('detects a plain Vite app and its default port', () => {
    const root = projectWith({ devDependencies: { vite: '^6.0.0' } });
    expect(detectFramework(root)).toEqual({
      framework: 'vite',
      label: 'Vite',
      baseURL: 'http://localhost:5173',
      start: 'npm run dev',
    });
  });

  it('returns undefined when nothing is recognised', () => {
    const root = projectWith({ dependencies: { express: '^4' } });
    expect(detectFramework(root)).toBeUndefined();
  });

  it('returns undefined when there is no package.json at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'was-preset-'));
    dirs.push(dir);
    expect(detectFramework(dir)).toBeUndefined();
  });
});

describe('configTemplate with a detected framework', () => {
  it('pre-fills the start command so the studio can boot the app itself', () => {
    const written = configTemplate({
      name: 'app',
      baseURL: 'http://localhost:3000',
      start: 'npm run dev',
    });
    expect(written).toContain(`start: 'npm run dev'`);
    expect(written).toContain('http://localhost:3000');
  });

  it('leaves start commented out when nothing was detected', () => {
    const written = configTemplate({ name: 'app', baseURL: 'http://localhost:5173' });
    expect(written).toContain(`// start: 'npm run dev'`);
  });
});
