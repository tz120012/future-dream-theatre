# 安全策略

这个项目会接触**儿童的声音、照片和表达**，同时会在本机保存第三方 API Key。请按下面的方式部署和使用。

## 部署边界

- **默认只监听 `127.0.0.1`**：前端 8080、接口 8000（部署包会自动换端口）。这是刻意的设计——本项目没有账号体系、没有多租户隔离，直接暴露到局域网或公网等于把设置面板（含 API Key）公开。
- 如果确实需要局域网多台设备访问，请自行在前置反向代理上加 **HTTPS + 身份认证**，并限制来源。注意：摄像头/麦克风只在 `localhost` 或 HTTPS 页面下可用。
- 不建议把这个服务放在公网服务器上长期运行。

## API Key

- Key 只保存在运行后端的设备上：本地开发是 `backend/data/settings.json` 或 `backend/.env`；Docker 部署是卷 `app-data`。
- 文件**未加密**，能登录这台电脑的人就能读到。请使用权限受限的系统账号。
- 读取配置的接口只返回「是否已配置」，不会返回 Key 本身，也不会写进浏览器存储。
- 一旦怀疑泄露：先去服务商后台吊销，再在设置页重新填写。

## 儿童数据

- 语音识别默认在**本机**完成（faster-whisper），录音在转写结束后删除。
- 照片默认不出网；只有在老师/家长单独勾选「允许把这张照片作为参考图」后，才会随图生图请求发送给图片服务。
- 在线对话只发送文字，不发送照片和原始录音。
- 临时会话与生成的图片按 `RETENTION_MINUTES`（默认 30 分钟）清理，也可以在页面上「下一位小朋友」立即清理。

## 报告问题

发现安全问题时，请不要直接开公开 Issue。可以通过 GitHub 的
[Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
联系维护者，或在 Issue 里只描述「影响范围」，不要附带可复现的敏感细节。

## 支持的版本

项目处于原型阶段，只对**当前主分支的最新提交**提供安全修复。
