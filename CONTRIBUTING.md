# 贡献指南

感谢愿意参与。这个项目是给幼儿园课堂和家庭用的原型，**最有价值的贡献是真实使用后的反馈**：哪句话孩子听不懂、哪一步会卡住、哪个语气听起来更自然。

## 提交之前

- 不要提交任何 **API Key、`.env`、`backend/data/`、儿童照片或录音**。
- 新增依赖时，请说明为什么现有依赖不够用。
- 涉及在线服务（对话/图片/语音）的改动，请保证**没有 Key 或断网时仍能走通本地回退**。

## 开发环境

```bash
# 后端：Python 3.11+
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端：Node 20+
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run lint     # oxlint
npm run build    # tsc -b && vite build
```

提交 PR 前请确保 `npm run build` 和 `python -m py_compile backend/main.py backend/settings.py` 都通过（CI 也会跑）。

## 代码风格

- 前端：TypeScript + React 函数组件，状态集中写在 `frontend/src/App.tsx`，接口封装在 `frontend/src/services/`。
- 后端：FastAPI + Pydantic，**所有对外请求都要设超时**；在线服务的失败一律降级到本地能力，不向孩子抛错误。
- 面向孩子的文案：短句、具体、不贴标签；不出现「你将来一定会……」「你不适合……」这类判断。
- 中文文案用简体，代码注释用中文或英文都可以。

## 提交信息

用 [Conventional Commits](https://www.conventionalcommits.org/) 风格，例如：

```
feat(tts): 增加童声音色预设
fix(image): 照片审核失败时给出可操作提示
docs(deploy): 补充 WSL 安装步骤
```

## 报告问题

- Bug 请附：系统版本、浏览器、复现步骤、`查看日志.bat` 或浏览器控制台里的报错。
- 涉及儿童的截图/录音请先打码或改用占位素材。
