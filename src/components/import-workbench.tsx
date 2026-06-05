"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rebuildParsedPayload } from "@/lib/excel/standardize";
import { sanitizeRuleRecords } from "@/lib/import-session";
import {
  shipmentFields,
  type FieldMapping,
  type ImportProgressState,
  type ParsedImportPayload,
  type ParseRule,
  type TemplateMappingRecord,
} from "@/lib/types";

const fieldLabels: Record<(typeof shipmentFields)[number], string> = {
  externalCode: "外部编码",
  storeName: "收货门店",
  receiverName: "收件人姓名",
  receiverPhone: "收件人电话",
  receiverAddress: "收件人地址",
  skuCode: "SKU物品编码",
  skuName: "SKU物品名称",
  quantity: "SKU发货数量",
  spec: "SKU规格型号",
  remark: "备注",
};

function getMissingRequiredFields(mapping: FieldMapping) {
  const hasStoreGroup = Boolean(mapping.storeName);
  const hasReceiverGroup = Boolean(mapping.receiverName && mapping.receiverPhone && mapping.receiverAddress);

  return shipmentFields.filter((field) => {
    if (field === "externalCode" || field === "remark" || field === "spec") return false;
    if (field === "storeName") return !hasStoreGroup && !hasReceiverGroup;
    if (field === "receiverName" || field === "receiverPhone" || field === "receiverAddress") {
      return !hasStoreGroup && !mapping[field];
    }
    return !mapping[field];
  });
}

export function ImportWorkbench() {
  const router = useRouter();
  const [result, setResult] = useState<ParsedImportPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [manualMapping, setManualMapping] = useState<FieldMapping>({});
  const [generatedBy, setGeneratedBy] = useState("");
  const [ruleRecords, setRuleRecords] = useState<TemplateMappingRecord[]>([]);
  const [selectedRuleSignature, setSelectedRuleSignature] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [progress, setProgress] = useState<ImportProgressState>({
    phase: "idle",
    percent: 0,
    message: "等待上传",
  });

  useEffect(() => {
    let active = true;

    async function fetchRuleRecords() {
      try {
        const response = await fetch("/api/template-mappings", { cache: "no-store" });
        const data = (await response.json()) as { items?: TemplateMappingRecord[]; error?: string };
        if (!response.ok) {
          throw new Error(data.error || "数据库规则库加载失败");
        }

        if (!active) return;

        setRuleRecords(sanitizeRuleRecords(data.items || []));
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "数据库规则库加载失败");
        }
      }
    }

    void fetchRuleRecords();

    return () => {
      active = false;
    };
  }, []);

  async function persistManualMapping(payload = result, mapping = manualMapping) {
    if (!payload) return;

    const record: TemplateMappingRecord = {
      templateSignature: payload.template.signature,
      templateName: payload.fileName,
      headers: payload.headers,
      mapping,
      rule: payload.template.rule
        ? {
            ...payload.template.rule,
            fieldMapping: mapping,
          }
        : undefined,
    };

    const response = await fetch("/api/template-mappings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record),
    });
    const data = (await response.json()) as { saved?: boolean; error?: string; reason?: string };

    if (!response.ok) {
      throw new Error(data.error || "保存规则失败，请检查数据库配置。");
    }

    await fetchRuleRecordsFromDatabase();
  }

  async function fetchRuleRecordsFromDatabase() {
    const response = await fetch("/api/template-mappings", { cache: "no-store" });
    const data = (await response.json()) as { items?: TemplateMappingRecord[]; error?: string };
    if (!response.ok) {
      throw new Error(data.error || "数据库规则库加载失败");
    }
    setRuleRecords(sanitizeRuleRecords(data.items || []));
  }

  async function saveImportPayload(payload: ParsedImportPayload) {
    const response = await fetch("/api/import-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { id?: number; error?: string };

    if (!response.ok || !data.id) {
      throw new Error(data.error || "解析结果保存入库失败");
    }

    setSessionId(data.id);
    return data.id;
  }

  async function updateImportPayload(payload: ParsedImportPayload) {
    if (!sessionId) {
      return saveImportPayload(payload);
    }

    const response = await fetch("/api/import-sessions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: sessionId, payload }),
    });
    const data = (await response.json()) as { saved?: boolean; error?: string };

    if (!response.ok) {
      throw new Error(data.error || "解析结果更新入库失败");
    }

    return sessionId;
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError("");
    setResult(null);
    setManualMapping({});
    setGeneratedBy("");
    setSessionId(null);
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
        message: "AI 正在生成推荐解析规则",
        current: 3,
        total: 4,
      });

      let payload = data as ParsedImportPayload;
      const selectedRule = ruleRecords.find((record) => record.templateSignature === selectedRuleSignature);

      if (selectedRule?.mapping) {
        payload = rebuildParsedPayload(payload, {
          ...payload.template,
          mapping: selectedRule.mapping,
          rule: selectedRule.rule,
          matchedBy: "manual",
          confidence: selectedRule.rule?.confidence || payload.template.confidence,
          missingFields: getMissingRequiredFields(selectedRule.mapping),
        });
        setGeneratedBy("selected-rule");
      }

      const ruleResponse = selectedRule
        ? null
        : await fetch("/api/rules/ai-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: payload.fileName,
          headers: payload.headers,
          mapping: payload.template.mapping,
          sampleRows: payload.sourceRows.slice(0, 5),
        }),
      });
      if (ruleResponse?.ok) {
        const ruleData = (await ruleResponse.json()) as { rule?: ParseRule; generatedBy?: string };
        if (ruleData.rule) {
          payload = {
            ...payload,
            template: {
              ...payload.template,
              rule: ruleData.rule,
              mapping: ruleData.rule.fieldMapping,
              matchedBy: "ai-generated",
              confidence: Math.max(payload.template.confidence, ruleData.rule.confidence),
              missingFields: getMissingRequiredFields(ruleData.rule.fieldMapping),
            },
          };
          payload = rebuildParsedPayload(payload, payload.template);
          setGeneratedBy(ruleData.generatedBy || "");
        }
      }
      setResult(payload);
      setManualMapping(payload.template.mapping);
      const savedSessionId = await saveImportPayload(payload);
      setProgress({
        phase: "ready",
        percent: 100,
        message: `推荐规则已生成，解析结果已入库 #${savedSessionId}`,
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
    <div className="grid gap-5">
      <section className="panel rounded p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">上传与模板识别</h2>
            <p className="mt-2 text-sm text-slate-500">
              上传前手动选择已有规则；未选择时由 AI 生成推荐规则，用户确认保存后才作为规则复用。
            </p>
          </div>
          <span className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            9 类结构规则化
          </span>
        </div>

        <label className="group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-[var(--app-accent)]">
          <div className="relative">
            <span className="block text-base font-semibold text-slate-900">拖拽或点击上传文件</span>
            <span className="mt-2 block max-w-md text-sm leading-6 text-slate-500">
              支持 `.xlsx` / `.xls` / `.docx` / `.pdf` / `.txt`。Excel 走表格解析，其他文件调用大模型抽取结构化下单数据。
            </span>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,.doc,.docx,.pdf,.txt"
            className="hidden"
            onChange={onFileChange}
          />
          <span className="relative mt-5 rounded bg-[var(--app-accent)] px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-500">
            {isLoading ? "解析中..." : "选择文件"}
          </span>
        </label>

        <div className="mt-4 rounded border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[260px] flex-1">
              <span className="text-sm font-medium text-slate-700">手动选择规则</span>
              <select
                value={selectedRuleSignature}
                onChange={(event) => setSelectedRuleSignature(event.target.value)}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[var(--app-accent)]"
              >
                <option value="">不选择已有规则，上传后新建 AI 推荐规则</option>
                {ruleRecords.map((record) => (
                  <option key={record.templateSignature} value={record.templateSignature}>
                    {record.templateName || record.rule?.name || record.templateSignature}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href="/rules"
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              管理规则
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 rounded border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-slate-800">{progress.message}</p>
            <p className="text-xs text-slate-500">{progress.percent}%</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-slate-200">
            <div
              className="h-full rounded bg-[var(--app-accent)] transition-all duration-500"
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

      <section className="panel rounded p-5">
        <h2 className="text-base font-semibold text-slate-950">规则与解析摘要</h2>
        {!result ? (
          <div className="mt-4 text-sm text-slate-600">
            <p>上传后会在这里显示：</p>
            <div className="mt-3 grid divide-y divide-slate-100 rounded border border-slate-200">
              {["AI 推荐解析规则", "字段映射与推测项", "试解析结果和错误行", "确认后保存规则"].map((text, index) => (
                <div key={text} className="px-4 py-3">
                  <span className="mr-3 text-slate-400">0{index + 1}</span>
                  {text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <div className="overflow-hidden rounded border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <tbody className="divide-y divide-slate-100">
                  {[
                    ["文件", result.fileName],
                    ["Sheet", result.sheetName],
                    ["模板签名", result.template.signature || "无"],
                    ["解析行数", String(result.totals.parsedRows)],
                    ["错误行数", String(result.totals.errorRows)],
                    ["映射字段数", String(Object.keys(result.template.mapping).length)],
                    ["解析分块", `${result.performance.totalChunks} 块 / 每块 ${result.performance.chunkSize} 行`],
                    ["预览建议", `每页 ${result.performance.recommendedPageSize} 行`],
                    ["映射来源", result.template.matchedBy],
                    ...(generatedBy ? [["规则生成", generatedBy]] : []),
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td className="w-36 bg-slate-50 px-4 py-3 font-medium text-slate-700">{label}</td>
                      <td className="px-4 py-3 text-slate-600">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.template.rule ? (
              <div className="rounded border border-slate-200 bg-white p-4">
                <p className="font-medium text-slate-950">{result.template.rule.name}</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">{result.template.rule.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.template.rule.operations.map((operation) => (
                    <span key={operation} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      {operation}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-2">
                  {result.template.rule.assumptions.map((assumption) => (
                    <p key={assumption} className="text-xs leading-5 text-slate-500">
                      {assumption}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded border border-slate-200 p-4">
              <p className="mb-2 font-medium text-slate-950">已识别字段</p>
              <pre className="overflow-x-auto text-xs leading-6 text-slate-600">
                {JSON.stringify(result.template.mapping, null, 2)}
              </pre>
            </div>
            {missingRequiredFields.length ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-4">
                <p className="mb-3 font-medium text-amber-800">手动映射缺失字段</p>
                <div className="grid gap-3">
                  {missingRequiredFields.map((field) => (
                    <label key={field} className="grid gap-2">
                      <span className="text-xs text-amber-800">{fieldLabels[field]}</span>
                      <select
                        value={manualMapping[field] || ""}
                        onChange={(event) =>
                          setManualMapping((current) => ({
                            ...current,
                            [field]: event.target.value || undefined,
                          }))
                        }
                        className="rounded border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                      >
                        <option value="">请选择 Excel 列</option>
                        {result.headers
                          .filter(Boolean)
                          .map((header) => (
                            <option key={header} value={header}>
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
                      try {
                        const nextTemplate = {
                          ...result.template,
                          mapping: manualMapping,
                          rule: result.template.rule
                            ? {
                                ...result.template.rule,
                                fieldMapping: manualMapping,
                              }
                            : undefined,
                          matchedBy: "manual" as const,
                          missingFields: getMissingRequiredFields(manualMapping),
                        };
                        const nextPayload = rebuildParsedPayload(result, nextTemplate);
                        await persistManualMapping(nextPayload, manualMapping);
                        await updateImportPayload(nextPayload);
                        setResult(nextPayload);
                        setError("");
                      } catch (requestError) {
                        setError(requestError instanceof Error ? requestError.message : "保存规则失败，请检查数据库配置。");
                      }
                    }}
                    className="rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    保存映射并应用
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!result.template.rule}
                onClick={async () => {
                  try {
                    await persistManualMapping(result, manualMapping);
                    setSelectedRuleSignature(result.template.signature);
                    setError("");
                    setProgress({
                      phase: "ready",
                      percent: 100,
                      message: "解析规则已保存到数据库，可在下次导入时复用",
                      current: result.totals.parsedRows,
                      total: result.totals.parsedRows,
                    });
                  } catch (requestError) {
                    setError(requestError instanceof Error ? requestError.message : "保存规则失败，请检查数据库配置。");
                  }
                }}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                确认并保存规则
              </button>
              <button
                type="button"
                onClick={() => router.push(sessionId ? `/preview?sessionId=${sessionId}` : "/preview")}
                className="rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
              >
                进入预览编辑
              </button>
              <Link
                href={sessionId ? `/preview?sessionId=${sessionId}` : "/preview"}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
