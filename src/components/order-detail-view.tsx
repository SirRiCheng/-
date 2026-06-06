"use client";

import Link from "next/link";
import { Button, Card, Descriptions, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ShipmentDetailResponse, ShipmentRecord } from "@/lib/types";

export function OrderDetailView({ detail }: { detail: ShipmentDetailResponse }) {
  const { importJob, order, skuRows } = detail;
  const totalQuantity = skuRows.reduce((total, row) => total + Number(row.quantity || 0), 0);
  const skuColumns: ColumnsType<ShipmentRecord> = [
    { title: "SKU编码", dataIndex: "skuCode", width: 160 },
    { title: "SKU名称", dataIndex: "skuName", ellipsis: true },
    { title: "规格", dataIndex: "spec", width: 180, render: (value: string | undefined) => value || "-" },
    { title: "数量", dataIndex: "quantity", width: 120 },
    { title: "备注", dataIndex: "remark", width: 180, render: (value: string | undefined) => value || "-" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-6 lg:px-8">
      <Card className="page-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">运单详情</p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950">
              {order.externalCode || `运单 #${order.id}`}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              共 {skuRows.length} 条 SKU，合计数量 {totalQuantity}
            </p>
          </div>
          <Link href="/orders">
            <Button>返回列表</Button>
          </Link>
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card title="收货信息" className="panel-list">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="收货门店">{order.storeName || "-"}</Descriptions.Item>
            <Descriptions.Item label="收件人">{order.receiverName || "-"}</Descriptions.Item>
            <Descriptions.Item label="收件电话">{order.receiverPhone || "-"}</Descriptions.Item>
            <Descriptions.Item label="收件地址">{order.receiverAddress || "-"}</Descriptions.Item>
            <Descriptions.Item label="外部编码">{order.externalCode || "-"}</Descriptions.Item>
            <Descriptions.Item label="备注">{order.remark || "-"}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="导入信息" className="panel-list">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="运单记录ID">{order.id}</Descriptions.Item>
            <Descriptions.Item label="导入任务ID">{order.importJobId || "-"}</Descriptions.Item>
            <Descriptions.Item label="导入文件">{importJob?.fileName || "-"}</Descriptions.Item>
            <Descriptions.Item label="任务状态">
              {importJob?.status ? <Tag color={importJob.status === "completed" ? "success" : "warning"}>{importJob.status}</Tag> : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="提交成功/失败">
              {importJob ? `${importJob.successRows} / ${importJob.failedRows}` : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{order.createdAt}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{order.updatedAt}</Descriptions.Item>
          </Descriptions>
        </Card>
      </section>

      <Card title="SKU 明细" className="panel-list">
        <Table
          rowKey="id"
          columns={skuColumns}
          dataSource={skuRows}
          pagination={false}
          scroll={{ x: 860 }}
        />
      </Card>

      <Card title="当前行原始字段" className="panel-list">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="SKU物品编码">{order.skuCode}</Descriptions.Item>
          <Descriptions.Item label="SKU物品名称">{order.skuName}</Descriptions.Item>
          <Descriptions.Item label="SKU发货数量">{order.quantity}</Descriptions.Item>
          <Descriptions.Item label="SKU规格型号">{order.spec || "-"}</Descriptions.Item>
        </Descriptions>
      </Card>
    </main>
  );
}
