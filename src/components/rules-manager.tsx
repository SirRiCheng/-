"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Space, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
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
  const recordColumns: ColumnsType<TemplateMappingRecord> = [
    {
      title: (
        <Checkbox
          checked={records.length > 0 && checkedSignatures.length === records.length}
          indeterminate={checkedSignatures.length > 0 && checkedSignatures.length < records.length}
          onChange={(event) =>
            setCheckedSignatures(event.target.checked ? records.map((record) => record.templateSignature) : [])
          }
          aria-label="选择全部规则"
        />
      ),
      width: 52,
      render: (_, record) => (
        <Checkbox
          checked={checkedSignatures.includes(record.templateSignature)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            setCheckedSignatures((current) =>
              event.target.checked
                ? [...current, record.templateSignature]
                : current.filter((signature) => signature !== record.templateSignature),
            )
          }
          aria-label={`选择规则 ${record.templateName || record.templateSignature}`}
        />
      ),
    },
    {
      title: "规则名称",
      dataIndex: "templateName",
      render: (_, record) => (
        <div>
          <p className="font-medium text-slate-950">{record.templateName || record.rule?.name || "未命名规则"}</p>
          <p className="mt-1 max-w-[18rem] truncate text-xs text-slate-500">{record.templateSignature}</p>
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 88,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            editRecord(record.templateSignature);
          }}
        >
          编辑
        </Button>
      ),
    },
  ];
  const previewColumns: ColumnsType<ParsedImportPayload["rows"][number]> = [
    {
      title: "行号",
      dataIndex: "rowNumber",
      width: 80,
    },
    {
      title: "门店/收件人",
      key: "receiver",
      render: (_, row) =>
        row.storeName || [row.receiverName, row.receiverPhone, row.receiverAddress].filter(Boolean).join(" / ") || "-",
    },
    {
      title: "SKU 编码",
      dataIndex: "skuCode",
      render: (value: string) => value || "-",
    },
    {
      title: "SKU 名称",
      dataIndex: "skuName",
      render: (value: string) => value || "-",
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 80,
      render: (value: number | "") => value || "-",
    },
    {
      title: "备注",
      dataIndex: "remark",
      render: (value: string | undefined) => value || "-",
    },
  ];

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
          <Space wrap>
            <Button
              danger
              disabled={!checkedSignatures.length}
              onClick={() => void removeRecords(checkedSignatures)}
              icon={<Trash2 className="h-4 w-4" />}
            >
              批量删除
            </Button>
            <Button
              type="primary"
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
              icon={<Plus className="h-4 w-4" />}
            >
              新建规则
            </Button>
          </Space>
        </div>

        {message ? (
          <Alert className="mt-4" type="success" message={message} showIcon />
        ) : null}
        {error ? (
          <Alert className="mt-4" type="error" message={error} showIcon />
        ) : null}

        <div className="mt-5 overflow-hidden rounded border border-slate-200">
          {records.length ? (
            <Table
              rowKey="templateSignature"
              columns={recordColumns}
              dataSource={records}
              pagination={false}
              rowClassName={(record) =>
                selectedRecord?.templateSignature === record.templateSignature
                  ? "cursor-pointer bg-cyan-50"
                  : "cursor-pointer"
              }
              onRow={(record) => ({
                onClick: () => selectRecord(record.templateSignature),
              })}
            />
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
              <Space wrap>
                <Button
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
                  icon={<Copy className="h-4 w-4" />}
                >
                  复制
                </Button>
                <Button
                  danger
                  onClick={() => void removeRecord(selectedRecord)}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  删除
                </Button>
              </Space>
            </div>

            <Alert
              type={ruleWarnings.length ? "warning" : "success"}
              showIcon
              icon={<AlertTriangle className="h-4 w-4" />}
              message={ruleWarnings.length ? "规则需要补充" : "规则字段已满足 V2 要求"}
              description={
                ruleWarnings.length
                  ? ruleWarnings.join(" ")
                  : "已覆盖 SKU 编码、SKU 名称、数量，以及门店或完整收件人信息。"
              }
            />

            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">规则名称</span>
              <Input
                value={selectedRecord.templateName || ""}
                disabled={!canEditSelected}
                onChange={(event) =>
                  updateSelected({
                    templateName: event.target.value,
                    rule: selectedRecord.rule ? { ...selectedRecord.rule, name: event.target.value } : undefined,
                  })
                }
              />
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">说明</span>
              <Input.TextArea
                value={selectedRecord.rule?.description || ""}
                disabled={!canEditSelected}
                rows={4}
                onChange={(event) =>
                  updateSelected({
                    rule: selectedRecord.rule ? { ...selectedRecord.rule, description: event.target.value } : undefined,
                  })
                }
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">结构操作</p>
              <Space className="mt-3" wrap>
                {operationOptions.map((operation) => {
                  const checked = selectedRecord.rule?.operations.includes(operation);
                  return (
                    <Button
                      key={operation}
                      size="small"
                      type={checked ? "primary" : "default"}
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
                    >
                      {operation}
                    </Button>
                  );
                })}
              </Space>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">字段映射</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {shipmentFields.map((field) => (
                  <div key={field} className="grid gap-1">
                    <span className="text-xs text-slate-500">{fieldLabels[field]}</span>
                    <Input
                      value={selectedRecord.mapping[field] || ""}
                      disabled={!canEditSelected}
                      onChange={(event) => updateMapping(field, event.target.value)}
                      placeholder="源文件列名 / 文本键名"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">试解析预览</p>
                  <p className="mt-1 text-xs text-slate-500">上传样例文件，用当前规则解析前 5 行并检查错误行数。</p>
                </div>
                <Upload
                  accept=".xlsx,.xls,.doc,.docx,.pdf,.txt"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => {
                    setPreviewFile(file);
                    setPreview(null);
                    setPreviewError("");
                    return false;
                  }}
                >
                  <Button icon={<FileSpreadsheet className="h-4 w-4" />}>选择样例文件</Button>
                </Upload>
              </div>

              {previewFile ? <p className="mt-3 text-xs text-slate-500">当前样例：{previewFile.name}</p> : null}
              {previewError ? (
                <Alert className="mt-3" type="error" message={previewError} showIcon />
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="primary"
                  disabled={!previewFile || isPreviewing}
                  onClick={() => void previewSelectedRule()}
                  loading={isPreviewing}
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                >
                  {isPreviewing ? "解析中" : "试解析当前文件"}
                </Button>
                {preview ? (
                  <span className="text-sm text-slate-600">
                    已解析 {preview.totals.parsedRows} 行，错误行 {preview.totals.errorRows} 行
                  </span>
                ) : null}
              </div>

              {preview ? (
                <div className="mt-4 rounded border border-slate-200 bg-white">
                  <Table
                    rowKey={(row) => `${row.rowNumber}-${row.skuCode}-${row.skuName}`}
                    size="small"
                    columns={previewColumns}
                    dataSource={preview.rows.slice(0, 5)}
                    pagination={false}
                    scroll={{ x: 900 }}
                  />
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
              <Button
                type="primary"
                disabled={!canEditSelected}
                onClick={() => void saveRecord(selectedRecord)}
                icon={<Save className="h-4 w-4" />}
              >
                保存规则
              </Button>
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
