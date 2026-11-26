'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { searchWeb } = require('./web-search.cjs');

const directory = path.resolve(__dirname, '../examples');
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const stopWords = new Set('中国 国际 援助 救援 事件 项目 合作 哪些 有哪些 参与 请问 讲讲 什么 怎么 如何 介绍 发生 时候 这个 那个 还有 比较 列举 几件 几次 行动 理念 结果 背景'.split(' '));

function terms(text) {
  return [...segmenter.segment(text.toLowerCase())]
    .filter(token => token.isWordLike && token.segment.length > 1 && !stopWords.has(token.segment))
    .map(token => token.segment);
}

function searchCases(messages, cases) {
  const questions = messages.filter(message => message?.role === 'user' && typeof message.content === 'string');
  const question = questions.at(-1)?.content.trim() || '';
  const previous = questions.at(-2)?.content.trim() || '';
  const followUp = /^(?:这[件次个]|该|上述|刚才|还有|那么|它|他们|[哪有]些参与方)/.test(question);
  const query = new Set(terms(followUp ? previous + ' ' + question : question));
  return cases.map(item => {
    const headline = [item.title, item.context.location, ...item.tags].join(' ').toLowerCase();
    const overview = [item.context.time, item.context.background, item.story.text].join(' ').toLowerCase();
    let score = 0;
    for (const word of query) {
      if (/^\d+$/.test(word)) continue;
      if (headline.includes(word)) score += 3;
      else if (overview.includes(word)) score++;
    }
    return { item, score };
  }).filter(result => result.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

const publicPlaces = '土耳其 叙利亚 菲律宾 塞拉利昂 汤加 尼泊尔 巴基斯坦 印度尼西亚 海地 摩洛哥 利比亚 缅甸 老挝 柬埔寨 瓦努阿图 所罗门群岛 莫桑比克 几内亚 利比里亚 西非'.split(' ');
const publicTopics = '地震 台风 海燕 洪灾 洪水 海啸 火山喷发 埃博拉 疫情 新冠 医疗队 腹腔镜 人道救援 紧急救援 抗疫 疫苗 灾后重建'.split(' ');

function currentKeywords(body) {
  if (typeof body.search_keywords === 'string') {
    const explicit = body.search_keywords.trim().slice(0, 100);
    if (explicit) return [explicit];
  }
  const question = body.messages.findLast(message => message?.role === 'user')?.content;
  if (typeof question !== 'string') return [];
  const places = publicPlaces.filter(place => question.includes(place)).slice(0, 3);
  const topics = publicTopics.filter(topic => question.includes(topic)).slice(0, 3);
  if (!places.length || !topics.length) return [];
  const years = [...new Set(question.match(/\b(?:19|20)\d{2}\b/g) || [])].slice(0, 2);
  return ['中国', '援助', ...places, ...topics, ...years];
}

function createCaseSearch({ externalSearch = searchWeb } = {}) {
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8'));
  const cases = index.cases
    .filter(entry => /^[a-z0-9-]+$/.test(entry.id) && entry.file === entry.id + '/case.json')
    .map(entry => JSON.parse(fs.readFileSync(path.join(directory, entry.file), 'utf8')));
  return async function addCaseContext(body, signal) {
    if (!Array.isArray(body?.messages) || !body.messages.some(message => message?.role === 'user')) return [];
    const results = searchCases(body.messages, cases);
    const sources = [];
    const matches = results.map(({ item, score }) => {
      const sourceIndexes = new Map(item.sources.map(source => {
        sources.push({ title: source.title, url: source.url });
        return [source.id, sources.length];
      }));
      return {
        title: item.title, score, context: item.context,
        facts: item.facts.map(fact => ({ text: fact.text, sources: fact.source_ids.map(id => sourceIndexes.get(id)) })),
        notes: item.notes
      };
    });
    let externalSources = [];
    try {
      externalSources = await externalSearch(currentKeywords(body), signal);
    } catch {
      signal.throwIfAborted();
    }
    const webContext = externalSources.map(source => {
      sources.push(source);
      return { number: sources.length, ...source };
    });
    let context = matches.length
      ? '以下是本地案例库检索线索，分数只反映关键词匹配。先判断候选与问题是否是同一事件。使用事实时可引用来源编号，如 [1]。\n' + JSON.stringify(matches)
      : '本地案例库没有检索到明确匹配。';
    context += webContext.length
      ? '\n以下是 Google 新闻索引的报道标题和链接，未读取正文，仅作为检索线索。若引用相关条目，请用其 number 作为引用编号，不要从标题推断细节。\n' + JSON.stringify(webContext)
      : '\n未取得外部报道线索。按有把握的知识直接回答，对关键不确定点简短说明。';
    const messages = body.messages.slice();
    if (messages[0]?.role === 'system' && typeof messages[0].content === 'string') {
      messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + context };
    } else {
      messages.unshift({ role: 'system', content: context });
    }
    const candidate = { ...body, messages };
    if (messages.length > 40 || messages.reduce((n, message) => n + (message?.content?.length || 0), 0) > 24000 ||
        Buffer.byteLength(JSON.stringify(candidate)) > 65536) return [];
    body.messages = messages;
    return sources;
  };
}

module.exports = { createCaseSearch };
