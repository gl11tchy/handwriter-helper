// HandwriteCheck - Core Types and Data Models

// ============================================
// Assignment Types
// ============================================

export type HandwritingStyle = "print" | "cursive";
export type PaperType = "ruled" | "blank" | "either";

export type NumberingFormat = "dot" | "paren" | "dash";

export type NumberingRule =
  | { required: false }
  | { required: true; startAt: number; format: NumberingFormat };

export type ExpectedContent = { mode: "perLine"; lines: string[] };

export type AssignmentPayload = {
  version: 1;
  assignmentId: string;
  createdAt: string;
  requiredLineCount: number;
  expectedStyle: HandwritingStyle;
  paperType: PaperType;
  numbering: NumberingRule;
  expectedContent: ExpectedContent;
  precisionMode: "max";
  notifyEmail?: string;
};


// ============================================
// Quality and Findings Types
// ============================================

export type QualityGateStatus = "ok" | "uncertain" | "ungradable";

export type QualityGate = {
  status: QualityGateStatus;
  reasons: string[];
  confidenceCoverage: number; // 0..1
};

export type FindingType =
  | "missing_i_dot"
  | "uncrossed_t"
  | "numbering_error"
  | "content_mismatch"
  | "content_uncertain";

export type BoundingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Finding = {
  id: string;
  pageIndex: number;
  type: FindingType;
  bbox: BoundingBox;
  lineIndex?: number;
  expectedText?: string;
  observedText?: string;
  confidence: number; // 0..1
  message: string;
};

// ============================================
// Scoring Types
// ============================================

export type ScoreBreakdown = {
  completeness: number; // 0..100
  content: number; // 0..100
  handwriting: number; // 0..100
  overall: number; // 0..100
};

// ============================================
// Report Types
// ============================================

export type PageData = {
  width: number;
  height: number;
  imageDataRef: string; // base64 or blob URL
};

export type ExtractedLine = {
  lineIndex: number;
  text: string;
  confidence: number;
  bbox?: BoundingBox;
};

export type InputFileInfo = {
  name: string;
  type: string;
  size: number;
};

export type Report = {
  reportId: string;
  createdAt: string;
  assignmentId: string;
  assignmentPayload: AssignmentPayload;
  inputFile: InputFileInfo;
  pages: PageData[];
  extractedTextPerLine: ExtractedLine[];
  detectedLineCount: number;
  quality: QualityGate;
  findings: Finding[];
  score: ScoreBreakdown;
};

// ============================================
// Processing Pipeline Types
// ============================================

export type PipelineStep =
  | "load"
  | "preprocess"
  | "detect_lines"
  | "ocr"
  | "verify_content"
  | "check_handwriting"
  | "quality_gate"
  | "score"
  | "complete";

export type PipelineProgress = {
  step: PipelineStep;
  stepIndex: number;
  totalSteps: number;
  message: string;
  progress: number; // 0..1
};

export type ImageQualityMetrics = {
  blurScore: number; // 0..1, lower is blurrier
  glareScore: number; // 0..1, higher means more glare
  skewAngle: number; // degrees
  brightness: number; // 0..255
  contrast: number; // 0..1
};

export type DetectedLine = {
  lineIndex: number;
  bbox: BoundingBox;
  baseline: number; // y-coordinate
  confidence: number;
};

// ============================================
// API Types
// ============================================

export type UploadReportRequest = {
  ciphertextB64: string;
  nonceB64: string;
  meta: {
    createdAt: string;
    size: number;
  };
};

export type UploadReportResponse = {
  reportId: string;
};

export type GetReportResponse = {
  ciphertextB64: string;
  nonceB64: string;
  meta: {
    createdAt: string;
    size: number;
  };
};

// ============================================
// Theme Types
// ============================================

export type Theme = "light" | "dark" | "system";
