/**
 * @param {object} [options]
 * @param {string} [options.emailLabel] accessible label of the email field
 * @param {string} [options.passwordLabel] accessible label of the password field
 * @param {string} [options.submitName] accessible name of the submit button
 * @param {string} [options.emailField] which identity field holds the email
 * @param {string} [options.passwordField] which identity field holds the password
 * @param {string} [options.formSelector] optional: wait for the form before filling
 */
export function formAuthProvider(options?: {
    emailLabel?: string | undefined;
    passwordLabel?: string | undefined;
    submitName?: string | undefined;
    emailField?: string | undefined;
    passwordField?: string | undefined;
    formSelector?: string | undefined;
}): import("./provider.mjs").AuthProvider;
