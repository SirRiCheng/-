"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { clearImportSession, loadImportSession } from "@/lib/import-session";
import { demoRows } from "@/lib/mock-data";
import { ImportProgressState, ParsedImportPayload, ShipmentRow, SubmitBatchResult } from "@/lib/types";
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
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      外部编码: row.externalCode || "",
      发件人姓名: row.senderName,
      发件人电话: row.senderPhone,
      发件人地址: row.senderAddress,
      收件人姓名: row.receiverName,
      收件人电话: row.receiverPhone,
      收件人地址: row.receiverAddress,
      重量: row.weight,
      件数: row.packageCount,
      温层: row.temperature ? temperatureLabels[row.temperature] : "",
      备注: row.remark || "",
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Preview");
  XLSX.writeFile(workbook, "preview-export.xlsx");
}

export function PreviewGrid() {
  const [payload, setPayload] = useState<ParsedImportPayload | null>(null);
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [submitProgress, setSubmitProgress] = useState<ImportProgressState>({
    phase: "idle",
    percent: 0,
    message: "等待提交",
  });

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

  const pageSize = payload?.performance.recommendedPageSize || 100;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, rows],
  );

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

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

    setSubmitProgress((current) =>
      current.phase === "done" || current.phase === "idle"
        ? current
        : {
            ...current,
            message: "数据已修改，等待重新提交",
            percent: Math.min(current.percent, 40),
          },
    );
  }

  function onCellKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    rowNumber: number,
    field: keyof ShipmentRow,
  ) {
    if (event.key !== "Tab" && event.key !== "Enter") return;

    event.preventDefault();
    const currentRowIndex = visibleRows.findIndex((row) => row.rowNumber === rowNumber);
    const currentFieldIndex = columns.findIndex((column) => column === field);

    if (currentRowIndex < 0 || currentFieldIndex < 0) return;

    const isLastField = currentFieldIndex === columns.length - 1;
    const isLastVisibleRow = currentRowIndex === visibleRows.length - 1;
    const nextFieldIndex = event.key === "Enter" ? currentFieldIndex : isLastField ? 0 : currentFieldIndex + 1;
    const nextRowIndex =
      event.key === "Enter"
        ? Math.min(visibleRows.length - 1, currentRowIndex + 1)
        : isLastField
          ? Math.min(visibleRows.length - 1, currentRowIndex + 1)
          : currentRowIndex;

    const nextRow = visibleRows[nextRowIndex];
    const nextField = columns[nextFieldIndex];
    if (event.key === "Tab" && isLastField && isLastVisibleRow && page < totalPages) {
      setPage((current) => Math.min(totalPages, current + 1));
      window.setTimeout(() => {
        const nextPageInput = document.querySelector<HTMLInputElement>(
          `[data-row="${rows[page * pageSize]?.rowNumber}"][data-field="${String(columns[0])}"]`,
        );
        nextPageInput?.focus();
        nextPageInput?.select();
      }, 0);
      return;
    }
    const input = document.querySelector<HTMLInputElement>(
      `[data-row="${nextRow?.rowNumber}"][data-field="${String(nextField)}"]`,
    );
    input?.focus();
    input?.select();
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
    setSubmitProgress({
      phase: "submitting",
      percent: 14,
      message: "正在分批提交运单",
      current: 0,
      total: rows.length,
    });
    let progressTimer: number | undefined;
    try {
      const totalChunks = Math.max(1, Math.ceil(rows.length / 100));
      let optimisticChunk = 0;
      progressTimer = window.setInterval(() => {
        optimisticChunk = Math.min(totalChunks, optimisticChunk + 1);
        setSubmitProgress({
          phase: "submitting",
          percent: Math.min(92, 14 + Math.round((optimisticChunk / totalChunks) * 72)),
          message: "正在分批提交运单",
          current: Math.min(rows.length, optimisticChunk * 100),
          total: rows.length,
        });
      }, 220);

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

      const data = (await response.json()) as SubmitBatchResult | { error?: string };
      if (!response.ok) {
        throw new Error(("error" in data ? data.error : undefined) || "提交失败");
      }
      if (!("totals" in data)) {
        throw new Error("提交返回结果不完整");
      }

      if ("saved" in data && data.saved) {
        clearImportSession();
      }

      if (progressTimer) {
        window.clearInterval(progressTimer);
      }

      setSubmitProgress({
        phase: "done",
        percent: 100,
        message: "提交完成",
        current: "totals" in data ? data.totals.successRows : rows.length,
        total: "totals" in data ? data.totals.totalRows : rows.length,
      });

      setSubmitMessage(
        "saved" in data && data.saved
          ? `提交完成：成功 ${data.totals.successRows} 条，失败 ${data.totals.failedRows} 条，分 ${data.progress?.totalChunks || 1} 批处理`
          : `数据库未配置，已完成提交流程验证：总计 ${data.totals.totalRows} 条`,
      );
    } catch (requestError) {
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      setSubmitError(requestError instanceof Error ? requestError.message : "提交失败");
      setSubmitProgress({
        phase: "idle",
        percent: 0,
        message: "提交失败",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="panel rounded-[30px] p-6">
        预览数据加载中...
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="panel rounded-[32px] p-6 lg:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Review Workspace</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">预览编辑工作台</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {payload
                ? `当前文件：${payload.fileName} / ${payload.sheetName}。可直接编辑、导出、提交。`
                : "当前未检测到上传会话，展示的是本地演示数据。"}
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              {payload?.performance.largeDataset
                ? `当前为大数据量预览，仅渲染当前页 ${pageSize} 行，降低页面卡顿。`
                : `当前总行数 ${rows.length}，可直接全流程处理。`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-full bg-[linear-gradient(135deg,#111827,#1f2937)] px-4 py-2 text-sm font-medium text-white">
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

        <div className="mb-5 rounded-[24px] border border-white/60 bg-white/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-slate-800">{submitProgress.message}</p>
            <p className="text-xs text-slate-500">{submitProgress.percent}%</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#111827,#d97706)] transition-all duration-500"
              style={{ width: `${submitProgress.percent}%` }}
            />
          </div>
          {submitProgress.current !== undefined && submitProgress.total !== undefined ? (
            <p className="mt-2 text-xs text-slate-500">
              {submitProgress.current} / {submitProgress.total}
            </p>
          ) : null}
        </div>

        <div className="max-h-[62vh] overflow-auto rounded-[26px] border border-white/50 bg-white/55">
          <table className="min-w-[1320px] divide-y divide-slate-200 text-sm">
            <thead className="text-left text-slate-100">
              <tr>
                <th className="sticky top-0 z-10 bg-[linear-gradient(135deg,#111827,#1f2937)] px-4 py-3 font-medium">行号</th>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="sticky top-0 z-10 bg-[linear-gradient(135deg,#111827,#1f2937)] px-4 py-3 font-medium"
                  >
                    {column}
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-[linear-gradient(135deg,#111827,#1f2937)] px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {visibleRows.map((row) => (
                <tr key={row.rowNumber} className="align-top">
                  <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                  {columns.map((column) => {
                    const hasIssue = issues.some(
                      (issue) => issue.rowNumber === row.rowNumber && issue.field === column,
                    );

                    return (
                      <td key={column} className="px-2 py-2">
                        <input
                          data-row={row.rowNumber}
                          data-field={String(column)}
                          value={formatCellValue(row, column)}
                          onChange={(event) => updateCell(row.rowNumber, column, event.target.value)}
                          onKeyDown={(event) => onCellKeyDown(event, row.rowNumber, column)}
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            当前显示第 {page} / {totalPages} 页，每页 {pageSize} 行，共 {rows.length} 行
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <section className="panel rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-950">错误汇总</h3>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
            一次性展示全部问题
          </span>
        </div>
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
