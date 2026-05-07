"use client";

import { useEffect, useMemo, useState } from "react";
import { clearImportSession, loadImportSession } from "@/lib/import-session";
import { demoRows } from "@/lib/mock-data";
import { ParsedImportPayload, ShipmentRow } from "@/lib/types";
import { detectDuplicateExternalCodes, normalizeTemperature, validateShipmentRow } from "@/lib/validators/shipment";

const columns: Array<keyof ShipmentRow> = [
  "externalCode",
  "senderName",
  "senderPhone",
  "senderAddress",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "weight",
  "packageCount",
  "temperature",
  "remark",
];

const temperatureLabels = {
  ambient: "常温",
  chilled: "冷藏",
  frozen: "冷冻",
} as const;

function formatCellValue(row: ShipmentRow, field: keyof ShipmentRow) {
  const value = row[field];
  if (field === "temperature" && value && typeof value === "string") {
    return temperatureLabels[value as keyof typeof temperatureLabels] || value;
  }
  return String(value ?? "");
}

function exportRowsToCsv(rows: ShipmentRow[]) {
  const header = ["外部编码", "发件人姓名", "发件人电话", "发件人地址", "收件人姓名", "收件人电话", "收件人地址", "重量", "件数", "温层", "备注"];
  const lines = rows.map((row) => [
    row.externalCode || "",
    row.senderName,
    row.senderPhone,
    row.senderAddress,
    row.receiverName,
    row.receiverPhone,
    row.receiverAddress,
    row.weight,
    row.packageCount,
    row.temperature ? temperatureLabels[row.temperature] : "",
    row.remark || "",
  ]);

  const csv = [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "preview-export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function PreviewGrid() {
  const [payload, setPayload] = useState<ParsedImportPayload | null>(null);
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const session = loadImportSession();
    if (session) {
      setPayload(session);
      setRows(session.rows);
    } else {
      setRows(demoRows);
    }
    setIsLoaded(true);
  }, []);

  const issues = useMemo(
    () => [...rows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(rows)],
    [rows],
  );

  function updateCell(rowNumber: number, field: keyof ShipmentRow, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.rowNumber !== rowNumber) return row;

        if (field === "weight" || field === "packageCount") {
          return {
            ...row,
            [field]: value === "" ? "" : Number(value),
          };
        }

        if (field === "temperature") {
          return {
            ...row,
            temperature: normalizeTemperature(value),
          };
        }

        return {
          ...row,
          [field]: value,
        };
      }),
    );
  }

  function appendRow() {
    setRows((current) => [
      ...current,
      {
        rowNumber: current.length ? Math.max(...current.map((item) => item.rowNumber)) + 1 : 2,
        externalCode: "",
        senderName: "",
        senderPhone: "",
        senderAddress: "",
        receiverName: "",
        receiverPhone: "",
        receiverAddress: "",
        weight: "",
        packageCount: "",
        temperature: "",
        remark: "",
      },
    ]);
  }

  function removeRow(rowNumber: number) {
    setRows((current) => current.filter((row) => row.rowNumber !== rowNumber));
  }

  async function submitRows() {
    setSubmitError("");
    setSubmitMessage("");

    if (issues.length) {
      setSubmitError("当前存在错误行，需修正后才能提交。");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/shipments/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: payload?.fileName || "manual-preview.xlsx",
          templateSignature: payload?.template.signature || "manual-preview",
          rows,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "提交失败");
      }

      if (data.saved) {
        clearImportSession();
      }

      setSubmitMessage(
        data.saved
          ? `提交完成：成功 ${data.totals.successRows} 条，失败 ${data.totals.failedRows} 条`
          : `数据库未配置，已完成提交流程验证：总计 ${data.totals.totalRows} 条`,
      );
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-float">
        预览数据加载中...
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-float">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">预览编辑工作台</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {payload
                ? `当前文件：${payload.fileName} / ${payload.sheetName}。可直接编辑、导出、提交。`
                : "当前未检测到上传会话，展示的是本地演示数据。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white">
              错误数 {issues.length}
            </div>
            <button
              type="button"
              onClick={() => exportRowsToCsv(rows)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              导出当前数据
            </button>
            <button
              type="button"
              onClick={appendRow}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              新增空行
            </button>
            <button
              type="button"
              onClick={submitRows}
              disabled={isSubmitting}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "提交中..." : "提交下单"}
            </button>
          </div>
        </div>

        {submitError ? (
          <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {submitError}
          </p>
        ) : null}
        {submitMessage ? (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {submitMessage}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-[24px] border border-slate-200">
          <table className="min-w-[1320px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-950 text-left text-slate-100">
              <tr>
                <th className="px-4 py-3 font-medium">行号</th>
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-medium">
                    {column}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={row.rowNumber} className="align-top">
                  <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                  {columns.map((column) => {
                    const hasIssue = issues.some(
                      (issue) => issue.rowNumber === row.rowNumber && issue.field === column,
                    );

                    return (
                      <td key={column} className="px-2 py-2">
                        <input
                          value={formatCellValue(row, column)}
                          onChange={(event) => updateCell(row.rowNumber, column, event.target.value)}
                          className={`w-full rounded-2xl border px-3 py-2 outline-none transition ${
                            hasIssue
                              ? "border-rose-300 bg-rose-50 text-rose-800"
                              : "border-slate-200 bg-slate-50 text-slate-700 focus:border-amber-400 focus:bg-white"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.rowNumber)}
                      className="rounded-full border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-float">
        <h3 className="text-lg font-semibold text-slate-950">错误汇总</h3>
        <div className="mt-4 grid gap-3">
          {issues.length ? (
            issues.map((issue) => (
              <div
                key={`${issue.rowNumber}-${issue.field}-${issue.message}`}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                第 {issue.rowNumber} 行，字段 {issue.field}：{issue.message}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              当前没有校验错误，可以直接提交下单。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
