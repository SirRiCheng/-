"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Input, Pagination, Progress, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import * as XLSX from "xlsx";
import { ImportProgressState, ParsedImportPayload, ShipmentRow, SubmitBatchResult } from "@/lib/types";
import { detectDuplicateExternalCodes, validateShipmentRow } from "@/lib/validators/shipment";

const columns: Array<keyof ShipmentRow> = [
  "externalCode",
  "storeName",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "skuCode",
  "skuName",
  "quantity",
  "spec",
  "remark",
];

const columnLabels: Record<keyof ShipmentRow, string> = {
  rowNumber: "行号",
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

function formatCellValue(row: ShipmentRow, field: keyof ShipmentRow) {
  const value = row[field];
  return String(value ?? "");
}

function exportRowsToCsv(rows: ShipmentRow[]) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      外部编码: row.externalCode || "",
      收货门店: row.storeName,
      收件人姓名: row.receiverName,
      收件人电话: row.receiverPhone,
      收件人地址: row.receiverAddress,
      SKU物品编码: row.skuCode,
      SKU物品名称: row.skuName,
      SKU发货数量: row.quantity,
      SKU规格型号: row.spec || "",
      备注: row.remark || "",
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Preview");
  XLSX.writeFile(workbook, "preview-export.xlsx");
}

export function PreviewGrid() {
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<ParsedImportPayload | null>(null);
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
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
    let active = true;

    async function fetchImportSession() {
      setIsLoaded(false);
      setSubmitError("");

      try {
        const requestedSessionId = searchParams.get("sessionId");
        const response = await fetch(
          `/api/import-sessions${requestedSessionId ? `?id=${encodeURIComponent(requestedSessionId)}` : ""}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as { id?: number; payload?: ParsedImportPayload | null; error?: string };

        if (!response.ok || !data.payload || !data.id) {
          throw new Error(data.error || "解析会话查询失败");
        }

        if (!active) return;
        setSessionId(data.id);
        setPayload(data.payload);
        setRows(data.payload.rows);
      } catch (requestError) {
        if (!active) return;
        setPayload(null);
        setRows([]);
        setSubmitError(requestError instanceof Error ? requestError.message : "解析会话查询失败");
      } finally {
        if (active) {
          setIsLoaded(true);
        }
      }
    }

    void fetchImportSession();

    return () => {
      active = false;
    };
  }, [searchParams]);

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
  const tableColumns: ColumnsType<ShipmentRow> = [
    {
      title: "行号",
      dataIndex: "rowNumber",
      width: 88,
      fixed: "left",
      render: (value: number) => <span className="text-slate-500">{value}</span>,
    },
    ...columns.map((column) => ({
      title: columnLabels[column],
      dataIndex: column,
      width: column === "receiverAddress" ? 240 : 180,
      render: (_: unknown, row: ShipmentRow) => {
        const hasIssue = issues.some((issue) => issue.rowNumber === row.rowNumber && issue.field === column);

        return (
          <Input
            data-row={row.rowNumber}
            data-field={String(column)}
            value={formatCellValue(row, column)}
            status={hasIssue ? "error" : undefined}
            onChange={(event) => updateCell(row.rowNumber, column, event.target.value)}
            onKeyDown={(event) => onCellKeyDown(event, row.rowNumber, column)}
          />
        );
      },
    })),
    {
      title: "操作",
      key: "action",
      width: 96,
      fixed: "right",
      render: (_, row) => (
        <Button danger size="small" onClick={() => removeRow(row.rowNumber)}>
          删除
        </Button>
      ),
    },
  ];

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  async function persistRows(nextRows: ShipmentRow[]) {
    if (!payload || !sessionId) return;

    const nextIssues = [...nextRows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(nextRows)];
    const nextPayload: ParsedImportPayload = {
      ...payload,
      rows: nextRows,
      issues: nextIssues,
      totals: {
        parsedRows: nextRows.length,
        errorRows: new Set(nextIssues.map((issue) => issue.rowNumber)).size,
      },
    };
    const response = await fetch("/api/import-sessions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: sessionId, payload: nextPayload }),
    });
    const data = (await response.json()) as { saved?: boolean; error?: string };

    if (!response.ok) {
      throw new Error(data.error || "预览数据保存入库失败");
    }

    setPayload(nextPayload);
  }

  function updateCell(rowNumber: number, field: keyof ShipmentRow, value: string) {
    if (field === "quantity") {
      setRows((current) => {
        const quantity: ShipmentRow["quantity"] = value === "" ? "" : Number(value);
        const nextRows: ShipmentRow[] = current.map((row) =>
          row.rowNumber === rowNumber
            ? {
                ...row,
                quantity,
              }
            : row,
        );
        void persistRows(nextRows).catch((error) => {
          setSubmitError(error instanceof Error ? error.message : "预览数据保存入库失败");
        });
        return nextRows;
      });
      return;
    }

    setRows((current) => {
      const nextRows = current.map((row) => {
        if (row.rowNumber !== rowNumber) return row;

        return {
          ...row,
          [field]: value,
        };
      });
      void persistRows(nextRows).catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "预览数据保存入库失败");
      });
      return nextRows;
    });

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
    setRows((current) => {
      const emptyRow: ShipmentRow = {
        rowNumber: current.length ? Math.max(...current.map((item) => item.rowNumber)) + 1 : 2,
        externalCode: "",
        storeName: "",
        receiverName: "",
        receiverPhone: "",
        receiverAddress: "",
        skuCode: "",
        skuName: "",
        quantity: "",
        spec: "",
        remark: "",
      };
      const nextRows = [
        ...current,
        emptyRow,
      ];
      void persistRows(nextRows).catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "预览数据保存入库失败");
      });
      return nextRows;
    });
  }

  function removeRow(rowNumber: number) {
    setRows((current) => {
      const nextRows = current.filter((row) => row.rowNumber !== rowNumber);
      void persistRows(nextRows).catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "预览数据保存入库失败");
      });
      return nextRows;
    });
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
      await persistRows(rows);
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
          importSessionId: sessionId,
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

      if (progressTimer) {
        window.clearInterval(progressTimer);
      }

      setSubmitProgress({
        phase: "done",
        percent: 100,
        message: "提交完成",
        current: data.totals.successRows,
        total: data.totals.totalRows,
      });

      setSubmitMessage(
        `提交完成：成功 ${data.totals.successRows} 条，失败 ${data.totals.failedRows} 条，分 ${data.progress?.totalChunks || 1} 批处理`,
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
      <div className="panel rounded p-5">
        <Progress percent={30} showInfo={false} />
        <p className="mt-3 text-sm text-slate-500">预览数据加载中...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="panel rounded p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">预览编辑表格</h2>
            <p className="mt-2 text-sm text-slate-500">
              {payload
                ? `当前文件：${payload.fileName} / ${payload.sheetName}。编辑、导出和提交都基于数据库会话 #${sessionId}。`
                : "当前未检测到数据库解析会话，请先在导入工作台上传并保存入库。"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {payload?.performance.largeDataset
                ? `当前为大数据量预览，仅渲染当前页 ${pageSize} 行，降低页面卡顿。`
                : `当前总行数 ${rows.length}，支持门店模式或收件人模式二选一。`}
            </p>
          </div>
          <Space wrap>
            <Tag color={issues.length ? "error" : "success"}>错误数 {issues.length}</Tag>
            <Button
              onClick={() => exportRowsToCsv(rows)}
              disabled={!payload}
            >
              导出当前数据
            </Button>
            <Button
              onClick={appendRow}
              disabled={!payload}
            >
              新增空行
            </Button>
            <Button
              type="primary"
              onClick={submitRows}
              disabled={!payload}
              loading={isSubmitting}
            >
              {isSubmitting ? "提交中..." : "提交下单"}
            </Button>
          </Space>
        </div>

        {submitError ? (
          <Alert className="mb-4" type="error" message={submitError} showIcon />
        ) : null}
        {submitMessage ? (
          <Alert className="mb-4" type="success" message={submitMessage} showIcon />
        ) : null}

        <div className="mb-5 rounded border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-slate-800">{submitProgress.message}</p>
            <p className="text-xs text-slate-500">{submitProgress.percent}%</p>
          </div>
          <Progress className="mt-2" percent={submitProgress.percent} showInfo={false} />
          {submitProgress.current !== undefined && submitProgress.total !== undefined ? (
            <p className="mt-2 text-xs text-slate-500">
              {submitProgress.current} / {submitProgress.total}
            </p>
          ) : null}
        </div>

        <Table
          rowKey="rowNumber"
          columns={tableColumns}
          dataSource={visibleRows}
          pagination={false}
          scroll={{ x: 1800, y: "62vh" }}
        />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            当前显示第 {page} / {totalPages} 页，每页 {pageSize} 行，共 {rows.length} 行
          </p>
          <Pagination
            current={page}
            total={rows.length}
            pageSize={pageSize}
            showSizeChanger={false}
            onChange={setPage}
          />
        </div>
      </section>

      <section className="panel rounded p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-slate-950">错误汇总</h3>
          <Tag color="error">一次性展示全部问题</Tag>
        </div>
        <div className="mt-4 grid gap-3">
          {issues.length ? (
            issues.map((issue) => (
              <Alert
                key={`${issue.rowNumber}-${issue.field}-${issue.message}`}
                type="error"
                message={`第 ${issue.rowNumber} 行，字段 ${columnLabels[issue.field]}：${issue.message}`}
                showIcon
              />
            ))
          ) : (
            <Alert type="success" message="当前没有校验错误，可以直接提交下单。" showIcon />
          )}
        </div>
      </section>
    </div>
  );
}
