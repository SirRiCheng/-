import { callConfiguredLlmJson } from "@/lib/llm";
import zlib from "zlib";
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

type TextBlock = {
  text: string;
  y?: number;
};

export function extractReadableText(buffer: Buffer) {
  return buffer
    .toString("utf8")
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeUtf16Hex(input: string) {
  const bytes = input.match(/[0-9a-fA-F]{2}/g);
  if (!bytes?.length) return "";

  const values = bytes.map((byte) => Number.parseInt(byte, 16));
  if (values[0] === 0xfe && values[1] === 0xff) {
    values.splice(0, 2);
  }

  // PDF 十六进制文本常用 UTF-16BE，Node 只内置 LE，这里手动按大端合成字符。
  if (values.length % 2 === 0) {
    return values
      .reduce<string[]>((chars, _byte, index) => {
        if (index % 2 === 0) {
          chars.push(String.fromCharCode((values[index] << 8) + values[index + 1]));
        }
        return chars;
      }, [])
      .join("")
      .replace(/\u0000/g, "");
  }

  return Buffer.from(values).toString("utf8").replace(/\u0000/g, "");
}

function parsePdfCMap(input: string) {
  const map = new Map<string, string>();
  [...input.matchAll(/<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]{4,})>/g)].forEach((match) => {
    map.set(match[1].toUpperCase(), decodeUtf16Hex(match[2]));
  });

  return map;
}

function extractPdfCMap(binary: string) {
  const cmap = new Map<string, string>();

  [...binary.matchAll(/<<(?:.|\n|\r)*?\/Filter\s*\/FlateDecode(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .forEach((match) => {
      try {
        const inflated = zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
        if (inflated.includes("beginbfchar") || inflated.includes("beginbfrange")) {
          parsePdfCMap(inflated).forEach((value, key) => cmap.set(key, value));
        }
      } catch {
        // 非文本映射流跳过。
      }
    });

  return cmap;
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
  const documentXml = inflateZipEntry(buffer, "word/document.xml");
  if (documentXml) {
    return normalizeText(decodeXmlText(documentXml.toString("utf8")));
  }

  const binary = buffer.toString("latin1");
  const documentXmlIndex = binary.indexOf("word/document.xml");
  if (documentXmlIndex < 0) return "";
  const xmlStart = binary.indexOf("<?xml", documentXmlIndex);
  const xmlEnd = binary.indexOf("</w:document>", xmlStart);
  if (xmlStart < 0 || xmlEnd < 0) return "";

  return normalizeText(decodeXmlText(binary.slice(xmlStart, xmlEnd + "</w:document>".length)));
}

function inflateZipEntry(buffer: Buffer, entryName: string) {
  let offset = 0;

  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.slice(dataStart, dataStart + compressedSize);

    if (name === entryName) {
      if (compression === 0) return data;
      if (compression === 8) return zlib.inflateRawSync(data);
      return uncompressedSize ? data : Buffer.alloc(0);
    }

    offset = dataStart + compressedSize;
  }

  return null;
}

function decodePdfLiteral(input: string) {
  return input
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1");
}

function normalizePdfGlyphText(input: string) {
  return input
    .replace(/[\u0016-\u001f]/g, (value) => String(value.charCodeAt(0) - 0x16))
    .replace(/\u0014/g, ".")
    .replace(/\u0015/g, "/")
    .replace(/\u0003/g, " ")
    .replace(/\u0010/g, "*");
}

function decodePdfTextToken(token: string, cmap?: Map<string, string>) {
  if (token.startsWith("<") && token.endsWith(">") && token.length > 2) {
    const hex = token.slice(1, -1).toUpperCase();
    if (cmap?.size) {
      const chars = hex.match(/[0-9A-F]{4}/g)?.map((code) => cmap.get(code) || decodeUtf16Hex(code)).join("");
      if (chars) return chars;
    }
    return decodeUtf16Hex(hex);
  }

  if (token.startsWith("(") && token.endsWith(")")) {
    return decodePdfLiteral(token.slice(1, -1));
  }

  return "";
}

function extractPdfBlocksFromStream(stream: string, cmap?: Map<string, string>) {
  const blocks: TextBlock[] = [];
  let currentY = 0;

  stream.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td/g, (_match, _x, y) => {
    currentY += Number(y);
    return "";
  });
  stream.replace(/(?:<[\dA-Fa-f]+>|\((?:[^()\\]|\\.)*\))\s*Tj/g, (match) => {
    const token = match.replace(/\s*Tj$/, "");
    const text = normalizeText(decodePdfTextToken(token, cmap));
    if (text) blocks.push({ text, y: currentY });
    return "";
  });
  stream.replace(/\[((?:<[\dA-Fa-f]+>|\((?:[^()\\]|\\.)*\)|-?\d+(?:\.\d+)?|\s)+)\]\s*TJ/g, (_match, content) => {
    const text = normalizeText([...String(content).matchAll(/<[\dA-Fa-f]+>|\((?:[^()\\]|\\.)*\)/g)]
      .map((item) => decodePdfTextToken(item[0], cmap))
      .join(""));
    if (text) blocks.push({ text, y: currentY });
    return "";
  });

  return blocks;
}

function extractPdfText(buffer: Buffer) {
  const binary = buffer.toString("latin1");
  const streamBlocks: TextBlock[] = [];
  const cmap = extractPdfCMap(binary);

  [...binary.matchAll(/<<(?:.|\n|\r)*?\/Filter\s*\/FlateDecode(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .forEach((match) => {
      try {
        const inflated = zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
        if (!inflated.includes("beginbfchar") && !inflated.includes("beginbfrange")) {
          streamBlocks.push(...extractPdfBlocksFromStream(inflated, cmap));
        }
      } catch {
        // 遇到图片或无法解码的流时跳过，保留后续文本流解析。
      }
    });

  if (streamBlocks.length) {
    return normalizeText(normalizePdfGlyphText(streamBlocks.map((block) => block.text).join("\n")));
  }

  const matches = [...binary.matchAll(/\(([^()]|\\[()nrtbf]){2,}\)|<[\dA-Fa-f]{4,}>/g)]
    .map((match) => decodePdfTextToken(match[0], cmap));

  return normalizeText(normalizePdfGlyphText(matches.join("\n")));
}

function parseDelimitedItemLine(line: string) {
  const delimited = line.match(/^\s*(?:\d+[.、])?\s*([^|｜\s]+)\s*[|｜]\s*([^|｜]+)\s*[|｜]\s*([^|｜]+)?\s*[|｜]\s*(\d+(?:\.\d+)?)\s*$/);
  if (delimited) {
    return {
      skuCode: normalizeText(delimited[1]),
      skuName: normalizeText(delimited[2]),
      spec: normalizeText(delimited[3]),
      quantity: delimited[4],
    };
  }

  const compact = line.match(/(?:编码|物品编码|SKU)[:：\s]*([A-Za-z0-9-]+).*?(?:名称|品名)[:：\s]*([^，,;；\n]+).*?(?:规格)[:：\s]*([^，,;；\n]+)?.*?(?:数量|发货数量)[:：\s]*(\d+(?:\.\d+)?)/);
  if (!compact) return null;

  return {
    skuCode: normalizeText(compact[1]),
    skuName: normalizeText(compact[2]),
    spec: normalizeText(compact[3]),
    quantity: compact[4],
  };
}

function parseSequentialItemBlocks(sourceText: string) {
  const lines = sourceText
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const rows: LlmStructuredOrder[] = [];
  const externalCode = sourceText.match(/(?:单据编号|配送单号|订单号)[:：\s]*([A-Za-z0-9=-]+)/)?.[1] || "";
  const storeName = sourceText.match(/(?:收货机构|收货门店|门店)[:：\s]*([^\n]+)/)?.[1] || "";
  const receiverName = sourceText.match(/(?:收件人|收货人|联系人|姓名)[:：\s]*([^\n，,;；\d]{2,10})/)?.[1] || "";
  const receiverPhone = sourceText.match(/1\d{10}/)?.[0] || "";
  const receiverAddress = sourceText.match(/(?:收件地址|收货地址|地址)[:：\s]*([^\n]+?)(?:备注|签字|电话|$)/)?.[1] || "";

  for (let index = 0; index < lines.length; index += 1) {
    const code = lines[index];
    if (!/^[A-Za-z][A-Za-z0-9=/-]{4,}$/.test(code)) continue;

    const skuName = lines[index + 1] || "";
    const spec = lines[index + 2] || "";
    const quantityCandidates = lines
      .slice(index + 3, index + 8)
      .map((line) => line.match(/^\d+(?:\.\d+)?$/)?.[0] || "")
      .filter(Boolean);
    const quantity = quantityCandidates[quantityCandidates.length - 1] || "";

    if (!skuName || !quantity) continue;

    rows.push({
      externalCode: externalCode || code,
      storeName: normalizeText(storeName),
      receiverName: normalizeText(receiverName),
      receiverPhone,
      receiverAddress: normalizeText(receiverAddress),
      skuCode: code,
      skuName,
      spec,
      quantity,
    });
  }

  return rows;
}

function structureTextWithRules(fileName: string, sourceText: string) {
  const rows: LlmStructuredOrder[] = [];
  const blocks = sourceText
    .split(/(?:━{3,}|-{5,}|={5,}|配送签收单|出库单|配送单)/)
    .map((block) => normalizeText(block))
    .filter(Boolean);

  (blocks.length ? blocks : [sourceText]).forEach((block, blockIndex) => {
    const storeName = block.match(/(?:收货门店|门店|收货机构|调入门店)[:：\s]*([^\n，,;；]+)/)?.[1] || "";
    const receiverName = block.match(/(?:收件人|收货人|联系人|姓名)[:：\s]*([^\n，,;；\d]{2,10})/)?.[1] || "";
    const receiverPhone = block.match(/1\d{10}/)?.[0] || "";
    const receiverAddress =
      block.match(/(?:收件地址|收货地址|地址)[:：\s]*([^\n]+?)(?:备注|签字|电话|$)/)?.[1] ||
      block.match(/((?:北京市|上海市|天津市|重庆市|[^，,;；\s]+省|[^，,;；\s]+市)[^\n，,;；]{6,})/)?.[1] ||
      "";
    const externalCode = block.match(/(?:外部编码|配送单号|订单号|单据号|签收单号)[:：\s]*([A-Za-z0-9-]+)/)?.[1] || `text-${blockIndex + 1}`;

    block.split(/\n+/).forEach((line) => {
      const item = parseDelimitedItemLine(line);
      if (!item) return;
      rows.push({
        externalCode,
        storeName: normalizeText(storeName),
        receiverName: normalizeText(receiverName),
        receiverPhone,
        receiverAddress: normalizeText(receiverAddress),
        ...item,
      });
    });
  });

  const fallbackRows = rows.length ? rows : parseSequentialItemBlocks(sourceText);

  return finalizeStructuredPayload(fileName, sourceText, normalizeStructuredRows(fallbackRows), [
    fallbackRows.length ? "未配置大模型或模型未返回内容时，已使用文本规则兜底抽取可识别的明细行。" : "文本规则未识别到完整明细，建议配置可返回内容的大模型 API 后重试。",
  ]);
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

  let response: LlmStructuredResponse | null = null;

  try {
    response = await callConfiguredLlmJson<LlmStructuredResponse>(
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
  } catch {
    return structureTextWithRules(fileName, sourceText);
  }

  const rows = normalizeStructuredRows(Array.isArray(response.rows) ? response.rows : []);

  return finalizeStructuredPayload(fileName, sourceText, rows, response.assumptions || []);
}
