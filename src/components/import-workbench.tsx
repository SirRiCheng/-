"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveImportSession } from "@/lib/import-session";
import type { ParsedImportPayload } from "@/lib/types";

export function ImportWorkbench() {
  const router = useRouter();
  const [result, setResult] = useState<ParsedImportPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/parse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "解析失败");
      }

      const payload = data as ParsedImportPayload;
      setResult(payload);
      saveImportSession(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "解析失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-float">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">上传与模板识别</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              当前已接通真实解析 API，上传成功后会把标准化结果写入本地会话，并跳转到预览编辑页继续处理。
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            5 模板已验证
          </span>
        </div>

        <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-amber-400 hover:bg-amber-50/50">
          <span className="text-lg font-semibold text-slate-900">拖拽或点击上传 Excel</span>
          <span className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
            支持 `.xlsx` / `.xls`。已覆盖标准模板、电商模板、英文模板、分组模板、多 Sheet 模板。
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onFileChange}
          />
          <span className="mt-6 rounded-full bg-slate-950 px-5 py-2 text-sm font-medium text-white">
            {isLoading ? "解析中..." : "选择文件"}
          </span>
        </label>

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-float">
        <h2 className="text-xl font-semibold">解析输出摘要</h2>
        {!result ? (
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>上传后会在这里显示：</p>
            <ul className="space-y-2">
              <li>1. 命中的表头映射</li>
              <li>2. 模板签名与缺失字段</li>
              <li>3. 解析行数与错误行数</li>
              <li>4. 前 5 行标准化预览数据</li>
            </ul>
          </div>
        ) : (
          <div className="mt-6 space-y-4 text-sm">
            <div className="grid gap-3 rounded-3xl bg-white/5 p-4">
              <p>文件：{result.fileName}</p>
              <p>Sheet：{result.sheetName}</p>
              <p>模板签名：{result.template.signature || "无"}</p>
              <p>解析行数：{result.totals.parsedRows}</p>
              <p>错误行数：{result.totals.errorRows}</p>
              <p>映射字段数：{Object.keys(result.template.mapping).length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 p-4">
              <p className="mb-2 font-medium text-white">已识别字段</p>
              <pre className="overflow-x-auto text-xs leading-6 text-slate-300">
                {JSON.stringify(result.template.mapping, null, 2)}
              </pre>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/preview")}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100"
              >
                进入预览编辑
              </button>
              <Link
                href="/preview"
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/5"
              >
                打开预览页
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
