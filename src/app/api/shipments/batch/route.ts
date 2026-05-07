import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDatabaseConfigured } from "@/lib/db";
import { ShipmentRow, SubmitBatchResult } from "@/lib/types";
import { detectDuplicateExternalCodes, validateShipmentRow } from "@/lib/validators/shipment";

export const runtime = "nodejs";

const INSERT_CHUNK_SIZE = 100;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = (body.rows || []) as ShipmentRow[];
    const fileName = String(body.fileName || "manual-submit.xlsx");
    const templateSignature = String(body.templateSignature || "manual");

    if (!rows.length) {
      return NextResponse.json({ error: "提交数据为空。" }, { status: 400 });
    }

    const issues = [...rows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(rows)];
    if (issues.length) {
      return NextResponse.json({ error: "存在错误行，禁止提交。", issues }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        saved: false,
        reason: "数据库未配置，当前仅完成本地开发骨架。",
        totals: { totalRows: rows.length, successRows: 0, failedRows: rows.length },
        progress: {
          chunkSize: INSERT_CHUNK_SIZE,
          totalChunks: Math.max(1, Math.ceil(rows.length / INSERT_CHUNK_SIZE)),
          processedChunks: 0,
        },
      });
    }

    await ensureSchema();
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [jobResult] = await connection.query(
        `
          INSERT INTO import_jobs (
            file_name, template_signature, total_rows, success_rows, failed_rows, status
          ) VALUES (
            :fileName, :templateSignature, :totalRows, 0, 0, 'pending'
          )
        `,
        {
          fileName,
          templateSignature,
          totalRows: rows.length,
        },
      );

      const importJobId = Number((jobResult as { insertId: number }).insertId);
      let successRows = 0;
      const failedRows: Array<{ rowNumber: number; reason: string }> = [];
      let processedChunks = 0;
      const totalChunks = Math.max(1, Math.ceil(rows.length / INSERT_CHUNK_SIZE));

      for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
        const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);

        for (const row of chunk) {
          try {
            await connection.query(
              `
                INSERT INTO shipments (
                  external_code,
                  sender_name,
                  sender_phone,
                  sender_address,
                  receiver_name,
                  receiver_phone,
                  receiver_address,
                  weight,
                  package_count,
                  temperature,
                  remark,
                  import_job_id
                ) VALUES (
                  :externalCode,
                  :senderName,
                  :senderPhone,
                  :senderAddress,
                  :receiverName,
                  :receiverPhone,
                  :receiverAddress,
                  :weight,
                  :packageCount,
                  :temperature,
                  :remark,
                  :importJobId
                )
              `,
              {
                ...row,
                importJobId,
              },
            );
            successRows += 1;
          } catch (error) {
            failedRows.push({
              rowNumber: row.rowNumber,
              reason: error instanceof Error ? error.message : "插入失败",
            });
          }
        }

        processedChunks += 1;
      }

      await connection.query(
        `
          UPDATE import_jobs
          SET success_rows = :successRows,
              failed_rows = :failedRows,
              status = :status,
              error_summary = :errorSummary
          WHERE id = :id
        `,
        {
          id: importJobId,
          successRows,
          failedRows: failedRows.length,
          status: failedRows.length ? "partial_failed" : "completed",
          errorSummary: failedRows.length ? JSON.stringify(failedRows) : null,
        },
      );

      await connection.commit();

      const result: SubmitBatchResult = {
        saved: true,
        importJobId,
        totals: {
          totalRows: rows.length,
          successRows,
          failedRows: failedRows.length,
        },
        failedRows,
        progress: {
          chunkSize: INSERT_CHUNK_SIZE,
          totalChunks,
          processedChunks,
        },
      };

      return NextResponse.json(result);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量提交失败。" },
      { status: 500 },
    );
  }
}
