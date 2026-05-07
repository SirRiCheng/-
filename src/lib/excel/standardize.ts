import { FieldMapping, ParsedImportPayload, ShipmentField, ShipmentRow, TemplateMatchResult } from "@/lib/types";
import {
  detectDuplicateExternalCodes,
  normalizeTemperature,
  normalizeText,
  parsePositiveInteger,
  parsePositiveNumber,
  validateShipmentRow,
} from "@/lib/validators/shipment";

export const PARSE_CHUNK_SIZE = 200;
export const LARGE_DATASET_THRESHOLD = 500;
export const RECOMMENDED_PAGE_SIZE = 100;

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

export function standardizeRows(
  sourceRows: Array<Record<string, unknown>>,
  mapping: FieldMapping,
  dataStartRowNumber: number,
) {
  const rows: ShipmentRow[] = [];
  const rowIssues = [];

  for (let index = 0; index < sourceRows.length; index += PARSE_CHUNK_SIZE) {
    const chunk = sourceRows.slice(index, index + PARSE_CHUNK_SIZE);
    const normalizedChunk = chunk
      .map((row, chunkIndex) => standardizeRow(row, dataStartRowNumber + index + chunkIndex, mapping))
      .filter((row) => Object.values(row).some((value) => normalizeText(value).length > 0));

    rows.push(...normalizedChunk);
    rowIssues.push(...normalizedChunk.flatMap(validateShipmentRow));
  }

  const issues = [...rowIssues, ...detectDuplicateExternalCodes(rows)];
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
      totalChunks: Math.max(1, Math.ceil(sourceRows.length / PARSE_CHUNK_SIZE)),
      recommendedPageSize: RECOMMENDED_PAGE_SIZE,
      largeDataset: rows.length >= LARGE_DATASET_THRESHOLD,
    },
  };
}

export function rebuildParsedPayload(
  payload: ParsedImportPayload,
  template: TemplateMatchResult,
): ParsedImportPayload {
  const standardized = standardizeRows(payload.sourceRows, template.mapping, payload.dataStartRowNumber);

  return {
    ...payload,
    template,
    rows: standardized.rows,
    issues: standardized.issues,
    totals: standardized.totals,
    performance: standardized.performance,
  };
}
