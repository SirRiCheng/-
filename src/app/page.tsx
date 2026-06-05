import Link from "next/link";
import type { Route } from "next";
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

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
      <section className="panel rounded p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">功能列表</h1>
            <p className="mt-2 text-sm text-slate-500">
              按导入流程进入对应功能，页面保持列表和按钮操作。
            </p>
          </div>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
          >
            开始导入
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="panel mt-5 overflow-hidden rounded">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100 text-left text-slate-900">
            <tr>
              <th className="px-5 py-4 font-semibold">编号</th>
              <th className="px-5 py-4 font-semibold">功能名称</th>
              <th className="px-5 py-4 font-semibold">说明</th>
              <th className="px-5 py-4 font-semibold">状态</th>
              <th className="px-5 py-4 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {modules.map(({ code, name, description, status, href, icon: Icon }) => (
              <tr key={code}>
                <td className="px-5 py-4 text-slate-600">{code}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <Icon className="h-4 w-4 text-[var(--app-accent)]" />
                    {name}
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-600">{description}</td>
                <td className="px-5 py-4 text-slate-600">{status}</td>
                <td className="px-5 py-4">
                  <Link href={href} className="font-medium text-blue-600 hover:text-blue-700">
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
