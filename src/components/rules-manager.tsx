"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { deleteRuleRecord, loadRuleRecords, saveRuleRecords, upsertRuleRecord } from "@/lib/import-session";
import { shipmentFields, type FieldMapping, type ParseRule, type TemplateMappingRecord } from "@/lib/types";

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

export function RulesManager() {
  const [records, setRecords] = useState<TemplateMappingRecord[]>([]);
  const [selectedSignature, setSelectedSignature] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedRecord = records.find((record) => record.templateSignature === selectedSignature) || records[0];

  useEffect(() => {
    let active = true;

    async function fetchRecords() {
      const storedRecords = loadRuleRecords();
      setRecords(storedRecords);
      setSelectedSignature(storedRecords[0]?.templateSignature || "");

      try {
        const response = await fetch("/api/template-mappings", { cache: "no-store" });
        const data = (await response.json()) as { items?: TemplateMappingRecord[]; error?: string };
        if (!response.ok) {
          throw new Error(data.error || "规则库加载失败");
        }
        if (!active || !data.items) return;

        setRecords(data.items);
        saveRuleRecords(data.items);
        setSelectedSignature(data.items[0]?.templateSignature || "");
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "规则库加载失败，已使用本地缓存");
        }
      }
    }

    void fetchRecords();

    return () => {
      active = false;
    };
  }, []);

  function persist(nextRecords: TemplateMappingRecord[]) {
    setRecords(nextRecords);
    saveRuleRecords(nextRecords);
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

  async function saveRecord(record: TemplateMappingRecord) {
    setMessage("");
    setError("");
    const savedRecord = upsertRuleRecord(record);
    persist(records.some((item) => item.templateSignature === savedRecord.templateSignature)
      ? records.map((item) => (item.templateSignature === savedRecord.templateSignature ? savedRecord : item))
      : [savedRecord, ...records]);

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
      setMessage(data.saved ? "规则已保存到服务器端规则库" : data.reason || "规则已保存到本地缓存");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存规则失败，已保留本地缓存");
    }
  }

  async function removeRecord(record: TemplateMappingRecord) {
    setMessage("");
    setError("");
    deleteRuleRecord(record.templateSignature);
    const nextRecords = records.filter((item) => item.templateSignature !== record.templateSignature);
    persist(nextRecords);
    setSelectedSignature(nextRecords[0]?.templateSignature || "");

    try {
      await fetch(`/api/template-mappings?templateSignature=${encodeURIComponent(record.templateSignature)}`, {
        method: "DELETE",
      });
      setMessage("规则已删除");
    } catch {
      setMessage("规则已从本地删除，服务器端删除失败时可稍后重试");
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
          <button
            type="button"
            onClick={() => {
              const record = upsertRuleRecord(createEmptyRuleRecord());
              const nextRecords = [record, ...records];
              setRecords(nextRecords);
              setSelectedSignature(record.templateSignature);
            }}
            className="inline-flex items-center gap-2 rounded bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" />
            新建规则
          </button>
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
                  <th className="px-4 py-3 font-semibold">规则名称</th>
                  <th className="px-4 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map((record) => (
                  <tr
                    key={record.templateSignature}
                    className={selectedRecord?.templateSignature === record.templateSignature ? "bg-cyan-50" : undefined}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{record.templateName || record.rule?.name || "未命名规则"}</p>
                      <p className="mt-1 max-w-[18rem] truncate text-xs text-slate-500">{record.templateSignature}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSignature(record.templateSignature)}
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

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">规则名称</span>
              <input
                value={selectedRecord.templateName || ""}
                onChange={(event) =>
                  updateSelected({
                    templateName: event.target.value,
                    rule: selectedRecord.rule ? { ...selectedRecord.rule, name: event.target.value } : undefined,
                  })
                }
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)]"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">说明</span>
              <textarea
                value={selectedRecord.rule?.description || ""}
                onChange={(event) =>
                  updateSelected({
                    rule: selectedRecord.rule ? { ...selectedRecord.rule, description: event.target.value } : undefined,
                  })
                }
                className="min-h-24 rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)]"
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
                      }`}
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
                      onChange={(event) => updateMapping(field, event.target.value)}
                      placeholder="源文件列名 / 文本键名"
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveRecord(selectedRecord)}
              className="inline-flex w-fit items-center gap-2 rounded bg-slate-950 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              保存规则
            </button>
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
