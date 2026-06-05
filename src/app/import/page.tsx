import { ImportWorkbench } from "@/components/import-workbench";

export default function ImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <section className="chapter-shell panel section-enter rounded-[36px] px-8 py-8 lg:px-10 lg:py-9">
        <p className="eyebrow">Import Flow</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="headline text-3xl font-semibold text-slate-950 lg:text-5xl">上传、识别与映射</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 lg:text-base">
              上传区负责吸收不同来源的 Excel、Word、PDF 文件。系统先生成可确认的解析规则，再把试解析结果折叠成可编辑的标准 SKU 出库单数据。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[30rem]">
            {[
              ["考核结构", "9 类"],
              ["识别方式", "AI Rule + Mapping"],
              ["数据落点", "Preview / DB"],
            ].map(([label, value]) => (
              <div key={label} className="data-chip metric-stack rounded-[22px] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section-enter-delay">
        <ImportWorkbench />
      </section>
    </main>
  );
}
