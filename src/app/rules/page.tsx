import { RulesManager } from "@/components/rules-manager";

export default function RulesPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <section className="chapter-shell panel section-enter rounded-[36px] px-8 py-8 lg:px-10 lg:py-9">
        <p className="eyebrow">Rule Management</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="headline text-3xl font-semibold text-slate-950 lg:text-5xl">解析规则管理</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 lg:text-base">
              规则可以手动创建、编辑、复制和删除。导入时用户选择已有规则，或让 AI 生成推荐规则后保存复用。
            </p>
          </div>
          <div className="data-chip metric-stack rounded-[22px] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">核心考点</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">Configurable Rules</p>
          </div>
        </div>
      </section>
      <RulesManager />
    </main>
  );
}
