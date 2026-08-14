# webapp-agent-studio

Drive your real web app in a real browser, leave evidence on disk that a person or an
agent can read, and keep a record of what was found, what someone decided to do about it,
and whether the next run bore that out.

---

## What this is for

An agent that changed your app will tell you it works. A test suite will tell you which
assertions passed. Neither leaves you anything to look at afterwards, and neither
remembers what was broken last week.

This package drives the app the way a person does — through the sign-in form, click by
click — and writes what it saw to a directory: screenshots, every console and network
error, accessibility scans, and a report. Then it does the part nothing else does. It
keeps findings across runs, records the directive a human wrote in response, and tells you
on the next run whether the thing you directed actually got fixed.

Five rules hold the whole thing up:

1. **Three states, and unknown never reads as pass.** A check that could not tell you
   anything says so. A judgment nobody has filed is `unknown`. Neither is ever coloured,
   counted, or exit-coded like a success.
2. **Mask before the pixel.** A secret is painted over during capture, so it never enters
   the file. Text artifacts get a second pass of pattern redaction.
3. **Log every error, filter none.** A real regression that produces the same 403 as an
   expected one is indistinguishable from it. Keep everything; let the reader judge.
4. **Exit 1 and exit 2 are different failures.** The app is broken, or the studio is
   broken. An unattended caller must be able to tell them apart.
5. **Assert on artifacts, never on "it didn't throw".** A selector matching nothing looks
   exactly like a pass unless you check what came out.

**It is not** a replacement for unit tests, an autonomous QA agent, or a way to skip
reading the screenshots. It is a way to make the evidence exist.

---

## Install

```bash
npm i -D github:RNCDev/webapp-agent-studio#v0.2.0 playwright
npx playwright install chromium
npx webapp-agent-studio init
```

`init` writes an annotated `studio.config.mjs`, adds the run artifacts to `.gitignore`,
adds the `studio:verify`, `studio:run` and `studio:status` scripts, and appends a short
pointer block to your `CLAUDE.md` or `AGENTS.md` so a future agent session finds the studio
without being told it exists. It recognises Next.js, Remix and Vite off your `package.json`
and pre-fills `baseURL` and the `start` command for them.

**Run it again whenever the config moves.** `init` necessarily runs before you have
customised anything, so it reads the config back off disk and derives the ignore rules and
the pointer block from the layout as it actually stands. If you later change `loopsDir`,
re-run it — otherwise your run artifacts are untracked but *not ignored*, which means
screenshots of a signed-in application sitting in `git status` waiting to be committed by
accident. `--sync` reconciles everything without touching the config; `--dry-run` shows
what it would change and writes nothing.

Node 22 or newer. Playwright is a peer dependency, so you pick the version; `verify`
checks it is one this package supports.

Versions are git tags — there is no registry and no publish step. Pin
`#semver:^0.1.0` to pick up patch tags automatically.

---

## Configure

Everything project-shaped lives in `studio.config.mjs`. Only `baseURL` is required: with
`auth: null` and no identities, a public page gets captures, error collection and
accessibility scans in about five minutes.

```js
import { defineConfig, env } from 'webapp-agent-studio';
import { formAuthProvider } from 'webapp-agent-studio/auth/form';

export default defineConfig({
  baseURL: 'http://localhost:5173',
  start: 'npm run dev',
  settle: '.app-nav',
  auth: formAuthProvider(),
  identities: {
    member: {
      email: env('STUDIO_TEST_EMAIL', 'add it to .env.local'),
      password: env('STUDIO_TEST_PASSWORD', 'add it next to the email'),
    },
  },
  redact: { maskSelectors: ['.invite-code', 'input[type="password"]'] },
});
```

### `envFile`: where the credentials come from

Signing in nearly always needs a secret, and almost nobody commits one. Point `envFile` at
your `.env` and the CLI loads it before anything reads the environment:

```js
export default defineConfig({ baseURL: '…', envFile: '.env' });
```

Without this a project has to bypass the command entirely and invoke
`node --env-file=.env node_modules/webapp-agent-studio/bin/webapp-agent-studio.mjs …` by
hand, which loses `npx` and hardcodes a path into `node_modules`. `--env-file <path>`
overrides it for one invocation; a file named and then not found is an immediate exit 2,
never a silent skip.

**Node never lets an env file overwrite a variable the environment already has.** That is
true of `--env-file` and of this alike, so a stale value inherited from your shell wins
silently and surfaces as an authentication failure pointing at nothing. The CLI names any
variable it finds shadowed that way, so you can unset it.

### `start`: the studio can boot the app itself

When nothing answers at `baseURL`, `run` and `verify` run the `start` command, wait for
the app to answer, and stop it again afterwards. An app that is **already** running is
used as-is and never touched — a dev server you are working against survives every run.
The object form takes `{ command, readyTimeout, cwd }`, and `--start "<command>"` on the
CLI overrides the config for one invocation. With no `start` at all, a dead port stays
what it always was: an immediate, legible exit 2.

### An app served under a sub-path

If the app does not live at the root — say it is hosted at `https://host/studio` — put the
sub-path in `baseURL` **with a trailing slash**: `http://127.0.0.1:8200/studio/`. Every
other path is resolved against it with `new URL(...)`, and without the slash the last
segment is treated as a filename and dropped, so `#/widget/x` would resolve against
`/` rather than `/studio/`.

That first visit is also the signed-out screen the settle doctor probes, so pointing
`baseURL` at the app's own entry rather than the bare origin makes that check meaningful.

### The settle wait is the field most worth getting right

A single-page app paints its signed-out shell immediately and only moves once an async
session restore resolves. `page.goto()` returns well before that. So `settle` must name
something that exists **only after** the app has settled. Name a selector that is also on
the pre-settle screen and every screenshot catches the flash — a run that signed in
cleanly will still be full of signed-out pictures. A function is allowed for anything more
involved than a selector.

### Identities and `env()`

Each secret is an `env()` getter that throws **at the point of use**, naming the variable
and printing your hint. A loop that never signs in as admin never needs the admin password
set, and a command that only wants `baseURL` still runs with no environment at all.

### Choosing an auth provider

| Provider | When |
| --- | --- |
| `formAuthProvider` | The default. Fills the real sign-in form, because signing in the way a person does is the point. Labels and the button name are config. |
| `betterAuthProvider` | better-auth apps. Signs in over HTTP and hands the cookies to the browser — use it when the form is not what you are testing. Also gives your hooks an `apiFetch` that solves the cookie-jar and `Origin` problem below. |
| `nextAuthProvider` | NextAuth / Auth.js credentials apps. Walks csrf → callback over HTTP — the token must ride in the body **and** the cookie, which is the trap this absorbs — and hands the session cookies to the browser. |
| `supabaseAuthProvider` | Supabase apps. Runs the GoTrue password grant and plants the session in the `sb-<ref>-auth-token` localStorage key supabase-js reads on boot. Also exposes an `apiFetch` for PostgREST calls from hooks. |
| `clerkAuthProvider` | Clerk apps. Drives the real `<SignIn />` component, two-step and all — Clerk's frontend API is a client-handshaked protocol that breaks under hand-rolled HTTP, so the form is the honest path. |
| `tokenAuthProvider` | You obtain a token some other way and inject it as a cookie, header, or localStorage entry. |
| `fragmentTokenAuthProvider` | Your app finishes signing in by landing on `/app/#token=<jwt>`. You mint that token; this drives that URL. See below. |
| `customAuthProvider` | Anything else. You get page, context, identity and config. |

> **Company apps behind Entra, Okta or similar.** The identity provider will not be driven
> by automation, and it is not what you are testing. But such an app almost always ends
> sign-in by redirecting to something like `/app/#token=<jwt>`, where the front end lifts
> the token out of the fragment and scrubs the address bar. `fragmentTokenAuthProvider`
> mints that same token and drives that same URL, so you are signed in as a **real user**
> and the API authorizes exactly as it would in production — never a service account that
> can see everything.
>
> ```js
> auth: fragmentTokenAuthProvider({
>   obtain: (identity) => new SignJWT({})
>     .setProtectedHeader({ alg: 'HS256' })
>     .setIssuer('studio').setSubject(String(identity.userId))
>     .setIssuedAt().setExpirationTime('8h')
>     .sign(new TextEncoder().encode(identity.secret)),
> }),
> ```

### A provider that navigates must say so

`startStudio` visits `baseURL` and *then* signs in. A provider that lands the browser
itself — a fragment token, an SSO callback path — has that visit cancelled out from under
it, and the cancelled page load is collected as a genuine failed request and scored against
`errorBudget`: a failure caused by the test, in a package that never filters errors.

Declare `navigates: true` on the provider and the harness skips the visit for every session
that uses it. `fragmentTokenAuthProvider` already does. For a hand-rolled one:

```js
customAuthProvider(async ({ page, identity, config }) => { … }, { navigates: true })
```

Per-session `goto: false` still works and still wins, but it belongs on the provider — the
thing that actually knows — not repeated in every loop.

> **The trap `betterAuthProvider` exists to absorb.** better-auth rejects any non-GET
> request carrying a `Cookie` without a matching `Origin`, with `403
> MISSING_OR_NULL_ORIGIN`. Browsers always send `Origin`; **Node's `fetch` does not**, and
> it has no cookie jar either. Every non-GET call from Node must supply both by hand. The
> failure is a 403 whose message names CSRF and points at nothing, and it costs a day to
> find. Do not re-solve it per project.

### Hooks

`beforeRun`, `afterRun` and `purge` are your code, called by the studio. Provisioning a
test user, seeding fixtures and cleaning up afterwards are things only your project knows
how to do. Get an authenticated HTTP client from the auth provider rather than writing
another sign-in.

---

## Verify first, and then falsify it

```bash
npx webapp-agent-studio verify
```

It signs in, captures, scans, and then checks what came out: the screenshot is bigger than
a floor a blank page could not reach, the accessibility JSON parses, `errors.json` exists,
and — if you set `verify.plantedSecret` — that the planted secret appears in no artifact
at all.

It also doctors the three config foot-guns while it has a real page: every mask selector
is one the engine accepts (with its match count reported), custom redact patterns carry
`/g`, and the settle selector is **not visible on the signed-out screen** — the one
mistake that makes every screenshot catch the flash.

**Now falsify it.** Stop the app and run it again. It must fail promptly, name the URL,
and exit 2. If it ever reports green against nothing, stop and fix that before trusting a
single loop result.

---

## The loop lifecycle

A loop is a question: a task, an eval, and a remediation mode.

```bash
npx webapp-agent-studio new-loop 007-checkout
```

```js
export default defineLoop({
  task: 'Drive the checkout flow as a member; every screen captured',
  session: { identity: 'member' },
  eval: {
    checks: [
      {
        name: 'cart-totals',
        run: async ({ page, capture, axe }) => {
          await capture('cart');
          await axe();                       // the axe budget scores what checks scanned
          const total = await page.locator('.total').innerText();
          return total === '£42.00'
            ? { status: 'pass', detail: total }
            : { status: 'fail', detail: `total was ${total}` };
        },
      },
    ],
    axe: { maxViolations: 0 },
    errorBudget: 0,
    judgments: [
      { name: 'dark-contrast',
        instruction: 'Is the total legible against the dark background?',
        artifacts: ['01-cart.png'] },
    ],
  },
  remediation: { mode: 'human' },
});
```

**A check returns a verdict.** Returning nothing records `unknown`, never `pass` — a check
whose body was skipped by an early return looks exactly like one that succeeded, and this
is the single most important rule in the package. Where a check looks for a shape that may
legitimately be absent, return `unknown` with the numbers that explain why.

**A check receives more than `page`.** The full set:

| | |
| --- | --- |
| `page` | the signed-in Playwright page for this loop's session |
| `capture(name)` | screenshot into the run directory, masked; returns the path |
| `axe({selector?})` | scan and record violations. **An `axe` budget scores only what a check scanned** — declaring the budget and never calling this records `unknown`, not a pass |
| `ctx` | a plain object shared by every check in the run, and by `setup`. How a later check uses what an earlier one found |
| `config` | the resolved config, for `baseURL` and anything else project-shaped |
| `session` | this session, if you need `session.context` or a second page |
| `studio` | the browser, to open another session (a second identity, dark mode) |

**Budgets are scored as checks**, so `axe` and `errorBudget` appear in the tally, the diff
and the findings exactly like the ones you wrote.

**Runs are iterations of the same loop.** Mint a new loop number only when the task or the
eval changes — when the *question* changes. When a new loop replaces an old one, point its
`supersedes` at the old one and keep the old one as record.

```
loops/007-checkout/
  loop.mjs          the definition — stable across iterations
  findings.json     the lifecycle; survives run pruning
  directives.md     what you decided, in your words
  runs/001/ 002/    screenshots, results.json, errors.json, axe-*.json,
                    diff.json, report.html, trace-*.zip on failing runs
  runs/latest.json  which run is newest, so nobody computes it
  runs/history.html every kept run on one page: a check × run grid with the
                    findings underneath — is this loop converging?
```

---

## The human-in-the-loop workflow

**Run → read → direct → re-run → confirm.**

```bash
npx webapp-agent-studio run 007-checkout           # run
open loops/007-checkout/runs/002/report.html       # read
npx webapp-agent-studio finding 007-checkout cart-totals \
    --status fix-directed --note "rounding is wrong in the tax line"
#                                                  # direct — and write it in directives.md
npx webapp-agent-studio run 007-checkout           # re-run
#                                                  # the report now says verified-fixed
```

Findings move `open → fix-directed → verified-fixed | accepted`. The runner drafts one for
any failing check that has none, so you curate rather than transcribe.

**A finding that starts passing while still `open` is not verified fixed.** It recovered by
accident, and the report says exactly that. Nobody decided anything, so nothing is known
about why it stopped failing — and a cause nobody found comes back.

Judgments are the part a program cannot settle. They stay `unknown` until someone files a
verdict:

```bash
npx webapp-agent-studio judge loops/007-checkout/runs/002 dark-contrast pass \
    --by ritu --note "legible at 200%"
```

`--by` records whether a person or an agent session decided. Across all loops:

```bash
npx webapp-agent-studio status
```

---

## Commands

| Command | Does |
| --- | --- |
| `init` | Set a project up in one command; recognises Next.js, Remix and Vite |
| `verify` | Drive the app once and assert on the artifacts. `--start "<cmd>"` boots it first |
| `run <loop...>` | Run loops. `--only`/`--from` to re-run part of one, `--trace`/`--no-trace`, `--start "<cmd>"`, `--json`, `--require-judgments` |
| `report <runDir>` | Re-render `report.html` from the JSON on disk |
| `diff <a> <b>` | Compare two runs |
| `new-loop <NNN-name>` | Scaffold a loop |
| `judge <runDir> <name> pass\|fail` | File a verdict |
| `finding <loop> <slug> --status <state>` | Advance a finding |
| `status` | Open findings and pending judgments, all loops |

**Exit codes.** `0` the eval was green. `1` checks failed — the app has a problem. `2` the
studio could not run: unreachable app, bad config, no auth, missing browser. Pending
judgments do **not** fail a run; the summary always prints the count, and
`--require-judgments` turns pending into exit 1 if you want to gate on it.

---

## Managing history

**Commit:** `loop.mjs`, `findings.json`, `directives.md`, and any screenshot you
deliberately curate as evidence of a specific problem.

**Ignore:** `runs/` — `init` does this for you. Screenshots of a signed-in app do not
belong in a repository by accident.

Old runs prune to `history.keepRuns`. Findings and directives live beside `loop.mjs`, not
inside a run, so pruning never costs you the record.

---

## Performance

One chromium for the whole run; each identity or colour scheme is a context, not another
browser. Waits are named conditions polled in the page, never fixed sleeps. `run` takes
several loops and shares the browser across all of them. `--only` re-runs the one check
you are working on. Playwright traces are recorded on every run and kept only when the
run failed — the failing case is maximally debuggable and the green case costs no disk.
`--trace` keeps them always; `--no-trace` skips recording entirely.

Checks stay serial, deliberately: when check 4 fails, what happened in 1 through 3 is the
context for reading it, and interleaved output destroys that.

Per-check timing lands in `results.json`, and the diff flags a check that got markedly
slower. There is no per-check retry, on purpose — slow-then-pass is what flakiness looks
like before it fails, and retrying it away hides the only warning you get.

---

## Non-goals

Self-driving remediation, browsers other than chromium, per-check retry, CI wiring, and
running several loops in parallel.

**There is no quarantine or known-fail state for checks, and there will not be one.** It is
the first step toward unknown reading as pass, which is what this whole design exists to
prevent. A finding marked `fix-directed` already tells a reader the failure is expected.
The exit code stays honest.

---

## For agent sessions

`AGENT-GUIDE.md` in this package is written for a session with only Bash and Read: run a
loop, find the newest run, read the results, file a judgment, advance a finding, and when
to mint a new loop number.
