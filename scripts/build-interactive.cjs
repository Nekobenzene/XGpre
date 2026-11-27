'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const examples = path.join(root, 'examples');
const site = path.join(root, 'interactive');
const read = file => JSON.parse(fs.readFileSync(path.join(examples, file), 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);
const caseLink = id => 'cases/' + id + '/';
const external = (url, label) => /^https?:\/\//i.test(url)
  ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`
  : escape(label);
const imagePath = (prefix, entry, image) => prefix + '../examples/' + entry.id + '/' + image.file;

function page({ title, prefix = './', current, script = '', extraScript = '', body, chat = false }) {
  const active = key => key === current ? ' aria-current="page"' : '';
  const csp = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'"
    + (chat ? "; connect-src 'self' https://1529785241-cw41hwjsxl.ap-guangzhou.tencentscf.com" : '');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${escape(title)} · 新时代国际援助</title>
  <link rel="stylesheet" href="${prefix}site.css">
  ${extraScript ? `<script defer src="${extraScript}"></script>` : ''}
  ${script ? `<script defer src="${prefix}${script}"></script>` : ''}
</head>
<body>
  <a class="skip" href="#main">跳到主要内容</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="${prefix}">新时代国际援助</a>
      <nav aria-label="主导航">
        <a href="${prefix}../">讲稿</a>
        <a href="${prefix}"${active('cases')}>案例库</a>
        <a href="${prefix}ask/"${active('ask')}>AI 问答</a>
      </nav>
    </div>
  </header>
  ${body}
</body>
</html>
`;
}

function write(relative, contents) {
  const file = path.join(site, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.replace(/^[ \t]+$/gm, ''));
}

const records = read('index.json').cases.map(entry => {
  if (!/^[a-z0-9-]+$/.test(entry.id) || entry.file !== entry.id + '/case.json') {
    throw new Error('Invalid case path: ' + entry.id);
  }
  const data = read(entry.file);
  const media = entry.media === entry.id + '/media.json' ? read(entry.media) : {};
  for (const image of media.images || []) {
    if (!/^[a-z0-9-]+\.(?:jpg|png|webp)$/.test(image.file)
      || !fs.existsSync(path.join(examples, entry.id, image.file))) {
      throw new Error('Missing or invalid case image: ' + entry.id + '/' + image.file);
    }
  }
  return { entry, data, media };
});

function cover({ entry, media }, index) {
  const photo = media.images?.[0];
  return `<li class="case-card">
  <a href="${caseLink(entry.id)}">
    ${photo ? `<img src="${imagePath('./', entry, photo)}" alt=""${dimensions(photo)} ${index < 6 ? '' : 'loading="lazy" '}decoding="async">` : ''}
    <div class="card-copy">
      <h2>${escape(entry.navigation.title)}</h2>
      <p>${escape(entry.navigation.subtitle)}</p>
    </div>
  </a>
</li>`;
}

const gallery = `<main id="main" class="wrap gallery">
  <div class="gallery-heading">
    <h1>国际援助案例</h1>
    <button class="control" id="gallery-mode" type="button" hidden>查看全部</button>
  </div>
  <div class="gallery-window" id="gallery-window">
    <ul class="case-grid" id="case-grid" aria-label="案例列表">
      ${records.map(cover).join('\n      ')}
    </ul>
  </div>
</main>`;
write('index.html', page({ title: '案例库', current: 'cases', script: 'gallery.js', body: gallery }));

function dimensions(image) {
  return [image.width, image.height].every(value => Number.isInteger(value) && value > 0)
    ? ` width="${image.width}" height="${image.height}"`
    : '';
}

function figure(entry, image) {
  return `<figure>
    <img src="${imagePath('../../', entry, image)}" alt="${escape(image.alt || image.caption)}"${dimensions(image)} decoding="async">
    <figcaption>
      <span>${escape(image.caption)}</span>
      <small>${escape(image.creator)} · ${external(image.license_url, image.license)} · ${external(image.source_url, '原图与许可')}</small>
    </figcaption>
  </figure>`;
}

function neighbor(record, label) {
  return record
    ? `<a href="../${record.entry.id}/"><small>${label}</small><strong>${escape(record.entry.navigation.title)}</strong></a>`
    : '';
}

const casesPrefix = '../../';
records.forEach(({ entry, data, media }, index) => {
  const context = [ ['时间', data.context.time], ['地点', data.context.location], ['援助类型', data.context.project_type] ];
  const references = media.references || [];
  const body = `<main id="main" class="wrap case-page">
    <a class="breadcrumb" href="../../">返回案例库</a>
    <article>
      <header class="case-heading">
        <h1>${escape(data.navigation.title)}</h1>
        <p>${escape(data.navigation.subtitle)}</p>
      </header>
      <div class="case-layout">
        <div class="case-story">
          <section>
            <h2>小故事</h2>
            <p>${escape(data.story.text)}</p>
          </section>
          <section>
            <h2>事件背景</h2>
            <p>${escape(data.context.background)}</p>
          </section>
          <section>
            <h2>援助经过</h2>
            <p>${escape(data.presentation.event)}</p>
          </section>
          <section class="case-analysis">
            <h2>理念解读</h2>
            <p>${escape(data.presentation.analysis)}</p>
          </section>
        </div>
        <aside class="case-context" aria-label="案例资料">
          ${(media.images || []).map(image => figure(entry, image)).join('\n')}
          <dl>${context.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
        </aside>
      </div>
      <section class="sources">
        <h2>资料来源</h2>
        <ol>${data.sources.map(source => `<li>${external(source.url, source.title)} <span>${escape(source.publisher)} · ${escape(source.date)}</span></li>`).join('')}</ol>
        ${references.length ? `<ul>${references.map(reference => `<li>${external(reference.source_url, reference.label)}</li>`).join('')}</ul>` : ''}
      </section>
    </article>
    <nav class="case-next" aria-label="相邻案例">
      ${neighbor(records[index - 1], '上一则')}
      ${neighbor(records[index + 1], '下一则')}
    </nav>
  </main>`;
  write(path.join(caseLink(entry.id), 'index.html'),
    page({ title: data.navigation.title, prefix: casesPrefix, body }));
});

const ask = fs.readFileSync(path.join(__dirname, 'interactive-ask.html'), 'utf8');
write('ask/index.html', page({
  title: 'AI 问答', prefix: '../', current: 'ask', chat: true, script: 'chat.js',
  extraScript: '../../demo/vendor/markdown-it.min.js', body: ask.trim()
}));
console.log(`已生成案例库、${records.length} 个案例页和 AI 问答页。`);
