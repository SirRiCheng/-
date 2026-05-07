import Link from "next/link";
import { ArrowRight, Database, FileSpreadsheet, ScanSearch, ShieldCheck, Waypoints } from "lucide-react";

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

const supportPillars = [
  {
    title: "模板识别",
    detail: "说明行、分组表头、多 Sheet 和中英文字段都能进入同一套标准模型。",
    icon: ScanSearch,
  },
  {
    title: "校验工作流",
    detail: "编辑、错误汇总、重复检测和导出在同一张工作台里完成。",
    icon: ShieldCheck,
  },
  {
    title: "入库结果",
    detail: "提交后落 TiDB / MySQL，并通过历史运单列表回查。",
    icon: Waypoints,
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-8 lg:px-10 lg:py-10">
      <section className="hero-grid panel section-enter grid gap-8 rounded-[36px] px-8 py-10 lg:grid-cols-[1.35fr_0.95fr] lg:px-10 lg:py-12">
        <div className="space-y-8">
          <p className="eyebrow">
            Universal Excel Importer
          </p>
          <div className="space-y-5">
            <h1 className="headline max-w-4xl text-4xl font-semibold text-slate-950 sm:text-5xl lg:text-6xl">
              多模板自动导入下单系统
            </h1>
            <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              把格式各异的 Excel 模板统一吸收到一条可控工作流里。上传、识别、修正、导出、入库和回查都在同一套操作桌面中完成。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#111827,#1f2937)] px-5 py-3 text-sm font-medium text-white shadow-[0_20px_40px_-24px_rgba(17,24,39,0.78)] transition hover:-translate-y-0.5"
            >
              进入导入工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/55 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-white"
            >
              查看已导入运单
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {supportPillars.map(({ title, detail, icon: Icon }) => (
              <div key={title} className="data-chip rounded-[24px] p-4 transition hover:-translate-y-0.5">
                <div className="mb-3 inline-flex rounded-2xl bg-[var(--app-accent-soft)] p-2.5 text-[var(--app-accent)]">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-strong section-enter-delay grid gap-5 rounded-[30px] p-6 text-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">当前开发范围</p>
            <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              live
            </p>
          </div>
          <div className="soft-divider" />
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-end justify-between">
              <span className="text-sm text-slate-300">{metric.label}</span>
              <span className="text-2xl font-semibold tracking-tight">{metric.value}</span>
            </div>
          ))}
          <div className="mt-auto rounded-[26px] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">主流程</p>
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-200">
              <span>Excel</span>
              <span className="text-slate-500">→</span>
              <span>Preview</span>
              <span className="text-slate-500">→</span>
              <span>Validate</span>
              <span className="text-slate-500">→</span>
              <span>Submit</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-enter-delay grid gap-4 lg:grid-cols-3">
        {steps.map(({ title, detail, icon: Icon }) => (
          <article
            key={title}
            className="panel rounded-[28px] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_32px_80px_-46px_rgba(15,23,42,0.3)]"
          >
            <div className="mb-5 inline-flex rounded-2xl bg-[var(--app-accent-soft)] p-3 text-[var(--app-accent)]">
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
