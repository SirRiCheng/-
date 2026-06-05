import { NextResponse } from "next/server";
import { demoOrders } from "@/lib/mock-data";
import { ensureSchema, getPool, isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("pageSize") || 20);

  if (!isDatabaseConfigured()) {
    const filtered = demoOrders.filter((order) => {
      const haystack = `${order.externalCode || ""} ${order.storeName} ${order.receiverName} ${order.skuCode} ${order.skuName}`;
      return haystack.includes(keyword);
    });

    return NextResponse.json({
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
      mock: true,
    });
  }

  try {
    await ensureSchema();
    const pool = getPool();
    const likeKeyword = `%${keyword}%`;

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
        WHERE (
          :keyword = ''
          OR external_code LIKE :likeKeyword
          OR store_name LIKE :likeKeyword
          OR receiver_name LIKE :likeKeyword
          OR sku_code LIKE :likeKeyword
          OR sku_name LIKE :likeKeyword
        )
        ORDER BY id DESC
        LIMIT :limit OFFSET :offset
      `,
      {
        keyword,
        likeKeyword,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
    );

    const [countRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM shipments
        WHERE (
          :keyword = ''
          OR external_code LIKE :likeKeyword
          OR store_name LIKE :likeKeyword
          OR receiver_name LIKE :likeKeyword
          OR sku_code LIKE :likeKeyword
          OR sku_name LIKE :likeKeyword
        )
      `,
      { keyword, likeKeyword },
    );

    const [{ total }] = countRows as Array<{ total: number }>;

    return NextResponse.json({
      items: rows,
      total,
      page,
      pageSize,
      mock: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "运单列表查询失败。" },
      { status: 500 },
    );
  }
}
