/**
 * @param {(args: import('./provider.mjs').SignInArgs) => Promise<void>} fn
 * @param {{ kind?: string, navigates?: boolean, client?: import('./provider.mjs').AuthProvider['client'] }} [options]
 *   Set `navigates: true` when `fn` lands the browser somewhere itself — otherwise the
 *   harness's visit to baseURL is cancelled by yours, and that cancelled request is
 *   collected as a real failed request and scored against `errorBudget`.
 */
export function customAuthProvider(fn: (args: import("./provider.mjs").SignInArgs) => Promise<void>, options?: {
    kind?: string;
    navigates?: boolean;
    client?: import("./provider.mjs").AuthProvider["client"];
}): import("./provider.mjs").AuthProvider;
