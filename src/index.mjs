// @ts-check
// The package's public surface.
//
// A consuming project needs `defineConfig` and `env` for its config, `defineLoop` for its
// loops, and the waits. Everything else is reachable but rarely reached for.

export { defineConfig, env, loadConfig, normalizeConfig, identityFor } from './config.mjs';
export { defineLoop, normalizeVerdict } from './loop.mjs';
export { startStudio } from './harness.mjs';
export { runLoop } from './runner.mjs';
export { verify, checkEnvironment, satisfiesRange } from './verify.mjs';
export {
  waitForSettled,
  waitForRows,
  waitForStableCount,
  waitForNetworkIdleAfter,
  waitForText,
} from './waits.mjs';
export {
  createRedactor,
  defaultRedactor,
  PRESETS,
  DEFAULT_PRESETS,
  DEFAULT_MASK_SELECTORS,
} from './redact.mjs';
export { diffTable, formatDiff } from './table-diff.mjs';
export {
  loadFindings,
  saveFindings,
  draftFinding,
  advanceFinding,
  reconcileAfterRun,
  openFindings,
  slugFor,
} from './findings.mjs';
export { fileJudgment } from './judgments.mjs';
export { listRuns, latestRun, previousRun, mintRun, readResults } from './runs.mjs';
export { renderReport, rerenderReport, writeReport } from './report/html.mjs';
export { diffRuns, diffScreenshots } from './report/diff.mjs';
export { validateResults, assertResults, RESULTS_SCHEMA } from './results-schema.mjs';
export {
  EXIT_OK,
  EXIT_CHECKS_FAILED,
  EXIT_STUDIO_BROKEN,
  StudioError,
  assertReachable,
} from './exit.mjs';

// Auth providers are also available at their subpaths (`webapp-agent-studio/auth/form`),
// which is how a config file usually imports them; re-exported here so a project that
// prefers one import line can have one.
export { formAuthProvider } from './auth/form.mjs';
export { tokenAuthProvider } from './auth/token.mjs';
export { customAuthProvider } from './auth/custom.mjs';
export { betterAuthProvider, betterAuthClient } from './auth/better-auth.mjs';
export { defineAuthProvider } from './auth/provider.mjs';
