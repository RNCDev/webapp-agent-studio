// @ts-check
// Named condition waits, in the page, replacing fixed sleeps.
//
// A `waitForTimeout` is two bugs waiting to happen: too short and the run is flaky, too
// long and every run pays for the worst case. Every wait here names the condition it is
// waiting for, so a timeout says what never became true rather than "20 seconds elapsed".
//
// These poll INSIDE the page (`waitForFunction`), not from Node. A Node-side poll pays a
// round trip per attempt and can only see what a selector query exposes.

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
export async function waitForSettled(page, settle, timeout) {
  if (typeof settle === 'function') {
    await settle(page);
    return;
  }
  await page.waitForSelector(settle, { timeout });
}

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
export async function waitForRows(page, selector, options = {}) {
  const { count = 1, timeout = 10_000 } = options;
  await page.waitForFunction(
    ([sel, min]) =>
      document.querySelectorAll(/** @type {string} */ (sel)).length >=
      /** @type {number} */ (min),
    /** @type {[string, number]} */ ([selector, count]),
    { timeout },
  );
}

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
export async function waitForStableCount(page, selector, options = {}) {
  const { quietMs = 500, timeout = 15_000 } = options;
  await page.waitForFunction(
    ([sel, quiet]) => {
      const key = '__wasStableCount';
      const store = /** @type {Record<string, {count: number, since: number}>} */ (
        // @ts-expect-error — a scratch slot on window, page-side only.
        (window[key] ??= {})
      );
      const selector = /** @type {string} */ (sel);
      const now = Date.now();
      const count = document.querySelectorAll(selector).length;
      const prev = store[selector];
      if (prev === undefined || prev.count !== count) {
        store[selector] = { count, since: now };
        return false;
      }
      return now - prev.since >= /** @type {number} */ (quiet);
    },
    /** @type {[string, number]} */ ([selector, quietMs]),
    { timeout, polling: 100 },
  );
}

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
export async function waitForNetworkIdleAfter(page, action, options = {}) {
  const { timeout = 15_000 } = options;
  const idle = page.waitForLoadState('networkidle', { timeout });
  await action();
  await idle;
}

/**
 * Wait for text to appear anywhere in the page, matched exactly or by substring.
 *
 * @param {import('playwright').Page} page
 * @param {string} text
 * @param {{ timeout?: number }} [options]
 */
export async function waitForText(page, text, options = {}) {
  const { timeout = 10_000 } = options;
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(/** @type {string} */ (needle)),
    text,
    { timeout },
  );
}
