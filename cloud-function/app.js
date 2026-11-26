'use strict';

const http = require('node:http');
const { createHash, timingSafeEqual } = require('node:crypto');

function sameSecret(value, accessCode) {
  return typeof value === 'string' && timingSafeEqual(
    createHash('sha256').update(value).digest(),
    createHash('sha256').update(accessCode).digest());
}

function send(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data === null ? undefined : JSON.stringify(data));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw Object.assign(new Error('请求体不能超过 64 KB'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('请求体必须是有效 JSON'), { status: 400 }); }
}

function createHandler({ env = process.env, fetchUpstream = fetch } = {}) {
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS || 'https://nekobenzene.github.io')
    .split(',').map(value => value.trim()).filter(Boolean));
  const apiKey = (env.DEEPSEEK_API_KEY || '').trim();
  const accessCode = (env.DEMO_ACCESS_CODE || '').trim();
  const ready = Boolean(apiKey && accessCode.length >= 12);
  let rateWindow = -1;
  let requestsThisMinute = 0;
  let inFlight = 0;

  return async function handleRequest(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: '该网页来源不允许访问' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Code');
    res.setHeader('Access-Control-Max-Age', '600');
    const path = (req.url || '/').split('?')[0];
    if (!['/', '/health', '/chat', '/v1/chat/completions'].includes(path)) {
      return send(res, 404, { error: '接口不存在' });
    }
    if (req.method === 'OPTIONS') return send(res, 204, null);
    if (req.method === 'GET' && (path === '/' || path === '/health')) {
      return send(res, 200, { service: 'XGpre DeepSeek proxy', status: ready ? 'ready' : 'configuration_required' });
    }
    if (req.method !== 'POST' || path === '/health') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return send(res, 405, { error: '请使用 POST /chat' });
    }
    if (!ready) return send(res, 503, { error: '请配置 DEEPSEEK_API_KEY 和至少 12 位的 DEMO_ACCESS_CODE 环境变量' });
    if (!sameSecret(req.headers['x-demo-code'], accessCode)) return send(res, 401, { error: '访问口令不正确' });
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return send(res, 415, { error: 'Content-Type 必须为 application/json' });
    }
    let body;
    try { body = await readJson(req); }
    catch (error) { return send(res, error.status || 400, { error: error.message }); }
    const messages = body && body.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40 ||
        messages.some(item => !item || !['system', 'user', 'assistant'].includes(item.role) ||
          typeof item.content !== 'string' || !item.content.trim()) ||
        messages.reduce((sum, item) => sum + item.content.length, 0) > 24000) {
      return send(res, 400, { error: 'messages 需包含 1–40 条文本消息，总长度不超过 24000 字符' });
    }
    if (!messages.some(item => item.role === 'user')) return send(res, 400, { error: '至少需要一条 user 消息' });
    if (body.stream === true) return send(res, 400, { error: '此接口使用非流式响应，请设置 stream: false' });
    if (body.model && body.model !== 'deepseek-chat') return send(res, 400, { error: '此演示仅支持 deepseek-chat' });
    if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 2048)) {
      return send(res, 400, { error: 'max_tokens 必须为 1–2048 的整数' });
    }
    // Each function instance keeps its own counters.
    const minute = Math.floor(Date.now() / 60000);
    if (rateWindow !== minute) {
      rateWindow = minute;
      requestsThisMinute = 0;
    }
    if (requestsThisMinute >= 20 || inFlight >= 2) {
      res.setHeader('Retry-After', '60');
      return send(res, 429, { error: '请求较多，请稍后再试' });
    }
    requestsThisMinute++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100000);
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    inFlight++;
    try {
      const upstream = await fetchUpstream('https://api.deepseek.com/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat', messages: messages.map(({ role, content }) => ({ role, content })),
          stream: false, max_tokens: body.max_tokens || 1024
        })
      });
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : 502;
        const error = upstream.status === 401 ? 'DeepSeek 密钥无效，请检查云函数环境变量' :
          upstream.status === 402 ? 'DeepSeek 账户余额不足' :
          upstream.status === 429 ? 'DeepSeek 请求频率受限，请稍后重试' : 'DeepSeek 服务暂时不可用';
        await upstream.body?.cancel();
        return send(res, status, { error, upstream_status: upstream.status });
      }
      const result = await upstream.json();
      const reply = result.choices?.[0]?.message?.content;
      if (typeof reply !== 'string') return send(res, 502, { error: 'DeepSeek 返回格式异常' });
      return send(res, 200, {
        reply, choices: result.choices, usage: result.usage, model: result.model,
        id: result.id, object: result.object, created: result.created
      });
    } catch (error) {
      return send(res, controller.signal.aborted ? 504 : 502, {
        error: controller.signal.aborted ? '模型响应超时，请缩短问题后重试' : '连接 DeepSeek 失败，请稍后重试'
      });
    } finally {
      clearTimeout(timer);
      res.off('close', onClose);
      inFlight--;
    }
  };
}

if (require.main === module) {
  const server = http.createServer(createHandler());
  server.requestTimeout = 115000;
  server.headersTimeout = 15000;
  server.listen(9000, '0.0.0.0', () => console.log('XGpre proxy listening on port 9000'));
}

module.exports = { createHandler };
