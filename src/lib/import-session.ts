import { ParsedImportPayload, StoredImportSession, TemplateMappingRecord } from "@/lib/types";

export const IMPORT_SESSION_KEY = "universal-excel-import-session";
export const MANUAL_MAPPING_KEY = "universal-excel-import-manual-mapping";

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
