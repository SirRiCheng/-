import { NextResponse } from "next/server";
import { parseWorkbookBuffer } from "@/lib/excel/parser";

export const runtime = "nodejs";

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
    const payload = parseWorkbookBuffer(Buffer.from(arrayBuffer), String(file.name || "upload.xlsx"));

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
