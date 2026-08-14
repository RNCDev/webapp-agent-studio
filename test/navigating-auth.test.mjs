// @ts-check
import { describe, expect, it } from 'vitest';
import { fragmentTokenAuthProvider } from '../src/auth/fragment-token.mjs';
import { customAuthProvider } from '../src/auth/custom.mjs';
import { normalizeConfig } from '../src/config.mjs';

/** A page stub that only records where it was sent. */
function fakePage() {
  /** @type {string[]} */
  const visited = [];
  return {
    visited,
    /** @param {string} url */
    goto: async (url) => {
      visited.push(url);
    },
  };
}

/** @param {Partial<Record<string, unknown>>} [over] */
function config(over = {}) {
  return normalizeConfig({ baseURL: 'http://127.0.0.1:8200/studio/', ...over });
}

describe('fragmentTokenAuthProvider', () => {
  it('drives the token in the fragment, against baseURL', async () => {
    const provider = fragmentTokenAuthProvider({ obtain: () => 'jwt-value' });
    const page = fakePage();

    await provider.signIn(
      /** @type {any} */ ({ page, context: {}, identity: {}, config: config() }),
    );

    expect(page.visited).toEqual(['http://127.0.0.1:8200/studio/#token=jwt-value']);
  });

  it('declares that it navigates, so the harness will not visit first', () => {
    // The whole reason the flag exists: the harness's visit would be cancelled by this
    // one, and the cancelled request collected as a real failed request.
    expect(fragmentTokenAuthProvider({ obtain: () => 't' }).navigates).toBe(true);
  });

  it('keeps a sub-path baseURL rather than resolving away from it', async () => {
    const provider = fragmentTokenAuthProvider({ obtain: () => 't', param: 'access' });
    const page = fakePage();

    await provider.signIn(
      /** @type {any} */ ({ page, context: {}, identity: {}, config: config() }),
    );

    expect(page.visited[0]).toBe('http://127.0.0.1:8200/studio/#access=t');
  });

  it('honours an explicit landing path', async () => {
    const provider = fragmentTokenAuthProvider({ obtain: () => 't', path: 'auth/callback' });
    const page = fakePage();

    await provider.signIn(
      /** @type {any} */ ({ page, context: {}, identity: {}, config: config() }),
    );

    expect(page.visited[0]).toBe('http://127.0.0.1:8200/studio/auth/callback#token=t');
  });

  it('reads the token from the identity, which is where the secret lives', async () => {
    const provider = fragmentTokenAuthProvider({
      obtain: (identity) => `signed:${identity.userId}`,
    });
    const page = fakePage();

    await provider.signIn(
      /** @type {any} */ ({ page, context: {}, identity: { userId: 3 }, config: config() }),
    );

    expect(page.visited[0]).toContain('#token=signed%3A3');
  });

  it('refuses an obtain that returns nothing, rather than driving an empty fragment', async () => {
    const provider = fragmentTokenAuthProvider({ obtain: () => '' });
    await expect(
      provider.signIn(
        /** @type {any} */ ({ page: fakePage(), context: {}, identity: {}, config: config() }),
      ),
    ).rejects.toThrow(/returned no token/);
  });

  it('needs an obtain function at all', () => {
    expect(() => fragmentTokenAuthProvider(/** @type {any} */ ({}))).toThrow(/obtain/);
  });
});

describe('customAuthProvider', () => {
  it('can declare that it navigates', () => {
    const provider = customAuthProvider(async () => {}, { navigates: true });
    expect(provider.navigates).toBe(true);
  });

  it('does not declare it by default, since most custom sign-ins do not navigate', () => {
    expect(customAuthProvider(async () => {}).navigates).toBeUndefined();
  });
});
