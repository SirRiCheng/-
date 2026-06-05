"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, FileSpreadsheet, Plus, Save, Trash2 } from "lucide-react";
import { rebuildParsedPayload } from "@/lib/excel/standardize";
import { sanitizeRuleRecords } from "@/lib/import-session";
import { shipmentFields, type FieldMapping, type ParsedImportPayload, type ParseRule, type TemplateMappingRecord } from "@/lib/types";

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

const operationOptions: ParseRule["operations"] = [
  "skip_headers",
  "tail_info_extract",
  "cross_row_group",
  "matrix_transpose",
  "multi_sheet_merge",
  "card_split",
  "plain_text_extract",
  "compound_cell_split",
  "pdf_order_split",
];

function createEmptyRuleRecord(): TemplateMappingRecord {
  const now = new Date().toISOString();
  const signature = `manual-rule-${Date.now()}`;
  return {
    id: Date.now(),
    templateSignature: signature,
    templateName: "新建解析规则",
    headers: [],
    mapping: {},
    rule: {
      id: signature,
      name: "新建解析规则",
      description: "手动配置字段映射和结构操作，保存后可在导入工作台选择使用。",
      fileTypes: ["excel"],
      fieldMapping: {},
      operations: ["skip_headers"],
      groupBy: "externalCode",
      confidence: 80,
      assumptions: ["手动创建规则，请上传样例文件试解析后确认。"],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function getRuleMissingFields(mapping: FieldMapping) {
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

function getRuleWarnings(record: TemplateMappingRecord) {
  const warnings: string[] = [];
  const missingFields = getRuleMissingFields(record.mapping);
  const legacyTerms = ["重量", "件数", "温层"];
  const mappingText = [
    ...Object.keys(record.mapping || {}),
    ...Object.values(record.mapping || {}),
    ...(record.headers || []),
  ].join(" ");

  if (missingFields.length) {
    warnings.push(`V2 必填字段未完整映射：${missingFields.map((field) => fieldLabels[field]).join("、")}。`);
  }

  if (legacyTerms.some((term) => mappingText.includes(term))) {
    warnings.push("检测到重量、件数或温层等旧版字段，请改为 SKU 编码、SKU 名称、SKU 数量等 V2 字段。");
  }

  if (!record.rule?.operations.length) {
    warnings.push("至少选择一种结构操作，用于覆盖表尾信息、跨行聚合、矩阵转置等考试样例结构。");
  }

  return warnings;
}

export function RulesManager() {
  const [records, setRecords] = useState<TemplateMappingRecord[]>([]);
  const [selectedSignature, setSelectedSignature] = useState("");
  const [editingSignature, setEditingSignature] = useState("");
  const [checkedSignatures, setCheckedSignatures] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedImportPayload | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const selectedRecord = records.find((record) => record.templateSignature === selectedSignature) || records[0];
  const canEditSelected = Boolean(selectedRecord && editingSignature === selectedRecord.templateSignature);
  const ruleWarnings = selectedRecord ? getRuleWarnings(selectedRecord) : [];

  useEffect(() => {
    let active = true;

    async function fetchRecords() {
      try {
        const response = await fetch("/api/template-mappings", { cache: "no-store" });
        const data = (await response.json()) as { items?: TemplateMappingRecord[]; error?: string };
        if (!response.ok) {
          throw new Error(data.error || "规则库加载失败");
        }
        if (!active || !data.items) return;

        const nextRecords = sanitizeRuleRecords(data.items);
        setRecords(nextRecords);
        setSelectedSignature(nextRecords[0]?.templateSignature || "");
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "规则库加载失败，请检查数据库配置");
        }
      }
    }

    void fetchRecords();

    return () => {
      active = false;
    };
  }, []);

  function persist(nextRecords: TemplateMappingRecord[]) {
    const sanitizedRecords = sanitizeRuleRecords(nextRecords);
    setRecords(sanitizedRecords);
    setCheckedSignatures((current) =>
      current.filter((signature) => sanitizedRecords.some((record) => record.templateSignature === signature)),
    );
  }

  function updateSelected(patch: Partial<TemplateMappingRecord>) {
    if (!selectedRecord) return;

    const updated: TemplateMappingRecord = {
      ...selectedRecord,
      ...patch,
      mapping: patch.mapping || selectedRecord.mapping,
      rule: {
        ...(selectedRecord.rule || createEmptyRuleRecord().rule!),
        ...(patch.rule || {}),
      },
      updatedAt: new Date().toISOString(),
    };
    persist(records.map((record) => (record.templateSignature === selectedRecord.templateSignature ? updated : record)));
  }

  function updateMapping(field: keyof FieldMapping, value: string) {
    const mapping = {
      ...(selectedRecord?.mapping || {}),
      [field]: value || undefined,
    };
    updateSelected({
      mapping,
      rule: selectedRecord?.rule
        ? {
            ...selectedRecord.rule,
            fieldMapping: mapping,
          }
        : undefined,
    });
  }

  function selectRecord(templateSignature: string) {
    setSelectedSignature(templateSignature);
    setEditingSignature("");
    setPreview(null);
    setPreviewError("");
  }

  function editRecord(templateSignature: string) {
    setSelectedSignature(templateSignature);
    setEditingSignature(templateSignature);
    setPreview(null);
    setPreviewError("");
  }

  async function saveRecord(record: TemplateMappingRecord) {
    setMessage("");
    setError("");
    const now = new Date().toISOString();
    const savedRecord: TemplateMappingRecord = {
      ...record,
      id: record.id || Date.now(),
      createdAt: record.createdAt || now,
      updatedAt: now,
      rule: record.rule
        ? {
            ...record.rule,
            fieldMapping: record.mapping,
          }
        : undefined,
    };

    try {
      const response = await fetch("/api/template-mappings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(savedRecord),
      });
      const data = (await response.json()) as { saved?: boolean; error?: string; reason?: string };
      if (!response.ok) {
        throw new Error(data.error || "保存规则失败");
      }
      persist(
        records.some((item) => item.templateSignature === savedRecord.templateSignature)
          ? records.map((item) => (item.templateSignature === savedRecord.templateSignature ? savedRecord : item))
          : [savedRecord, ...records],
      );
      setSelectedSignature(savedRecord.templateSignature);
      setMessage("规则已保存到数据库规则库");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存规则失败，请检查数据库配置");
    }
  }

  async function previewSelectedRule() {
    if (!selectedRecord || !previewFile) {
      setPreviewError("请先选择规则和样例文件。");
      return;
    }

    setPreview(null);
    setPreviewError("");
    setIsPreviewing(true);

    try {
      const formData = new FormData();
      formData.append("file", previewFile);

      const response = await fetch("/api/import/parse", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "试解析失败");
      }

      const payload = data as ParsedImportPayload;
      const nextTemplate = {
        ...payload.template,
        mapping: selectedRecord.mapping,
        rule: selectedRecord.rule
          ? {
              ...selectedRecord.rule,
              fieldMapping: selectedRecord.mapping,
            }
          : selectedRecord.rule,
        matchedBy: "manual" as const,
        confidence: selectedRecord.rule?.confidence || payload.template.confidence,
        missingFields: getRuleMissingFields(selectedRecord.mapping),
      };

      setPreview(rebuildParsedPayload(payload, nextTemplate));
      setMessage("试解析完成，请检查预览行和错误提示后再保存规则。");
    } catch (requestError) {
      setPreviewError(requestError instanceof Error ? requestError.message : "试解析失败");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function removeRecord(record: TemplateMappingRecord) {
    await removeRecords([record.templateSignature]);
  }

  async function removeRecords(templateSignatures: string[]) {
    setMessage("");
    setError("");
    const nextTemplateSignatures = Array.from(new Set(templateSignatures.map((signature) => signature.trim()).filter(Boolean)));
    if (!nextTemplateSignatures.length) return;

    try {
      const response = await fetch("/api/template-mappings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ templateSignatures: nextTemplateSignatures }),
      });
      const data = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "删除规则失败");
      }
      const deleteSet = new Set(nextTemplateSignatures);
      const nextRecords = records.filter((item) => !deleteSet.has(item.templateSignature));
      persist(nextRecords);
      setSelectedSignature((current) => (current && !deleteSet.has(current) ? current : nextRecords[0]?.templateSignature || ""));
      setEditingSignature((current) => (current && !deleteSet.has(current) ? current : ""));
      setPreview(null);
      setPreviewError("");
      setMessage(nextTemplateSignatures.length > 1 ? `已删除 ${nextTemplateSignatures.length} 条规则` : "规则已删除");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除规则失败，请检查数据库配置");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="panel rounded p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">解析规则库</h2>
            <p className="mt-2 text-sm text-slate-500">选择一条规则后在右侧编辑。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!checkedSignatures.length}
              onClick={() => void removeRecords(checkedSignatures)}
              className="inline-flex items-center gap-2 rounded border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              批量删除
            </button>
            <button
              type="button"
              onClick={() => {
                const record = createEmptyRuleRecord();
                const nextRecords = sanitizeRuleRecords([record, ...records]);
                persist(nextRecords);
                setSelectedSignature(record.templateSignature);
                setEditingSignature(record.templateSignature);
                setPreview(null);
                setPreviewError("");
                setMessage("新规则已创建，配置字段后可上传样例文件试解析。");
                setError("");
              }}
              className="inline-flex items-center gap-2 rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
            >
              <Plus className="h-4 w-4" />
              新建规则
            </button>
          </div>
        </div>

        {message ? (
          <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 overflow-hidden rounded border border-slate-200">
          {records.length ? (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-slate-900">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={records.length > 0 && checkedSignatures.length === records.length}
                      onChange={(event) =>
                        setCheckedSignatures(event.target.checked ? records.map((record) => record.templateSignature) : [])
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[var(--app-accent)]"
                      aria-label="选择全部规则"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">规则名称</th>
                  <th className="px-4 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map((record) => (
                  <tr
                    key={record.templateSignature}
                    onClick={() => selectRecord(record.templateSignature)}
                    aria-selected={selectedRecord?.templateSignature === record.templateSignature}
                    className={`cursor-pointer transition ${
                      selectedRecord?.templateSignature === record.templateSignature
                        ? "border-l-4 border-[var(--app-accent)] bg-cyan-50"
                        : "border-l-4 border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checkedSignatures.includes(record.templateSignature)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setCheckedSignatures((current) =>
                            event.target.checked
                              ? [...current, record.templateSignature]
                              : current.filter((signature) => signature !== record.templateSignature),
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-[var(--app-accent)]"
                        aria-label={`选择规则 ${record.templateName || record.templateSignature}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{record.templateName || record.rule?.name || "未命名规则"}</p>
                      <p className="mt-1 max-w-[18rem] truncate text-xs text-slate-500">{record.templateSignature}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          editRecord(record.templateSignature);
                        }}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-sm text-slate-500">
              暂无规则。可以新建规则，或在导入页由 AI 生成规则后保存。
            </div>
          )}
        </div>
      </section>

      <section className="panel rounded p-5">
        {selectedRecord ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">规则编辑</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cloned: TemplateMappingRecord = {
                      ...selectedRecord,
                      id: Date.now(),
                      templateSignature: `${selectedRecord.templateSignature}-copy-${Date.now()}`,
                      templateName: `${selectedRecord.templateName || "规则"} 副本`,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    persist([cloned, ...records]);
                    setSelectedSignature(cloned.templateSignature);
                    setEditingSignature(cloned.templateSignature);
                  }}
                  className="inline-flex items-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => void removeRecord(selectedRecord)}
                  className="inline-flex items-center gap-2 rounded border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              </div>
            </div>

            <div
              className={`rounded border px-4 py-3 text-sm ${
                ruleWarnings.length
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <div>
                  <p className="font-medium">{ruleWarnings.length ? "规则需要补充" : "规则字段已满足 V2 要求"}</p>
                  {ruleWarnings.length ? (
                    <ul className="mt-2 grid gap-1">
                      {ruleWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1">已覆盖 SKU 编码、SKU 名称、数量，以及门店或完整收件人信息。</p>
                  )}
                </div>
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">规则名称</span>
              <input
                value={selectedRecord.templateName || ""}
                readOnly={!canEditSelected}
                onChange={(event) =>
                  updateSelected({
                    templateName: event.target.value,
                    rule: selectedRecord.rule ? { ...selectedRecord.rule, name: event.target.value } : undefined,
                  })
                }
                className={`rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)] ${
                  canEditSelected ? "bg-white" : "bg-slate-50 text-slate-500"
                }`}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">说明</span>
              <textarea
                value={selectedRecord.rule?.description || ""}
                readOnly={!canEditSelected}
                onChange={(event) =>
                  updateSelected({
                    rule: selectedRecord.rule ? { ...selectedRecord.rule, description: event.target.value } : undefined,
                  })
                }
                className={`min-h-24 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)] ${
                  canEditSelected ? "bg-white" : "bg-slate-50 text-slate-500"
                }`}
              />
            </label>

            <div>
              <p className="text-sm font-medium text-slate-700">结构操作</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {operationOptions.map((operation) => {
                  const checked = selectedRecord.rule?.operations.includes(operation);
                  return (
                    <button
                      key={operation}
                      type="button"
                      disabled={!canEditSelected}
                      onClick={() => {
                        const current = selectedRecord.rule?.operations || [];
                        updateSelected({
                          rule: selectedRecord.rule
                            ? {
                                ...selectedRecord.rule,
                                operations: checked
                                  ? current.filter((item) => item !== operation)
                                  : [...current, operation],
                              }
                            : undefined,
                        });
                      }}
                      className={`rounded border px-3 py-1.5 text-xs ${
                        checked ? "border-cyan-300 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-500"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {operation}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">字段映射</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {shipmentFields.map((field) => (
                  <label key={field} className="grid gap-1">
                    <span className="text-xs text-slate-500">{fieldLabels[field]}</span>
                    <input
                      value={selectedRecord.mapping[field] || ""}
                      readOnly={!canEditSelected}
                      onChange={(event) => updateMapping(field, event.target.value)}
                      placeholder="源文件列名 / 文本键名"
                      className={`rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)] ${
                        canEditSelected ? "bg-white" : "bg-slate-50 text-slate-500"
                      }`}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">试解析预览</p>
                  <p className="mt-1 text-xs text-slate-500">上传样例文件，用当前规则解析前 5 行并检查错误行数。</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <FileSpreadsheet className="h-4 w-4" />
                  选择样例文件
                  <input
                    type="file"
                    accept=".xlsx,.xls,.doc,.docx,.pdf,.txt"
                    className="hidden"
                    onChange={(event) => {
                      setPreviewFile(event.target.files?.[0] || null);
                      setPreview(null);
                      setPreviewError("");
                    }}
                  />
                </label>
              </div>

              {previewFile ? <p className="mt-3 text-xs text-slate-500">当前样例：{previewFile.name}</p> : null}
              {previewError ? (
                <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {previewError}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!previewFile || isPreviewing}
                  onClick={() => void previewSelectedRule()}
                  className="inline-flex items-center gap-2 rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {isPreviewing ? "解析中" : "试解析当前文件"}
                </button>
                {preview ? (
                  <span className="text-sm text-slate-600">
                    已解析 {preview.totals.parsedRows} 行，错误行 {preview.totals.errorRows} 行
                  </span>
                ) : null}
              </div>

              {preview ? (
                <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-100 text-left text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">行号</th>
                        <th className="px-3 py-2 font-semibold">门店/收件人</th>
                        <th className="px-3 py-2 font-semibold">SKU 编码</th>
                        <th className="px-3 py-2 font-semibold">SKU 名称</th>
                        <th className="px-3 py-2 font-semibold">数量</th>
                        <th className="px-3 py-2 font-semibold">备注</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.slice(0, 5).map((row) => (
                        <tr key={`${row.rowNumber}-${row.skuCode}-${row.skuName}`}>
                          <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                          <td className="px-3 py-2 text-slate-800">
                            {row.storeName || [row.receiverName, row.receiverPhone, row.receiverAddress].filter(Boolean).join(" / ") || "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-800">{row.skuCode || "-"}</td>
                          <td className="px-3 py-2 text-slate-800">{row.skuName || "-"}</td>
                          <td className="px-3 py-2 text-slate-800">{row.quantity || "-"}</td>
                          <td className="px-3 py-2 text-slate-500">{row.remark || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.issues.length ? (
                    <div className="border-t border-slate-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {preview.issues.slice(0, 3).map((issue) => (
                        <p key={`${issue.rowNumber}-${issue.field}-${issue.message}`}>
                          第 {issue.rowNumber} 行 {fieldLabels[issue.field]}：{issue.message}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canEditSelected}
                onClick={() => void saveRecord(selectedRecord)}
                className="inline-flex w-fit items-center gap-2 rounded bg-slate-950 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                保存规则
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
            选择或新建一条规则后编辑。
          </div>
        )}
      </section>
    </div>
  );
}
