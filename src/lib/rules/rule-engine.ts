import { FieldMapping, ParseRule, ShipmentField, shipmentFields, TemplateMatchResult } from "@/lib/types";

const requiredFields: ShipmentField[] = [
  "storeName",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "skuCode",
  "skuName",
  "quantity",
];

export function buildRuleFromTemplate(
  fileName: string,
  headers: string[],
  template: TemplateMatchResult,
): ParseRule {
  const fileType = fileName.toLowerCase().endsWith(".pdf")
    ? "pdf"
    : fileName.toLowerCase().endsWith(".docx")
      ? "word"
      : "excel";
  const matchedFields = Object.keys(template.mapping).length;
  const hasStoreMode = Boolean(template.mapping.storeName);
  const hasReceiverMode = Boolean(
    template.mapping.receiverName && template.mapping.receiverPhone && template.mapping.receiverAddress,
  );

  return {
    id: `rule-${Date.now()}`,
    name: `${fileName.replace(/\.[^.]+$/, "") || "出库单"}解析规则`,
    description: "由字段别名和文件结构预分析生成，用户确认后保存为可复用规则。",
    fileTypes: [fileType],
    fieldMapping: template.mapping,
    operations: inferOperations(headers, template.mapping, fileType),
    groupBy: template.mapping.externalCode ? "externalCode" : undefined,
    confidence: Math.min(96, Math.max(42, Math.round((matchedFields / shipmentFields.length) * 100))),
    assumptions: [
      hasStoreMode ? "已识别收货门店，可按 A组门店模式校验。" : "未识别收货门店，可能需要手动映射 A组字段。",
      hasReceiverMode
        ? "已识别完整收件人信息，可按 B组收件人模式校验。"
        : "收件人姓名/电话/地址未完整识别，需要用户确认。",
      template.mapping.externalCode
        ? "外部编码可作为跨行聚合和重复检测依据。"
        : "未识别外部编码，提交时仅做批次内可见数据校验。",
    ],
  };
}

function inferOperations(headers: string[], mapping: FieldMapping, fileType: ParseRule["fileTypes"][number]) {
  const operations: ParseRule["operations"] = ["skip_headers"];
  const normalizedHeaders = headers.join("|");

  if (mapping.externalCode) operations.push("cross_row_group");
  if (fileType === "pdf") operations.push("pdf_order_split", "tail_info_extract");
  if (fileType === "word") operations.push("plain_text_extract");
  if (/周一|周二|周三|周四|周五|日期/.test(normalizedHeaders)) operations.push("matrix_transpose", "compound_cell_split");
  if (/sheet|门店|店/.test(normalizedHeaders)) operations.push("multi_sheet_merge");
  if (/调拨记录|卡片|记录/.test(normalizedHeaders)) operations.push("card_split");
  if (mapping.receiverName || mapping.receiverPhone || mapping.receiverAddress) operations.push("tail_info_extract");

  return Array.from(new Set(operations));
}

export function mergeRuleIntoTemplate(template: TemplateMatchResult, rule: ParseRule): TemplateMatchResult {
  const mapping = {
    ...template.mapping,
    ...rule.fieldMapping,
  };

  return {
    ...template,
    mapping,
    rule,
    matchedBy: "ai-generated",
    confidence: Math.max(template.confidence, rule.confidence),
    missingFields: requiredFields.filter((field) => {
      if (field === "storeName") {
        return !mapping.storeName && !(mapping.receiverName && mapping.receiverPhone && mapping.receiverAddress);
      }
      if (field === "receiverName" || field === "receiverPhone" || field === "receiverAddress") {
        return !mapping.storeName && !mapping[field];
      }
      return !mapping[field];
    }),
  };
}
