"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { rebuildParsedPayload } from "@/lib/excel/standardize";
import { loadManualMapping, saveImportSession, saveManualMapping } from "@/lib/import-session";
import { shipmentFields, type FieldMapping, type ImportProgressState, type ParsedImportPayload, type TemplateMappingRecord } from "@/lib/types";

export function ImportWorkbench() {
  const router = useRouter();
  const [result, setResult] = useState<ParsedImportPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [manualMapping, setManualMapping] = useState<FieldMapping>({});
  const [progress, setProgress] = useState<ImportProgressState>({
    phase: "idle",
    percent: 0,
    message: "等待上传",
  });

  async function tryMatchSavedTemplate(payload: ParsedImportPayload) {
    try {
      const response = await fetch(
        `/api/template-mappings/match?templateSignature=${encodeURIComponent(payload.template.signature)}`,
        { cache: "no-store" },
      );

      if (response.ok) {
        const data = (await response.json()) as { matched?: boolean; record?: TemplateMappingRecord };
        if (data.matched && data.record?.mapping) {
          const nextTemplate = {
            ...payload.template,
            mapping: data.record.mapping,
            matchedBy: "saved-template" as const,
            missingFields: shipmentFields.filter(
              (field) => field !== "externalCode" && field !== "remark" && !data.record?.mapping[field],
            ),
          };
          return rebuildParsedPayload(payload, nextTemplate);
        }
      }
    } catch {
      const localRecord = loadManualMapping();
      if (localRecord?.templateSignature === payload.template.signature) {
        const nextTemplate = {
          ...payload.template,
          mapping: localRecord.mapping,
          matchedBy: "saved-template" as const,
          missingFields: shipmentFields.filter(
            (field) => field !== "externalCode" && field !== "remark" && !localRecord.mapping[field],
          ),
        };
        return rebuildParsedPayload(payload, nextTemplate);
      }
    }

    return payload;
  }

  async function persistManualMapping() {
    if (!result) return;

    const record: TemplateMappingRecord = {
      templateSignature: result.template.signature,
      templateName: result.fileName,
      headers: result.headers,
      mapping: manualMapping,
    };

    saveManualMapping(record);

    try {
      await fetch("/api/template-mappings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(record),
      });
    } catch {
      // Fall back to local storage only if remote persistence fails.
    }
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError("");
    setResult(null);
    setManualMapping({});
    setProgress({
      phase: "uploading",
      percent: 18,
      message: "上传文件中",
      current: 1,
      total: 4,
    });

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

      setProgress({
        phase: "mapping",
        percent: 62,
        message: "识别模板与校验数据中",
        current: 3,
        total: 4,
      });

      const payload = (await tryMatchSavedTemplate(data as ParsedImportPayload)) as ParsedImportPayload;
      setResult(payload);
      setManualMapping(payload.template.mapping);
      saveImportSession(payload);
      setProgress({
        phase: "ready",
        percent: 100,
        message: "导入数据已准备好",
        current: payload.totals.parsedRows,
        total: payload.totals.parsedRows,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "解析失败");
      setProgress({
        phase: "idle",
        percent: 0,
        message: "导入失败",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const missingRequiredFields = result?.template.missingFields || [];
  const canSaveManualMapping = result && Object.keys(manualMapping).length > 0;

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

        <div className="mt-4 rounded-[24px] border border-white/60 bg-white/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-slate-800">{progress.message}</p>
            <p className="text-xs text-slate-500">{progress.percent}%</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#d97706,#f59e0b)] transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {progress.current && progress.total ? (
            <p className="mt-2 text-xs text-slate-500">
              {progress.current} / {progress.total}
            </p>
          ) : null}
        </div>
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
              <p>解析分块：{result.performance.totalChunks} 块 / 每块 {result.performance.chunkSize} 行</p>
              <p>预览建议：每页 {result.performance.recommendedPageSize} 行</p>
              <p>映射来源：{result.template.matchedBy}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 p-4">
              <p className="mb-2 font-medium text-white">已识别字段</p>
              <pre className="overflow-x-auto text-xs leading-6 text-slate-300">
                {JSON.stringify(result.template.mapping, null, 2)}
              </pre>
            </div>
            {missingRequiredFields.length ? (
              <div className="rounded-[24px] border border-amber-300/25 bg-amber-400/10 p-4">
                <p className="mb-3 font-medium text-amber-100">手动映射缺失字段</p>
                <div className="grid gap-3">
                  {missingRequiredFields.map((field) => (
                    <label key={field} className="grid gap-2">
                      <span className="text-xs uppercase tracking-[0.18em] text-amber-100/80">{field}</span>
                      <select
                        value={manualMapping[field] || ""}
                        onChange={(event) =>
                          setManualMapping((current) => ({
                            ...current,
                            [field]: event.target.value || undefined,
                          }))
                        }
                        className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white outline-none"
                      >
                        <option value="">请选择 Excel 列</option>
                        {result.headers
                          .filter(Boolean)
                          .map((header) => (
                            <option key={header} value={header} className="text-slate-900">
                              {header}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!canSaveManualMapping}
                    onClick={async () => {
                      const nextTemplate = {
                        ...result.template,
                        mapping: manualMapping,
                        matchedBy: "manual" as const,
                        missingFields: shipmentFields.filter(
                          (field) =>
                            field !== "externalCode" && field !== "remark" && !manualMapping[field],
                        ),
                      };
                      const nextPayload = rebuildParsedPayload(result, nextTemplate);
                      setResult(nextPayload);
                      saveImportSession(nextPayload);
                      await persistManualMapping();
                    }}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    保存映射并应用
                  </button>
                </div>
              </div>
            ) : null}
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
