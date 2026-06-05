import Link from "next/link";
import type { Route } from "next";
import { Database, FileSpreadsheet, Rows3, Settings2, Warehouse } from "lucide-react";

const navItems = [
  { href: "/", label: "总览", icon: Warehouse },
  { href: "/import", label: "导入工作台", icon: FileSpreadsheet },
  { href: "/rules", label: "规则管理", icon: Settings2 },
  { href: "/preview", label: "预览编辑", icon: Rows3 },
  { href: "/orders", label: "已导入运单", icon: Database },
] as const satisfies ReadonlyArray<{
  href: Route;
  label: string;
  icon: typeof Warehouse;
}>;

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-[var(--app-accent)] text-[0.7rem] font-semibold text-white">
              AI
            </div>
            <div>
              <p className="text-base font-semibold text-slate-950">
                万能导入 V2
              </p>
              <p className="text-xs text-slate-500">AI 解析规则导入工具</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="relative pb-12">{children}</div>
    </div>
  );
}
