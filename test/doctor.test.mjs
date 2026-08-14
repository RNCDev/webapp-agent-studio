// @ts-check
import { describe, expect, it } from 'vitest';
import { checkMaskSelectors, probeSettleSignedOut } from '../src/verify.mjs';

/**
 * A page stub: a map from selector to its behaviour. The helpers only touch
 * locator().count() / .first().isVisible(), so this is the whole surface.
 *
 * @param {Record<string, {count?: number, visible?: boolean, invalid?: boolean}>} selectors
 */
function stubPage(selectors) {
  return /** @type {any} */ ({
    locator(/** @type {string} */ sel) {
      const entry = selectors[sel] ?? { count: 0 };
      return {
        count: async () => {
          if (entry.invalid) throw new Error(`'${sel}' is not a valid selector`);
          return entry.count ?? 0;
        },
        first: () => ({
          isVisible: async () => entry.visible ?? false,
        }),
      };
    },
  });
}

describe('checkMaskSelectors', () => {
  it('reports how many elements each selector matched', async () => {
    const page = stubPage({ '.secret': { count: 2 }, 'input[type="password"]': { count: 0 } });
    const results = await checkMaskSelectors(page, ['.secret', 'input[type="password"]']);
    expect(results).toEqual([
      { selector: '.secret', ok: true, matches: 2 },
      { selector: 'input[type="password"]', ok: true, matches: 0 },
    ]);
  });

  it('fails a selector the engine rejects, naming it', async () => {
    const page = stubPage({ ':::garbage': { invalid: true } });
    const results = await checkMaskSelectors(page, [':::garbage']);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain(':::garbage');
  });
});

describe('probeSettleSignedOut', () => {
  it('reports a settle selector absent from the signed-out screen — the good case', async () => {
    const page = stubPage({ '.app-nav': { count: 0 } });
    expect(await probeSettleSignedOut(page, '.app-nav')).toEqual({
      present: false,
      visible: false,
    });
  });

  it('reports present-but-hidden, which still gates a visibility wait', async () => {
    const page = stubPage({ '.app-nav': { count: 1, visible: false } });
    expect(await probeSettleSignedOut(page, '.app-nav')).toEqual({
      present: true,
      visible: false,
    });
  });

  it('reports visible on the signed-out screen — the foot-gun', async () => {
    const page = stubPage({ body: { count: 1, visible: true } });
    expect(await probeSettleSignedOut(page, 'body')).toEqual({
      present: true,
      visible: true,
    });
  });
});
