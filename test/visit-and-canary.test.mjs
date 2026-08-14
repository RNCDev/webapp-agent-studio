// @ts-check
import { describe, expect, it } from 'vitest';
import { shouldVisitFirst } from '../src/harness.mjs';
import { plantedCanary } from '../src/verify.mjs';
import { createRedactor, PRESETS } from '../src/redact.mjs';
import { fragmentTokenAuthProvider } from '../src/auth/fragment-token.mjs';

const navigating = fragmentTokenAuthProvider({ obtain: () => 't' });
const plain = /** @type {any} */ ({ kind: 'form', signIn: async () => {} });

describe('shouldVisitFirst', () => {
  it('visits first for an ordinary provider', () => {
    expect(shouldVisitFirst({ signIn: true, auth: plain })).toBe(true);
  });

  it('does not visit first for a provider that navigates itself', () => {
    expect(shouldVisitFirst({ signIn: true, auth: navigating })).toBe(false);
  });

  it('still visits for a signed-out session, which has nothing else to navigate it', () => {
    // Skipping here would settle against about:blank, which reads as a hanging app.
    expect(shouldVisitFirst({ signIn: false, auth: navigating })).toBe(true);
  });

  it('lets an explicit goto win in both directions', () => {
    expect(shouldVisitFirst({ goto: true, signIn: true, auth: navigating })).toBe(true);
    expect(shouldVisitFirst({ goto: false, signIn: true, auth: plain })).toBe(false);
  });

  it('visits first when there is no auth at all', () => {
    expect(shouldVisitFirst({ signIn: false, auth: null })).toBe(true);
  });
});

describe('plantedCanary', () => {
  it('is shaped like a JWT, so the default presets catch it', () => {
    expect(PRESETS.jwt.pattern.test(plantedCanary())).toBe(true);
  });

  it('is different every run, so a stale artifact cannot answer for this one', () => {
    // A fixed canary would let a leak from a PREVIOUS run read as this one's — and worse,
    // let a run that planted nothing match an old file and pass.
    expect(plantedCanary()).not.toBe(plantedCanary());
  });

  it('is removed by the default redactor, which is what verify then asserts', () => {
    const canary = plantedCanary();
    const { redactText } = createRedactor();
    const out = redactText(`webapp-agent-studio redaction canary: ${canary}`);
    expect(out).not.toContain(canary);
    // The label survives, which is how verify proves the canary reached the artifact at
    // all — absence alone would also be what a dropped collector looks like.
    expect(out).toContain('redaction canary');
  });
});
