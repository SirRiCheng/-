import mysql from "mysql2/promise";

const schemaQueries = [
  `
    CREATE TABLE IF NOT EXISTS template_mappings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      template_signature VARCHAR(1024) NOT NULL,
      template_name VARCHAR(255) NOT NULL DEFAULT '',
      headers_json JSON NOT NULL,
      mapping_json JSON NOT NULL,
      rule_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_template_signature (template_signature(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS import_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      template_signature VARCHAR(1024) NOT NULL,
      total_rows INT NOT NULL DEFAULT 0,
      success_rows INT NOT NULL DEFAULT 0,
      failed_rows INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      error_summary TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS import_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      sheet_name VARCHAR(255) NOT NULL DEFAULT '',
      template_signature VARCHAR(1024) NOT NULL,
      payload_json JSON NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'parsed',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_template_signature (template_signature(255)),
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS shipments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      external_code VARCHAR(255) NULL,
      store_name VARCHAR(255) NOT NULL DEFAULT '',
      receiver_name VARCHAR(255) NOT NULL,
      receiver_phone VARCHAR(32) NOT NULL,
      receiver_address TEXT NOT NULL,
      sku_code VARCHAR(255) NOT NULL,
      sku_name VARCHAR(255) NOT NULL,
      quantity DECIMAL(12, 2) NOT NULL DEFAULT 0,
      spec VARCHAR(255) NULL,
      remark TEXT NULL,
      import_job_id BIGINT UNSIGNED NULL,
      source_template_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_external_code (external_code),
      INDEX idx_store_name (store_name),
      INDEX idx_receiver_name (receiver_name),
      INDEX idx_sku_code (sku_code),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
];

function hasValue(input?: string) {
  return Boolean(input && input.trim());
}

export function getConnectionOptions() {
  const isTiDB = hasValue(process.env.TIDB_HOST);
  const user = process.env.TIDB_USER || process.env.MYSQL_USER || "root";
  const password = process.env.TIDB_PASSWORD || process.env.MYSQL_PASSWORD || "";
  const database =
    process.env.TIDB_DATABASE || process.env.MYSQL_DATABASE || "universal_excel_importer";

  const options: mysql.PoolOptions = {
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    dateStrings: true,
    charset: "utf8mb4",
  };

  if (isTiDB) {
    options.host = process.env.TIDB_HOST;
    options.port = Number(process.env.TIDB_PORT || 4000);
    options.ssl = {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    };
    return options;
  }

  if (hasValue(process.env.MYSQL_SOCKET)) {
    options.socketPath = process.env.MYSQL_SOCKET;
    return options;
  }

  options.host = process.env.MYSQL_HOST || "127.0.0.1";
  options.port = Number(process.env.MYSQL_PORT || 3306);
  return options;
}

export function isDatabaseConfigured() {
  return hasValue(process.env.TIDB_HOST) || hasValue(process.env.MYSQL_HOST) || hasValue(process.env.MYSQL_SOCKET);
}

export function assertDatabaseConfigured() {
  if (!isDatabaseConfigured()) {
    throw new Error("数据库未配置，请在 .env.local 配置 TIDB_HOST 或 MYSQL_HOST/MYSQL_SOCKET。");
  }
}

let pool: mysql.Pool | null = null;
let schemaPromise: Promise<void> | undefined;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(getConnectionOptions());
  }
  return pool;
}

export async function ensureSchema() {
  assertDatabaseConfigured();

  if (!schemaPromise) {
    schemaPromise = (async () => {
      const activePool = getPool();
      for (const query of schemaQueries) {
        await activePool.query(query);
      }
      await migrateExistingSchema(activePool);
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }

  await schemaPromise;
}

async function hasColumn(activePool: mysql.Pool, tableName: string, columnName: string) {
  const [rows] = await activePool.query(
    `
      SELECT COUNT(*) AS total
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND COLUMN_NAME = :columnName
    `,
    { tableName, columnName },
  );
  const [{ total }] = rows as Array<{ total: number }>;
  return total > 0;
}

async function hasIndex(activePool: mysql.Pool, tableName: string, indexName: string) {
  const [rows] = await activePool.query(
    `
      SELECT COUNT(*) AS total
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND INDEX_NAME = :indexName
    `,
    { tableName, indexName },
  );
  const [{ total }] = rows as Array<{ total: number }>;
  return total > 0;
}

async function addColumnIfMissing(activePool: mysql.Pool, tableName: string, columnName: string, definition: string) {
  if (await hasColumn(activePool, tableName, columnName)) return;
  await activePool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

async function migrateExistingSchema(activePool: mysql.Pool) {
  await addColumnIfMissing(activePool, "template_mappings", "rule_json", "rule_json JSON NULL");
  await addColumnIfMissing(activePool, "import_sessions", "status", "status VARCHAR(32) NOT NULL DEFAULT 'parsed'");
  await addColumnIfMissing(activePool, "shipments", "store_name", "store_name VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnIfMissing(activePool, "shipments", "sku_code", "sku_code VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnIfMissing(activePool, "shipments", "sku_name", "sku_name VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnIfMissing(activePool, "shipments", "quantity", "quantity DECIMAL(12, 2) NOT NULL DEFAULT 0");
  await addColumnIfMissing(activePool, "shipments", "spec", "spec VARCHAR(255) NULL");

  // 兼容旧版 V1 表：旧必填列不再写入，但需要默认值避免 INSERT 失败。
  for (const columnName of ["sender_name", "sender_phone", "temperature"]) {
    if (await hasColumn(activePool, "shipments", columnName)) {
      await activePool.query(`ALTER TABLE shipments ALTER COLUMN ${columnName} SET DEFAULT ''`);
    }
  }
  if (await hasColumn(activePool, "shipments", "sender_address")) {
    await activePool.query("ALTER TABLE shipments MODIFY COLUMN sender_address TEXT NULL");
  }

  if (await hasIndex(activePool, "shipments", "uk_external_code")) {
    await activePool.query("ALTER TABLE shipments DROP INDEX uk_external_code");
  }
}
