"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoOrders } from "@/lib/mock-data";
import { ShipmentRecord } from "@/lib/types";

type ShipmentsResponse = {
  items: ShipmentRecord[];
  total: number;
  page: number;
  pageSize: number;
  mock?: boolean;
};

export function OrdersTable() {
  const [items, setItems] = useState<ShipmentRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchShipments() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/shipments?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(submittedKeyword)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as ShipmentsResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in data ? data.error || "运单列表查询失败" : "运单列表查询失败");
        }

        if (!active) return;
        const payload = data as ShipmentsResponse;
        setItems(payload.items);
        setTotal(payload.total);
        setIsMock(Boolean(payload.mock));
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "运单列表查询失败");
        setItems(demoOrders);
        setTotal(demoOrders.length);
        setIsMock(true);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void fetchShipments();

    return () => {
      active = false;
    };
  }, [page, pageSize, submittedKeyword]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  return (
    <div className="grid gap-5">
      <section className="panel rounded p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">查询表格</h2>
            <p className="mt-2 text-sm text-slate-500">
              支持按外部编码、门店、收件人、SKU 搜索。数据库未配置时自动回退 mock 数据。
            </p>
          </div>
          <span
            className={`rounded px-3 py-1 text-xs font-medium ${
              isMock ? "bg-cyan-100 text-cyan-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {isMock ? "Mock 数据" : "数据库数据"}
          </span>
        </div>

        <form
          className="mt-6 flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSubmittedKeyword(keyword.trim());
          }}
        >
          <label className="min-w-[260px] flex-1">
            <span className="mb-2 block text-sm font-medium text-slate-700">关键词</span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入外部编码 / 门店 / 收件人 / SKU"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[var(--app-accent)]"
          />
          </label>
          <button
            type="submit"
            className="self-end rounded bg-[var(--app-accent)] px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
          >
            搜索
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <section className="panel overflow-hidden rounded">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100 text-left text-slate-900">
            <tr>
              <th className="px-5 py-4 font-semibold">外部编码</th>
              <th className="px-5 py-4 font-semibold">收货门店</th>
              <th className="px-5 py-4 font-semibold">收件人</th>
              <th className="px-5 py-4 font-semibold">SKU</th>
              <th className="px-5 py-4 font-semibold">数量</th>
              <th className="px-5 py-4 font-semibold">创建时间</th>
              <th className="px-5 py-4 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                  列表加载中...
                </td>
              </tr>
            ) : items.length ? (
              items.map((order) => (
                <tr key={order.id}>
                  <td className="px-5 py-4 font-medium text-slate-900">{order.externalCode || "-"}</td>
                  <td className="px-5 py-4 text-slate-600">{order.storeName || "-"}</td>
                  <td className="px-5 py-4 text-slate-600">{order.receiverName || "-"}</td>
                  <td className="px-5 py-4 text-slate-600">{order.skuCode} / {order.skuName}</td>
                  <td className="px-5 py-4 text-slate-600">{order.quantity}</td>
                  <td className="px-5 py-4 text-slate-600">{order.createdAt}</td>
                  <td className="px-5 py-4">
                    <Link href={`/orders/${order.id}`} className="font-medium text-blue-600 transition hover:text-blue-700">
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel flex items-center justify-between rounded px-5 py-4">
        <p className="text-sm text-slate-600">
          第 {page} / {pageCount} 页，共 {total} 条
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
}
