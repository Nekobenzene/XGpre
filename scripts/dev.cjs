'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHandler } = require('../cloud-function/app.js');
const { createCaseSearch } = require('./case-search.cjs');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.XGPRE_DEV_PORT || '8080');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('XGPRE_DEV_PORT 必须是 1–65535 之间的整数。');
  process.exit(1);
}
const origin = 'http://127.0.0.1:' + port;
const allowedOrigins = [origin, 'http://localhost:' + port].join(',');
const live = process.argv.includes('--live');
const cloud = process.argv.includes('--cloud');
const cloudChatUrl = 'https://1529785241-cw41hwjsxl.ap-guangzhou.tencentscf.com/chat';
const mockCode = 'local-demo-code';
if (live && cloud) {
  console.error('请选择 --cloud 或 --live 其中一种模式。');
  process.exit(1);
}
const env = live ? {
  ...process.env,
  ALLOWED_ORIGINS: allowedOrigins
} : {
  DEEPSEEK_API_KEY: 'local-mock-key',
  DEMO_ACCESS_CODE: mockCode,
  ALLOWED_ORIGINS: allowedOrigins
};

if (live && (!env.DEEPSEEK_API_KEY?.trim() || (env.DEMO_ACCESS_CODE?.trim().length ?? 0) < 12)) {
  console.error('请设置 DEEPSEEK_API_KEY 和至少 12 位的 DEMO_ACCESS_CODE。');
  process.exit(1);
}

const fetchUpstream = live ? fetch : async (_url, { body }) => {
  const { messages } = JSON.parse(body);
  const user = messages.findLast(message => message.role === 'user');
  const content = '（本地模拟）收到事件问答：' + user.content;
  return Response.json({ model: 'local-mock', choices: [{ message: { role: 'assistant', content } }] });
};
const handleApi = createHandler({ env, fetchUpstream });
const addCaseContext = cloud ? createCaseSearch() : null;

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}
async function relayCloudChat(req, res) {
  if (req.headers.origin && !allowedOrigins.split(',').includes(req.headers.origin)) {
    return sendJson(res, 403, JSON.stringify({ error: '请从本地测试页发起请求。' }));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 105000);
  res.on('close', () => controller.abort());
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      bytes += chunk.length;
      if (bytes > 65536) {
        res.setHeader('Connection', 'close');
        return sendJson(res, 413, JSON.stringify({ error: '请求体不能超过 64 KB。' }));
      }
      chunks.push(chunk);
    }
    let body = Buffer.concat(chunks);
    let sources = [];
    try {
      const request = JSON.parse(body.toString('utf8'));
      sources = await addCaseContext(request, controller.signal);
      if (request && typeof request === 'object') delete request.search_keywords;
      body = JSON.stringify(request);
    } catch {
      controller.signal.throwIfAborted();
    }
    const response = await fetch(cloudChatUrl, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'X-Demo-Code': req.headers['x-demo-code'] || ''
      },
      body
    });
    const data = await response.json();
    if (response.ok && sources.length) data.search_sources = sources;
    sendJson(res, response.status, JSON.stringify(data));
  } catch {
    if (!res.destroyed) sendJson(res, controller.signal.aborted ? 504 : 502, JSON.stringify({
      error: controller.signal.aborted ? '等待腾讯云响应超时。' : '无法连接腾讯云，请检查网络后重试。'
    }));
  } finally {
    clearTimeout(timer);
  }
}

const files = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/demo/', 'demo/index.html'],
  ['/demo/index.html', 'demo/index.html'],
  ['/demo/vendor/markdown-it.min.js', 'demo/vendor/markdown-it.min.js'],
  ['/interactive/', 'interactive/index.html'],
  ['/interactive/index.html', 'interactive/index.html'],
  ['/interactive/site.css', 'interactive/site.css'],
  ['/interactive/gallery.js', 'interactive/gallery.js'],
  ['/interactive/chat.js', 'interactive/chat.js'],
  ['/interactive/ask/', 'interactive/ask/index.html'],
  ['/interactive/ask/index.html', 'interactive/ask/index.html'],
  ['/examples/index.json', 'examples/index.json'],
  ['/examples/article.css', 'examples/article.css']
]);
const reportCredits = 'assets/credits.json';
if (fs.existsSync(path.join(root, reportCredits))) {
  files.set('/' + reportCredits, reportCredits);
  const credits = JSON.parse(fs.readFileSync(path.join(root, reportCredits), 'utf8'));
  for (const filename of Object.keys(credits)) {
    if (!/^[a-z0-9-]+\.(?:jpg|png|webp)$/.test(filename)) continue;
    const asset = 'assets/' + filename;
    files.set('/' + asset, asset);
  }
}
const index = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'index.json'), 'utf8'));
for (const entry of index.cases) {
  if (!/^[a-z0-9-]+$/.test(entry.id) || entry.file !== entry.id + '/case.json') {
    throw new Error('案例文件路径无效');
  }
  const file = 'examples/' + entry.file;
  files.set('/' + file, file);
  if (entry.page !== entry.id + '/index.html') throw new Error('案例网页路径无效，请先同步案例索引');
  const casePage = 'examples/' + entry.page;
  files.set('/examples/' + entry.id + '/', casePage);
  files.set('/' + casePage, casePage);
  if (entry.media === entry.id + '/media.json') {
    const mediaFile = 'examples/' + entry.media;
    files.set('/' + mediaFile, mediaFile);
    const media = JSON.parse(fs.readFileSync(path.join(root, mediaFile), 'utf8'));
    for (const image of media.images || []) {
      if (!/^[a-z0-9-]+\.(?:jpg|png|webp)$/.test(image.file)) throw new Error('案例图片路径无效');
      const imageFile = 'examples/' + entry.id + '/' + image.file;
      files.set('/' + imageFile, imageFile);
    }
  }
}

const server = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (!route.endsWith('/') && files.get(route + '/')?.endsWith('/index.html')
    && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(302, { Location: route + '/' }).end();
    return;
  }
  if (cloud && route === '/chat' && req.method === 'POST') return relayCloudChat(req, res);
  if (!cloud && ['/chat', '/health', '/v1/chat/completions'].includes(route)) {
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
    const mimeTypes = {
      '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)], 'Cache-Control': 'no-store' });
    const hint = cloud ? '腾讯云联调模式，请输入函数中设置的演示口令。' : '本地模拟口令：' + mockCode;
    const chatPage = file === 'demo/index.html' || file === 'interactive/index.html';
    let body = !live && chatPage
      ? data.toString('utf8').replace('口令由页面所有者提供。', hint)
      : data;
    if (cloud && typeof body === 'string') {
      body = body.replace('id="web-keywords-row" hidden', 'id="web-keywords-row"')
        .replace('AI 回答可能有误，请核实重要信息。', '已识别的公开地点和事件类型会自动用于 Google 新闻检索。');
    }
    res.end(req.method === 'HEAD' ? undefined : body);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('案例与问答：' + origin + '/interactive/');
  console.log('AI 测试页：' + origin + '/demo/');
  if (cloud) console.log('腾讯云联调模式。');
  else console.log(live ? '已启用真实 DeepSeek 请求。' : '模拟模式，演示口令：' + mockCode);
});
