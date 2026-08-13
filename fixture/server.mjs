// @ts-check
// The tiny app the package drives against itself.
//
// THE HARNESS MUST NEVER AGAIN DEPEND ON HAVING A CONSUMING PROJECT HANDY TO PROVE IT
// WORKS. Everything the studio claims to do is exercised here: a sign-in form to fill, an
// element to mask, a planted secret that must not survive into any artifact, a deliberate
// console error, and a deliberate 404 whose URL carries the secret — so redaction is
// proven on a file the run actually wrote, not only in a unit test.

import { createServer } from 'node:http';

/** A fake secret, shaped like a real one: 43 characters of base64url, which is 32 bytes. */
export const PLANTED_SECRET = 'FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake123';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fixture app</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; background: #fff; color: #111; }
  .app-nav { display: flex; gap: 1rem; padding: .5rem 0; border-bottom: 1px solid #ddd; }
  form { display: grid; gap: .75rem; max-width: 20rem; }
  label { display: grid; gap: .25rem; }
  input, button { font: inherit; padding: .4rem; }
  .secret { font-family: monospace; background: #f3f3f3; padding: .25rem .5rem; }
  table { border-collapse: collapse; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: .35rem .75rem; text-align: left; }
  .hidden { display: none; }
</style>
</head>
<body>
<div id="signin">
  <h1>Sign in</h1>
  <form id="form">
    <label>Email <input id="email" name="email" type="email" autocomplete="username"></label>
    <label>Password <input id="password" name="password" type="password" autocomplete="current-password"></label>
    <button type="submit">Sign in</button>
  </form>
</div>

<div id="app" class="hidden">
  <nav class="app-nav">
    <a href="#/data">Data</a>
    <a href="#/account">Account</a>
  </nav>
  <h1>Signed in</h1>
  <p>Your invite code: <code class="secret">${PLANTED_SECRET}</code></p>
  <table id="rows">
    <thead><tr><th>Name</th><th>Value</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<script>
  // A deliberate console error, fired on every load. A loop with errorBudget: 0 must see
  // this and fail; that is what proves the collectors are wired at all.
  console.error('fixture: deliberate console error');

  // A deliberate 404, WITH THE SECRET IN THE URL. This is the redaction end-to-end proof:
  // the collector records the failing response's URL, and the secret must not survive into
  // errors.json.
  fetch('/api/missing?token=${PLANTED_SECRET}').catch(function () {});

  document.getElementById('form').addEventListener('submit', function (event) {
    event.preventDefault();
    // Asynchronous on purpose. The app paints its signed-out shell first and only settles
    // later — exactly the race a settle wait exists to absorb, and a harness that captures
    // straight after the click catches the wrong screen.
    setTimeout(function () {
      document.getElementById('signin').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      var body = document.querySelector('#rows tbody');
      ['alpha', 'beta', 'gamma'].forEach(function (name, i) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + name + '</td><td>' + (i + 1) * 10 + '</td>';
        body.appendChild(tr);
      });
    }, 250);
  });
</script>
</body>
</html>
`;

/** @param {number} port */
export function startFixture(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/missing') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actual = typeof address === 'object' && address !== null ? address.port : port;
      resolvePromise({
        server,
        port: actual,
        url: `http://127.0.0.1:${actual}`,
        close: () => new Promise((done) => server.close(() => done(undefined))),
      });
    });
  });
}

// Run directly for poking at it by hand.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8099);
  startFixture(port).then((f) => {
    console.log(`fixture app on ${f.url}`);
  });
}
