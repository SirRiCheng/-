import { ParsedImportPayload, StoredImportSession, TemplateMappingRecord } from "@/lib/types";

export const IMPORT_SESSION_KEY = "universal-excel-import-session";
export const MANUAL_MAPPING_KEY = "universal-excel-import-manual-mapping";
export const RULE_RECORDS_KEY = "universal-excel-import-rule-records";

export function saveImportSession(payload: ParsedImportPayload) {
  if (typeof window === "undefined") return;

  const session: StoredImportSession = {
    ...payload,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(IMPORT_SESSION_KEY, JSON.stringify(session));
}

export function loadImportSession() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(IMPORT_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredImportSession;
  } catch {
    return null;
  }
}

export function clearImportSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(IMPORT_SESSION_KEY);
}

export function saveManualMapping(record: TemplateMappingRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANUAL_MAPPING_KEY, JSON.stringify(record));
  upsertRuleRecord(record);
}

export function loadManualMapping() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(MANUAL_MAPPING_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TemplateMappingRecord;
  } catch {
    return null;
  }
}

export function loadRuleRecords() {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(RULE_RECORDS_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as TemplateMappingRecord[];
  } catch {
    return [];
  }
}

export function saveRuleRecords(records: TemplateMappingRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RULE_RECORDS_KEY, JSON.stringify(records));
}

export function upsertRuleRecord(record: TemplateMappingRecord) {
  const now = new Date().toISOString();
  const nextRecord: TemplateMappingRecord = {
    ...record,
    id: record.id || Date.now(),
    createdAt: record.createdAt || now,
    updatedAt: now,
  };
  const records = loadRuleRecords();
  const nextRecords = records.some((item) => item.templateSignature === nextRecord.templateSignature)
    ? records.map((item) => (item.templateSignature === nextRecord.templateSignature ? nextRecord : item))
    : [nextRecord, ...records];

  saveRuleRecords(nextRecords);
  return nextRecord;
}

export function deleteRuleRecord(templateSignature: string) {
  saveRuleRecords(loadRuleRecords().filter((record) => record.templateSignature !== templateSignature));
}
