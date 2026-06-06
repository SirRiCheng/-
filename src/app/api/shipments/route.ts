import { NextResponse } from "next/server";
import { assertDatabaseConfigured, ensureSchema, getPool, getPublicDatabaseError } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("pageSize") || 20);

  try {
    assertDatabaseConfigured();
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
        AND (:dateFrom = '' OR created_at >= :dateFrom)
        AND (:dateTo = '' OR created_at < DATE_ADD(:dateTo, INTERVAL 1 DAY))
        ORDER BY id DESC
        LIMIT :limit OFFSET :offset
      `,
      {
        keyword,
        likeKeyword,
        dateFrom,
        dateTo,
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
        AND (:dateFrom = '' OR created_at >= :dateFrom)
        AND (:dateTo = '' OR created_at < DATE_ADD(:dateTo, INTERVAL 1 DAY))
      `,
      { keyword, likeKeyword, dateFrom, dateTo },
    );

    const [{ total }] = countRows as Array<{ total: number }>;

    return NextResponse.json({
      items: rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    return NextResponse.json(
      { error: getPublicDatabaseError(error, "运单列表查询失败。") },
      { status: 500 },
    );
  }
}
