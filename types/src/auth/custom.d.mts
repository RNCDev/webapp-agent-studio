/**
 * @param {(args: import('./provider.mjs').SignInArgs) => Promise<void>} fn
 * @param {{ kind?: string, client?: import('./provider.mjs').AuthProvider['client'] }} [options]
 */
export function customAuthProvider(fn: (args: import("./provider.mjs").SignInArgs) => Promise<void>, options?: {
    kind?: string;
    client?: import("./provider.mjs").AuthProvider["client"];
}): import("./provider.mjs").AuthProvider;
