import { ImportWorkbench } from "@/components/import-workbench";

export default function ImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Import Flow</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">上传、识别与映射</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          这一页对接 `/api/import/parse`，用于完成首个闭环：上传 Excel、解析 Sheet、匹配标准字段、返回错误摘要。
        </p>
      </section>
      <ImportWorkbench />
    </main>
  );
}
