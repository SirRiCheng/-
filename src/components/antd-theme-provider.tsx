"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#0fc6c2",
          borderRadius: 4,
          colorLink: "#075d5b",
          colorLinkHover: "#0ab4b0",
          fontFamily:
            "IBM Plex Sans, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif",
        },
        components: {
          Button: {
            borderRadius: 4,
            primaryShadow: "none",
          },
          Card: {
            borderRadiusLG: 4,
          },
          Table: {
            headerBg: "#f3f4f6",
            headerColor: "#111827",
            rowHoverBg: "rgba(15, 198, 194, 0.06)",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
