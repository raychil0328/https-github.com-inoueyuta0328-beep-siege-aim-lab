// Chrome DevTools Protocol でページ内の JS を 1 回実行して結果を表示する（負荷計測で試合を自動開始するため）
//   node tools/loadbench/cdp.mjs <port> "<expression>"
const [port, expr] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(t => t.type === 'page' && /^https?:/.test(t.url)) || targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
const msg = await new Promise(r => ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id === 1) r(m); }));
const ex = msg.result?.exceptionDetails;
console.log(JSON.stringify(ex ? 'ERROR: ' + (ex.exception?.description || ex.text) : msg.result?.result?.value));
ws.close();
