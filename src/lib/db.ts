import mysql from "mysql2/promise";

const schemaQueries = [
  `
    CREATE TABLE IF NOT EXISTS template_mappings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      template_signature VARCHAR(1024) NOT NULL,
      template_name VARCHAR(255) NOT NULL DEFAULT '',
      headers_json JSON NOT NULL,
      mapping_json JSON NOT NULL,
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
    CREATE TABLE IF NOT EXISTS shipments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      external_code VARCHAR(255) NULL,
      sender_name VARCHAR(255) NOT NULL,
      sender_phone VARCHAR(32) NOT NULL,
      sender_address TEXT NOT NULL,
      receiver_name VARCHAR(255) NOT NULL,
      receiver_phone VARCHAR(32) NOT NULL,
      receiver_address TEXT NOT NULL,
      weight DECIMAL(10, 2) NOT NULL DEFAULT 0,
      package_count INT NOT NULL DEFAULT 0,
      temperature VARCHAR(32) NOT NULL,
      remark TEXT NULL,
      import_job_id BIGINT UNSIGNED NULL,
      source_template_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_external_code (external_code),
      INDEX idx_receiver_name (receiver_name),
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

let pool: mysql.Pool | null = null;
let schemaPromise: Promise<void> | undefined;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(getConnectionOptions());
  }
  return pool;
}

export async function ensureSchema() {
  if (!isDatabaseConfigured()) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      const activePool = getPool();
      for (const query of schemaQueries) {
        await activePool.query(query);
      }
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }

  await schemaPromise;
}
