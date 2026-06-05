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
    <div className="app-shell min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-[rgba(238,250,251,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#075d5b,#0fc6c2)] text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white shadow-[0_18px_40px_-24px_rgba(15,198,194,0.9)]">
              AI
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
                Rule Engine Workspace
              </p>
              <p className="text-lg font-semibold tracking-tight text-slate-950">
                万能导入 V2
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-1.5 rounded-full border border-white/50 bg-white/60 p-1.5 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.25),inset_0_1px_0_rgba(255,255,255,0.88)] md:flex">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-[var(--app-deep)] hover:text-white"
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
