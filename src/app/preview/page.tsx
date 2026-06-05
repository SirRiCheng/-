import { PreviewGrid } from "@/components/preview-grid";

export default function PreviewPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
      <section className="panel rounded p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">预览与在线编辑</h1>
          <p className="mt-2 text-sm text-slate-500">
            检查解析结果，修正错误行，导出数据或批量提交。
          </p>
        </div>
      </section>
      <div className="mt-5">
      <PreviewGrid />
      </div>
    </main>
  );
}
