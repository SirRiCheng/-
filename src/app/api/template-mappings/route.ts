import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDatabaseConfigured } from "@/lib/db";
import { TemplateMappingRecord } from "@/lib/types";

export const runtime = "nodejs";

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toTemplateMappingRecord(record: Record<string, unknown>): TemplateMappingRecord {
  return {
    id: Number(record.id),
    templateSignature: String(record.template_signature || ""),
    templateName: String(record.template_name || ""),
    headers: parseJsonValue<string[]>(record.headers_json, []),
    mapping: parseJsonValue<TemplateMappingRecord["mapping"]>(record.mapping_json, {}),
    rule: record.rule_json ? parseJsonValue<TemplateMappingRecord["rule"]>(record.rule_json, undefined) : undefined,
    createdAt: String(record.created_at || ""),
    updatedAt: String(record.updated_at || ""),
  };
}

function getRecordSortTime(record: TemplateMappingRecord) {
  return Date.parse(record.updatedAt || record.createdAt || "") || Number(record.id) || 0;
}

function dedupeTemplateMappingRecords(records: TemplateMappingRecord[]) {
  const deduped = new Map<string, TemplateMappingRecord>();

  records.forEach((record) => {
    const templateSignature = record.templateSignature.trim();
    if (!templateSignature) return;

    const previousRecord = deduped.get(templateSignature);
    if (!previousRecord || getRecordSortTime(record) >= getRecordSortTime(previousRecord)) {
      deduped.set(templateSignature, {
        ...record,
        templateSignature,
      });
    }
  });

  return [...deduped.values()].sort((left, right) => getRecordSortTime(right) - getRecordSortTime(left));
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ items: [], saved: false, reason: "数据库未配置。" });
  }

  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT id, template_signature, template_name, headers_json, mapping_json, rule_json, created_at, updated_at
        FROM template_mappings
        ORDER BY updated_at DESC, id DESC
      `,
    );

    return NextResponse.json({
      items: dedupeTemplateMappingRecords((rows as Array<Record<string, unknown>>).map(toTemplateMappingRecord)),
      saved: true,
    });
  } catch (error) {
    return NextResponse.json({
      items: [],
      saved: false,
      reason: error instanceof Error ? error.message : "查询模板映射失败。",
    });
  }
}

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

    await pool.query("DELETE FROM template_mappings WHERE template_signature = :templateSignature", {
      templateSignature,
    });
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
    return NextResponse.json({
      saved: false,
      reason: error instanceof Error ? error.message : "保存模板映射失败。",
    });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const templateSignature = searchParams.get("templateSignature");

  if (!templateSignature) {
    return NextResponse.json({ error: "缺少 templateSignature。" }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ deleted: false, reason: "数据库未配置。" });
  }

  try {
    await ensureSchema();
    const pool = getPool();
    await pool.query("DELETE FROM template_mappings WHERE template_signature = :templateSignature", {
      templateSignature,
    });
    return NextResponse.json({ deleted: true, templateSignature });
  } catch (error) {
    return NextResponse.json({
      deleted: false,
      reason: error instanceof Error ? error.message : "删除模板映射失败。",
    });
  }
}
