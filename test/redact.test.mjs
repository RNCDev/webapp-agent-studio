// @ts-check
import { describe, expect, it } from 'vitest';
import { createRedactor, PRESETS } from '../src/redact.mjs';

const redactor = createRedactor();

describe('redaction', () => {
  it('replaces a 43-character base64url token', () => {
    const token = 'A'.repeat(43);
    expect(redactor.redactText(`code=${token}`)).toBe('code=[REDACTED]');
  });

  it('leaves a 40-character git SHA alone', () => {
    // The threshold is 43 precisely so this survives — a SHA in a finding is something to
    // read, not a credential to hide.
    const sha = 'a'.repeat(40);
    expect(redactor.redactText(`fixed in ${sha}`)).toBe(`fixed in ${sha}`);
  });

  it('redacts every occurrence, not only the first', () => {
    const a = 'A'.repeat(43);
    const b = 'B'.repeat(44);
    expect(redactor.redactText(`${a} and ${b}`)).toBe('[REDACTED] and [REDACTED]');
  });

  it('redacts a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef-_123';
    expect(redactor.redactText(jwt)).not.toContain('eyJzdWIiOiIxIn0');
  });

  it('redacts inside a URL, which is how a token reaches errors.json', () => {
    const token = 'x'.repeat(43);
    const out = redactor.redactText(`GET /api/missing?token=${token} 404`);
    expect(out).toBe('GET /api/missing?token=[REDACTED] 404');
  });

  it('walks nested structures without mutating the original', () => {
    const token = 'z'.repeat(43);
    const input = { errors: [{ url: `https://x/?t=${token}`, status: 404 }], ok: false };
    const out = /** @type {any} */ (redactor.redactJson(input));
    expect(out.errors[0].url).toBe('https://x/?t=[REDACTED]');
    expect(out.errors[0].status).toBe(404);
    expect(out.ok).toBe(false);
    expect(input.errors[0].url).toContain(token);
  });

  it('refuses a custom pattern without the g flag', () => {
    // A non-global pattern replaces only the first match, which on a line holding two
    // credentials leaks the second one.
    expect(() =>
      createRedactor({ patterns: [{ name: 'oops', pattern: /secret/ }] }),
    ).toThrow(/must carry the g flag/);
  });

  it('names the available presets when given an unknown one', () => {
    expect(() => createRedactor({ presets: ['nope'] })).toThrow(/available:/);
  });

  it('applies project patterns alongside the presets', () => {
    const r = createRedactor({ patterns: [{ name: 'emp', pattern: /EMP-\d{4}/g }] });
    expect(r.redactText('EMP-1234 and EMP-9999')).toBe('[REDACTED] and [REDACTED]');
  });

  it('does not carry lastIndex between calls', () => {
    // A shared global RegExp holds state; two calls in a row must behave identically.
    const token = 'q'.repeat(43);
    expect(redactor.redactText(token)).toBe('[REDACTED]');
    expect(redactor.redactText(token)).toBe('[REDACTED]');
  });

  it('ships the presets the config template names', () => {
    for (const name of ['long-token', 'jwt', 'auth-header', 'vendor-key', 'password-field']) {
      expect(PRESETS[name]).toBeDefined();
    }
  });
});
