import Link from "next/link";
import { ArrowRight, Database, FileSpreadsheet, ScanSearch, ShieldCheck, Waypoints } from "lucide-react";

const steps = [
  {
    title: "上传多格式文件",
    detail: "支持 Excel / Word / PDF 入口，先抽取表头、样例行和文本结构。",
    icon: FileSpreadsheet,
  },
  {
    title: "AI 生成解析规则",
    detail: "大模型生成字段映射和规则操作，用户确认后持久化复用。",
    icon: ScanSearch,
  },
  {
    title: "校验并入库",
    detail: "在预览页修正错误后，批量提交到 TiDB/MySQL。",
    icon: Database,
  },
];

const metrics = [
  { label: "考核结构覆盖", value: "9 类" },
  { label: "单次导入规模", value: "1000+" },
  { label: "性能目标", value: "10s" },
];

const supportPillars = [
  {
    title: "规则引擎",
    detail: "跳过头部、尾部提取、跨行聚合、矩阵转置和多 Sheet 合并由规则描述。",
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
      <section className="hero-grid panel section-enter grid gap-10 rounded-[38px] px-8 py-10 lg:min-h-[34rem] lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-12">
        <div className="space-y-8">
          <p className="eyebrow">
            Universal Excel Importer
          </p>
          <div className="space-y-6">
            <h1 className="headline max-w-4xl text-4xl font-semibold text-slate-950 sm:text-5xl lg:text-[4.35rem] lg:leading-[0.94]">
              AI 万能导入 V2
            </h1>
            <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              面向物流出库单的多格式导入工作台。文件结构由 AI 生成解析规则，业务数据进入统一的 SKU 下单模型，再完成校验、编辑、提交和回查。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#075d5b,#0fc6c2)] px-5 py-3 text-sm font-medium text-white shadow-[0_20px_40px_-24px_rgba(15,198,194,0.78)] transition hover:-translate-y-0.5"
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
          <div className="grid gap-4 border-t border-white/50 pt-6 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
            {supportPillars.map(({ title, detail, icon: Icon }) => (
              <div key={title} className="flex gap-3">
                <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-strong section-enter-delay grid gap-6 rounded-[32px] p-6 text-slate-100 lg:p-7">
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
          <div className="mt-auto rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">主流程</p>
            <div className="mt-4 space-y-3">
              {[
                ["01", "File Intake"],
                ["02", "AI Rule Draft"],
                ["03", "Preview Review"],
                ["04", "Database Submit"],
              ].map(([index, label]) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{index}</span>
                  <span className="font-medium text-slate-100">{label}</span>
                </div>
              ))}
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
