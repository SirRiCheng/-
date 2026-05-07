import Link from "next/link";
import { ArrowRight, Database, FileSpreadsheet, ScanSearch } from "lucide-react";

const steps = [
  {
    title: "上传 Excel",
    detail: "支持 .xls / .xlsx，先解析原始表头和数据。",
    icon: FileSpreadsheet,
  },
  {
    title: "识别模板",
    detail: "通过字段别名、列顺序无关匹配和模板签名自动映射。",
    icon: ScanSearch,
  },
  {
    title: "校验并入库",
    detail: "在预览页修正错误后，批量提交到 TiDB/MySQL。",
    icon: Database,
  },
];

const metrics = [
  { label: "模板兼容目标", value: ">= 5" },
  { label: "单次导入规模", value: "1000+" },
  { label: "数据库方案", value: "TiDB / MySQL" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-6 py-10 lg:px-10">
      <section className="grid gap-8 rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.35)] lg:grid-cols-[1.4fr_0.9fr] lg:px-10">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            Universal Excel Importer
          </p>
          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              多模板自动导入下单系统
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              当前版本已完成本地项目初始化、Vercel + mysql2/TiDB 接入骨架、核心页面路径和首批 API
              结构，接下来可继续向 Excel 识别、预览编辑和批量入库闭环推进。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              进入导入工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              查看已导入运单
            </Link>
          </div>
        </div>

        <div className="grid gap-3 rounded-[28px] bg-slate-950 p-5 text-slate-100">
          <p className="text-sm uppercase tracking-[0.22em] text-slate-400">当前开发范围</p>
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-end justify-between border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
            >
              <span className="text-sm text-slate-300">{metric.label}</span>
              <span className="text-lg font-semibold">{metric.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {steps.map(({ title, detail, icon: Icon }) => (
          <article
            key={title}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]"
          >
            <div className="mb-5 inline-flex rounded-2xl bg-amber-100 p-3 text-amber-700">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
