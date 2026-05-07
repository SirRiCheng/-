import type { Metadata } from "next";
import "./globals.css";
import { AppFrame } from "@/components/app-frame";

export const metadata: Metadata = {
  title: "Universal Excel Importer",
  description: "多模板 Excel 自动导入下单系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--app-bg)] text-slate-950 antialiased">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
