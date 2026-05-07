import { OrdersTable } from "@/components/orders-table";

export default function OrdersPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <section className="panel section-enter rounded-[34px] px-8 py-8">
        <p className="eyebrow">Imported Orders</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="headline text-3xl font-semibold text-slate-950 lg:text-5xl">已导入运单列表</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 lg:text-base">
              所有提交成功的运单都会在这里回流，形成从 Excel 到数据库再到回查的完整闭环。
            </p>
          </div>
          <div className="data-chip rounded-[22px] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">数据来源</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">API / Database</p>
          </div>
        </div>
      </section>
      <OrdersTable />
    </main>
  );
}
