/**
 * Wait for the app to reach a determinate post-load state.
 *
 * WHY A FIXED SELECTOR IS NOT ENOUGH ON ITS OWN, AND WHY THIS MATTERS MOST. A single-page
 * app typically paints its signed-out shell synchronously and only moves once an async
 * session restore resolves. `page.goto()` resolves on the network 'load' event, which
 * fires well before that. Capturing right after goto therefore catches the transient
 * signed-out paint even on a run that goes on to sign in cleanly. The settle selector must
 * name a POST-settle root — waiting for any top-level root, including the pre-settle one,
 * resolves on the flash and defeats the point.
 *
 * @param {import('playwright').Page} page
 * @param {string | ((page: import('playwright').Page) => Promise<void>)} settle
 * @param {number} timeout
 */
export function waitForSettled(page: import("playwright").Page, settle: string | ((page: import("playwright").Page) => Promise<void>), timeout: number): Promise<void>;
/**
 * Wait until a selector matches at least `count` elements.
 *
 * The common case is a table that renders empty and then fills. Counting from Node right
 * after the click that requested the data reads the previous state and passes either way.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {{ count?: number, timeout?: number }} [options]
 */
export function waitForRows(page: import("playwright").Page, selector: string, options?: {
    count?: number;
    timeout?: number;
}): Promise<void>;
/**
 * Wait until a selector's match count stops changing.
 *
 * For lists that stream in: "at least one row" resolves on the first, which is rarely the
 * state worth capturing. Stable for `quietMs` is the honest condition.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {{ quietMs?: number, timeout?: number }} [options]
 */
export function waitForStableCount(page: import("playwright").Page, selector: string, options?: {
    quietMs?: number;
    timeout?: number;
}): Promise<void>;
/**
 * Run an action and wait for the network it starts to go quiet.
 *
 * `page.waitForLoadState('networkidle')` alone races the action: fire it after the click
 * and the request may already have completed. This brackets the action instead.
 *
 * @param {import('playwright').Page} page
 * @param {() => Promise<void>} action
 * @param {{ timeout?: number }} [options]
 */
export function waitForNetworkIdleAfter(page: import("playwright").Page, action: () => Promise<void>, options?: {
    timeout?: number;
}): Promise<void>;
/**
 * Wait for text to appear anywhere in the page, matched exactly or by substring.
 *
 * @param {import('playwright').Page} page
 * @param {string} text
 * @param {{ timeout?: number }} [options]
 */
export function waitForText(page: import("playwright").Page, text: string, options?: {
    timeout?: number;
}): Promise<void>;
