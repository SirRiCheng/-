import * as XLSX from "xlsx";
import { fieldAliasMap } from "@/lib/excel/aliases";
import { standardizeRowsByTemplate } from "@/lib/excel/standardize";
import { buildRuleFromTemplate, mergeRuleIntoTemplate } from "@/lib/rules/rule-engine";
import {
  FieldMapping,
  ParseRule,
  ParsedImportPayload,
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
    .replace(/[()（）[\]【】:：/.*#]/g, "");
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

const matrixMetricHeaderPattern = /序号|数量|单价|金额|重量|体积|库存|可用|冻结|分配|待移入|总和|仓库|货主|状态|单位|规格|品牌|分类|备注|日期|时间|人员|操作|换算|折扣|合计|成本|支付/;

type HeaderCandidate = {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  template: TemplateMatchResult;
  score: number;
  matchedFields: number;
  preferredMatched: number;
};

type SheetRows = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  dataStartRowNumber: number;
  operations?: ParseRule["operations"];
};

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

function hasMatrixCandidate(headers: string[]) {
  const template = autoMatchHeaders(headers);
  const hasSkuIdentity = Boolean(template.mapping.skuCode || template.mapping.skuName);
  const mappedHeaders = new Set(Object.values(template.mapping).filter(Boolean));
  const candidateColumns = headers.filter((header) => {
    const normalized = normalizeText(header);
    if (!normalized || mappedHeaders.has(header)) return false;
    return !matrixMetricHeaderPattern.test(normalized);
  });

  return hasSkuIdentity && candidateColumns.length >= 2 && candidateColumns.length <= 8;
}

function isUsableHeaderCandidate(candidate: HeaderCandidate) {
  return candidate.preferredMatched >= 3 || hasMatrixCandidate(candidate.headers);
}

function pickHeaderCandidate(workbook: XLSX.WorkBook) {
  let bestCandidate: HeaderCandidate | undefined;

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

function pickSheetHeaderCandidate(sheetName: string, sheet: XLSX.WorkSheet, fallback: HeaderCandidate) {
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  let bestCandidate: HeaderCandidate | undefined;

  matrix.slice(0, 8).forEach((row, rowIndex) => {
    const headers = row.map((cell) => normalizeText(cell));
    if (!headers.some(Boolean)) return;

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

  return bestCandidate && isUsableHeaderCandidate(bestCandidate) ? bestCandidate : { ...fallback, sheetName };
}

function readSheetRows(sheet: XLSX.WorkSheet, headerRowIndex: number) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: headerRowIndex,
    defval: "",
    raw: false,
  });
}

function readSheetRowsWithHeaders(sheet: XLSX.WorkSheet, headerRowIndex: number, headers: string[]) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: headerRowIndex + 1,
    header: headers,
    defval: "",
    raw: false,
  });
}

function readSheetMatrix(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
}

function getCell(row: unknown[], index: number) {
  return normalizeText(row[index]);
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.some((alias) => normalizeHeader(header) === normalizeHeader(alias)));
}

function readLabelValue(row: unknown[], label: string) {
  const index = row.findIndex((cell) => normalizeHeader(normalizeText(cell)) === normalizeHeader(label));
  return index >= 0 ? getCell(row, index + 1) : "";
}

function parseCardRows(matrix: unknown[][], sheetName: string) {
  const rows: Array<Record<string, unknown>> = [];
  let cardContext: Record<string, unknown> = {};
  let itemHeaders: string[] = [];
  let itemIndexes = { skuCode: -1, skuName: -1, spec: -1, quantity: -1 };
  let currentExternalCode = "";
  let hasCardBoundary = false;

  matrix.forEach((row, rowIndex) => {
    const text = row.map(normalizeText).filter(Boolean).join(" ");

    if (/记录|调拨记录/.test(text) && !/物品编码|物品名称|数量/.test(text)) {
      hasCardBoundary = true;
      currentExternalCode = text.replace(/[▶#\s]/g, "") || `card-${rowIndex + 1}`;
      cardContext = {
        externalCode: currentExternalCode,
        __sheetName: sheetName,
      };
      itemHeaders = [];
      return;
    }

    const storeName = readLabelValue(row, "调入门店") || readLabelValue(row, "收货门店");
    const receiverName = readLabelValue(row, "收货人") || readLabelValue(row, "联系人");
    const receiverPhone = readLabelValue(row, "电话") || readLabelValue(row, "联系电话");
    const receiverAddress = readLabelValue(row, "收货地址") || readLabelValue(row, "地址");

    if (hasCardBoundary && (storeName || receiverName || receiverPhone || receiverAddress)) {
      cardContext = {
        ...cardContext,
        storeName: storeName || cardContext.storeName,
        receiverName: receiverName || cardContext.receiverName,
        receiverPhone: receiverPhone || cardContext.receiverPhone,
        receiverAddress: receiverAddress || cardContext.receiverAddress,
      };
      return;
    }

    const normalizedRow = row.map((cell) => normalizeText(cell));
    const skuCodeIndex = findHeaderIndex(normalizedRow, ["SKU物品编码", "SKU编码", "物品编码", "商品编码"]);
    const skuNameIndex = findHeaderIndex(normalizedRow, ["SKU物品名称", "SKU名称", "物品名称", "商品名称"]);
    const quantityIndex = findHeaderIndex(normalizedRow, ["SKU发货数量", "发货数量", "数量", "出库数量"]);

    if (hasCardBoundary && skuCodeIndex >= 0 && skuNameIndex >= 0 && quantityIndex >= 0) {
      itemHeaders = normalizedRow;
      itemIndexes = {
        skuCode: skuCodeIndex,
        skuName: skuNameIndex,
        spec: findHeaderIndex(normalizedRow, ["SKU规格型号", "规格型号", "规格"]),
        quantity: quantityIndex,
      };
      return;
    }

    if (!hasCardBoundary || !itemHeaders.length || itemIndexes.skuCode < 0 || itemIndexes.skuName < 0 || itemIndexes.quantity < 0) {
      return;
    }
    if (!getCell(row, itemIndexes.skuCode) || /合计/.test(text)) return;

    // 卡片式结构把收货信息写在小表上方，这里把块上下文合并进每条 SKU 明细。
    rows.push({
      ...cardContext,
      skuCode: getCell(row, itemIndexes.skuCode),
      skuName: getCell(row, itemIndexes.skuName),
      spec: itemIndexes.spec >= 0 ? getCell(row, itemIndexes.spec) : "",
      quantity: getCell(row, itemIndexes.quantity),
      __sheetName: sheetName,
    });
  });

  return rows;
}

function readStructuredSheetRows(sheet: XLSX.WorkSheet, sheetName: string, headerRowIndex: number) {
  const matrix = readSheetMatrix(sheet);
  const contextText = matrix.map((row) => row.map(normalizeText).filter(Boolean).join(" ")).filter(Boolean).join("\n");
  const contextOperations: ParseRule["operations"] = /收货|收件|联系人|电话|地址|门店/.test(contextText)
    ? ["tail_info_extract"]
    : [];
  const cardRows = parseCardRows(matrix, sheetName);
  if (cardRows.length) {
    return {
      headers: ["externalCode", "storeName", "receiverName", "receiverPhone", "receiverAddress", "skuCode", "skuName", "spec", "quantity"],
      rows: cardRows.map((row) => ({ ...row, __contextText: contextText })),
      dataStartRowNumber: 1,
      operations: Array.from(new Set<ParseRule["operations"][number]>(["card_split", ...contextOperations])),
    };
  }

  return {
    headers: [] as string[],
    rows: readSheetRowsWithHeaders(sheet, headerRowIndex, readSheetMatrix(sheet)[headerRowIndex].map((cell) => normalizeText(cell))).map((row) => ({
      ...row,
      __sheetName: sheetName,
      __contextText: contextText,
    })),
    dataStartRowNumber: headerRowIndex + 2,
    operations: contextOperations,
  };
}

function readWorkbookRows(workbook: XLSX.WorkBook, fallback: HeaderCandidate) {
  return workbook.SheetNames.map((sheetName): SheetRows => {
    const activeSheet = workbook.Sheets[sheetName];
    const candidate = pickSheetHeaderCandidate(sheetName, activeSheet, fallback);
    const structured = readStructuredSheetRows(activeSheet, sheetName, candidate.headerRowIndex);
    if (structured.rows.length && structured.headers.length) {
      return structured;
    }

    // 多 Sheet 模板常把标题说明行写得不同，逐 Sheet 定位表头可避免把说明行导入成订单。
    return {
      headers: candidate.headers,
      dataStartRowNumber: candidate.headerRowIndex + 2,
      operations: structured.operations,
      rows: readSheetRowsWithHeaders(activeSheet, candidate.headerRowIndex, candidate.headers).map((row) => ({
        ...row,
        __sheetName: sheetName,
        __contextText: readSheetMatrix(activeSheet).map((matrixRow) => matrixRow.map(normalizeText).filter(Boolean).join(" ")).filter(Boolean).join("\n"),
      })),
    };
  });
}

export function parseWorkbookBuffer(buffer: Buffer, fileName: string): ParsedImportPayload {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const candidate = pickHeaderCandidate(workbook);

  if (!candidate || !isUsableHeaderCandidate(candidate)) {
    throw new Error("未找到可解析的模板表头，请检查 Excel 是否包含运单数据。");
  }

  const rawHeaders = candidate.headers;
  const rule = buildRuleFromTemplate(fileName, rawHeaders, candidate.template);
  const template = mergeRuleIntoTemplate(candidate.template, rule);
  const sheetRows = readWorkbookRows(workbook, candidate);
  const bodyRows = sheetRows.flatMap((sheet) => sheet.rows);
  const structuralOperations = [
    ...sheetRows.flatMap((sheet) => sheet.operations || []),
    ...(sheetRows.length > 1 ? (["multi_sheet_merge"] as const) : []),
  ];
  if (structuralOperations.length && template.rule) {
    template.rule.operations = Array.from(new Set([...template.rule.operations, ...structuralOperations]));
  }
  const standardized = standardizeRowsByTemplate(sheetRows, template);

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
