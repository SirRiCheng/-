"use client";

import Link from "next/link";
import type { Route } from "next";
import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowRight, Database, FileSpreadsheet, Rows3, Settings2 } from "lucide-react";

const modules = [
  {
    code: "01",
    name: "导入工作台",
    description: "上传 Excel / Word / PDF，选择解析规则并生成预览数据。",
    status: "可用",
    href: "/import",
    icon: FileSpreadsheet,
  },
  {
    code: "02",
    name: "规则管理",
    description: "新建、编辑、复制、删除解析规则，供导入时手动选择。",
    status: "可用",
    href: "/rules",
    icon: Settings2,
  },
  {
    code: "03",
    name: "预览编辑",
    description: "查看解析结果，修正错误行，导出或批量提交下单。",
    status: "可用",
    href: "/preview",
    icon: Rows3,
  },
  {
    code: "04",
    name: "已导入运单",
    description: "查询已提交的运单记录，支持按编码、门店、收件人和 SKU 搜索。",
    status: "可用",
    href: "/orders",
    icon: Database,
  },
] satisfies Array<{
  code: string;
  name: string;
  description: string;
  status: string;
  href: Route;
  icon: typeof FileSpreadsheet;
}>;

type ModuleItem = (typeof modules)[number];

const columns: ColumnsType<ModuleItem> = [
  {
    title: "编号",
    dataIndex: "code",
    width: 100,
  },
  {
    title: "功能名称",
    dataIndex: "name",
    width: 180,
    render: (_, item) => {
      const Icon = item.icon;
      return (
        <div className="flex items-center gap-2 font-medium text-slate-950">
          <Icon className="h-4 w-4 text-[var(--app-accent)]" />
          {item.name}
        </div>
      );
    },
  },
  {
    title: "说明",
    dataIndex: "description",
  },
  {
    title: "状态",
    dataIndex: "status",
    width: 110,
    render: (status: string) => <Tag color="success">{status}</Tag>,
  },
  {
    title: "操作",
    key: "action",
    width: 100,
    render: (_, item) => (
      <Link href={item.href} className="app-link">
        查看
      </Link>
    ),
  },
];

export default function Home() {
  return (
    <main className="w-full px-5 py-5 lg:px-6">
      <section className="page-hero rounded p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">功能列表</h1>
            <p className="mt-2 text-sm text-slate-500">
              按导入流程进入对应功能，页面保持列表和按钮操作。
            </p>
          </div>
          <Link href="/import">
            <Button type="primary" icon={<ArrowRight className="h-4 w-4" />}>
              开始导入
            </Button>
          </Link>
        </div>
      </section>

      <section className="panel panel-list mt-5 overflow-hidden rounded">
        <Table rowKey="code" columns={columns} dataSource={modules} pagination={false} scroll={{ x: 760 }} />
      </section>
    </main>
  );
}
