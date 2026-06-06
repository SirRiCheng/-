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
const matrixDimensionPattern = /周一|周二|周三|周四|周五|周六|周日|星期|日期|门店|店|^\d{1,2}[/-]\d{1,2}$|^\d{1,2}月\d{1,2}日$/;
const deliveryDatePattern = /周一|周二|周三|周四|周五|周六|周日|星期|日期|\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日/;
const tailInfoPattern = /收件|收货|联系人|电话|手机|地址|备注/;

type SheetStandardizeInput = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  dataStartRowNumber: number;
};

type ReceiverTailInfo = Partial<Pick<ShipmentRow, "storeName" | "receiverName" | "receiverPhone" | "receiverAddress" | "remark">>;

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

function looksLikeMatrixDimension(header: string) {
  return matrixDimensionPattern.test(normalizeText(header));
}

function looksLikeMetricHeader(header: string) {
  return /序号|数量|单价|金额|重量|体积|库存|可用|冻结|分配|待移入|总和|仓库|货主|状态|单位|规格|品牌|分类|备注|日期|时间|人员|操作|换算|折扣|合计|成本|支付/.test(normalizeText(header));
}

function getActiveMatrixHeaders(sourceRows: Array<Record<string, unknown>>, headers: string[], mapping: FieldMapping) {
  const matrixHeaders = getMatrixHeaders(headers, mapping);
  const namedDimensionHeaders = matrixHeaders.filter(looksLikeMatrixDimension);
  if (namedDimensionHeaders.length >= 2) return namedDimensionHeaders;

  return matrixHeaders.filter((header) => {
    if (looksLikeMetricHeader(header)) return false;

    return sourceRows
      .slice(0, 30)
      .some((row) => normalizeQuantityCell(row[header]).length);
  });
}

function looksLikeMatrixRows(sourceRows: Array<Record<string, unknown>>, headers: string[], template: TemplateMatchResult) {
  if (!hasOperation(template, "matrix_transpose")) return false;

  const matrixHeaders = getActiveMatrixHeaders(sourceRows, headers, template.mapping);
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
  const activeMatrixHeaders = getActiveMatrixHeaders(sourceRows, headers, template.mapping);
  const rows: ShipmentRow[] = [];

  sourceRows.forEach((sourceRow, rowIndex) => {
    activeMatrixHeaders.forEach((matrixHeader) => {
      normalizeQuantityCell(sourceRow[matrixHeader]).forEach((item, itemIndex) => {
        rows.push({
          rowNumber: dataStartRowNumber + rowIndex + itemIndex / 100,
          externalCode:
            normalizeText(sourceRow[template.mapping.externalCode || ""]) || `${matrixHeader}-${dataStartRowNumber + rowIndex}`,
          storeName: deliveryDatePattern.test(matrixHeader)
            ? normalizeText(sourceRow[template.mapping.storeName || ""])
            : matrixHeader,
          receiverName: normalizeText(sourceRow[template.mapping.receiverName || ""]),
          receiverPhone: normalizeText(sourceRow[template.mapping.receiverPhone || ""]),
          receiverAddress: normalizeText(sourceRow[template.mapping.receiverAddress || ""]),
          skuCode: normalizeText(sourceRow[template.mapping.skuCode || ""]) || item.skuName,
          skuName: item.skuName || normalizeText(sourceRow[template.mapping.skuName || ""]),
          quantity: item.quantity,
          spec: normalizeText(sourceRow[template.mapping.spec || ""]) || undefined,
          remark: deliveryDatePattern.test(matrixHeader)
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

    if (!normalizeText(row.skuCode) && !normalizeText(row.skuName) && tailInfoPattern.test(text)) {
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

function extractRawTailReceiverInfo(sourceRows: Array<Record<string, unknown>>) {
  let tailInfo: ReceiverTailInfo = {};

  sourceRows.forEach((sourceRow) => {
    const rowText = Object.entries(sourceRow)
      .filter(([key]) => !key.startsWith("__"))
      .map(([, value]) => normalizeText(value))
      .filter(Boolean)
      .join(" ");
    const contextText = normalizeText(sourceRow.__contextText);
    const text = tailInfoPattern.test(rowText) ? rowText : contextText;
    if (!tailInfoPattern.test(text)) return;

    const phone =
      text.match(/(?:收货电话|联系电话|联系方式|电话|手机)[:：\s]*(?:[^\d]{0,12})?(1\d{10})/)?.[1] ||
      text.match(/1\d{10}/)?.[0] ||
      "";
    const storeName = text.match(/(?:收货门店|调入门店|收货机构|门店)[:：\s]*([^\s，,;；联系人电话手机地址备注]{2,40})/)?.[1] || "";
    const name = text.match(/(?:收件人|收货人|联系人|姓名)[:：\s]*([^\s，,;；电话手机地址备注]{2,10})/)?.[1] || "";
    const address =
      text.match(/(?:收件地址|收货地址|地址)[:：\s]*([\s\S]+?)(?=\s*(?:制单人|审核人|签字|备注|收货人|收货电话|联系电话|备用联系人|$))/)?.[1] ||
      text.match(/((?:北京市|上海市|天津市|重庆市|[^，,;；\s]+省|[^，,;；\s]+市)[^，,;；]{6,})/)?.[1] ||
      "";
    const remark = text.match(/备注[:：][ \t]*([^，,;；\n]{2,80})/)?.[1] || "";

    // 表尾联系方式通常散落在非映射列，先从整行文本抽取，再回填到缺失的明细行。
    tailInfo = {
      storeName: tailInfo.storeName || normalizeText(storeName),
      receiverName: tailInfo.receiverName || normalizeText(name),
      receiverPhone: tailInfo.receiverPhone || phone,
      receiverAddress: tailInfo.receiverAddress || normalizeText(address),
      remark: tailInfo.remark || normalizeText(remark),
    };
  });

  return tailInfo;
}

function applyTailInfo(
  rows: ShipmentRow[],
  tailInfo: ReceiverTailInfo,
) {
  if (!tailInfo.storeName && !tailInfo.receiverName && !tailInfo.receiverPhone && !tailInfo.receiverAddress && !tailInfo.remark) {
    return rows;
  }

  return rows.map((row) => ({
    ...row,
    storeName: row.storeName || tailInfo.storeName || "",
    receiverName: row.receiverName || tailInfo.receiverName || "",
    receiverPhone: row.receiverPhone || tailInfo.receiverPhone || "",
    receiverAddress: row.receiverAddress || tailInfo.receiverAddress || "",
    remark: row.remark || tailInfo.remark || undefined,
  }));
}

function isSummarySourceRow(row: Record<string, unknown>) {
  const values = Object.values(row).map(normalizeText).filter((value): value is string => Boolean(value));
  if (!values.length) return false;

  return /^(合计|总计|小计)[:：]?/.test(values[0]) && values.length <= 4;
}

function isBusinessRow(row: ShipmentRow) {
  if (!normalizeText(row.skuCode) || !normalizeText(row.skuName) || row.quantity === "" || row.quantity <= 0) return false;
  return !/^(合计|总计|小计|上游单据|收货电话|收货人|备注)$/i.test(normalizeText(row.skuCode));
}

function normalizeRemark(value: unknown) {
  const text = normalizeText(value);
  if (!text) return undefined;
  if (/^(备注|物品备注|单据备注)$/i.test(text)) return undefined;
  if (/物品备注.*收货电话|预计发货日期.*收货地址|制单人|审核人|签字/.test(text)) return undefined;
  if (/^\d+\s+[A-Za-z0-9=/-]+\s+.+\s+\d+(?:\.\d+)?\s+/.test(text)) return undefined;
  if (/收货人|收货电话|收货地址|备用联系人|制单人|审核人|签字/.test(text)) return undefined;

  return text;
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
    return sourceHeader ? row[sourceHeader] || row[field] || "" : row[field] || "";
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
    remark: normalizeRemark(pick("remark")),
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
      .filter((row) => !isSummarySourceRow(row))
      .map((row, chunkIndex) => standardizeRow(row, dataStartRowNumber + index + chunkIndex, mapping))
      .filter(isBusinessRow);

    rows.push(...normalizedChunk);
  }

  return finalizeRows(rows, sourceRows.length);
}

function standardizeSheetRowsByTemplate(
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
    rows = applyTailInfo(extractTailReceiverInfo(rows), extractRawTailReceiverInfo(sourceRows));
  }

  return finalizeRows(rows, sourceRows.length);
}

export function standardizeRowsByTemplate(
  sourceRowsOrSheets: Array<Record<string, unknown>> | SheetStandardizeInput[],
  headersOrTemplate: string[] | TemplateMatchResult,
  template?: TemplateMatchResult,
  dataStartRowNumber?: number,
) {
  if (Array.isArray(headersOrTemplate)) {
    return standardizeSheetRowsByTemplate(
      sourceRowsOrSheets as Array<Record<string, unknown>>,
      headersOrTemplate,
      template as TemplateMatchResult,
      dataStartRowNumber || 1,
    );
  }

  const sheets = sourceRowsOrSheets as SheetStandardizeInput[];
  const sheetResults = sheets.map((sheet) =>
    standardizeSheetRowsByTemplate(sheet.rows, sheet.headers, headersOrTemplate, sheet.dataStartRowNumber),
  );
  const rows = sheetResults.flatMap((result) => result.rows);

  return finalizeRows(rows, sheets.reduce((total, sheet) => total + sheet.rows.length, 0));
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
