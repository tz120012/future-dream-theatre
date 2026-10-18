# 未来梦想剧场

面向幼儿园课堂和家庭使用的儿童梦想探索互动原型。

小朋友通过语音、点击选项和可选照片表达想法，系统生成一张“未来梦想卡”，并让孩子和想象中的未来自己进行多轮对话。

## 当前实现

第一阶段原型已经包含：

- 老师课堂模式和家庭模式入口。
- 课堂设置和设备检查。
- 三轮儿童友好的梦想访谈。
- 访谈结束后汇总三轮回答，整理出兴趣、想象场景和 2–3 个可确认的梦想方向。
- 可选接入 OpenAI 兼容在线大模型或硅基流动；在线模式只发送经简体转换的文字回答，不发送照片或原始录音。
- 在线模型失败、未配置或未获本次确认时，自动使用本地模板继续体验。
- 摄像头授权、实时预览和拍照。
- 卡通形象、使用照片、不使用照片三种选择。
- Mock 梦想卡生成流程，也可用硅基流动文生图生成插画。
- “未来的自己”语音或文字多轮对话；在线模式会携带最近几轮文字上下文。
- 梦想卡下载。
- 下一位小朋友切换和临时会话清理。
- FastAPI 本地 API，包含会话、语音转写和 Mock 生成接口。
- 前后端会话连接：回答记录、梦想卡任务轮询和未来自己接口。
- 使用 faster-whisper 在本机进行中文语音识别；浏览器只负责录音。
- 点击“完成并识别”后，录音发送到本机 API，转写结束即删除临时音频。
- 不使用语音时仍可直接点选答案；设置页会说明本地录音处理方式。

## 运行前端

在 `frontend` 目录执行：

    npm install
    npm run dev

打开 `http://localhost:5173/`。

生产构建：

    npm run build

## 运行后端

在 `backend` 目录执行：

    py -m venv .venv
    .venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

健康检查地址：`http://localhost:8000/api/health`

本地 Whisper 模型只需要下载一次：默认保存在 `backend/data/whisper`，之后再启动会直接从磁盘加载，不会重复下载，也不会再联网。想放到别的磁盘可设置 `WHISPER_MODEL_DIR`（相对路径以 `backend` 目录为基准）；完全断网时可设置 `WHISPER_LOCAL_ONLY=1`。`GET /api/config/capabilities` 的 `whisper.cached` 会显示当前模型是否已经缓存。

语音识别、对话模型和图片模型可在全局设置中配置；默认语音识别使用浏览器自带识别，对话优先使用硅基流动（未配置 Key 或未授权时会自动回退内置模板），图片默认 Mock。硅基流动使用 `https://api.siliconflow.cn/v1` 的对话与 `/images/generations` 图片接口。摄像头和麦克风需要在 `localhost` 或 HTTPS 页面中使用。

后端提供 `backend/.env.example` 作为配置模板，不配置 API Key 也能体验：对话会回退到内置模板，图片使用 Mock。直接运行后端时可复制为 `backend/.env`；使用 Compose 时可复制为项目根目录的 `.env`。Key 由用户自行提供和付费，保存在运行后端的设备上。

页面左上角的图标打开全局设置，可切换浏览器语音识别或本地 Whisper、配置 OpenAI 兼容 API 或硅基流动、选择图片生成服务、开关语音播报和设置新会话保留时间。硅基流动使用同一把 Key，聊天模型和图片模型分别配置，默认分别为 `deepseek-ai/DeepSeek-V4.1-Flash` 和 `Tongyi-MAI/Z-Image`。照片页还能按课堂时间选择出图速度：“精细绘本”使用 Z-Image（约 15–20 秒，水彩绘本感），“快速卡通”使用 Z-Image-Turbo（约 5 秒），两个模型都可在设置里替换。照片模式可以现场拍照，也可以直接上传一张正脸照；上传/拍照后会让人物参考孩子的脸，并可选“现在的样子”（约 20 秒、保脸更准）或“长大以后”（两步生成，约 1 分钟，成年版的五官由模型推断，可能不完全像）。在线对话用于“梦想理解”和“未来的自己”多轮回复。老师或家长可在每次体验前分别确认是否发送访谈及未来对话文字、是否发送已确认的角色/场景/风格文字来生成图片。API Key 保存在后端本机配置数据中，不会由读取接口返回，也不会写入浏览器存储。

设置面板写入的 API Key 保存在后端 `data/settings.json`，文件未加密；也可通过本机 `.env` 配置。当前原型没有账号和多租户隔离，只适合本机或可信的自托管环境，不要直接公开到互联网。在线服务的计费、数据处理和留存规则取决于服务商及账号设置，启用前请查阅其最新政策。

梦想理解接口为 `POST /api/sessions/{session_id}/dream-analysis`。请求包含本轮回答和 `allow_online_model` 确认字段；服务端会校验模型返回的 JSON、长度、候选方向和儿童安全词，异常时返回模板回退结果。在线模型不得直接给孩子贴职业或能力标签，页面会让孩子或老师选择方向后再进入拍照和生成。

图片接口为 `POST /api/sessions/{session_id}/dream-card`。硅基流动模式下只发送已确认的角色、场景和风格文字，并要求 `allow_online_image` 确认。后端将硅基流动返回的临时图片下载到本机，再通过 `/api/generated/{asset_id}` 提供给前端；会话清理或过期时删除图片。摄像头照片不会上传到图片服务。

## Docker Compose

安装并启动 Docker Desktop 后，在项目根目录执行：

    docker compose up --build

打开 `http://localhost:8080/`。API 健康检查地址为 `http://localhost:8000/api/health`。

Compose 将前端和 API 端口绑定在本机回环地址，不会默认向局域网开放。全局设置和本地 Whisper 模型都保存在 Docker volume `app-data` 中；如需迁移，请保留该 volume。

首次点击“完成并识别”时，后端会下载默认的 Whisper `base` 模型，等待时间取决于网络；模型保存在 `app-data` volume 的 `whisper` 目录，后续启动直接从磁盘加载，不会重新下载。默认以 CPU `int8` 运行。可在项目根目录 `.env` 中设置 `WHISPER_MODEL=tiny` 以减少资源占用，或在无法访问 Hugging Face 时设置 `HF_ENDPOINT=https://hf-mirror.com`。硅基流动 Key、聊天模型和图片模型也可以通过全局设置配置，或在本机 `.env` 中设置 `SILICONFLOW_API_KEY`、`SILICONFLOW_CHAT_MODEL` 和 `SILICONFLOW_IMAGE_MODEL`。

## 目录

- [PRD](PRD.md)
- [技术方案](TECHNICAL-PLAN.md)
- [页面原型](UI-PROTOTYPE.md)
- [前端](frontend/)
- [本地 API 后端](backend/)
