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
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="panel rounded-[32px] p-6 lg:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Stage 01</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">上传与模板识别</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              当前已接通真实解析 API，上传成功后会把标准化结果写入本地会话，并跳转到预览编辑页继续处理。
            </p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            5 模板已验证
          </span>
        </div>

        <label className="group relative flex min-h-[23rem] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[28px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(249,244,235,0.86))] p-8 text-center transition hover:border-amber-400">
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.14),transparent_72%)] opacity-70" />
          <div className="relative">
            <span className="inline-flex rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              drag / drop
            </span>
            <span className="mt-5 block text-2xl font-semibold text-slate-900">拖拽或点击上传 Excel</span>
            <span className="mt-3 block max-w-md text-sm leading-7 text-slate-600">
            支持 `.xlsx` / `.xls`。已覆盖标准模板、电商模板、英文模板、分组模板、多 Sheet 模板。
            </span>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onFileChange}
          />
          <span className="relative mt-7 rounded-full bg-[linear-gradient(135deg,#111827,#1f2937)] px-6 py-3 text-sm font-medium text-white shadow-[0_18px_40px_-22px_rgba(17,24,39,0.88)] transition group-hover:-translate-y-0.5">
            {isLoading ? "解析中..." : "选择文件"}
          </span>
        </label>

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <section className="panel-strong rounded-[32px] p-6 text-slate-100 lg:p-7">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Stage 02</p>
        <h2 className="mt-3 text-2xl font-semibold">解析输出摘要</h2>
        {!result ? (
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>上传后会在这里显示：</p>
            <div className="grid gap-3">
              {["命中的表头映射", "模板签名与缺失字段", "解析行数与错误行数", "前 5 行标准化预览数据"].map((text, index) => (
                <div key={text} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                  <span className="mr-3 text-amber-300">0{index + 1}</span>
                  {text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4 text-sm">
            <div className="grid gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p>文件：{result.fileName}</p>
              <p>Sheet：{result.sheetName}</p>
              <p>模板签名：{result.template.signature || "无"}</p>
              <p>解析行数：{result.totals.parsedRows}</p>
              <p>错误行数：{result.totals.errorRows}</p>
              <p>映射字段数：{Object.keys(result.template.mapping).length}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 p-4">
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
