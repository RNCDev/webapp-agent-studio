// @ts-check
// Sign in by filling the real sign-in form.
//
// THE DEFAULT, BECAUSE SIGNING IN THE WAY A PERSON DOES IS THE POINT. A harness that
// injects a session cookie skips the one screen every visitor must pass through, and then
// re-verifies a state the real app never enters that way. The form costs a couple of
// seconds per session; fidelity is worth more.
//
// Locators are configuration, not code — a project names its labels and its button.

import { defineAuthProvider, requireField } from './provider.mjs';

/**
 * @param {object} [options]
 * @param {string} [options.emailLabel] accessible label of the email field
 * @param {string} [options.passwordLabel] accessible label of the password field
 * @param {string} [options.submitName] accessible name of the submit button
 * @param {string} [options.emailField] which identity field holds the email
 * @param {string} [options.passwordField] which identity field holds the password
 * @param {string} [options.formSelector] optional: wait for the form before filling
 */
export function formAuthProvider(options = {}) {
  const {
    emailLabel = 'Email',
    passwordLabel = 'Password',
    submitName = 'Sign in',
    emailField = 'email',
    passwordField = 'password',
    formSelector,
  } = options;

  return defineAuthProvider({
    kind: 'form',
    async signIn({ page, identity }) {
      const email = requireField(identity, emailField, 'form');
      const password = requireField(identity, passwordField, 'form');

      if (formSelector !== undefined) {
        await page.waitForSelector(formSelector, { timeout: 15_000 });
      }
      await page.getByLabel(emailLabel).fill(email);
      await page.getByLabel(passwordLabel).fill(password);
      // `exact` so a "Sign in" button is not also matched by a "Sign in with Google" one —
      // clicking the wrong control is a failure that looks like a hang.
      await page.getByRole('button', { name: submitName, exact: true }).click();
    },
  });
}
