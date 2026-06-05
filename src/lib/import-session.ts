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

function getRecordSortTime(record: TemplateMappingRecord) {
  return Date.parse(record.updatedAt || record.createdAt || "") || Number(record.id) || 0;
}

export function sanitizeRuleRecords(records: TemplateMappingRecord[]) {
  const deduped = new Map<string, TemplateMappingRecord>();

  records.forEach((record) => {
    const templateSignature = record.templateSignature?.trim();
    if (!templateSignature) return;

    const normalizedRecord: TemplateMappingRecord = {
      ...record,
      templateSignature,
      headers: Array.isArray(record.headers) ? record.headers : [],
      mapping: record.mapping || {},
    };
    const previousRecord = deduped.get(templateSignature);

    if (!previousRecord || getRecordSortTime(normalizedRecord) >= getRecordSortTime(previousRecord)) {
      deduped.set(templateSignature, normalizedRecord);
    }
  });

  return [...deduped.values()].sort((left, right) => getRecordSortTime(right) - getRecordSortTime(left));
}

export function loadRuleRecords() {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(RULE_RECORDS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as TemplateMappingRecord[];
    const records = sanitizeRuleRecords(Array.isArray(parsed) ? parsed : []);
    window.localStorage.setItem(RULE_RECORDS_KEY, JSON.stringify(records));
    return records;
  } catch {
    return [];
  }
}

export function saveRuleRecords(records: TemplateMappingRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RULE_RECORDS_KEY, JSON.stringify(sanitizeRuleRecords(records)));
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
  const nextRecords = sanitizeRuleRecords(records).some((item) => item.templateSignature === nextRecord.templateSignature)
    ? records.map((item) => (item.templateSignature === nextRecord.templateSignature ? nextRecord : item))
    : [nextRecord, ...records];

  saveRuleRecords(sanitizeRuleRecords(nextRecords));
  return nextRecord;
}

export function deleteRuleRecord(templateSignature: string) {
  saveRuleRecords(loadRuleRecords().filter((record) => record.templateSignature !== templateSignature));
}
