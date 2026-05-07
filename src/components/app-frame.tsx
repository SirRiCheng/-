import Link from "next/link";
import type { Route } from "next";
import { Database, FileSpreadsheet, Rows3, Warehouse } from "lucide-react";

const navItems = [
  { href: "/", label: "总览", icon: Warehouse },
  { href: "/import", label: "导入工作台", icon: FileSpreadsheet },
  { href: "/preview", label: "预览编辑", icon: Rows3 },
  { href: "/orders", label: "已导入运单", icon: Database },
] as const satisfies ReadonlyArray<{
  href: Route;
  label: string;
  icon: typeof Warehouse;
}>;

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[rgba(247,243,234,0.88)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
              Operations Workspace
            </p>
            <p className="text-lg font-semibold tracking-tight text-slate-950">
              万能导入下单系统
            </p>
          </div>
          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
