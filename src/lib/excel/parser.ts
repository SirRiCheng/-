import * as XLSX from "xlsx";
import { fieldAliasMap } from "@/lib/excel/aliases";
import {
  FieldMapping,
  ParsedImportPayload,
  ShipmentField,
  ShipmentRow,
  TemplateMatchResult,
} from "@/lib/types";
import {
  detectDuplicateExternalCodes,
  normalizeTemperature,
  normalizeText,
  parsePositiveInteger,
  parsePositiveNumber,
  validateShipmentRow,
} from "@/lib/validators/shipment";

function normalizeHeader(header: string) {
  return normalizeText(header)
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[()（）[\]【】:：/.]/g, "");
}

export function buildTemplateSignature(headers: string[]) {
  return headers.map((header) => normalizeHeader(header)).filter(Boolean).join("|");
}

const preferredFields: ShipmentField[] = [
  "senderName",
  "senderPhone",
  "senderAddress",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "weight",
  "packageCount",
  "temperature",
];

export function autoMatchHeaders(headers: string[]): TemplateMatchResult {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const mapping: FieldMapping = {};

  (Object.keys(fieldAliasMap) as ShipmentField[]).forEach((field) => {
    const aliases = fieldAliasMap[field].map(normalizeHeader);
    const matchedHeader = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (matchedHeader) {
      mapping[field] = matchedHeader.original;
    }
  });

  const missingFields = (Object.keys(fieldAliasMap) as ShipmentField[]).filter((field) => {
    if (field === "externalCode" || field === "remark") return false;
    return !mapping[field];
  });

  return {
    mapping,
    matchedBy: "alias",
    confidence: Number(((Object.keys(mapping).length / 11) * 100).toFixed(2)),
    missingFields,
    signature: buildTemplateSignature(headers),
  };
}

function scoreHeaderRow(headers: string[]) {
  const template = autoMatchHeaders(headers);
  const matchedFields = Object.keys(template.mapping).length;
  const preferredMatched = preferredFields.filter((field) => template.mapping[field]).length;
  const nonEmptyHeaders = headers.filter((header) => normalizeText(header)).length;
  const signaturePenalty = headers.some((header) => normalizeText(header).includes("说明")) ? 2 : 0;

  return {
    template,
    score: preferredMatched * 10 + matchedFields * 4 + Math.min(nonEmptyHeaders, 12) - signaturePenalty,
    matchedFields,
    preferredMatched,
  };
}

function pickHeaderCandidate(workbook: XLSX.WorkBook) {
  let bestCandidate:
    | {
        sheetName: string;
        headerRowIndex: number;
        headers: string[];
        template: TemplateMatchResult;
        score: number;
        matchedFields: number;
        preferredMatched: number;
      }
    | undefined;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    matrix.slice(0, 8).forEach((row, rowIndex) => {
      const headers = row.map((cell) => normalizeText(cell));
      const nonEmptyHeaders = headers.filter(Boolean);
      if (!nonEmptyHeaders.length) return;

      const candidate = scoreHeaderRow(headers);
      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = {
          sheetName,
          headerRowIndex: rowIndex,
          headers,
          template: candidate.template,
          score: candidate.score,
          matchedFields: candidate.matchedFields,
          preferredMatched: candidate.preferredMatched,
        };
      }
    });
  });

  return bestCandidate;
}

function standardizeRow(row: Record<string, unknown>, rowNumber: number, mapping: FieldMapping): ShipmentRow {
  const pick = (field: ShipmentField) => {
    const sourceHeader = mapping[field];
    return sourceHeader ? row[sourceHeader] : "";
  };

  return {
    rowNumber,
    externalCode: normalizeText(pick("externalCode")) || undefined,
    senderName: normalizeText(pick("senderName")),
    senderPhone: normalizeText(pick("senderPhone")),
    senderAddress: normalizeText(pick("senderAddress")),
    receiverName: normalizeText(pick("receiverName")),
    receiverPhone: normalizeText(pick("receiverPhone")),
    receiverAddress: normalizeText(pick("receiverAddress")),
    weight: parsePositiveNumber(pick("weight")),
    packageCount: parsePositiveInteger(pick("packageCount")),
    temperature: normalizeTemperature(pick("temperature")),
    remark: normalizeText(pick("remark")) || undefined,
  };
}

export function parseWorkbookBuffer(buffer: Buffer, fileName: string): ParsedImportPayload {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const candidate = pickHeaderCandidate(workbook);

  if (!candidate || candidate.preferredMatched < 4) {
    throw new Error("未找到可解析的模板表头，请检查 Excel 是否包含运单数据。");
  }

  const sheet = workbook.Sheets[candidate.sheetName];
  const rawHeaders = candidate.headers;
  const headers = rawHeaders.filter(Boolean);
  const template = candidate.template;
  const bodyRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: candidate.headerRowIndex,
    defval: "",
    raw: false,
  });

  const rows = bodyRows
    .map((row, index) => standardizeRow(row, candidate.headerRowIndex + index + 2, template.mapping))
    .filter((row) => Object.values(row).some((value) => normalizeText(value).length > 0));
  const issues = [...rows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(rows)];
  const errorRows = new Set(issues.map((issue) => issue.rowNumber)).size;

  return {
    fileName,
    sheetName: candidate.sheetName,
    headers: rawHeaders,
    template,
    rows,
    issues,
    totals: {
      parsedRows: rows.length,
      errorRows,
    },
  };
}
