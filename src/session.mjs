// @ts-check
// One browser context: a page, the four collectors, and the three things every check is
// built on — capture(), axe(), report().

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectErrors } from './errors.mjs';
import { waitForSettled } from './waits.mjs';

/**
 * @param {object} args
 * @param {import('playwright').BrowserContext} args.context
 * @param {import('playwright').Page} args.page
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {string} args.name
 * @param {string} args.outDir
 * @param {ReturnType<import('./errors.mjs').createSequence>} args.sequence
 * @param {import('./errors.mjs').CollectedError[]} args.errors
 * @param {{name: string, path: string, seq: number, ts: string}[]} args.screenshots
 * @param {{file: string, violations: string[], session: string}[]} args.axeRuns
 */
export function createSession(args) {
  const { context, page, config, name, outDir, sequence, errors, screenshots, axeRuns } =
    args;

  let shot = 0;
  // Independent of `shot`. Sharing capture()'s counter without advancing it means two
  // axe() calls with no intervening capture() — or any axe() before the first capture() —
  // silently overwrite each other's JSON. A loop that runs axe on every screen hits this
  // immediately, so it is not hypothetical.
  let axeShot = 0;

  /**
   * Screenshot into the run dir; returns the path so a caller can Read it.
   *
   * @param {string} shotName
   * @param {object} [options]
   * @param {string[]} [options.mask] selectors painted over BEFORE the pixel is taken
   * @param {boolean} [options.fullPage]
   * @param {boolean} [options.requireMask] assert every mask selector matches something
   * @param {{x: number, y: number, width: number, height: number}} [options.clip]
   * @param {string} [options.element] capture just this element
   * @param {number} [options.scale] device scale for this shot
   * @param {'png' | 'jpeg'} [options.type]
   * @param {number} [options.quality] jpeg only
   */
  async function capture(shotName, options = {}) {
    const {
      mask = config.maskSelectors,
      fullPage = true,
      requireMask = false,
      clip,
      element,
      type = 'png',
      quality,
    } = options;

    // PNG stays the default: agents read text off these images, and JPEG artifacts around
    // small type are exactly where that goes wrong. JPEG is for intermediate shots where
    // size matters more than legibility.
    const extension = type === 'jpeg' ? 'jpg' : 'png';
    const file = join(
      outDir,
      `${String(++shot).padStart(2, '0')}-${shotName}.${extension}`,
    );
    const locators = mask.map((s) => page.locator(s));

    if (requireMask) {
      // A selector matching zero elements is ordinarily NOT an error — a secret-bearing
      // selector is absent from most screens, so an unconditional check would cry wolf on
      // nearly every capture and teach callers to ignore it. `requireMask` is the check
      // author's explicit assertion that THIS capture is of a screen where the mask
      // selectors must be present, which is the one situation where a zero-match is
      // unambiguously the silent-failure mode masking exists to prevent. It requires EVERY
      // selector to match, so pair it with an explicit `mask` naming only the selectors
      // this screen is expected to contain.
      const counts = await Promise.all(locators.map((l) => l.count()));
      const unmatched = mask.filter((_, i) => counts[i] === 0);
      if (unmatched.length > 0) {
        throw new Error(
          `capture('${shotName}'): requireMask selector(s) matched nothing on this screen: ` +
            `${unmatched.join(', ')} — a live credential may be unmasked in this screenshot`,
        );
      }
    }

    // MASK BEFORE THE PIXEL IS TAKEN, not scrub after. Playwright paints over these
    // elements DURING capture, so a live secret never enters the file at all. Scrubbing
    // afterwards would mean the secret existed on disk, and an ignored artifacts directory
    // does not help once someone copies it out.
    const shotOptions = {
      path: file,
      mask: locators,
      ...(type === 'jpeg' ? { type: /** @type {'jpeg'} */ ('jpeg') } : {}),
      ...(quality !== undefined ? { quality } : {}),
    };

    if (element !== undefined) {
      await page.locator(element).screenshot(shotOptions);
    } else if (clip !== undefined) {
      await page.screenshot({ ...shotOptions, clip });
    } else {
      await page.screenshot({ ...shotOptions, fullPage });
    }

    screenshots.push({
      name: shotName,
      path: file,
      seq: sequence.current(),
      ts: new Date().toISOString(),
    });
    return file;
  }

  /**
   * Run axe-core. Returns the REDACTED result; violations[] is what matters.
   *
   * axe is already in the page — the context injected it once at init — so this does not
   * re-evaluate 33k lines of source per call.
   *
   * @param {{ selector?: string }} [options]
   */
  async function axe(options = {}) {
    const selector = options.selector ?? null;
    const hasAxe = await page.evaluate(() => 'axe' in window);
    if (!hasAxe) {
      // Init scripts run at document start on every navigation, so a missing axe means
      // something replaced the document wholesale (a same-page rewrite, a data: URL). Say
      // so rather than throwing a bare "axe is not defined" from inside evaluate.
      throw new Error(
        'axe-core is not present in this page — the context init script did not run, ' +
          'which usually means the page was replaced rather than navigated',
      );
    }
    const result = await page.evaluate(
      (sel) =>
        // @ts-expect-error — axe is injected into the page, not typed on window here.
        window.axe.run(sel === null ? document : document.querySelector(sel)),
      selector,
    );
    // axe-core serializes each node's outerHTML into violations[]/passes[]/incomplete[]
    // .nodes[].html — and `passes` is on by default, so this fires even on a clean screen.
    // A framework reflects a filled input's `value` as a real attribute, and an element
    // rendering a live credential puts it straight into that HTML string. capture()'s
    // pixel masking does not touch this — it protects the image, not axe's JSON dump — so
    // this is redacted independently. Redact BOTH the written file and the returned value:
    // a caller that logs the return must not be able to reintroduce the leak.
    const redacted = /** @type {{violations: {id: string}[]}} */ (config.redactJson(result));
    const file = join(outDir, `axe-${String(++axeShot).padStart(2, '0')}.json`);
    writeFileSync(file, JSON.stringify(redacted, null, 2));
    // Recorded so the runner can score an accessibility budget as a check of its own,
    // without every loop having to tally its own violations by hand.
    axeRuns.push({
      file,
      violations: (redacted.violations ?? []).map((v) => v.id),
      session: name,
    });
    return redacted;
  }

  /** Flush the collected errors. Redacted: a 4xx URL can carry a token in its path. */
  async function report() {
    const file = join(outDir, 'errors.json');
    writeFileSync(file, JSON.stringify(config.redactJson(errors), null, 2));
    return file;
  }

  async function close() {
    await context.close();
  }

  return {
    name,
    page,
    context,
    errors,
    screenshots,
    outDir,
    capture,
    axe,
    report,
    close,
    /** @param {string} label exact accessible name of a nav link */
    navTo: (label) => page.getByRole('link', { name: label, exact: true }).click(),
    /** @param {{timeout?: number}} [options] */
    settle: (options = {}) =>
      waitForSettled(page, config.settle, options.timeout ?? config.settleTimeout),
  };
}

/** @typedef {ReturnType<typeof createSession>} Session */

/** @param {string} dir */
export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export { collectErrors };
