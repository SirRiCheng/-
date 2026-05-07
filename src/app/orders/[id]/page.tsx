import { notFound } from "next/navigation";
import { demoOrders } from "@/lib/mock-data";
import { ShipmentRecord } from "@/lib/types";

async function getOrder(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const response = await fetch(`${baseUrl}/api/shipments/${id}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ShipmentRecord;
  } catch {
    return demoOrders.find((item) => item.id === Number(id)) || null;
  }
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const order = await getOrder(params.id);

  if (!order) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-float">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Shipment Detail</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          运单详情 #{order.id}
        </h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            ["外部编码", order.externalCode || "-"],
            ["寄件人", order.senderName],
            ["寄件电话", order.senderPhone],
            ["寄件地址", order.senderAddress],
            ["收件人", order.receiverName],
            ["收件电话", order.receiverPhone],
            ["收件地址", order.receiverAddress],
            ["重量", String(order.weight)],
            ["件数", String(order.packageCount)],
            ["温层", order.temperature],
            ["备注", order.remark || "-"],
            ["创建时间", order.createdAt],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
