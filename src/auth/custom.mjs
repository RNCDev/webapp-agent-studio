// @ts-check
// The escape hatch: sign in however this project signs in.
//
// Everything the built-in providers do is available to the function — page, context,
// identity, config — and nothing is assumed about what it does with them.

import { defineAuthProvider } from './provider.mjs';

/**
 * @param {(args: import('./provider.mjs').SignInArgs) => Promise<void>} fn
 * @param {{ kind?: string, navigates?: boolean, client?: import('./provider.mjs').AuthProvider['client'] }} [options]
 *   Set `navigates: true` when `fn` lands the browser somewhere itself — otherwise the
 *   harness's visit to baseURL is cancelled by yours, and that cancelled request is
 *   collected as a real failed request and scored against `errorBudget`.
 */
export function customAuthProvider(fn, options = {}) {
  if (typeof fn !== 'function') {
    throw new Error('customAuthProvider needs a signIn function');
  }
  return defineAuthProvider({
    kind: options.kind ?? 'custom',
    signIn: fn,
    ...(options.navigates !== undefined ? { navigates: options.navigates } : {}),
    ...(options.client !== undefined ? { client: options.client } : {}),
  });
}
