const assert = require('node:assert/strict');
const http = require('node:http');
const { createHandler } = require('../cloud-function/app.js');
let calls = 0;
const server = http.createServer(createHandler({
  env: { DEEPSEEK_API_KEY: 'test-only-fake-key', DEMO_ACCESS_CODE: 'test-only-demo-code' },
  fetchUpstream: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'deepseek-chat');
    assert.equal(body.stream, false);
    assert.equal(body.max_tokens, 32);
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '连接成功' } }], usage: { total_tokens: 10 } }));
  }
}));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const origin = 'https://nekobenzene.github.io';
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Demo-Code': 'test-only-demo-code' };
  const post = body => fetch(base + '/chat', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    assert.equal((await (await fetch(base + '/health')).json()).status, 'ready');
    let response = await fetch(base + '/chat', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-demo-code' } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('access-control-allow-headers'), /X-Demo-Code/);
    assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(base + '/chat', { method: 'POST', headers: { Origin: origin } })).status, 401);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post({ messages: [] })).status, 400);
    assert.equal((await post({ messages: [{role:'user',content:'hello'}], max_tokens: 2049 })).status, 400);
    assert.equal((await post({ messages: [{role:'user',content:'hello'}], stream:true })).status, 400);
    response = await post({ messages: [{role:'user',content:'连接测试'}], max_tokens:32 });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.reply, '连接成功');
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes('test-only-fake-key'));
    console.log('PASS: health, CORS preflight, origin rejection, access code, invalid JSON, input/output limits, streaming rejection, successful upstream mapping, secret isolation.');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
