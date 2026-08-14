// @ts-check
// Clerk sign-in: drive the real <SignIn /> component, the way a person does.
//
// DELIBERATELY NOT AN HTTP FLOW. Clerk's frontend API is a versioned, client-handshaked
// protocol (a `__client` JWT, device attestation on some plans) that changes under
// automation and is different again in production instances — a hand-rolled HTTP sign-in
// is exactly the kind of per-project archaeology this package exists to absorb, and it
// would break silently. Driving the component costs a couple of seconds and exercises the
// path every visitor walks, which is the same reason the form provider is the default.
//
// The component is two-step by default: identifier, Continue, then password, Continue.
// Single-step layouts (password field already on screen) are handled by checking before
// clicking.

import { defineAuthProvider, requireField } from './provider.mjs';

/**
 * @param {object} [options]
 * @param {string} [options.identifierField] which identity field holds the identifier
 * @param {string} [options.passwordField] which identity field holds the password
 * @param {string} [options.identifierInput] selector for Clerk's identifier input
 * @param {string} [options.passwordInput] selector for Clerk's password input
 * @param {string} [options.continueName] accessible name of the continue/submit button
 * @param {number} [options.timeout] per-step wait, ms
 */
export function clerkAuthProvider(options = {}) {
  const {
    identifierField = 'email',
    passwordField = 'password',
    identifierInput = 'input[name="identifier"]',
    passwordInput = 'input[name="password"]',
    continueName = 'Continue',
    timeout = 15_000,
  } = options;

  return defineAuthProvider({
    kind: 'clerk',
    async signIn({ page, identity }) {
      const identifier = requireField(identity, identifierField, 'clerk');
      const password = requireField(identity, passwordField, 'clerk');

      await page.locator(identifierInput).waitFor({ state: 'visible', timeout });
      await page.locator(identifierInput).fill(identifier);

      // Two-step unless the password field is already on screen. `first()` because Clerk
      // renders a hidden duplicate of the button in some layouts.
      if (!(await page.locator(passwordInput).isVisible())) {
        await page.getByRole('button', { name: continueName }).first().click();
        await page.locator(passwordInput).waitFor({ state: 'visible', timeout });
      }
      await page.locator(passwordInput).fill(password);
      await page.getByRole('button', { name: continueName }).first().click();
    },
  });
}
