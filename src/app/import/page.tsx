import { ImportWorkbench } from "@/components/import-workbench";

export default function ImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <section className="panel section-enter rounded-[34px] px-8 py-8">
        <p className="eyebrow">Import Flow</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="headline text-3xl font-semibold text-slate-950 lg:text-5xl">上传、识别与映射</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 lg:text-base">
              上传区负责吸收不同来源的 Excel 模板，并把说明行、分组表头、多 Sheet
              结构统一折叠成可编辑的标准运单数据。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["兼容模板", "5 / 5"],
              ["识别方式", "Alias + Signature"],
              ["数据落点", "Preview Session"],
            ].map(([label, value]) => (
              <div key={label} className="data-chip rounded-[22px] px-4 py-3">
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
