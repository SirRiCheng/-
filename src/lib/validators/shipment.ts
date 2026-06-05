import { ShipmentField, ShipmentRow, ValidationIssue } from "@/lib/types";

export function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function parsePositiveNumber(input: unknown) {
  const normalized = normalizeText(input);
  if (!normalized) return "";
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : "";
}

export function parsePositiveInteger(input: unknown) {
  const value = parsePositiveNumber(input);
  if (value === "") return "";
  return Number.isInteger(value) ? value : "";
}

export function validateShipmentRow(row: ShipmentRow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  (["skuCode", "skuName"] as const).forEach((field) => {
    if (!normalizeText(row[field])) {
      issues.push({
        rowNumber: row.rowNumber,
        field,
        message: "必填字段缺失",
        level: "error",
      });
    }
  });

  const hasStoreGroup = Boolean(normalizeText(row.storeName));
  const hasReceiverGroup = Boolean(
    normalizeText(row.receiverName) && normalizeText(row.receiverPhone) && normalizeText(row.receiverAddress),
  );

  if (!hasStoreGroup && !hasReceiverGroup) {
    (["storeName", "receiverName", "receiverPhone", "receiverAddress"] as const).forEach((field) => {
      issues.push({
        rowNumber: row.rowNumber,
        field,
        message: "收货门店，或收件人姓名/电话/地址至少填写一组",
        level: "error",
      });
    });
  }

  const phonePattern = /^1\d{10}$/;
  const receiverPhone = normalizeText(row.receiverPhone);
  if (receiverPhone && !phonePattern.test(receiverPhone)) {
    issues.push({
      rowNumber: row.rowNumber,
      field: "receiverPhone",
      message: "手机号格式错误",
      level: "error",
    });
  }

  if (row.quantity === "" || row.quantity <= 0) {
    issues.push({
      rowNumber: row.rowNumber,
      field: "quantity",
      message: "SKU发货数量必须为正数",
      level: "error",
    });
  }

  return issues;
}

export function detectDuplicateExternalCodes(rows: ShipmentRow[]) {
  const map = new Map<string, number[]>();

  rows.forEach((row) => {
    const code = normalizeText(row.externalCode);
    const skuCode = normalizeText(row.skuCode);
    if (!code) return;
    // 同一外部编码允许承载多条 SKU 行；只有同一外部编码 + 同一 SKU 重复才视为重复明细。
    const duplicateKey = `${code}::${skuCode}`;
    map.set(duplicateKey, [...(map.get(duplicateKey) || []), row.rowNumber]);
  });

  const issues: ValidationIssue[] = [];

  map.forEach((rowNumbers, duplicateKey) => {
    if (rowNumbers.length < 2) return;
    const [code, skuCode] = duplicateKey.split("::");
    rowNumbers.forEach((rowNumber) => {
      issues.push({
        rowNumber,
        field: "externalCode",
        message: `同一外部编码和SKU重复：${code} / ${skuCode || "未填SKU"}，重复行 ${rowNumbers.join(" / ")}`,
        level: "error",
      });
    });
  });

  return issues;
}
