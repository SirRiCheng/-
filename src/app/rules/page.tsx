import { RulesManager } from "@/components/rules-manager";

export default function RulesPage() {
  return (
    <main className="w-full px-5 py-5 lg:px-6">
      <section className="page-hero rounded p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">解析规则管理</h1>
          <p className="mt-2 text-sm text-slate-500">
            维护导入规则，支持新建、编辑、复制、删除和导入页选择使用。
          </p>
        </div>
      </section>
      <div className="mt-5">
        <RulesManager />
      </div>
    </main>
  );
}
