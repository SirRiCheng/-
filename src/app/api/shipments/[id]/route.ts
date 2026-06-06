import { NextResponse } from "next/server";
import { assertDatabaseConfigured, ensureSchema, getPool, getPublicDatabaseError } from "@/lib/db";
import { ShipmentRecord } from "@/lib/types";

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

    const [record] = rows as ShipmentRecord[];
    if (!record) {
      return NextResponse.json({ error: "记录不存在。" }, { status: 404 });
    }

    const importJobId = record.importJobId || null;
    const externalCode = record.externalCode || null;
    const [skuRows] = await pool.query(
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
          (:importJobId IS NOT NULL AND import_job_id = :importJobId)
          OR (:importJobId IS NULL AND import_job_id IS NULL)
        )
        AND (
          (:externalCode IS NOT NULL AND external_code = :externalCode)
          OR (:externalCode IS NULL AND id = :id)
        )
        ORDER BY id ASC
      `,
      {
        id,
        importJobId,
        externalCode,
      },
    );

    const [jobRows] = importJobId
      ? await pool.query(
        `
          SELECT
            id,
            file_name AS fileName,
            template_signature AS templateSignature,
            total_rows AS totalRows,
            success_rows AS successRows,
            failed_rows AS failedRows,
            status,
            error_summary AS errorSummary,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM import_jobs
          WHERE id = :importJobId
          LIMIT 1
        `,
        { importJobId },
      )
      : [[]];

    return NextResponse.json({
      order: record,
      skuRows,
      importJob: (jobRows as Array<Record<string, unknown>>)[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: getPublicDatabaseError(error, "查询详情失败。") },
      { status: 500 },
    );
  }
}
