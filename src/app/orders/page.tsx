import { OrdersTable } from "@/components/orders-table";

export default function OrdersPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
      <section className="panel rounded p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">已导入运单列表</h1>
          <p className="mt-2 text-sm text-slate-500">
            查询已经提交的运单记录，支持按外部编码、门店、收件人和 SKU 搜索。
          </p>
        </div>
      </section>
      <div className="mt-5">
      <OrdersTable />
      </div>
    </main>
  );
}
