"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Database,
  FileSpreadsheet,
  Home,
  Rows3,
  Settings2,
} from "lucide-react";

const navItems = [
  { href: "/", label: "总览", icon: Home },
  { href: "/import", label: "导入工作台", icon: FileSpreadsheet },
  { href: "/rules", label: "规则管理", icon: Settings2 },
  { href: "/preview", label: "预览编辑", icon: Rows3 },
  { href: "/orders", label: "已导入运单", icon: Database },
] as const satisfies ReadonlyArray<{
  href: Route;
  label: string;
  icon: typeof Home;
}>;

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell min-h-screen">
      <header className="app-topbar sticky top-0 z-30">
        <div className="flex h-16 items-center justify-between gap-6 px-5">
          <div className="flex min-w-0 items-center gap-8">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <Image
                src="/zto-cold-chain.png"
                alt="中通冷链"
                width={190}
                height={40}
                className="h-10 w-[190px] object-contain"
              />
            </Link>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-base font-semibold text-white">万能导入 V2</p>
              <p className="truncate text-xs text-white/72">AI 解析规则导入工具</p>
            </div>
          </div>
        </div>
      </header>

      <div className="app-workspace flex min-h-[calc(100vh-4rem)]">
        <aside className="app-sidebar hidden w-[244px] shrink-0 flex-col lg:flex">
          <div className="flex h-12 items-center justify-between border-b border-white/8 px-5 text-sm font-medium text-white/84">
            <span>功能菜单</span>
            <ChevronDown className="h-4 w-4" />
          </div>
          <div className="px-3 py-4">
            <nav className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={[
                      "flex items-center gap-3 rounded px-3 py-3 text-sm font-medium transition",
                      active
                        ? "bg-[rgba(76,194,192,0.26)] text-white"
                        : "text-white/66 hover:bg-white/8 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="app-subbar hidden h-11 items-center border-b border-slate-200 bg-white px-5 text-sm text-slate-500 lg:flex">
            <span className="mr-3 text-xl leading-none text-slate-500">«</span>
            <span>万能导入 V2 / AI 解析规则导入工具</span>
          </div>
          <div className="app-content relative pb-12">{children}</div>
        </div>
      </div>
    </div>
  );
}
