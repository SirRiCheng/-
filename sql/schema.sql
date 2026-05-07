CREATE DATABASE IF NOT EXISTS universal_excel_importer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE universal_excel_importer;

CREATE TABLE IF NOT EXISTS template_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_signature VARCHAR(1024) NOT NULL,
  template_name VARCHAR(255) NOT NULL DEFAULT '',
  headers_json JSON NOT NULL,
  mapping_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_template_signature (template_signature(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
