"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, DatePicker, Form, Input, Pagination, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { ShipmentRecord } from "@/lib/types";

type ShipmentsResponse = {
  items: ShipmentRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export function OrdersTable() {
  const [items, setItems] = useState<ShipmentRecord[]>([]);
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [submittedDateFrom, setSubmittedDateFrom] = useState("");
  const [submittedDateTo, setSubmittedDateTo] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchShipments() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/shipments?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(submittedKeyword)}&dateFrom=${encodeURIComponent(submittedDateFrom)}&dateTo=${encodeURIComponent(submittedDateTo)}`,
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
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "运单列表查询失败");
        setItems([]);
        setTotal(0);
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
  }, [page, pageSize, submittedDateFrom, submittedDateTo, submittedKeyword]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const columns: ColumnsType<ShipmentRecord> = [
    {
      title: "外部编码",
      dataIndex: "externalCode",
      ellipsis: true,
      render: (value: string | undefined) => value || "-",
    },
    {
      title: "收货门店",
      dataIndex: "storeName",
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "收件人",
      dataIndex: "receiverName",
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "SKU",
      key: "sku",
      ellipsis: true,
      render: (_, order) => `${order.skuCode} / ${order.skuName}`,
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 100,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      ellipsis: true,
    },
    {
      title: "操作",
      key: "action",
      width: 112,
      fixed: "right",
      render: (_, order) => (
        <Link href={`/orders/${order.id}`} className="app-link whitespace-nowrap">
          查看详情
        </Link>
      ),
    },
  ];

  return (
    <div className="grid gap-5">
      <section className="panel rounded p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">查询表格</h2>
            <p className="mt-2 text-sm text-slate-500">
              支持按外部编码、门店、收件人、SKU 搜索，数据来自已配置的 MySQL/TiDB。
            </p>
          </div>
          <Tag color="success">数据库数据</Tag>
        </div>

        <Form
          layout="inline"
          className="mt-6"
          onFinish={(values: { keyword?: string; dateRange?: [Dayjs, Dayjs] }) => {
            setPage(1);
            setSubmittedKeyword(values.keyword?.trim() || "");
            setSubmittedDateFrom(values.dateRange?.[0] ? values.dateRange[0].format("YYYY-MM-DD") : "");
            setSubmittedDateTo(values.dateRange?.[1] ? values.dateRange[1].format("YYYY-MM-DD") : "");
          }}
        >
          <Form.Item name="keyword" className="min-w-[280px] flex-1">
            <Input
              allowClear
              placeholder="输入外部编码 / 门店 / 收件人 / SKU"
            />
          </Form.Item>
          <Form.Item name="dateRange">
            <DatePicker.RangePicker
              allowEmpty={[true, true]}
              presets={[
                { label: "今天", value: [dayjs(), dayjs()] },
                { label: "最近7天", value: [dayjs().subtract(6, "day"), dayjs()] },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                搜索
              </Button>
              <Button
                htmlType="button"
                onClick={() => {
                  setPage(1);
                  setSubmittedKeyword("");
                  setSubmittedDateFrom("");
                  setSubmittedDateTo("");
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {error ? (
          <Alert className="mt-4" type="error" message={error} showIcon />
        ) : null}
      </section>

      <section className="panel overflow-hidden rounded">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          pagination={false}
          scroll={{ x: 1120 }}
        />
      </section>

      <section className="panel flex items-center justify-between rounded px-5 py-4">
        <p className="text-sm text-slate-600">
          第 {page} / {pageCount} 页，共 {total} 条
        </p>
        <Pagination
          current={page}
          total={total}
          pageSize={pageSize}
          showSizeChanger={false}
          onChange={(nextPage) => setPage(nextPage)}
        />
      </section>
    </div>
  );
}
