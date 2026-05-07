import { ShipmentField, ShipmentRow, ValidationIssue } from "@/lib/types";

const temperatureMap = new Map([
  ["常温", "ambient"],
  ["ambient", "ambient"],
  ["冷藏", "chilled"],
  ["chilled", "chilled"],
  ["冷冻", "frozen"],
  ["frozen", "frozen"],
]);

export function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeTemperature(input: unknown): ShipmentRow["temperature"] {
  const value = normalizeText(input).toLowerCase();
  return (temperatureMap.get(value) as ShipmentRow["temperature"]) || "";
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

  const requiredTextFields: ShipmentField[] = [
    "senderName",
    "senderPhone",
    "senderAddress",
    "receiverName",
    "receiverPhone",
    "receiverAddress",
  ];

  requiredTextFields.forEach((field) => {
    if (!normalizeText(row[field])) {
      issues.push({
        rowNumber: row.rowNumber,
        field,
        message: "必填字段缺失",
        level: "error",
      });
    }
  });

  const phonePattern = /^1\d{10}$/;
  (["senderPhone", "receiverPhone"] as const).forEach((field) => {
    const value = normalizeText(row[field]);
    if (value && !phonePattern.test(value)) {
      issues.push({
        rowNumber: row.rowNumber,
        field,
        message: "手机号格式错误",
        level: "error",
      });
    }
  });

  if (row.weight === "" || row.weight <= 0) {
    issues.push({
      rowNumber: row.rowNumber,
      field: "weight",
      message: "重量必须为正数",
      level: "error",
    });
  }

  if (row.packageCount === "" || row.packageCount <= 0 || !Number.isInteger(row.packageCount)) {
    issues.push({
      rowNumber: row.rowNumber,
      field: "packageCount",
      message: "件数必须为正整数",
      level: "error",
    });
  }

  if (!row.temperature) {
    issues.push({
      rowNumber: row.rowNumber,
      field: "temperature",
      message: "温层必须为常温、冷藏、冷冻之一",
      level: "error",
    });
  }

  return issues;
}

export function detectDuplicateExternalCodes(rows: ShipmentRow[]) {
  const map = new Map<string, number[]>();

  rows.forEach((row) => {
    const code = normalizeText(row.externalCode);
    if (!code) return;
    map.set(code, [...(map.get(code) || []), row.rowNumber]);
  });

  const issues: ValidationIssue[] = [];

  map.forEach((rowNumbers, code) => {
    if (rowNumbers.length < 2) return;
    rowNumbers.forEach((rowNumber) => {
      issues.push({
        rowNumber,
        field: "externalCode",
        message: `外部编码重复：${code}，重复行 ${rowNumbers.join(" / ")}`,
        level: "error",
      });
    });
  });

  return issues;
}
