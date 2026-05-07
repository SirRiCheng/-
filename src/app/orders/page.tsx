import { OrdersTable } from "@/components/orders-table";

export default function OrdersPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Imported Orders</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">已导入运单列表</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          列表页已改为请求 `/api/shipments`，数据库配置后会直接展示真实入库结果。
        </p>
      </section>
      <OrdersTable />
    </main>
  );
}
