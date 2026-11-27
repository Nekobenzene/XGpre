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
const imagePath = (entry, image) => '../examples/' + entry.id + '/' + image.file;

function page(body) {
  const csp = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; connect-src 'self' https://1529785241-cw41hwjsxl.ap-guangzhou.tencentscf.com";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>案例与问答 · 新时代国际援助</title>
  <link rel="stylesheet" href="../site-navigation.css">
  <link rel="stylesheet" href="site.css">
  <script defer src="../demo/vendor/markdown-it.min.js"></script>
  <script defer src="gallery.js"></script>
  <script defer src="chat.js"></script>
</head>
<body>
  <a class="skip" href="#main">跳到主要内容</a>
  <header class="project-header">
    <div class="project-header-inner">
      <a class="project-brand" href="../">新时代国际援助</a>
      <nav class="project-sections" aria-label="项目分区">
        <a href="../">讲稿</a>
        <a href="#cases" aria-current="page">互动</a>
      </nav>
      <nav class="project-local" aria-label="互动目录">
        <a href="#cases" data-interactive-nav aria-current="location">案例库</a>
        <a href="#ask" data-interactive-nav>AI 问答</a>
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

const previousOrder = fs.existsSync(path.join(examples, 'index.json'))
  ? new Map(read('index.json').cases.map((entry, index) => [entry.id, index]))
  : new Map();
const records = fs.readdirSync(examples, { withFileTypes: true })
  .filter(item => item.isDirectory() && fs.existsSync(path.join(examples, item.name, 'case.json')))
  .sort((a, b) => (previousOrder.get(a.name) ?? Infinity) - (previousOrder.get(b.name) ?? Infinity)
    || a.name.localeCompare(b.name))
  .map(({ name: id }) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('案例目录名无效：' + id);
    const file = id + '/case.json';
    const { id: declaredId, title, tags, navigation } = read(file);
    if (declaredId !== id || !title || !Array.isArray(tags)
      || !navigation?.title || [...navigation.title].length > 7
      || !navigation.subtitle || [...navigation.subtitle].length > 15) {
      throw new Error('案例 ID、标题或导航信息无效：' + id);
    }
    const entry = { id, title, tags, navigation, file, page: id + '/index.html' };
    if (!fs.existsSync(path.join(examples, entry.page))) throw new Error('缺少手写网页：' + entry.page);
    let media = {};
    const mediaFile = id + '/media.json';
    if (fs.existsSync(path.join(examples, mediaFile))) {
      entry.media = mediaFile;
      media = read(mediaFile);
      for (const image of media.images || []) {
        if (!/^[a-z0-9-]+\.(?:jpg|png|webp)$/.test(image.file)
          || !fs.existsSync(path.join(examples, id, image.file))) {
          throw new Error('案例图片缺失或文件名无效：' + id + '/' + image.file);
        }
      }
    }
    return { entry, media };
  });
const index = { schema_version: 2, cases: records.map(record => record.entry) };
fs.writeFileSync(path.join(examples, 'index.json'), JSON.stringify(index, null, 2) + '\n');

function cover({ entry, media }, index) {
  const photo = media.images?.[0];
  return `<li class="case-card">
  <a href="${'../examples/' + entry.id + '/'}">
    ${photo ? `<img src="${imagePath(entry, photo)}" alt=""${dimensions(photo)} ${index < 6 ? '' : 'loading="lazy" '}decoding="async">` : ''}
    <div class="card-copy">
      <h2>${escape(entry.navigation.title)}</h2>
      <p>${escape(entry.navigation.subtitle)}</p>
    </div>
  </a>
</li>`;
}

const gallery = `<section id="cases" class="gallery" aria-labelledby="cases-title">
  <div class="gallery-heading">
    <h1 id="cases-title">国际援助案例</h1>
    <button class="control" id="gallery-mode" type="button" hidden>查看全部</button>
  </div>
  ${records.length ? '' : '<p>暂无案例。</p>'}
  <div class="gallery-window" id="gallery-window">
    <ul class="case-grid" id="case-grid" aria-label="案例列表">
      ${records.map(cover).join('\n      ')}
    </ul>
  </div>
</section>`;

function dimensions(image) {
  return [image.width, image.height].every(value => Number.isInteger(value) && value > 0)
    ? ` width="${image.width}" height="${image.height}"`
    : '';
}

const ask = fs.readFileSync(path.join(__dirname, 'interactive-ask.html'), 'utf8');
write('index.html', page(`<main id="main" class="wrap interactive-layout" tabindex="-1">
  ${gallery}
  ${ask.trim()}
</main>`));
console.log(`已同步 ${records.length} 个手写案例的索引和交互入口。`);
