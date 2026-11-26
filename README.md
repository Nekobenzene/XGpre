# XGpre

习概期末报告的演示项目，主题为新时代的中国外交，方向为国际援助。选一个案例，页面会展示小故事，并让 DeepSeek 结合案例材料讲解事件和相关理念。也可以继续追问。

[线上演示](https://nekobenzene.github.io/XGpre/)

## 克隆并运行

需要 Node.js 20.19 或更新版本。项目没有第三方依赖。

```sh
git clone https://github.com/Nekobenzene/XGpre.git
cd XGpre
node scripts/dev.cjs
```

访问 [本地预览](http://127.0.0.1:8080/)，输入本地口令 `local-demo-code`，点击「连接」。选择案例后点击「讲解案例」，再输入一条追问。默认回复是模拟结果，可用来检查页面、口令和案例传递流程。

需要验证真实模型时，将 `.env.example` 复制为 `.env`，填入自己的 `DEEPSEEK_API_KEY`，并设置至少 12 位的 `DEMO_ACCESS_CODE`。停止模拟服务后运行：

```sh
node --env-file=.env scripts/dev.cjs --live
```

浏览器里输入 `.env` 中的演示口令。密钥由本地服务读取，`.env` 已加入 Git 忽略规则。

## 改哪里

| 要做的事 | 文件 |
| --- | --- |
| 改页面、讲解提示和追问行为 | [index.html](index.html) |
| 新增或编辑案例 | [案例目录](examples/index.json)和对应案例 JSON |
| 改口令、CORS、模型转发和限额 | [cloud-function/app.js](cloud-function/app.js) |
| 检查接口、了解部署和案例格式 | [架构与部署](docs/architecture.md)、[HTTP 协议](docs/api.md) |

提交前运行 `node cloud-function/verify.cjs`。修改案例或聊天流程时，用本地模拟模式走一遍「连接 → 讲解 → 追问」。GitHub Pages 从 `main` 分支根目录发布静态页。修改云函数后，需要在腾讯云单独部署。
