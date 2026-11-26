# XGpre

习概期末报告的演示项目，主题为新时代的中国外交，方向为国际援助。「内置案例」直接展示写好的故事、事件经过、理念解读和来源。「AI 问答」可就另外的具体事件提问或追问。

[案例与问答](https://nekobenzene.github.io/XGpre/interactive/) · [AI 测试页](https://nekobenzene.github.io/XGpre/demo/)

## 克隆并运行

需要 Node.js 20.19 或更新版本。项目没有第三方依赖。

```sh
git clone https://github.com/Nekobenzene/XGpre.git
cd XGpre
node scripts/dev.cjs
```

访问 [本地交互站](http://127.0.0.1:8080/interactive/) 浏览案例，或打开「AI 问答」。输入本地口令 `local-demo-code` 并连接后，可以问「中国参与了哪些2023年土耳其地震救援行动？」默认使用模拟回复。[本地 AI 测试页](http://127.0.0.1:8080/demo/) 用于联调。若同一台电脑同时运行两个工作区，可为其中一个设置 `XGPRE_DEV_PORT`。

要使用已有腾讯云演示口令，请停止模拟服务，运行 `node scripts/dev.cjs --cloud` 并重新打开本地测试页。口令由腾讯云校验。提问时，本地服务先查案例库，并用当前问题提取出的事件关键词查询 Google 新闻。若外部检索超时或无结果，仍会用已有线索回答。选读内置案例只读取本地 JSON。

也可以直接使用自己的 DeepSeek API Key。将 `.env.example` 复制为 `.env`，填入自己的 `DEEPSEEK_API_KEY`，并设置至少 12 位的 `DEMO_ACCESS_CODE`，然后运行：

```sh
node --env-file=.env scripts/dev.cjs --live
```

浏览器里输入 `.env` 中的演示口令。密钥由本地服务读取，`.env` 已加入 Git 忽略规则。

## 分工

| 要做的事 | 文件 |
| --- | --- |
| 做正式报告页 | [index.html](index.html) 和前端自己的资源目录。根地址展示报告页 |
| 做案例库和 AI 问答 | [interactive/](interactive/)、[静态页面生成器](scripts/build-interactive.cjs) 和 [问答模板](scripts/interactive-ask.html) |
| 调试案例讲解、对话流程和测试界面 | [demo/index.html](demo/index.html) |
| 改接口自测与本地模拟 | [tests/api.cjs](tests/api.cjs)、[scripts/dev.cjs](scripts/dev.cjs) |
| 新增或编辑案例 | [案例总索引](examples/index.json)及每个事件目录的 `case.json`、可选的 `media.json` 和图片 |
| 改口令、CORS、模型转发和限额 | [cloud-function/app.js](cloud-function/app.js) |
| 检查接口、了解部署和案例格式 | [架构与部署](docs/architecture.md)、[HTTP 协议](docs/api.md) |

从共同基线分别开分支。AI 交互在 `ai-interaction` 工作区推进，正式报告页在 `frontend-design` 工作区实现。具体路径、文件边界和联调约定见 [HTTP 协议与前端工作区](docs/api.md#前端工作区)。

更新案例、图片或问答模板后，运行 `node scripts/build-interactive.cjs` 并提交生成的 HTML。提交前运行 `node tests/api.cjs`，分别测试免口令阅读以及「连接 → 提问 → 追问」。GitHub Pages 从 `main` 分支根目录发布。修改云函数后，需要在腾讯云单独部署。
