export const shipmentFields = [
  "externalCode",
  "senderName",
  "senderPhone",
  "senderAddress",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "weight",
  "packageCount",
  "temperature",
  "remark",
] as const;

export type ShipmentField = (typeof shipmentFields)[number];

export type TemperatureOption = "ambient" | "chilled" | "frozen";

export type ShipmentRow = {
  rowNumber: number;
  externalCode?: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  weight: number | "";
  packageCount: number | "";
  temperature: TemperatureOption | "";
  remark?: string;
};

export type ValidationIssue = {
  rowNumber: number;
  field: ShipmentField;
  message: string;
  level: "error" | "warning";
};

export type FieldMapping = Partial<Record<ShipmentField, string>>;

export type TemplateMatchResult = {
  mapping: FieldMapping;
  matchedBy: "alias" | "saved-template" | "manual";
  confidence: number;
  missingFields: ShipmentField[];
  signature: string;
};

export type TemplateMappingRecord = {
  id?: number;
  templateSignature: string;
  templateName?: string;
  headers: string[];
  mapping: FieldMapping;
  createdAt?: string;
  updatedAt?: string;
};

export type ParsedImportPayload = {
  fileName: string;
  sheetName: string;
  headers: string[];
  template: TemplateMatchResult;
  rows: ShipmentRow[];
  issues: ValidationIssue[];
  sourceRows: Array<Record<string, unknown>>;
  dataStartRowNumber: number;
  totals: {
    parsedRows: number;
    errorRows: number;
  };
  performance: {
    chunkSize: number;
    totalChunks: number;
    recommendedPageSize: number;
    largeDataset: boolean;
  };
};

export type StoredImportSession = ParsedImportPayload & {
  savedAt: string;
};

export type ShipmentRecord = ShipmentRow & {
  id: number;
  importJobId?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportJobRecord = {
  id: number;
  fileName: string;
  templateSignature: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  status: "pending" | "completed" | "partial_failed";
  errorSummary?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubmitBatchResult = {
  saved: boolean;
  importJobId?: number;
  totals: {
    totalRows: number;
    successRows: number;
    failedRows: number;
  };
  failedRows?: Array<{ rowNumber: number; reason: string }>;
  progress?: {
    chunkSize: number;
    totalChunks: number;
    processedChunks: number;
  };
  reason?: string;
};

export type ImportProgressState = {
  phase: "idle" | "uploading" | "mapping" | "ready" | "submitting" | "done";
  percent: number;
  message: string;
  current?: number;
  total?: number;
};
