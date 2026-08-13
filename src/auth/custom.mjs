// @ts-check
// The escape hatch: sign in however this project signs in.
//
// Everything the built-in providers do is available to the function — page, context,
// identity, config — and nothing is assumed about what it does with them.

import { defineAuthProvider } from './provider.mjs';

/**
 * @param {(args: import('./provider.mjs').SignInArgs) => Promise<void>} fn
 * @param {{ kind?: string, client?: import('./provider.mjs').AuthProvider['client'] }} [options]
 */
export function customAuthProvider(fn, options = {}) {
  if (typeof fn !== 'function') {
    throw new Error('customAuthProvider needs a signIn function');
  }
  return defineAuthProvider({
    kind: options.kind ?? 'custom',
    signIn: fn,
    ...(options.client !== undefined ? { client: options.client } : {}),
  });
}
