'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHandler } = require('../cloud-function/app.js');

const root = path.resolve(__dirname, '..');
const port = 8080;
const origin = 'http://127.0.0.1:' + port;
const live = process.argv.includes('--live');
const mockCode = 'local-demo-code';
const env = live ? {
  ...process.env,
  ALLOWED_ORIGINS: origin
} : {
  DEEPSEEK_API_KEY: 'local-mock-key',
  DEMO_ACCESS_CODE: mockCode,
  ALLOWED_ORIGINS: origin
};

if (live && (!env.DEEPSEEK_API_KEY?.trim() || (env.DEMO_ACCESS_CODE?.trim().length ?? 0) < 12)) {
  console.error('请设置 DEEPSEEK_API_KEY 和至少 12 位的 DEMO_ACCESS_CODE。');
  process.exit(1);
}

const fetchUpstream = live ? fetch : async (_url, { body }) => {
  const { messages } = JSON.parse(body);
  const user = messages.findLast(message => message.role === 'user');
  const hasCase = messages.some(message => message.role === 'system');
  const content = '（本地模拟）' + (hasCase ? '已收到案例材料。' : '') + '收到消息：' + user.content;
  return Response.json({ model: 'local-mock', choices: [{ message: { role: 'assistant', content } }] });
};
const handleApi = createHandler({ env, fetchUpstream });

const files = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/examples/index.json', 'examples/index.json']
]);
const index = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'index.json'), 'utf8'));
for (const entry of index.cases) {
  if (!/^[a-z0-9-]+\.json$/.test(entry.file)) throw new Error('案例文件名无效');
  files.set('/examples/' + entry.file, 'examples/' + entry.file);
}

const server = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (['/chat', '/health', '/v1/chat/completions'].includes(route)) {
    return handleApi(req, res);
  }
  const file = files.get(route);
  if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    const type = file.endsWith('.json') ? 'application/json' : 'text/html';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('本地预览：' + origin);
  console.log(live ? '已启用真实 DeepSeek 请求。' : '模拟模式，演示口令：' + mockCode);
});
