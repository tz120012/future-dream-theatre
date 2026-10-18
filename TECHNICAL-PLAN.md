# 未来梦想剧场

## 技术方案

## 1. 技术决策摘要

| 领域 | 决定 |
| --- | --- |
| 应用形态 | 浏览器应用，桌面优先，支持课堂全屏使用 |
| 前端 | React + TypeScript + Vite |
| 后端 | Python + FastAPI |
| 数据库 | SQLite，保存会话元数据；媒体文件使用本地文件存储 |
| 任务处理 | MVP 使用 FastAPI 后台任务和状态轮询 |
| 部署 | Docker Compose；本地运行、自托管和云端均可 |
| 默认会话 | 无账号、临时会话、默认结束即清理 |
| AI 接入 | STT、LLM、TTS、图片生成均使用适配器接口 |
| 浏览器目标 | Chrome/Edge 最新稳定版，Windows 笔记本优先 |

## 2. 为什么选择浏览器应用

浏览器可以直接访问笔记本摄像头、麦克风和扬声器，老师打开地址即可开始体验，不需要给每台电脑安装复杂的桌面软件。React 适合实现儿童交互页面，Vite 适合本地开发和静态部署，FastAPI 负责保护服务密钥、处理媒体、调用模型并管理会话。

浏览器应用需要在 localhost 或 HTTPS 环境下使用摄像头和麦克风。开发和本地运行文档必须明确这一点。

## 3. 整体架构

~~~text
┌────────────────────────────────────────────────────────────┐
│ 浏览器：React + TypeScript                                  │
│                                                            │
│ 课堂设置  设备检查  儿童对话  拍照  梦想卡  未来自己对话      │
└───────────────┬────────────────────────────────────────────┘
                │ REST + JSON / 文件上传 / 任务状态轮询
┌───────────────▼────────────────────────────────────────────┐
│ FastAPI 应用服务                                            │
│                                                            │
│ 会话状态机  内容安全  提示词编排  任务管理  数据删除          │
└───────┬───────────┬───────────┬───────────┬────────────────┘
        │           │           │           │
   STT 适配器   对话适配器  TTS 适配器  图片生成适配器
        │           │           │           │
    浏览器/本地/云服务，可按部署配置切换
                │
       SQLite + 临时文件目录
~~~

## 4. 前端方案

### 4.1 技术栈

- React
- TypeScript
- Vite
- React Router
- Zod，用于前端 API 数据校验
- 原生 MediaDevices 和 MediaRecorder API
- CSS Modules 或普通 CSS

第一版不引入复杂的组件库。儿童体验页面需要大按钮、明确状态和稳定布局，使用少量项目内组件更容易控制。

### 4.2 前端模块

~~~text
src/
  app/                   路由和全局状态
  pages/                 页面级组件
  components/            Button、StepIndicator、VoiceState 等通用组件
  features/session/      会话状态机和课堂流程
  features/device/       摄像头、麦克风、扬声器检查
  features/conversation/语音录制、转写结果、问题卡片
  features/capture/      拍照和照片选择
  features/dream-card/   梦想卡预览和下载
  features/future-self/  未来自己对话
  services/api/          HTTP 客户端
  services/media/       摄像头、麦克风、录音和拍照
  styles/                主题和响应式样式
~~~

### 4.3 前端状态

页面使用显式会话状态，避免上一位儿童的数据残留：

~~~text
idle
  -> setup
  -> device_check
  -> welcome
  -> interviewing
  -> dream_analysis
  -> dream_direction_review
  -> photo_choice
  -> capturing (可选)
  -> generating
  -> card_review
  -> future_self (可跳过)
  -> completed
  -> clearing
  -> idle
~~~

每个状态只能通过定义好的操作进入下一状态。next_child 和 delete_session 必须清理前端内存、对象 URL、录音 Blob 和后端临时文件。

## 5. 后端方案

### 5.1 技术栈

- Python 3.12+
- FastAPI
- Pydantic v2
- SQLAlchemy 2 + SQLite
- Uvicorn
- Pillow
- python-multipart

MVP 不引入 Redis、消息队列或微服务。图片生成任务先由 FastAPI 后台任务执行并写入任务状态；需要更高并发时再替换为任务队列。

### 5.2 服务模块

~~~text
server/
  main.py                  应用入口
  api/                     REST 路由
  domain/                  会话、问题、梦想卡领域模型
  services/
    session_service.py     会话和状态转换
    conversation_service.py 对话流程和摘要
    safety_service.py      输入和输出安全检查
    generation_service.py  图片任务编排
    cleanup_service.py     临时文件清理
  providers/
    stt/                   语音识别适配器
    llm/                   对话模型适配器
    tts/                   语音合成适配器
    image/                 图片生成适配器
  storage/                 数据库和文件存储
  settings.py              环境变量和部署配置
~~~

## 6. AI 服务适配策略

### 6.1 语音识别（STT）

统一接口：

~~~text
transcribe(audio, language) -> Transcript
~~~

MVP 默认使用本机 faster-whisper，不依赖浏览器语音识别；全局设置也可以切换到浏览器自带识别：

1. 浏览器通过 `MediaRecorder` 录制音频，孩子说完后点击“完成并识别”。
2. 前端将录音上传至本机 FastAPI 的 `/api/stt/transcribe` 接口。
3. 后端在 CPU 上运行 faster-whisper（默认 `base` 模型、`int8`），首次转写时下载模型并缓存。
4. 本地 Whisper 模式在后端转写完即删除临时录音；上传大小限制为 15 MB，录音时长限制为 60 秒。

浏览器识别模式使用 Web Speech API，并在短暂静音后尝试继续监听，最长 60 秒，直到用户点击“完成并识别”。是否支持以及数据处理方式取决于浏览器。

如果无法使用麦克风、Whisper 尚未下载或模型不可用，页面仍提供点击选项。Docker Compose 使用持久化 volume 缓存模型；可通过 `HF_ENDPOINT` 指定模型下载镜像。

### 6.2 对话模型（LLM）

问题流程由固定问题模板和状态机控制。三轮回答完成后，界面向后端提交整组文字回答，后端依据全局设置使用本地模板、OpenAI 兼容接口或硅基流动整理梦想。模型只负责：

- 从多轮儿童回答中提取兴趣线索、想象场景和 2–3 个开放方向。
- 用带有不确定性的简短复述呈现理解结果，由孩子或老师确认方向。
- 根据已确认的梦想方向和上下文，生成未来自己的简短多轮回应。

梦想理解接口为 `POST /api/sessions/{session_id}/dream-analysis`，请求体包括回答数组和 `allow_online_model` 确认字段。未来对话接口为 `POST /api/sessions/{session_id}/future-self/messages`，支持传入确认过的梦想方向、最近对话上下文和当前消息。只有老师在当次体验开始前确认在线文字处理时，服务端才会把相应的简体中文文字发送到配置的模型端点；照片和原始录音不进入这些接口。服务端验证 JSON 结构、字段长度、候选数量和简单的儿童安全词，模型回应会做长度、简体中文和安全词检查，不记录回答或模型响应正文。

统一接口：

~~~text
extract_dream(transcript, age_group, theme) -> DreamProfile
respond_as_future_self(dream_profile, child_message) -> SafeResponse
~~~

如果 LLM 不可用，系统仍可根据点击选项生成基础梦想卡，并使用预先编写的未来自己回应。在线未来对话最多携带最近 8 条上下文，避免无限增长。

全局设置可选内置模板、OpenAI 兼容接口或硅基流动。硅基流动使用固定 API 地址 `https://api.siliconflow.cn/v1`，API Key 共用，聊天和图片模型分别配置；默认聊天模型为 `deepseek-ai/DeepSeek-V4-Flash`。API Key 只存入后端本地配置文件，读取设置时只返回密钥是否存在。部署者应把 Key 当作密码保护，不要提交到仓库或公开部署未经访问控制的设置页面。在线模型失败时，梦想理解回退到本地模板，“未来的自己”回退到预设回应。

### 6.3 语音合成（TTS）

默认使用浏览器 SpeechSynthesis 进行引导语音和基础回应。未来可以接入本地 Piper 或云端 TTS 生成更稳定的角色声音。

统一接口：

~~~text
synthesize(text, voice, language) -> AudioAsset
~~~

### 6.4 图片生成

统一接口：

~~~text
generate_dream_card(dream_profile, portrait_mode, style) -> GenerationJob
~~~

MVP 默认使用本地 Mock 预览，也可以使用硅基流动 `POST /v1/images/generations` 接口；默认图片模型为 `Kwai-Kolors/Kolors`。同一硅基流动 Key 可供聊天和图片服务共用，两个模型可以独立设置。只有老师或家长确认后，后端才把已确认的梦想角色、场景和风格文字发送给图片服务；原始照片与录音不上传。后端下载供应商返回的临时图片，在本机暂存并通过带会话有效期的本地 URL 返回前端；会话删除或过期后删除文件。

图片提示词由后端生成，前端不直接拼接儿童原始录音或未确认文字到模型请求中。提示词中固定加入儿童安全约束和“想象中的未来角色”语义。

## 7. 数据与隐私设计

### 7.1 数据实体

~~~text
Session
  id
  mode                  classroom | family
  age_group
  theme
  status
  consent_flags
  created_at
  expires_at

Response
  id
  session_id
  question_id
  transcript_text       可选，默认会话结束清理
  source                voice | choice | teacher_input

MediaAsset
  id
  session_id
  type                  portrait | audio | generated_image
  path
  expires_at

DreamCard
  id
  session_id
  title
  quote
  dream_profile_json
  image_asset_id
~~~

### 7.2 默认保存策略

- 会话数据默认只存在于当前会话。
- 原始照片和录音默认标记为临时文件。
- 点击“下一位”或“删除”后立即清理临时文件和前端对象 URL。
- 只有老师明确选择下载或保存时，才保留生成图片。
- 日志只记录错误类型、任务 ID 和耗时，不记录儿童原话、照片或音频。

### 7.3 云服务边界

任何需要把照片、音频或文字发送到第三方的适配器，都必须在 UI 中显示服务名称、发送的数据类型、数据用途和失败及保存行为。

## 8. REST API 草案

### 会话

~~~text
POST   /api/sessions
GET    /api/sessions/{session_id}
POST   /api/sessions/{session_id}/dream-analysis
POST   /api/sessions/{session_id}/clear
DELETE /api/sessions/{session_id}
~~~

### 设备和输入

~~~text
POST /api/sessions/{session_id}/responses
POST /api/sessions/{session_id}/photo
POST /api/sessions/{session_id}/audio
~~~

### 生成和未来自己

~~~text
POST /api/sessions/{session_id}/dream-card
GET  /api/jobs/{job_id}
POST /api/sessions/{session_id}/future-self/messages
~~~

### 配置和健康检查

~~~text
GET /api/config/capabilities
GET /api/health
~~~

MVP 使用短轮询查询图片生成进度。后续需要更细的实时状态时，再增加 SSE 或 WebSocket。

## 9. 部署方案

### 9.1 本地开发

~~~text
frontend: http://localhost:5173
backend:  http://localhost:8000
~~~

开发环境通过 Vite 代理 /api 到 FastAPI，避免浏览器跨域配置影响体验。

### 9.2 单机自托管

使用 Docker Compose：

~~~text
web       前端静态文件或 Nginx
api       FastAPI 服务
data      SQLite、临时媒体和可选生成图片
~~~

全局设置 API Key 保存在本机后端数据卷，读取接口不返回原值。Compose 默认只绑定 `127.0.0.1`；如需在网络中自托管，必须增加认证和 HTTPS，不能直接暴露管理配置接口。

### 9.3 配置分层

~~~text
APP_MODE=local | self_hosted | cloud
STT_PROVIDER=local_whisper
WHISPER_MODEL=base
WHISPER_COMPUTE_TYPE=int8
# 可选：配置 Hugging Face 下载镜像
# HF_ENDPOINT=https://hf-mirror.com
LLM_PROVIDER=template | openai_compatible | custom
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
TTS_PROVIDER=browser | piper | custom
IMAGE_PROVIDER=mock | openai_compatible | comfyui | custom
RETENTION_MINUTES=30
~~~

mock 图片服务用于没有 API Key 的开发和演示环境，返回占位图或本地测试图片，不会阻塞页面流程开发。

## 10. 内容安全策略

### 输入侧

- 对话问题使用固定儿童友好模板。
- 对自由回答做长度限制和敏感信息检测。
- 检测到姓名、住址、电话等信息时，不重复展示，并引导孩子回到梦想主题。

### 输出侧

- 未来自己回应限制为短句、鼓励性语气和一个问题。
- 禁止医疗、危险行为、恐怖、暴力、歧视和成人内容。
- 图片生成前固定加入儿童安全风格约束。
- 生成结果异常时使用安全占位图和预先写好的回应。

## 11. 关键技术风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 麦克风或本地 Whisper 不可用 | 浏览器 TTS + 点击选项；检查本机 API、麦克风权限和模型下载 |
| 图片生成时间过长 | 进度页面、取消、重试、预设示例图兜底 |
| 云服务费用或限额 | Provider 配置、任务限额、mock 模式、明确错误提示 |
| 儿童数据残留 | 会话状态机统一清理，文件过期任务定期执行 |
| 网络中断 | 保留当前文字和点击选择；生成失败后可重试 |
| 模型输出不适合儿童 | 固定模板、输入输出检查、预置安全回答 |
| 老师操作中断 | 页面显示当前步骤，刷新后默认回到空白会话 |

## 12. 开发顺序

### 阶段 1：无生成模型可运行原型

- 完成页面路由、会话状态机和课堂流程。
- 使用固定模板、浏览器 TTS 和 Mock 图片生成。
- 验证老师能否连续完成 5 位儿童体验。

### 阶段 2：接入设备和本地语音识别

- 摄像头拍照。
- 麦克风录音和本机 Whisper 转写（当前已接入）。
- 浏览器语音播报。
- 文件清理和下载。

### 阶段 3：接入真实生成服务

- LLM 提取梦想结构（内置模板、OpenAI 兼容接口和硅基流动）。
- 硅基流动图片生成；图片失败时保留本地梦想卡。
- 未来自己语音或文字多轮对话。

### 阶段 4：隐私与部署完善

- Docker Compose。
- 本地和自托管配置说明。
- 云服务数据提示。
- 家庭模式和家长确认入口。

## 13. 推荐的第一版验收环境

- Windows 10 或 Windows 11 笔记本。
- Chrome 或 Edge 最新稳定版。
- 1280x720 以上屏幕分辨率。
- 内置摄像头、麦克风和扬声器。
- 可选择联网或只使用 mock/本地适配器。

