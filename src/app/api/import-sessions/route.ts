import { NextResponse } from "next/server";
import { assertDatabaseConfigured, ensureSchema, getPool } from "@/lib/db";
import { ParsedImportPayload } from "@/lib/types";

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

function toImportSession(record: Record<string, unknown>) {
  const payload = parseJsonValue<ParsedImportPayload | null>(record.payload_json, null);

  return {
    id: Number(record.id),
    payload,
    createdAt: String(record.created_at || ""),
    updatedAt: String(record.updated_at || ""),
  };
}

export async function GET(request: Request) {
  try {
    assertDatabaseConfigured();
    await ensureSchema();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const pool = getPool();
    const [rows] = await pool.query(
      id
        ? `
          SELECT id, payload_json, created_at, updated_at
          FROM import_sessions
          WHERE id = :id
          LIMIT 1
        `
        : `
          SELECT id, payload_json, created_at, updated_at
          FROM import_sessions
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `,
      id ? { id } : {},
    );
    const [record] = rows as Array<Record<string, unknown>>;

    if (!record) {
      return NextResponse.json({ error: "解析会话不存在。" }, { status: 404 });
    }

    return NextResponse.json(toImportSession(record));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析会话查询失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertDatabaseConfigured();
    const payload = (await request.json()) as ParsedImportPayload;

    if (!payload?.fileName || !payload.template?.signature) {
      return NextResponse.json({ error: "解析结果缺少文件名或模板签名。" }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    const [result] = await pool.query(
      `
        INSERT INTO import_sessions (
          file_name, sheet_name, template_signature, payload_json, status
        ) VALUES (
          :fileName, :sheetName, :templateSignature, :payloadJson, 'parsed'
        )
      `,
      {
        fileName: payload.fileName,
        sheetName: payload.sheetName,
        templateSignature: payload.template.signature,
        payloadJson: JSON.stringify(payload),
      },
    );

    return NextResponse.json({ saved: true, id: Number((result as { insertId: number }).insertId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析会话保存失败。" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertDatabaseConfigured();
    const body = (await request.json()) as { id?: number; payload?: ParsedImportPayload };

    if (!body.id || !body.payload?.fileName || !body.payload.template?.signature) {
      return NextResponse.json({ error: "缺少解析会话 ID 或有效解析结果。" }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    await pool.query(
      `
        UPDATE import_sessions
        SET file_name = :fileName,
            sheet_name = :sheetName,
            template_signature = :templateSignature,
            payload_json = :payloadJson,
            status = 'edited'
        WHERE id = :id
      `,
      {
        id: body.id,
        fileName: body.payload.fileName,
        sheetName: body.payload.sheetName,
        templateSignature: body.payload.template.signature,
        payloadJson: JSON.stringify(body.payload),
      },
    );

    return NextResponse.json({ saved: true, id: body.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析会话更新失败。" },
      { status: 500 },
    );
  }
}
