// @ts-check
// The exit contract, in one place.
//
// TWO FAILURES THAT MUST NEVER BLUR. "The app is broken" and "the studio is broken" call
// for different people doing different things, and an unattended caller — CI, a cron, an
// agent session — cannot tell them apart from a bare nonzero. So:
//
//   0  the eval was green
//   1  checks failed — the APP has a problem
//   2  the studio could not run — unreachable app, bad config, no auth, missing browser
//
// A studio that cannot reach the app must never report a failing check: that would read as
// a regression in the app and send someone hunting for a bug that is not there.

export const EXIT_OK = 0;
export const EXIT_CHECKS_FAILED = 1;
export const EXIT_STUDIO_BROKEN = 2;

/** Anything that means the studio itself could not run. Always exit 2. */
export class StudioError extends Error {
  /** @param {string} message @param {{cause?: unknown}} [options] */
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'StudioError';
    this.exitCode = EXIT_STUDIO_BROKEN;
  }
}

/**
 * Is the app answering at all?
 *
 * A plain `run` against a dead dev server would otherwise burn a full Playwright
 * navigation timeout before failing, and fail with a message about a selector rather than
 * about the port. One cheap request turns that into an instant, legible exit 2.
 *
 * Any HTTP answer counts, including a 404 or a 500: something is listening, and what it
 * serves is the app's business. Only a connection failure or a timeout is a dead app.
 *
 * @param {string} baseURL
 * @param {{ timeoutMs?: number }} [options]
 */
export async function assertReachable(baseURL, options = {}) {
  const { timeoutMs = 5_000 } = options;
  try {
    const response = await fetch(baseURL, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain, so the socket closes rather than lingering for the process lifetime.
    await response.arrayBuffer().catch(() => {});
    return { ok: true, status: response.status };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new StudioError(
      `nothing is answering at ${baseURL} (${reason}) — start the app, or point baseURL ` +
        'at a running one. The studio has not driven anything, so this is not a failing ' +
        'check.',
      { cause: err },
    );
  }
}
