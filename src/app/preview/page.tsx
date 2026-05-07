import { PreviewGrid } from "@/components/preview-grid";

export default function PreviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Preview Workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">预览与在线编辑</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          当前页面会优先读取上传页保存的导入会话，支持真实数据的在线编辑、错误高亮、导出和提交。
        </p>
      </section>
      <PreviewGrid />
    </main>
  );
}
