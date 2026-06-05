import * as XLSX from "xlsx";
import { fieldAliasMap } from "@/lib/excel/aliases";
import { PARSE_CHUNK_SIZE, RECOMMENDED_PAGE_SIZE, standardizeRows, LARGE_DATASET_THRESHOLD } from "@/lib/excel/standardize";
import { buildRuleFromTemplate, mergeRuleIntoTemplate } from "@/lib/rules/rule-engine";
import {
  FieldMapping,
  ParsedImportPayload,
  ShipmentRow,
  ShipmentField,
  TemplateMatchResult,
} from "@/lib/types";
import {
  normalizeText,
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
  "storeName",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "skuCode",
  "skuName",
  "quantity",
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
    if (field === "externalCode" || field === "remark" || field === "spec") return false;
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

function normalizeQuantityCell(value: unknown) {
  const text = normalizeText(value);
  if (!text) return [];

  return text
    .split(/\n|；|;/)
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.+?)[xX×*](\d+(?:\.\d+)?)$/);
      if (!match) return { skuName: "", quantity: Number(part) };
      return {
        skuName: normalizeText(match[1]),
        quantity: Number(match[2]),
      };
    })
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
}

function getMatrixHeaders(headers: string[], template: TemplateMatchResult) {
  const mappedHeaders = new Set(Object.values(template.mapping).filter(Boolean));
  return headers.filter((header) => normalizeText(header) && !mappedHeaders.has(header));
}

function looksLikeMatrixRows(
  sourceRows: Array<Record<string, unknown>>,
  headers: string[],
  template: TemplateMatchResult,
) {
  const matrixHeaders = getMatrixHeaders(headers, template);
  if (!Boolean(template.mapping.skuCode || template.mapping.skuName) || matrixHeaders.length < 2) return false;

  const matrixValueCount = sourceRows
    .slice(0, 20)
    .reduce((total, row) => total + matrixHeaders.filter((header) => normalizeQuantityCell(row[header]).length).length, 0);

  return matrixValueCount >= 2;
}

function expandMatrixRows(
  sourceRows: Array<Record<string, unknown>>,
  headers: string[],
  template: TemplateMatchResult,
  dataStartRowNumber: number,
) {
  const matrixHeaders = getMatrixHeaders(headers, template);
  const rows: ShipmentRow[] = [];

  sourceRows.forEach((sourceRow, rowIndex) => {
    matrixHeaders.forEach((matrixHeader) => {
      normalizeQuantityCell(sourceRow[matrixHeader]).forEach((item, itemIndex) => {
        const baseRow = {
          rowNumber: dataStartRowNumber + rowIndex + itemIndex / 100,
          externalCode: normalizeText(sourceRow[template.mapping.externalCode || ""]) || `${matrixHeader}-${dataStartRowNumber + rowIndex}`,
          storeName: /周一|周二|周三|周四|周五|周六|周日|日期/.test(matrixHeader)
            ? normalizeText(sourceRow[template.mapping.storeName || ""])
            : matrixHeader,
          receiverName: normalizeText(sourceRow[template.mapping.receiverName || ""]),
          receiverPhone: normalizeText(sourceRow[template.mapping.receiverPhone || ""]),
          receiverAddress: normalizeText(sourceRow[template.mapping.receiverAddress || ""]),
          skuCode: normalizeText(sourceRow[template.mapping.skuCode || ""]) || item.skuName,
          skuName: item.skuName || normalizeText(sourceRow[template.mapping.skuName || ""]),
          quantity: item.quantity,
          spec: normalizeText(sourceRow[template.mapping.spec || ""]) || undefined,
          remark: /周一|周二|周三|周四|周五|周六|周日|日期/.test(matrixHeader)
            ? `配送日期：${matrixHeader}`
            : normalizeText(sourceRow[template.mapping.remark || ""]) || undefined,
        };
        rows.push(baseRow);
      });
    });
  });

  return rows;
}

function readSheetRows(sheet: XLSX.WorkSheet, headerRowIndex: number) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: headerRowIndex,
    defval: "",
    raw: false,
  });
}

export function parseWorkbookBuffer(buffer: Buffer, fileName: string): ParsedImportPayload {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const candidate = pickHeaderCandidate(workbook);

  if (!candidate || candidate.preferredMatched < 3) {
    throw new Error("未找到可解析的模板表头，请检查 Excel 是否包含运单数据。");
  }

  const sheet = workbook.Sheets[candidate.sheetName];
  const rawHeaders = candidate.headers;
  const headers = rawHeaders.filter(Boolean);
  const rule = buildRuleFromTemplate(fileName, rawHeaders, candidate.template);
  const template = mergeRuleIntoTemplate(candidate.template, rule);
  const bodyRows = workbook.SheetNames.flatMap((sheetName) => {
    const activeSheet = workbook.Sheets[sheetName];
    return readSheetRows(activeSheet, candidate.headerRowIndex).map((row) => ({
      ...row,
      __sheetName: sheetName,
    }));
  });
  const standardized = looksLikeMatrixRows(bodyRows, headers, template)
    ? standardizeRows(
        expandMatrixRows(bodyRows, headers, template, candidate.headerRowIndex + 2) as unknown as Array<Record<string, unknown>>,
        {
          externalCode: "externalCode",
          storeName: "storeName",
          receiverName: "receiverName",
          receiverPhone: "receiverPhone",
          receiverAddress: "receiverAddress",
          skuCode: "skuCode",
          skuName: "skuName",
          quantity: "quantity",
          spec: "spec",
          remark: "remark",
        },
        candidate.headerRowIndex + 2,
      )
    : standardizeRows(bodyRows, template.mapping, candidate.headerRowIndex + 2);

  return {
    fileName,
    sheetName: candidate.sheetName,
    headers: rawHeaders,
    template,
    rows: standardized.rows,
    issues: standardized.issues,
    totals: standardized.totals,
    performance: standardized.performance,
    sourceRows: bodyRows,
    dataStartRowNumber: candidate.headerRowIndex + 2,
  };
}
