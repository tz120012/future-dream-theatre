# 本地 API

这是第一阶段原型的 FastAPI 服务，提供会话、语音转写、梦想卡任务和未来自己接口。语音识别默认使用本机 faster-whisper；对话默认使用内置模板，也可配置 OpenAI 兼容 API 或硅基流动；图片生成默认 Mock，也可切换硅基流动。

启动方式：

    py -m venv .venv
    .venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

健康检查地址：http://localhost:8000/api/health

复制 `.env.example` 为 `.env` 可调整模型和服务。浏览器只录制音频，`POST /api/stt/transcribe` 将录音发送给本机 FastAPI，再由 faster-whisper 在 CPU 上转写；服务不调用浏览器在线语音识别。录音临时写入本机临时目录，转写结束后删除，单次上传上限为 15 MB。

首次转写会下载配置的 Whisper 模型（默认 `base`），并缓存到当前用户的 Hugging Face 缓存目录。使用 Docker Compose 时，模型缓存在 `whisper-models` volume 中。网络无法访问 Hugging Face 时，可取消 `.env.example` 中 `HF_ENDPOINT` 的注释并设置为可访问的镜像地址。模型占用较大或设备较慢时，可设置 `WHISPER_MODEL=tiny`。

API Key 只应放在本机 `.env`，不要提交到仓库。直接运行后端时，`.env` 放在 `backend` 目录；Compose 启动时，`.env` 放在项目根目录。

Web 设置面板通过 `GET/PUT /api/config/settings` 配置语音识别、Whisper 模型、大模型服务、图片服务和会话保留时间。API Key 只在后端写入本地 `data/settings.json`（Compose 下为 `app-data` volume），读取接口只返回是否已配置。该本地配置文件未加密；当前原型没有账号和多租户隔离，请只在自己控制的本机或可信自托管环境中使用，不要直接公开到互联网。在线服务的费用和数据留存规则取决于服务商及账号设置。

## 语音转写接口

`POST /api/stt/transcribe` 接收 multipart 表单字段 `audio` 和可选的 `language`（默认 `zh`），成功时返回识别文本和 provider。空录音、无语音、超大录音和模型不可用会返回对应错误。前端在转写前不会自动结束录音，孩子说完后由老师或孩子点击“完成并识别”；最长录音时间为 60 秒。

`POST /api/sessions/{session_id}/dream-card` 在图片服务为 `siliconflow` 时调用 SiliconFlow `/v1/images/generations`。三个模型分工不同：`siliconflow_image_model`（默认 `Tongyi-MAI/Z-Image`）用于无照片的精细绘本、`siliconflow_image_fast_model`（默认 `Tongyi-MAI/Z-Image-Turbo`）用于快速卡通和"长大以后"的成年模板、`siliconflow_image_edit_model`（默认 `Qwen/Qwen-Image-Edit-2509`）用于保脸的图生图与双图融合。后端只发送经确认的角色、场景和风格文字，将返回图像暂存在 `data/generated`，并通过 `/api/generated/{asset_id}` 提供不可缓存的本地访问。会话清理或过期时会删除图片。

硅基流动对图片请求有内容审核，儿童照片的图生图请求偶发误判（HTTP 451 / code 20021）。后端会在一个总时间预算内自动重试，失败时把原因分成 `image_reference_rejected` / `image_prompt_rejected` / `image_auth_failed` / `image_quota_exceeded` / `image_timeout` / `image_upstream_error` 返回给前端，页面据此给出"换一张照片""重新生成""检查余额"之类的具体提示，而不是笼统的"服务不可用"。

`POST /api/sessions/{session_id}/future-self/messages` 可在 `allow_online_model` 获得本次体验确认后调用已配置的聊天模型。请求包含儿童当前文字、梦想角色与场景，以及最多 8 条简短历史对话；照片和音频不在请求中。接口会把模型回复转换为简体中文并做基础儿童安全检查。
