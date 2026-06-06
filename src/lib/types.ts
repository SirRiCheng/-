export const shipmentFields = [
  "externalCode",
  "storeName",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "skuCode",
  "skuName",
  "quantity",
  "spec",
  "remark",
] as const;

export type ShipmentField = (typeof shipmentFields)[number];

export type ShipmentRow = {
  rowNumber: number;
  externalCode?: string;
  storeName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  skuCode: string;
  skuName: string;
  quantity: number | "";
  spec?: string;
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
  matchedBy: "alias" | "saved-template" | "manual" | "ai-generated";
  confidence: number;
  missingFields: ShipmentField[];
  signature: string;
  rule?: ParseRule;
};

export type TemplateMappingRecord = {
  id?: number;
  templateSignature: string;
  templateName?: string;
  headers: string[];
  mapping: FieldMapping;
  rule?: ParseRule;
  createdAt?: string;
  updatedAt?: string;
};

export type ParseRule = {
  id?: string;
  name: string;
  description: string;
  fileTypes: Array<"excel" | "word" | "pdf" | "text">;
  fieldMapping: FieldMapping;
  operations: Array<
    | "skip_headers"
    | "tail_info_extract"
    | "cross_row_group"
    | "matrix_transpose"
    | "multi_sheet_merge"
    | "card_split"
    | "plain_text_extract"
    | "compound_cell_split"
    | "pdf_order_split"
  >;
  groupBy?: ShipmentField;
  confidence: number;
  assumptions: string[];
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

export type ShipmentDetailResponse = {
  order: ShipmentRecord;
  skuRows: ShipmentRecord[];
  importJob?: ImportJobRecord | null;
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
