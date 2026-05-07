import { PreviewGrid } from "@/components/preview-grid";

export default function PreviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <section className="chapter-shell panel section-enter rounded-[36px] px-8 py-8 lg:px-10 lg:py-9">
        <p className="eyebrow">Preview Workspace</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="headline text-3xl font-semibold text-slate-950 lg:text-5xl">预览与在线编辑</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 lg:text-base">
              在这一层完成字段修正、错误排查和提交前检查。目标是让用户在单一工作面上完成所有修补动作。
            </p>
          </div>
          <div className="data-chip metric-stack rounded-[22px] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">交互目标</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">Edit / Validate / Submit</p>
          </div>
        </div>
      </section>
      <PreviewGrid />
    </main>
  );
}
