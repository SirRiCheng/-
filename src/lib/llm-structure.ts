import { callConfiguredLlmJson } from "@/lib/llm";
import { PARSE_CHUNK_SIZE, RECOMMENDED_PAGE_SIZE } from "@/lib/excel/standardize";
import { buildRuleFromTemplate } from "@/lib/rules/rule-engine";
import { ParsedImportPayload, ShipmentRow, TemplateMatchResult, ValidationIssue } from "@/lib/types";
import { detectDuplicateExternalCodes, normalizeText, parsePositiveNumber, validateShipmentRow } from "@/lib/validators/shipment";

type LlmStructuredOrder = {
  externalCode?: string;
  storeName?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  skuCode?: string;
  skuName?: string;
  quantity?: number | string;
  spec?: string;
  remark?: string;
};

type LlmStructuredResponse = {
  rows?: LlmStructuredOrder[];
  assumptions?: string[];
};

export function extractReadableText(buffer: Buffer) {
  return buffer
    .toString("utf8")
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlText(input: string) {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractDocxText(buffer: Buffer) {
  const binary = buffer.toString("latin1");
  const documentXmlIndex = binary.indexOf("word/document.xml");
  if (documentXmlIndex < 0) return "";

  const xmlStart = binary.indexOf("<?xml", documentXmlIndex);
  const xmlEnd = binary.indexOf("</w:document>", xmlStart);
  if (xmlStart < 0 || xmlEnd < 0) return "";

  return normalizeText(decodeXmlText(binary.slice(xmlStart, xmlEnd + "</w:document>".length)));
}

function extractPdfText(buffer: Buffer) {
  const binary = buffer.toString("latin1");
  const matches = [...binary.matchAll(/\(([^()]|\\[()nrtbf]){2,}\)/g)]
    .map((match) => match[0].slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\[()]/g, (value) => value.slice(1)));

  return normalizeText(matches.join("\n"));
}

export function extractReadableTextByFileName(buffer: Buffer, fileName: string) {
  if (/\.docx$/i.test(fileName)) {
    return extractDocxText(buffer) || extractReadableText(buffer);
  }

  if (/\.pdf$/i.test(fileName)) {
    return extractPdfText(buffer) || extractReadableText(buffer);
  }

  return extractReadableText(buffer);
}

function normalizeStructuredRows(rows: LlmStructuredOrder[]) {
  return rows.map((row, index): ShipmentRow => ({
    rowNumber: index + 1,
    externalCode: normalizeText(row.externalCode) || undefined,
    storeName: normalizeText(row.storeName),
    receiverName: normalizeText(row.receiverName),
    receiverPhone: normalizeText(row.receiverPhone),
    receiverAddress: normalizeText(row.receiverAddress),
    skuCode: normalizeText(row.skuCode),
    skuName: normalizeText(row.skuName),
    quantity: parsePositiveNumber(row.quantity),
    spec: normalizeText(row.spec) || undefined,
    remark: normalizeText(row.remark) || undefined,
  }));
}

function finalizeStructuredPayload(fileName: string, sourceText: string, rows: ShipmentRow[], assumptions: string[]) {
  const issues: ValidationIssue[] = [...rows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(rows)];
  const errorRows = new Set(issues.map((issue) => issue.rowNumber)).size;
  const template: TemplateMatchResult = {
    mapping: {
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
    matchedBy: "ai-generated",
    confidence: rows.length ? 92 : 0,
    missingFields: [],
    signature: `llm-structured:${fileName}:${Date.now()}`,
  };
  const rule = buildRuleFromTemplate(fileName, Object.keys(template.mapping), template);

  return {
    fileName,
    sheetName: "LLM结构化抽取",
    headers: Object.keys(template.mapping),
    template: {
      ...template,
      rule: {
        ...rule,
        name: `${fileName.replace(/\.[^.]+$/, "") || "文件"}LLM结构化规则`,
        description: "通过大模型读取文件内容并输出标准下单行，结果已进入预览校验。",
        assumptions: assumptions.length ? assumptions : ["模型已按题面字段抽取结构化下单数据。"],
      },
    },
    rows,
    issues,
    totals: {
      parsedRows: rows.length,
      errorRows,
    },
    performance: {
      chunkSize: PARSE_CHUNK_SIZE,
      totalChunks: Math.max(1, Math.ceil(rows.length / PARSE_CHUNK_SIZE)),
      recommendedPageSize: RECOMMENDED_PAGE_SIZE,
      largeDataset: rows.length >= 500,
    },
    sourceRows: rows.map((row) => ({ ...row })),
    dataStartRowNumber: 1,
    sourceText,
  } satisfies ParsedImportPayload & { sourceText: string };
}

export async function structureFileContentWithLlm(fileName: string, sourceText: string): Promise<ParsedImportPayload> {
  if (!sourceText) {
    throw new Error("文件没有可抽取的文本内容，请上传包含文本的 Word/PDF/TXT 文件。");
  }

  const response = await callConfiguredLlmJson<LlmStructuredResponse>(
    [
      {
        role: "system",
        content: [
          "你是物流批量下单文件结构化抽取器。",
          "只返回 JSON 对象，不要输出解释。",
          "rows 必须是数组，每一项字段只能包含 externalCode, storeName, receiverName, receiverPhone, receiverAddress, skuCode, skuName, quantity, spec, remark。",
          "A组 storeName 与 B组 receiverName+receiverPhone+receiverAddress 至少尽量抽取一组；skuCode、skuName、quantity 必须尽量抽取。",
          "如果一个订单有多个 SKU，需要拆成多行。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          fileName,
          text: sourceText.slice(0, 60000),
          expectedJsonShape: {
            rows: [
              {
                externalCode: "外部编码，可为空",
                storeName: "收货门店，A组",
                receiverName: "收件人姓名，B组",
                receiverPhone: "收件人电话，B组",
                receiverAddress: "收件人地址，B组",
                skuCode: "SKU物品编码",
                skuName: "SKU物品名称",
                quantity: 1,
                spec: "SKU规格型号，可为空",
                remark: "备注，可为空",
              },
            ],
            assumptions: ["抽取依据或不确定项"],
          },
        }),
      },
    ],
    "大模型结构化抽取失败",
  );
  const rows = normalizeStructuredRows(Array.isArray(response.rows) ? response.rows : []);

  return finalizeStructuredPayload(fileName, sourceText, rows, response.assumptions || []);
}
