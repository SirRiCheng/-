import { NextResponse } from "next/server";
import { parseWorkbookBuffer } from "@/lib/excel/parser";
import { buildRuleFromTemplate } from "@/lib/rules/rule-engine";
import { shipmentFields, TemplateMatchResult } from "@/lib/types";

export const runtime = "nodejs";

function createRuleOnlyPayload(fileName: string) {
  const template: TemplateMatchResult = {
    mapping: {},
    matchedBy: "ai-generated",
    confidence: 0,
    missingFields: shipmentFields.filter((field) => field !== "externalCode" && field !== "remark" && field !== "spec"),
    signature: `rule-only:${fileName}`,
  };
  const rule = buildRuleFromTemplate(fileName, [], template);

  return {
    fileName,
    sheetName: "文本预处理",
    headers: [],
    template: {
      ...template,
      rule,
    },
    rows: [],
    issues: [],
    totals: {
      parsedRows: 0,
      errorRows: 0,
    },
    performance: {
      chunkSize: 200,
      totalChunks: 1,
      recommendedPageSize: 100,
      largeDataset: false,
    },
    sourceRows: [],
    dataStartRowNumber: 1,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (
      !file ||
      typeof file !== "object" ||
      !("arrayBuffer" in file) ||
      typeof file.arrayBuffer !== "function" ||
      !("name" in file)
    ) {
      return NextResponse.json({ error: "缺少上传文件。" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileName = String(file.name || "upload.xlsx");
    const isExcel = /\.(xlsx|xls)$/i.test(fileName);
    const payload = isExcel
      ? parseWorkbookBuffer(Buffer.from(arrayBuffer), fileName)
      : createRuleOnlyPayload(fileName);

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "解析失败，请检查 Excel 内容。",
      },
      { status: 400 },
    );
  }
}
