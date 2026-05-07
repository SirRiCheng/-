import { NextResponse } from "next/server";
import { demoOrders } from "@/lib/mock-data";
import { ensureSchema, getPool, isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: { id: string };
  },
) {
  const id = Number(context.params.id);

  if (!isDatabaseConfigured()) {
    const order = demoOrders.find((item) => item.id === id);
    if (!order) {
      return NextResponse.json({ error: "记录不存在。" }, { status: 404 });
    }
    return NextResponse.json(order);
  }

  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT
          id,
          external_code AS externalCode,
          sender_name AS senderName,
          sender_phone AS senderPhone,
          sender_address AS senderAddress,
          receiver_name AS receiverName,
          receiver_phone AS receiverPhone,
          receiver_address AS receiverAddress,
          weight,
          package_count AS packageCount,
          temperature,
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
      { error: error instanceof Error ? error.message : "查询详情失败。" },
      { status: 500 },
    );
  }
}
