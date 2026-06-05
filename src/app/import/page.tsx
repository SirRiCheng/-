import { ImportWorkbench } from "@/components/import-workbench";

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
      <section className="panel rounded p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">上传、识别与映射</h1>
          <p className="mt-2 text-sm text-slate-500">
            上传文件后生成解析规则，并把数据转换为可编辑的标准出库单。
          </p>
        </div>
      </section>
      <section className="mt-5">
        <ImportWorkbench />
      </section>
    </main>
  );
}
