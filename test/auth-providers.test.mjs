// @ts-check
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { nextAuthClient, nextAuthProvider } from '../src/auth/nextauth.mjs';
import { supabaseAuthProvider, supabaseClient, supabaseStorageKey } from '../src/auth/supabase.mjs';
import { clerkAuthProvider } from '../src/auth/clerk.mjs';

/** @type {(() => Promise<void> | void)[]} */
const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** @param {(req: import('node:http').IncomingMessage, body: string, res: import('node:http').ServerResponse) => void} handle */
async function stubServer(handle) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => handle(req, body, res));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  cleanups.push(() => new Promise((r) => server.close(() => r(undefined))));
  return `http://127.0.0.1:${port}`;
}

// ---------------------------------------------------------------------------- NextAuth

/** A minimal NextAuth credentials backend: /csrf, then /callback/credentials. */
function nextAuthStub() {
  return stubServer((req, body, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/auth/csrf') {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'next-auth.csrf-token=tok%7Chash; Path=/; HttpOnly',
      });
      res.end(JSON.stringify({ csrfToken: 'tok' }));
      return;
    }
    if (url.pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
      const form = new URLSearchParams(body);
      if (form.get('csrfToken') !== 'tok' || !(req.headers.cookie ?? '').includes('csrf-token')) {
        res.writeHead(302, { location: '/api/auth/signin?error=MissingCSRF' });
        res.end();
        return;
      }
      if (form.get('email') === 'member@example.com' && form.get('password') === 'hunter2') {
        res.writeHead(302, {
          location: '/',
          'set-cookie': 'next-auth.session-token=SESSION123; Path=/; HttpOnly',
        });
        res.end();
        return;
      }
      res.writeHead(302, { location: '/api/auth/signin?error=CredentialsSignin' });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

describe('nextAuthClient', () => {
  it('walks csrf → callback and returns the session cookies', async () => {
    const baseURL = await nextAuthStub();
    const client = nextAuthClient({ baseURL });
    const { cookies } = await client.signIn({ email: 'member@example.com', password: 'hunter2' });
    expect(cookies.some((c) => c.name === 'next-auth.session-token')).toBe(true);
    // The csrf cookie rides along — the jar replays what the server set, verbatim.
    expect(cookies.some((c) => c.name === 'next-auth.csrf-token')).toBe(true);
  });

  it('throws the error code — and only the code — on rejected credentials', async () => {
    const baseURL = await nextAuthStub();
    const client = nextAuthClient({ baseURL });
    const attempt = client.signIn({ email: 'member@example.com', password: 'wrong' });
    await expect(attempt).rejects.toThrow('CredentialsSignin');
    await attempt.catch((/** @type {Error} */ err) => {
      expect(err.message).not.toContain('wrong');
    });
  });

  it('is a provider with kind nextauth', () => {
    expect(nextAuthProvider().kind).toBe('nextauth');
  });
});

// ---------------------------------------------------------------------------- Supabase

describe('supabaseStorageKey', () => {
  it('derives the sb-<ref>-auth-token key supabase-js reads', () => {
    expect(supabaseStorageKey('https://abcdefghij.supabase.co')).toBe(
      'sb-abcdefghij-auth-token',
    );
  });

  it('falls back to the hostname for a local stack', () => {
    expect(supabaseStorageKey('http://localhost:54321')).toBe('sb-localhost-auth-token');
  });
});

/** A minimal GoTrue password grant. */
function supabaseStub() {
  return stubServer((req, body, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      if (req.headers.apikey !== 'anon-key') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error_code: 'no_api_key', msg: 'No API key' }));
        return;
      }
      const creds = JSON.parse(body);
      if (creds.email === 'member@example.com' && creds.password === 'hunter2') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'ACCESS',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'REFRESH',
            user: { id: 'u1', email: creds.email },
          }),
        );
        return;
      }
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

describe('supabaseClient', () => {
  it('signs in with the password grant and returns the whole session', async () => {
    const url = await supabaseStub();
    const client = supabaseClient({ url, anonKey: 'anon-key' });
    const session = await client.signIn('member@example.com', 'hunter2');
    expect(session.access_token).toBe('ACCESS');
    expect(session.refresh_token).toBe('REFRESH');
    expect(session.user.id).toBe('u1');
  });

  it('throws the error code — and only the code — on rejected credentials', async () => {
    const url = await supabaseStub();
    const client = supabaseClient({ url, anonKey: 'anon-key' });
    const attempt = client.signIn('member@example.com', 'wrong');
    await expect(attempt).rejects.toThrow('invalid_credentials');
    await attempt.catch((/** @type {Error} */ err) => {
      expect(err.message).not.toContain('wrong');
    });
  });

  it('is a provider with kind supabase', () => {
    expect(supabaseAuthProvider({ url: 'http://x', anonKey: 'k' }).kind).toBe('supabase');
  });
});

// ------------------------------------------------------------------------------- Clerk

/**
 * A fake Clerk sign-in component: the identifier input is on screen; the password input
 * appears only after Continue is clicked. Records fills and clicks.
 */
function fakeClerkPage() {
  const state = {
    passwordVisible: false,
    /** @type {Record<string, string>} */
    fills: {},
    clicks: 0,
  };
  const page = /** @type {any} */ ({
    locator(/** @type {string} */ sel) {
      const isPassword = sel.includes('password');
      return {
        waitFor: async () => {
          if (isPassword && !state.passwordVisible) throw new Error(`timeout waiting for ${sel}`);
        },
        isVisible: async () => (isPassword ? state.passwordVisible : true),
        fill: async (/** @type {string} */ value) => {
          state.fills[sel] = value;
        },
      };
    },
    getByRole(/** @type {string} */ role, /** @type {any} */ opts) {
      return {
        first: () => ({
          click: async () => {
            state.clicks += 1;
            state.passwordVisible = true;
          },
        }),
      };
    },
  });
  return { page, state };
}

describe('clerkAuthProvider', () => {
  it('drives the two-step component: identifier, Continue, password, Continue', async () => {
    const { page, state } = fakeClerkPage();
    const provider = clerkAuthProvider();
    await provider.signIn(
      /** @type {any} */ ({
        page,
        context: {},
        identity: { email: 'member@example.com', password: 'hunter2' },
        config: {},
      }),
    );
    expect(state.fills['input[name="identifier"]']).toBe('member@example.com');
    expect(state.fills['input[name="password"]']).toBe('hunter2');
    expect(state.clicks).toBe(2);
  });

  it('demands the identity fields it needs, legibly', async () => {
    const { page } = fakeClerkPage();
    const provider = clerkAuthProvider();
    await expect(
      provider.signIn(
        /** @type {any} */ ({ page, context: {}, identity: { email: 'x' }, config: {} }),
      ),
    ).rejects.toThrow(/password/);
  });
});
