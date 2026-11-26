'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

function field(item, tag) {
  const text = item.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>'))?.[1] || '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#34': '"' };
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos|#39|#34);/g, (_, name) => entities[name]).trim();
}

function parseNews(xml) {
  const sources = [];
  const titles = new Set();
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = field(item, 'title');
    const url = field(item, 'link');
    if (!title || titles.has(title) || !url.startsWith('https://news.google.com/rss/articles/')) continue;
    titles.add(title);
    sources.push({ title: title.slice(0, 220), url, publisher: field(item, 'source'), date: field(item, 'pubDate') });
    if (sources.length === 6) break;
  }
  return sources;
}

async function readFeed(url, signal) {
  if (process.platform === 'win32') {
    const command = '$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[Text.Encoding]::UTF8; (Invoke-WebRequest -Uri $env:XGPRE_NEWS_URL -TimeoutSec 6 -MaximumRedirection 0).Content';
    const { stdout } = await run('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      env: { ...process.env, XGPRE_NEWS_URL: url.href },
      encoding: 'utf8', maxBuffer: 1024 * 1024, signal, timeout: 7500, windowsHide: true
    });
    return stdout;
  }
  const response = await fetch(url, { signal, redirect: 'error' });
  if (!response.ok) throw new Error('Google News HTTP ' + response.status);
  return response.text();
}

async function searchWeb(keywords, signal, getFeed = readFeed) {
  if (!keywords.length) return [];
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: keywords.join(' '), hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' });
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(7500)]);
  return parseNews(await getFeed(url, deadline));
}

module.exports = { searchWeb };
