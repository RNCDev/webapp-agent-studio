# Driving this studio from an agent session

Written for a session with only Bash and Read. Everything below is a shell command and a
file to open; nothing needs a browser you can see.

---

## What you are working with

This project has loops. A loop is a question about the app, driven in a real browser. Each
run of a loop writes a directory holding screenshots, every error the page produced, and a
report. Your job in most sessions is one of:

- run a loop and say what it found,
- read the newest run and judge something a program cannot judge,
- record that a fix was directed, then re-run and confirm it landed.

---

## Run a loop

```bash
npx webapp-agent-studio status                 # what loops exist, what is open
npx webapp-agent-studio run <loop>             # run one
npx webapp-agent-studio run <loop> --json      # same, summary as one JSON object
```

**Read the exit code before anything else.**

| Exit | Means | What to do |
| --- | --- | --- |
| 0 | The eval was green | Read the report anyway if judgments are pending |
| 1 | Checks failed | The **app** has a problem. Read the failing checks and their screenshots |
| 2 | The studio could not run | The **app was unreachable, or the config is wrong**. Do not report this as a bug in the app. Start the dev server and try again |

If you get exit 2, the message names the cause — usually a dead port. Nothing was driven,
so there is nothing to diagnose about the product. When the config has a `start` command,
the studio boots the app itself and stops it afterwards; `--start "<command>"` does the
same for one invocation.

**Credentials come from the config's `envFile`**, so run the plain command — you do not
need `node --env-file=...`. If sign-in fails anyway, look at the first line of output: the
studio prints which file it loaded and names any variable that was **already set in the
environment**, because an env file never overwrites one of those. A stale value inherited
from the shell is the usual cause of an authentication failure that otherwise points at
nothing. `--env-file <path>` overrides the config for one invocation.

---

## Find the newest run

Never compute it by listing directories:

```bash
cat loops/<loop>/runs/latest.json     # {"run": "002", "path": "..."}
```

Every command also prints the run directory and report path it wrote.

---

## Read what happened

The run directory holds:

| File | What it is |
| --- | --- |
| `report.html` | Start here. Every check with its status, screenshots, attributed errors, findings and pending judgments, and the comparison against the previous run |
| `results.json` | The same thing, machine-readable. Parse this when you need numbers |
| `errors.json` | **Every** console, page, request and 4xx/5xx error, unfiltered |
| `axe-*.json` | Accessibility scans, violations only |
| `diff.json` | What changed since the previous run |
| `*.png` | The screenshots — the primary artifact. Read them |
| `trace-*.zip` | Playwright trace, present only when the run failed. Open with `npx playwright show-trace <zip>` |

Beside the runs, `loops/<loop>/runs/history.html` shows every kept run on one page — a
check × run grid with the findings underneath. Read it to answer "is this loop
converging?" without opening each report.

`report.html` is readable as text: every status is spelled out as a word, and the numbers
are in the prose, not only in the colours.

Useful reads:

```bash
# just the failures
node -e "const r=require('./loops/L/runs/002/results.json');console.log(r.checks.filter(c=>c.status!=='pass').map(c=>c.status+' '+c.name+' — '+c.detail).join('\n'))"

# what regressed since last time
cat loops/L/runs/002/diff.json
```

**`unknown` is not `pass`.** A check that returned `unknown` told you nothing — it did not
succeed. If several checks are unknown, ask why before reporting the run as fine. A run
where nothing passed at all fails on purpose.

---

## File a judgment

Judgments are the questions a program cannot settle: is this legible, does this read
clearly, is this layout right. The loop declares them and names the evidence. They sit at
`unknown` until someone decides.

```bash
# the report lists each pending judgment, its instruction, and its evidence files
npx webapp-agent-studio judge loops/<loop>/runs/002 <judgment> pass --by claude \
    --note "checked the contrast in 01-dark.png; the label reads clearly"
```

Read the named artifacts before you file. `--by` matters: the record should say an agent
decided this, not imply a person looked.

Use `fail` when the artifact shows a real problem, and leave it `unknown` if the evidence
does not let you decide — that is a legitimate answer and better than a guess.

---

## Advance a finding

The runner drafts a finding for every failing check. The lifecycle is
`open → fix-directed → verified-fixed | accepted`.

```bash
# after a human (or you, with their agreement) decides what to do about it
npx webapp-agent-studio finding <loop> <slug> --status fix-directed \
    --note "the tax line rounds before summing" --by claude
```

Then write the decision in `loops/<loop>/directives.md` in plain words, ending the line
with the finding slug in backticks. Re-run the loop. If the check now passes, the next
report says **verified fixed**.

A finding that starts passing while still `open` shows as **recovered without being
directed**. That is not a success to report. Nobody decided anything, so nothing is known
about why it stopped failing.

---

## When to mint a new loop

Only when the **question** changes — a different task or a different eval. Everything else
is another run of the same loop, and that is what makes the run-over-run comparison mean
anything.

```bash
npx webapp-agent-studio new-loop 008-checkout-v2
```

If the new loop replaces an old one, set `supersedes: '007-checkout'` in its definition
and leave the old one in place as record. Do not delete a loop the app moved out from
under; retire it.

---

## Writing a check

```js
{
  name: 'cart-totals',
  run: async ({ page, capture, axe, ctx, studio }) => {
    await capture('cart');
    const total = await page.locator('.total').innerText();
    if (total === '') return { status: 'unknown', detail: 'no total rendered; cart may be empty' };
    return total === '£42.00'
      ? { status: 'pass', detail: total }
      : { status: 'fail', detail: `total was ${total}` };
  },
}
```

Rules that matter:

- **Return a verdict.** Returning nothing records `unknown` with a message telling you off.
- **Put the numbers in `detail`.** A future reader has only the text and the screenshot.
- **Use `unknown` honestly** when the shape you check for is not present this run, and say
  what you saw instead.
- **Never use a fixed sleep.** Import a wait from the package: `waitForRows`,
  `waitForStableCount`, `waitForNetworkIdleAfter`, `waitForText`.
- **An `axe` budget scores only what a check scanned.** If the loop declares
  `axe: { maxViolations: 0 }` and no check calls `await axe()`, the budget records
  `unknown` — nothing was scanned, so nothing is known. Call it in whichever check is on
  the screen worth scanning.
- **`ctx` carries state between checks.** It is one plain object shared by every check in
  the run (and by `setup`), which is how a later check uses what an earlier one found.
- **Capture before you assert.** If the assertion throws, you still want the picture.
- Check names are the diff's key. Renaming one is renaming the question.

---

## Do not

- Do not report exit 2 as an app bug.
- Do not treat `unknown` as passing, in a summary or anywhere else.
- Do not hand-edit `results.json` or `findings.json` — use `judge` and `finding`, which
  keep the files valid and re-render the report.
- Do not commit `runs/` directories. Curated evidence is copied out deliberately.
- Do not add a retry to make a flaky check green. The flakiness is the finding.
