// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import { env, identityFor, normalizeConfig } from '../src/config.mjs';

afterEach(() => {
  delete process.env.STUDIO_TEST_PASSWORD;
  delete process.env.STUDIO_BASE_URL;
});

describe('config', () => {
  it('requires baseURL and nothing else', () => {
    const config = normalizeConfig({ baseURL: 'http://localhost:3000' });
    expect(config.baseURL).toBe('http://localhost:3000');
    expect(config.auth).toBeNull();
    expect(config.history.keepRuns).toBe(10);
  });

  it('refuses a config with no baseURL', () => {
    expect(() => normalizeConfig(/** @type {any} */ ({}))).toThrow(/only required field/);
  });

  it('lets the environment point a run at another server', () => {
    process.env.STUDIO_BASE_URL = 'http://elsewhere:9999';
    expect(normalizeConfig({ baseURL: 'http://localhost:3000' }).baseURL).toBe(
      'http://elsewhere:9999',
    );
  });

  it('does not throw at load for an unset credential', () => {
    // Several commands load the config for baseURL alone; a config that threw at import
    // because a password was unset would make those unrunnable.
    const config = normalizeConfig({
      baseURL: 'http://localhost:3000',
      identities: { member: { email: 'a@b.c', password: env('STUDIO_TEST_PASSWORD') } },
    });
    expect(config.identities.member.email).toBe('a@b.c');
  });

  it('throws at the point of use, naming the variable and the hint', () => {
    const config = normalizeConfig({
      baseURL: 'http://localhost:3000',
      identities: {
        member: { password: env('STUDIO_TEST_PASSWORD', 'add it to .env.local') },
      },
    });
    expect(() => config.identities.member.password).toThrow(
      /STUDIO_TEST_PASSWORD is not set.*add it to \.env\.local/,
    );
  });

  it('reads the value once it is set', () => {
    const config = normalizeConfig({
      baseURL: 'http://localhost:3000',
      identities: { member: { password: env('STUDIO_TEST_PASSWORD') } },
    });
    process.env.STUDIO_TEST_PASSWORD = 'hunter2';
    expect(config.identities.member.password).toBe('hunter2');
  });

  it('names the declared identities when asked for one that does not exist', () => {
    const config = normalizeConfig({
      baseURL: 'http://x',
      identities: { admin: {}, member: {} },
    });
    expect(() => identityFor(config, 'nobody')).toThrow(/declared: admin, member/);
  });

  it('defaults to the first identity when a loop names none', () => {
    const config = normalizeConfig({
      baseURL: 'http://x',
      identities: { admin: { email: 'a' }, member: { email: 'm' } },
    });
    expect(identityFor(config, undefined)?.name).toBe('admin');
  });
});
