# GPT Image Playground

基于 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) 改造的多用户图片生成与编辑服务。

在原项目纯前端架构基础上，增加了 FastAPI 后端、多用户空间隔离、管理后台、服务端历史记录、运行时配置等功能。

## 与原项目的主要区别

- 新增 FastAPI 后端，统一管理 API Key，用户无需自备
- 口令空间隔离，多用户共享同一实例
- 服务端图片存储 + 历史记录持久化
- 管理控制台（仪表盘、任务管理、图库、空间主管理、运行时配置）
- 并发控制（每用户生成上限可动态调整）
- 遮罩编辑与参考图在详情中可回溯查看

## 目录结构

```
gpt-image-playground/
├── backend/          # FastAPI 后端
│   ├── app.py        # 主服务
│   ├── db.py         # SQLite 数据层
│   ├── requirements.txt
│   ├── run_local.sh
│   ├── start_screen.sh
│   └── stop_screen.sh
├── frontend/         # React 前端
│   ├── src/
│   ├── package.json
│   └── dist/         # 构建产物（被后端静态服务）
├── .env.example
├── API.md
├── start.bat        # Windows 一键启动脚本
└── README.md
```

## 功能

- `/` 用户 Web UI（口令空间隔离）
- `ADMIN_PAGE_PATH` 管理控制台
- `POST /api/v1/generate` 文生图 API
- `POST /api/v1/edit` 图片编辑 API
- SQLite 审计日志
- 本地图片存储 + 缩略图

## 快速开始

Windows 一键启动：

```bat
start.bat
```

脚本会检查依赖、构建前端，并在当前终端启动后端。如果端口已被占用，会询问是否关闭旧进程。

```bash
cp .env.example .env
# 编辑 .env 填入真实配置

cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
bash run_local.sh
```

前端开发：

```bash
cd frontend
npm install
npm run dev
```

前端构建（后端会自动从 `frontend/dist/` 提供静态文件）：

```bash
cd frontend
npm run build
```

## 环境变量

```env
IMAGE_API_KEY=your-api-key
IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_MODEL=gpt-image-2
IMAGE_API_TIMEOUT=360
IMAGE_RESPONSE_FORMAT=
IMAGE_QUALITY_FIELD=
PORT=30116
OWNER_SECRET=replace-with-a-long-secret
COOKIE_SIGNING_SECRET=replace-with-another-long-secret
ADMIN_PASSWORD=replace-with-admin-password
ADMIN_PAGE_PATH=/admin
```

### NowCoding 适配

当 `IMAGE_API_BASE_URL` 指向 `https://nowcoding.ai/v1` 时，服务会自动进行兼容处理：

- 生图接口和 OpenAI SDK 一样走 `/images/generations`
- 编辑/参考图接口和 OpenAI SDK 一样走 `/images/edits`
- 不需要为 NowCoding 单独改接口路径，只需要把 `IMAGE_API_BASE_URL` 改成 `https://nowcoding.ai/v1`
- 默认补充 `response_format=b64_json`
- 将前端的质量选项转换为 NowCoding 使用的 `thinking` 字段，例如 `quality=high` 会转为 `thinking=hd`

如需手动指定兼容字段，可通过环境变量覆盖：

```env
IMAGE_RESPONSE_FORMAT=b64_json
IMAGE_QUALITY_FIELD=thinking
```

## API

详见 `API.md`。

## 致谢

本项目基于 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) 开发，感谢原作者的优秀工作。

## 许可证

[MIT License](LICENSE)
