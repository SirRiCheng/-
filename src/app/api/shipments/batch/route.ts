import { NextResponse } from "next/server";
import { assertDatabaseConfigured, ensureSchema, getPool, getPublicDatabaseError } from "@/lib/db";
import { sendDingTalkNotification } from "@/lib/dingtalk";
import { ShipmentRow, SubmitBatchResult } from "@/lib/types";
import { detectDuplicateExternalCodes, validateShipmentRow } from "@/lib/validators/shipment";

export const runtime = "nodejs";

const INSERT_CHUNK_SIZE = 100;

async function notifyImportResult(title: string, lines: string[]) {
  try {
    await sendDingTalkNotification({
      title,
      text: lines.join("\n\n"),
    });
  } catch {
    // 预警通道不能影响导入主流程；失败时由接口返回和日志排查。
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = (body.rows || []) as ShipmentRow[];
    const fileName = String(body.fileName || "manual-submit.xlsx");
    const templateSignature = String(body.templateSignature || "manual");
    const importSessionId = Number(body.importSessionId || 0);

    if (!rows.length) {
      return NextResponse.json({ error: "提交数据为空。" }, { status: 400 });
    }

    const issues = [...rows.flatMap(validateShipmentRow), ...detectDuplicateExternalCodes(rows)];
    if (issues.length) {
      await notifyImportResult("批量下单校验失败", [
        `- 文件：${fileName}`,
        `- 模板：${templateSignature}`,
        `- 错误数：${issues.length}`,
      ]);
      return NextResponse.json({ error: "存在错误行，禁止提交。", issues }, { status: 400 });
    }

    assertDatabaseConfigured();
    await ensureSchema();
    const pool = getPool();
    const externalCodes = Array.from(new Set(rows.map((row) => row.externalCode).filter(Boolean)));

    if (externalCodes.length) {
      const [existingRows] = await pool.query(
        `
          SELECT external_code AS externalCode, sku_code AS skuCode
          FROM shipments
          WHERE external_code IN (:externalCodes)
        `,
        { externalCodes },
      );
      const existingPairs = new Set(
        (existingRows as Array<{ externalCode: string; skuCode: string }>).map(
          (row) => `${row.externalCode}::${row.skuCode}`,
        ),
      );
      const duplicateRows = rows
        .filter((row) => row.externalCode && existingPairs.has(`${row.externalCode}::${row.skuCode}`))
        .map((row) => ({
          rowNumber: row.rowNumber,
          reason: `数据库已存在相同外部编码和SKU：${row.externalCode} / ${row.skuCode}`,
        }));

      if (duplicateRows.length) {
        await notifyImportResult("批量下单重复拦截", [
          `- 文件：${fileName}`,
          `- 模板：${templateSignature}`,
          `- 重复行数：${duplicateRows.length}`,
        ]);
        return NextResponse.json(
          {
            error: "存在与数据库重复的外部编码和SKU，禁止提交。",
            failedRows: duplicateRows,
          },
          { status: 400 },
        );
      }
    }

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
                  store_name,
                  receiver_name,
                  receiver_phone,
                  receiver_address,
                  sku_code,
                  sku_name,
                  quantity,
                  spec,
                  remark,
                  import_job_id
                ) VALUES (
                  :externalCode,
                  :storeName,
                  :receiverName,
                  :receiverPhone,
                  :receiverAddress,
                  :skuCode,
                  :skuName,
                  :quantity,
                  :spec,
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

      if (importSessionId) {
        await connection.query(
          `
            UPDATE import_sessions
            SET status = 'submitted'
            WHERE id = :importSessionId
          `,
          { importSessionId },
        );
      }

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

      await notifyImportResult(failedRows.length ? "批量下单部分失败" : "批量下单完成", [
        `- 文件：${fileName}`,
        `- 模板：${templateSignature}`,
        `- 任务ID：${importJobId}`,
        `- 成功：${successRows}`,
        `- 失败：${failedRows.length}`,
        `- 分批：${processedChunks}/${totalChunks}`,
      ]);

      return NextResponse.json(result);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const publicError = getPublicDatabaseError(error, "批量提交失败。");
    await notifyImportResult("批量下单写入失败", [
      `- 原因：${publicError}`,
    ]);
    return NextResponse.json(
      { error: publicError },
      { status: 500 },
    );
  }
}
