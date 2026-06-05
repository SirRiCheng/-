import { TemplateMappingRecord } from "@/lib/types";

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
