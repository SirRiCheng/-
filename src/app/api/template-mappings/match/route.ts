import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const templateSignature = searchParams.get("templateSignature");

  if (!templateSignature) {
    return NextResponse.json({ error: "缺少 templateSignature。" }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ matched: false, record: null });
  }

  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT id, template_signature, template_name, headers_json, mapping_json, created_at, updated_at
        FROM template_mappings
        WHERE template_signature = :templateSignature
        ORDER BY id DESC
        LIMIT 1
      `,
      { templateSignature },
    );

    const [record] = rows as Array<Record<string, unknown>>;

    if (!record) {
      return NextResponse.json({ matched: false, record: null });
    }

    return NextResponse.json({ matched: true, record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "模板匹配查询失败。" },
      { status: 500 },
    );
  }
}
