// @ts-check
// The page shell: escaping, styles, and the document wrapper.
//
// A template literal rather than a template engine. The whole report is one page with
// perhaps a dozen repeated shapes, and a dependency would buy nothing except a second
// syntax to learn.
//
// SELF-CONTAINED, AND OPENED FROM DISK. No CDN, no fonts, no scripts fetched — a report
// must render on a machine with no network, months after the run. Screenshots are
// referenced by relative path because they sit in the same directory; moving the HTML out
// of its run dir breaks the images, which is the correct behaviour: the run dir is the
// artifact, and the report is a reading aid for it.

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// UNKNOWN MUST NOT LOOK LIKE PASS. It gets its own colour, its own word, and its own
// marker glyph — three signals, because a reader skimming a long page reads colour first
// and a colour-blind reader may not read it at all. Nothing here renders unknown in the
// same family as pass.
const CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #16181d; --muted: #5b6270; --line: #e3e6ec; --panel: #f7f8fa;
  --pass: #1a7f4b; --pass-bg: #e8f5ee;
  --fail: #b3261e; --fail-bg: #fdeceb;
  --unknown: #8a5b00; --unknown-bg: #fdf3e0;
  --accent: #2f4bd8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a; --fg: #e8eaf0; --muted: #9aa2b1; --line: #2a2e37; --panel: #1a1d23;
    --pass: #52c78a; --pass-bg: #16281f;
    --fail: #ff8a80; --fail-bg: #2b1a19;
    --unknown: #e6b552; --unknown-bg: #2a2318;
    --accent: #93a6ff;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem 1.5rem 4rem; background: var(--bg); color: var(--fg);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 60rem; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.1rem; margin: 2.5rem 0 .75rem; padding-bottom: .35rem; border-bottom: 1px solid var(--line); }
h3 { font-size: 1rem; margin: 0; }
p { margin: .4rem 0; }
.task { color: var(--muted); margin: 0 0 1rem; }
.meta { color: var(--muted); font-size: .85rem; }
.tally { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0; }
.pill {
  border: 1px solid var(--line); border-radius: 999px; padding: .25rem .75rem;
  font-size: .85rem; font-weight: 600;
}
.pill.pass { color: var(--pass); background: var(--pass-bg); border-color: var(--pass); }
.pill.fail { color: var(--fail); background: var(--fail-bg); border-color: var(--fail); }
.pill.unknown { color: var(--unknown); background: var(--unknown-bg); border-color: var(--unknown); }
.check {
  border: 1px solid var(--line); border-left-width: 4px; border-radius: 6px;
  padding: .85rem 1rem; margin: .6rem 0; background: var(--panel);
}
.check.pass { border-left-color: var(--pass); }
.check.fail { border-left-color: var(--fail); }
.check.unknown { border-left-color: var(--unknown); }
.check-head { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
.status {
  font-weight: 700; font-size: .78rem; letter-spacing: .06em; text-transform: uppercase;
  padding: .1rem .45rem; border-radius: 4px;
}
.status.pass { color: var(--pass); background: var(--pass-bg); }
.status.fail { color: var(--fail); background: var(--fail-bg); }
.status.unknown { color: var(--unknown); background: var(--unknown-bg); }
.detail { margin: .5rem 0 0; white-space: pre-wrap; }
.dur { color: var(--muted); font-size: .8rem; margin-left: auto; }
.shots { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: .75rem; }
.shots figure { margin: 0; max-width: 15rem; }
.shots img {
  max-width: 100%; border: 1px solid var(--line); border-radius: 4px; display: block;
  background: var(--bg);
}
.shots figcaption { font-size: .75rem; color: var(--muted); margin-top: .25rem; word-break: break-all; }
table { border-collapse: collapse; width: 100%; font-size: .87rem; }
th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
.errs { margin-top: .6rem; }
.errs summary { cursor: pointer; color: var(--muted); font-size: .85rem; }
.empty { color: var(--muted); font-style: italic; }
.card { border: 1px solid var(--line); border-radius: 6px; padding: .75rem 1rem; margin: .5rem 0; background: var(--panel); }
.tag {
  display: inline-block; font-size: .72rem; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase; padding: .1rem .4rem; border-radius: 4px;
  border: 1px solid var(--line); color: var(--muted);
}
.tag.open { color: var(--fail); border-color: var(--fail); }
.tag.fix-directed { color: var(--accent); border-color: var(--accent); }
.tag.verified-fixed { color: var(--pass); border-color: var(--pass); }
.tag.accepted { color: var(--muted); }
.banner {
  border: 1px solid var(--line); border-left-width: 4px; border-radius: 6px;
  padding: .75rem 1rem; margin: 1rem 0; background: var(--panel);
}
.banner.warn { border-left-color: var(--unknown); }
.banner.bad { border-left-color: var(--fail); }
.banner.good { border-left-color: var(--pass); }
a { color: var(--accent); }
`;

/**
 * @param {{title: string, body: string}} args
 */
export function page(args) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(args.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${args.body}
</div>
</body>
</html>
`;
}
