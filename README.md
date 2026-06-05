# AI 万能导入 V2

面向物流/快递批量下单的多格式导入系统。项目使用 `Next.js App Router + TypeScript`，围绕“AI 生成解析规则 + 用户确认 + 试解析 + 预览编辑 + 数据库存储”完成考试题核心流程。

## 已实现能力

- 鲸天风格 UI：主色 `#0fc6c2`，蓝绿色清爽工作台、圆角面板、进度反馈和错误汇总。
- 多格式上传入口：支持 `.xlsx`、`.xls`、`.docx`、`.pdf`、`.txt`；Excel 执行表格解析，Word/PDF/TXT 调用配置的大模型抽取结构化下单数据。
- 规则引擎：字段映射、跳过头部、尾部信息提取、跨行聚合、矩阵转置、多 Sheet 合并、卡片拆分、纯文本提取、PDF 多单拆分等操作用规则描述。
- AI 辅助生成规则：`POST /api/rules/ai-generate` 根据文件名、表头和样例行生成推荐规则；未配置模型时使用本地启发式兜底。
- 大模型结构化抽取：非 Excel 文件上传后会调用 `LLM_API_URL` 兼容的 `/chat/completions`，把文件文本抽取为标准下单行，再保存到 `import_sessions`。
- 规则库持久化：解析规则保存到 MySQL/TiDB，支持服务器端新建、编辑、复制、删除；导入时由用户手动选择已有规则，未选择时新建 AI 推荐规则。
- 解析会话持久化：上传解析结果、预览编辑后的行数据统一保存到 `import_sessions`，预览页从数据库读取。
- 题面字段模型：外部编码、收货门店、收件人姓名/电话/地址、SKU 物品编码/名称/数量/规格、备注。
- 校验规则：A组收货门店或 B组收件人信息二选一；SKU 编码、名称、数量必填；手机号格式；同外部编码 + 同 SKU 重复检测。
- 类 Excel 预览编辑：分页渲染 1000+ 行、固定表头、横向滚动、单元格编辑、Tab/Enter 跳转、新增/删除行、导出 Excel。
- 提交与历史列表：批量提交、进度条、数据库写入、历史运单搜索、分页和详情页。
- 钉钉预警：批量提交完成、失败、重复拦截、数据库配置错误等节点可通过机器人 Webhook 发送预警。

## 环境变量

复制 `.env.example` 为 `.env.local`，本地或 Vercel 必须配置 MySQL/TiDB。业务数据不会保存到浏览器本地存储，数据库未配置时规则、解析会话、预览编辑、提交和查询接口会返回错误。

```bash
TIDB_HOST=
TIDB_PORT=4000
TIDB_USER=
TIDB_PASSWORD=
TIDB_DATABASE=universal_excel_importer

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=universal_excel_importer
MYSQL_SOCKET=

LLM_API_KEY=
LLM_API_URL=https://www.vbcode.io/v1
LLM_MODEL=deepseek-chat

DINGTALK_WEBHOOK_URL=
DINGTALK_SECRET=
```

`LLM_API_URL` 可填 OpenAI 兼容的 `/v1` 基础地址，系统会自动请求 `/chat/completions`。

## 本地运行

```bash
npm install
npm run dev
```

## 构建验证

```bash
npx tsc --noEmit
npm run build
```

## API

- `POST /api/import/parse`
- `GET /api/import-sessions`
- `POST /api/import-sessions`
- `PATCH /api/import-sessions`
- `POST /api/rules/ai-generate`
- `POST /api/template-mappings`
- `GET /api/template-mappings`
- `DELETE /api/template-mappings`
- `GET /api/template-mappings/match`
- `GET /api/shipments`
- `GET /api/shipments/:id`
- `POST /api/shipments/batch`
- `POST /api/alerts/dingtalk`
