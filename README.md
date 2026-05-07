# Universal Excel Importer

多模板 Excel 自动导入下单系统，技术方案对齐 `Vercel + mysql2 + TiDB/MySQL`。

## 当前已完成

- `Next.js App Router + TypeScript` 本地项目初始化
- `Vercel + mysql2/promise` 数据库接入骨架
- `TiDB / MySQL / MYSQL_SOCKET` 连接优先级
- `template_mappings / import_jobs / shipments` 建表 SQL
- 首版 Excel 解析接口：`POST /api/import/parse`
- 模板映射与运单接口骨架
- 首页、导入页、预览页、历史列表页、详情页

## 本地运行

1. 安装依赖：`npm install`
2. 复制环境变量：`cp .env.example .env.local`
3. 本地开发如需真实数据库，填写 `MYSQL_*` 或 `MYSQL_SOCKET`
4. 启动开发：`npm run dev`

## 线上部署

1. 将项目推到 Git 仓库
2. 在 `vercel.com` 导入项目
3. 在 Vercel 项目环境变量中配置：
   - `TIDB_HOST`
   - `TIDB_PORT`
   - `TIDB_USER`
   - `TIDB_PASSWORD`
   - `TIDB_DATABASE`
4. 重新部署

## API

- `POST /api/import/parse`
- `POST /api/template-mappings`
- `GET /api/template-mappings/match`
- `GET /api/shipments`
- `GET /api/shipments/:id`
- `POST /api/shipments/batch`
