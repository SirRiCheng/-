import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { templateSignature, templateName = "", headers = [], mapping = {}, rule = null } = body;

    if (!templateSignature) {
      return NextResponse.json({ error: "templateSignature 必填。" }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        saved: false,
        reason: "数据库未配置，当前仅完成本地页面和 API 骨架。",
      });
    }

    await ensureSchema();
    const pool = getPool();

    await pool.query(
      `
        INSERT INTO template_mappings (template_signature, template_name, headers_json, mapping_json, rule_json)
        VALUES (:templateSignature, :templateName, :headersJson, :mappingJson, :ruleJson)
      `,
      {
        templateSignature,
        templateName,
        headersJson: JSON.stringify(headers),
        mappingJson: JSON.stringify(mapping),
        ruleJson: rule ? JSON.stringify(rule) : null,
      },
    );

    return NextResponse.json({ saved: true, templateSignature });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存模板映射失败。" },
      { status: 500 },
    );
  }
}
