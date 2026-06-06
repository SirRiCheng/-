import { NextResponse } from "next/server";
import { assertDatabaseConfigured, ensureSchema, getPool, getPublicDatabaseError } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: { id: string };
  },
) {
  const id = Number(context.params.id);

  try {
    assertDatabaseConfigured();
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT
          id,
          external_code AS externalCode,
          store_name AS storeName,
          receiver_name AS receiverName,
          receiver_phone AS receiverPhone,
          receiver_address AS receiverAddress,
          sku_code AS skuCode,
          sku_name AS skuName,
          quantity,
          spec,
          remark,
          import_job_id AS importJobId,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM shipments
        WHERE id = :id
        LIMIT 1
      `,
      { id },
    );

    const [record] = rows as Array<Record<string, unknown>>;
    if (!record) {
      return NextResponse.json({ error: "记录不存在。" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json(
      { error: getPublicDatabaseError(error, "查询详情失败。") },
      { status: 500 },
    );
  }
}
