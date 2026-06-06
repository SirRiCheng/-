import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";
import { AppFrame } from "@/components/app-frame";
import { AntdThemeProvider } from "@/components/antd-theme-provider";

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
      <body className="min-h-screen text-slate-950 antialiased">
        <AntdRegistry>
          <AntdThemeProvider>
            <AppFrame>{children}</AppFrame>
          </AntdThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
