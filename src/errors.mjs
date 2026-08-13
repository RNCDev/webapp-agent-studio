// @ts-check
// The four collectors, and the sequence stamps that let the runner attribute an error to
// the check it happened during.
//
// This is the highest-value part of the harness, and it pays off with no assertions
// written at all: a check that clicks through five screens gets a regression flagged for
// free if any of the four ever fired. Each entry carries enough context (url/status/
// message) to be actionable straight out of errors.json, without reproducing the run.
//
// ATTRIBUTION IS A VIEW, NEVER A FILTER. Every collected error is written to errors.json
// whole. The runner marks the sequence window around each check and the report shows
// errors inside that window under that check; everything else shows as "between checks".
// Nothing is dropped, because the reason we do not filter by expected-status also applies
// here: a real regression producing the same shape as an expected entry looks identical
// to it, so the only safe move is to keep everything and let the reader judge.

/**
 * @typedef {object} CollectedError
 * @property {'console' | 'pageerror' | 'requestfailed' | 'response'} kind
 * @property {number} seq monotonic across the whole studio, all sessions
 * @property {string} ts ISO timestamp
 * @property {string} session which session produced it
 * @property {string} [text]
 * @property {string} [message]
 * @property {string} [stack]
 * @property {string} [url]
 * @property {string} [method]
 * @property {string} [failure]
 * @property {number} [status]
 * @property {string} [statusText]
 * @property {unknown} [location]
 */

/**
 * A counter shared by every session in one studio, so the ordering of two sessions'
 * errors against each other is real and not an artifact of which array they landed in.
 */
export function createSequence() {
  let seq = 0;
  return {
    next: () => ++seq,
    /** The current high-water mark, for opening and closing an attribution window. */
    current: () => seq,
  };
}

/**
 * Attach the four collectors to a page. Returns the array they push into.
 *
 * @param {import('playwright').Page} page
 * @param {{ sequence: ReturnType<typeof createSequence>, sessionName: string, sink?: CollectedError[] }} options
 */
export function collectErrors(page, options) {
  const { sequence, sessionName, sink = [] } = options;

  /** @param {Partial<CollectedError> & {kind: CollectedError['kind']}} entry */
  function push(entry) {
    sink.push(
      /** @type {CollectedError} */ ({
        ...entry,
        seq: sequence.next(),
        ts: new Date().toISOString(),
        session: sessionName,
      }),
    );
  }

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    push({ kind: 'console', text: msg.text(), location: msg.location() });
  });

  page.on('pageerror', (err) => {
    push({ kind: 'pageerror', message: err.message, stack: err.stack });
  });

  page.on('requestfailed', (request) => {
    push({
      kind: 'requestfailed',
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText,
    });
  });

  // NOT filtered to "unexpected" 4xx/5xx. An app legitimately 4xxs in places — a
  // not-yet-a-member probe, a deliberate 404 — and those entries landing here is correct,
  // not noise to suppress. Filtering by expected-code hides the one case that matters
  // most: a REAL regression producing the SAME status code as an expected one is
  // indistinguishable from it, so log every 4xx/5xx and let the reader judge.
  page.on('response', (response) => {
    if (response.status() < 400) return;
    push({
      kind: 'response',
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
    });
  });

  return sink;
}

/**
 * The errors that fell inside a check's sequence window.
 *
 * @param {CollectedError[]} errors
 * @param {{ from: number, to: number }} window
 */
export function errorsInWindow(errors, window) {
  return errors.filter((e) => e.seq > window.from && e.seq <= window.to);
}

/**
 * Errors that fell outside every check's window — real, and nobody's check.
 *
 * @param {CollectedError[]} errors
 * @param {{ from: number, to: number }[]} windows
 */
export function unattributedErrors(errors, windows) {
  return errors.filter((e) => !windows.some((w) => e.seq > w.from && e.seq <= w.to));
}
