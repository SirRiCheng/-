import { FieldMapping, ParsedImportPayload, ShipmentField, ShipmentRow, TemplateMatchResult } from "@/lib/types";
import {
  detectDuplicateExternalCodes,
  normalizeText,
  parsePositiveNumber,
  validateShipmentRow,
} from "@/lib/validators/shipment";

export const PARSE_CHUNK_SIZE = 200;
export const LARGE_DATASET_THRESHOLD = 500;
export const RECOMMENDED_PAGE_SIZE = 100;

const identityMapping: FieldMapping = {
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
};

const receiverFields: ShipmentField[] = ["receiverName", "receiverPhone", "receiverAddress"];

function hasOperation(template: TemplateMatchResult, operation: NonNullable<TemplateMatchResult["rule"]>["operations"][number]) {
  return Boolean(template.rule?.operations.includes(operation));
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

function getMatrixHeaders(headers: string[], mapping: FieldMapping) {
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  return headers.filter((header) => normalizeText(header) && !mappedHeaders.has(header));
}

function looksLikeMatrixRows(sourceRows: Array<Record<string, unknown>>, headers: string[], template: TemplateMatchResult) {
  if (!hasOperation(template, "matrix_transpose")) return false;

  const matrixHeaders = getMatrixHeaders(headers, template.mapping);
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
  const matrixHeaders = getMatrixHeaders(headers, template.mapping);
  const rows: ShipmentRow[] = [];

  sourceRows.forEach((sourceRow, rowIndex) => {
    matrixHeaders.forEach((matrixHeader) => {
      normalizeQuantityCell(sourceRow[matrixHeader]).forEach((item, itemIndex) => {
        rows.push({
          rowNumber: dataStartRowNumber + rowIndex + itemIndex / 100,
          externalCode:
            normalizeText(sourceRow[template.mapping.externalCode || ""]) || `${matrixHeader}-${dataStartRowNumber + rowIndex}`,
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
        });
      });
    });
  });

  return rows;
}

function copyPreviousBusinessContext(rows: ShipmentRow[]) {
  let previous: Partial<ShipmentRow> = {};

  return rows.map((row) => {
    const nextRow = {
      ...row,
      externalCode: row.externalCode || previous.externalCode,
      storeName: row.storeName || previous.storeName || "",
      receiverName: row.receiverName || previous.receiverName || "",
      receiverPhone: row.receiverPhone || previous.receiverPhone || "",
      receiverAddress: row.receiverAddress || previous.receiverAddress || "",
      remark: row.remark || previous.remark,
    };

    // 合并单元格或跨行明细常把客户信息只写在第一行，这里把上一条业务上下文传给后续 SKU 行。
    if (
      normalizeText(row.externalCode) ||
      normalizeText(row.storeName) ||
      receiverFields.some((field) => normalizeText(row[field]))
    ) {
      previous = {
        externalCode: nextRow.externalCode,
        storeName: nextRow.storeName,
        receiverName: nextRow.receiverName,
        receiverPhone: nextRow.receiverPhone,
        receiverAddress: nextRow.receiverAddress,
        remark: nextRow.remark,
      };
    }

    return nextRow;
  });
}

function extractTailReceiverInfo(rows: ShipmentRow[]) {
  let tailInfo: Pick<ShipmentRow, "receiverName" | "receiverPhone" | "receiverAddress" | "remark"> = {
    receiverName: "",
    receiverPhone: "",
    receiverAddress: "",
    remark: "",
  };

  const businessRows = rows.filter((row) => {
    const text = [row.storeName, row.receiverName, row.receiverPhone, row.receiverAddress, row.skuCode, row.skuName, row.remark]
      .map(normalizeText)
      .join(" ");
    const phone = text.match(/1\d{10}/)?.[0] || "";

    if (!normalizeText(row.skuCode) && !normalizeText(row.skuName) && /收件|收货|联系人|电话|地址|备注/.test(text)) {
      tailInfo = {
        receiverName: row.receiverName || tailInfo.receiverName,
        receiverPhone: row.receiverPhone || phone || tailInfo.receiverPhone,
        receiverAddress: row.receiverAddress || tailInfo.receiverAddress,
        remark: row.remark || text || tailInfo.remark,
      };
      return false;
    }

    return true;
  });

  if (!tailInfo.receiverName && !tailInfo.receiverPhone && !tailInfo.receiverAddress && !tailInfo.remark) {
    return rows;
  }

  return businessRows.map((row) => ({
    ...row,
    receiverName: row.receiverName || tailInfo.receiverName,
    receiverPhone: row.receiverPhone || tailInfo.receiverPhone,
    receiverAddress: row.receiverAddress || tailInfo.receiverAddress,
    remark: row.remark || tailInfo.remark || undefined,
  }));
}

function finalizeRows(rows: ShipmentRow[], sourceRowCount: number) {
  const issues = [...rows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(rows)];
  const errorRows = new Set(issues.map((issue) => issue.rowNumber)).size;

  return {
    rows,
    issues,
    totals: {
      parsedRows: rows.length,
      errorRows,
    },
    performance: {
      chunkSize: PARSE_CHUNK_SIZE,
      totalChunks: Math.max(1, Math.ceil(sourceRowCount / PARSE_CHUNK_SIZE)),
      recommendedPageSize: RECOMMENDED_PAGE_SIZE,
      largeDataset: rows.length >= LARGE_DATASET_THRESHOLD,
    },
  };
}

export function standardizeRow(
  row: Record<string, unknown>,
  rowNumber: number,
  mapping: FieldMapping,
): ShipmentRow {
  const pick = (field: ShipmentField) => {
    const sourceHeader = mapping[field];
    return sourceHeader ? row[sourceHeader] : "";
  };

  return {
    rowNumber,
    externalCode: normalizeText(pick("externalCode")) || undefined,
    storeName: normalizeText(pick("storeName")),
    receiverName: normalizeText(pick("receiverName")),
    receiverPhone: normalizeText(pick("receiverPhone")),
    receiverAddress: normalizeText(pick("receiverAddress")),
    skuCode: normalizeText(pick("skuCode")),
    skuName: normalizeText(pick("skuName")),
    quantity: parsePositiveNumber(pick("quantity")),
    spec: normalizeText(pick("spec")) || undefined,
    remark: normalizeText(pick("remark")) || undefined,
  };
}

export function standardizeRows(
  sourceRows: Array<Record<string, unknown>>,
  mapping: FieldMapping,
  dataStartRowNumber: number,
) {
  const rows: ShipmentRow[] = [];

  for (let index = 0; index < sourceRows.length; index += PARSE_CHUNK_SIZE) {
    const chunk = sourceRows.slice(index, index + PARSE_CHUNK_SIZE);
    const normalizedChunk = chunk
      .map((row, chunkIndex) => standardizeRow(row, dataStartRowNumber + index + chunkIndex, mapping))
      .filter((row) => Object.values(row).some((value) => normalizeText(value).length > 0));

    rows.push(...normalizedChunk);
  }

  return finalizeRows(rows, sourceRows.length);
}

export function standardizeRowsByTemplate(
  sourceRows: Array<Record<string, unknown>>,
  headers: string[],
  template: TemplateMatchResult,
  dataStartRowNumber: number,
) {
  if (looksLikeMatrixRows(sourceRows, headers.filter(Boolean), template)) {
    return standardizeRows(
      expandMatrixRows(sourceRows, headers.filter(Boolean), template, dataStartRowNumber) as unknown as Array<Record<string, unknown>>,
      identityMapping,
      dataStartRowNumber,
    );
  }

  const standardized = standardizeRows(sourceRows, template.mapping, dataStartRowNumber);
  let rows = standardized.rows;

  if (hasOperation(template, "cross_row_group")) {
    rows = copyPreviousBusinessContext(rows);
  }

  if (hasOperation(template, "tail_info_extract")) {
    rows = extractTailReceiverInfo(rows);
  }

  return finalizeRows(rows, sourceRows.length);
}

export function rebuildParsedPayload(
  payload: ParsedImportPayload,
  template: TemplateMatchResult,
): ParsedImportPayload {
  const standardized = standardizeRowsByTemplate(payload.sourceRows, payload.headers, template, payload.dataStartRowNumber);

  return {
    ...payload,
    template,
    rows: standardized.rows,
    issues: standardized.issues,
    totals: standardized.totals,
    performance: standardized.performance,
  };
}
