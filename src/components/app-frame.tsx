"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
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
        <div className="flex min-h-16 flex-col gap-3 px-5 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
          <div className="flex min-w-0 shrink-0 items-center gap-8">
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
          <nav className="top-menu -mx-1 flex min-w-0 gap-1 overflow-x-auto pb-1 lg:mx-0 lg:justify-end lg:pb-0">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded px-3 text-sm font-medium transition",
                    active
                      ? "bg-white text-[var(--app-deep)] shadow-sm"
                      : "text-white/78 hover:bg-white/12 hover:text-white",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="app-workspace min-h-[calc(100vh-4rem)] min-w-0 max-w-full">
        <div className="app-content relative min-w-0 max-w-full overflow-x-hidden pb-12">{children}</div>
      </div>
    </div>
  );
}
