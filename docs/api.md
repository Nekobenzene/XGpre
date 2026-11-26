# HTTP 协议

当前 Web 函数的 HTTPS 根地址为 `https://1529785241-cw41hwjsxl.ap-guangzhou.tencentscf.com`。本地联调使用 `http://127.0.0.1:8080`，请求与静态页面同源。

| 请求 | 用途 |
| --- | --- |
| `GET /health` | 检查进程和环境变量。返回 HTTP 200，`status` 为 `ready` 或 `configuration_required` |
| `POST /chat` | 发送消息并获取完整 JSON 回答 |
| `POST /`、`POST /v1/chat/completions` | 云函数对聊天请求的兼容路径 |
| `OPTIONS /chat` | 浏览器预检。允许的来源返回 204，并允许 `POST`、`Content-Type` 和 `X-Demo-Code` |

健康检查的 `ready` 表示函数已读到所需设置。密钥有效性与余额需要通过一次真实模型请求验证。

## 聊天请求

请求头使用 `Content-Type: application/json` 和 `X-Demo-Code: <演示口令>`。下面的示例使用默认本地模拟服务，可在终端执行：

```sh
curl -X POST http://127.0.0.1:8080/chat \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Code: local-demo-code' \
  --data '{"messages":[{"role":"user","content":"你好"}],"max_tokens":32,"stream":false}'
```

Windows PowerShell 可使用：

```powershell
$xgpreBody = @{ messages = @(@{ role = 'user'; content = 'Hello' }); max_tokens = 32 } | ConvertTo-Json -Depth 4
Invoke-RestMethod 'http://127.0.0.1:8080/chat' -Method Post -ContentType 'application/json' -Headers @{ 'X-Demo-Code' = 'local-demo-code' } -Body $xgpreBody
```

| 字段 | 约定 |
| --- | --- |
| `messages` | 1–40 条；每条包含 `role` 和非空文本 `content`，至少一条 `user` |
| `role` | `system`、`user` 或 `assistant` |
| `max_tokens` | 可省略，默认 1024，支持 1–2048 的整数 |
| `model` | 可省略，当前固定 `deepseek-chat` |
| `stream` | 可省略，发送 `false` 获取非流式 JSON |

消息正文总长度上限为 24000 个 JavaScript 字符单位，整个 UTF-8 JSON 请求体上限为 65536 字节。计入 `system` 消息里的案例材料。页面会裁掉最旧的问答，给当前案例和新消息留空间。

成功响应为 HTTP 200，`reply` 是回答文本。上游提供时也返回 `choices`、`usage`、`model`、`id`、`object` 和 `created`。失败返回 `{"error":"…"}`，部分上游失败另外提供 `upstream_status`。

| 状态码 | 含义 |
| --- | --- |
| 400 | JSON 或参数无效 |
| 401 / 403 | 口令错误 / 浏览器来源不允许 |
| 404 / 405 | 路径不存在 / 方法不支持 |
| 413 / 415 | 请求体超限 / 内容类型错误 |
| 429 | 当前实例或 DeepSeek 限流 |
| 502 / 503 / 504 | DeepSeek 调用失败 / 云函数缺少配置 / 等待上游超时 |

每个函数实例每分钟最多转发 20 次，最多同时转发 2 次。云平台可额外限制并发。上游等待上限为 100 秒，网页等待上限为 110 秒。

## 当前页面的口令校验

连接时页面向 `POST /chat` 发送 `{"messages":[]}`。后端先检查配置和口令，再校验消息。正确口令会收到消息数组无效的 HTTP 400，错误口令收到 401。这一步不会调用模型。由于页面识别以 `messages 需包含` 开头的错误提示，调整连接协议时应同时更新前端。
