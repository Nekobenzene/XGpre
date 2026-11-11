# XGpre

习概期末报告的 DeepSeek 对话测试页。

访问地址：<https://nekobenzene.github.io/XGpre/>

输入页面所有者提供的演示口令，连接后即可聊天。支持连续对话、新对话、停止等待和锁定。口令与对话只保留在当前页面内存中，刷新或锁定后清除；发送的消息会经腾讯云函数转发至 DeepSeek。

`index.html` 是独立静态页面，无外部依赖。GitHub Pages 发布源为 `main` 分支根目录。

云函数配置：

- Node.js 20.19 Web 函数，监听 9000，执行超时 120 秒。
- 环境变量 `DEEPSEEK_API_KEY` 保存 DeepSeek 密钥。
- 环境变量 `DEMO_ACCESS_CODE` 保存至少 12 位演示口令。
- 环境变量 `ALLOWED_ORIGINS` 为 `https://nekobenzene.github.io`。
- `POST /chat` 接收 `messages`，通过 `X-Demo-Code` 校验口令，返回 `reply`。
- 模型为 `deepseek-chat`，非流式响应。每次请求最多 40 条消息、总计 24000 字符，输出最多 2048 token。

不要将 API 密钥或演示口令提交到仓库。CORS 不代替口令鉴权；口令持有者仍可通过其他客户端调用接口。

此站用于课堂测试。腾讯云提供的默认函数 URL 仅供测试，正式长期使用请绑定自有域名。
