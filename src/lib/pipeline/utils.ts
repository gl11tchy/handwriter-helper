// Pure utility functions for pipeline processing
// These are extracted for testability

import type {
  ExtractedLine,
  Finding,
  QualityGate,
  ScoreBreakdown,
} from "@/types";

// Thresholds for conservative detection
export const OCR_HIGH_CONFIDENCE = 0.85;
export const FINDING_CONFIDENCE_THRESHOLD = 0.92;
export const QUALITY_COVERAGE_MIN = 0.6;
export const LINE_CONFIDENCE_UNCERTAIN = 0.7;

// Calculate Levenshtein distance for fuzzy matching
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Normalize text for comparison (handles common OCR errors)
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Common OCR substitutions
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    // Remove extra whitespace
    .replace(/\s+/g, " ");
}

// Calculate similarity score between two strings (0-1)
export function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);

  return 1 - distance / maxLen;
}

// Determine quality gate status
export function computeQualityGate(
  extracted: ExtractedLine[],
  findings: Finding[],
  uncertainCount: number,
  expectedLineCount: number
): QualityGate {
  const reasons: string[] = [];

  // Check if we detected far fewer lines than expected (image too small)
  if (extracted.length < expectedLineCount * 0.5) {
    reasons.push(
      `Only ${extracted.length} lines detected out of ${expectedLineCount} expected. ` +
        `The image may be too small or low resolution for this many lines.`
    );
    return {
      status: "ungradable",
      reasons,
      confidenceCoverage: extracted.length / expectedLineCount,
    };
  }

  // Calculate coverage
  const verifiedLines = extracted.filter(
    (l) => l.confidence >= LINE_CONFIDENCE_UNCERTAIN
  ).length;
  const confidenceCoverage = verifiedLines / expectedLineCount;

  // Check for ungradable conditions
  if (confidenceCoverage < QUALITY_COVERAGE_MIN) {
    reasons.push(
      `Only ${Math.round(confidenceCoverage * 100)}% of lines could be verified with sufficient confidence`
    );
    return { status: "ungradable", reasons, confidenceCoverage };
  }

  if (uncertainCount > expectedLineCount * 0.4) {
    reasons.push(
      `${uncertainCount} of ${expectedLineCount} lines have uncertain verification`
    );
    return { status: "ungradable", reasons, confidenceCoverage };
  }

  // Check for uncertain status
  if (uncertainCount > 0) {
    reasons.push(
      `${uncertainCount} line(s) could not be verified with high confidence`
    );
  }

  const contentUncertainFindings = findings.filter(
    (f) => f.type === "content_uncertain"
  ).length;
  if (contentUncertainFindings > 0) {
    reasons.push(`${contentUncertainFindings} line(s) marked as uncertain`);
  }

  if (reasons.length > 0) {
    return { status: "uncertain", reasons, confidenceCoverage };
  }

  return { status: "ok", reasons: [], confidenceCoverage };
}

// Calculate scores
export function calculateScore(
  extracted: ExtractedLine[],
  findings: Finding[],
  quality: QualityGate,
  expectedLineCount: number
): ScoreBreakdown {
  if (quality.status === "ungradable") {
    return { completeness: 0, content: 0, handwriting: 0, overall: 0 };
  }

  // Completeness: How many lines were detected
  const completeness = Math.min(100, (extracted.length / expectedLineCount) * 100);

  // Content: Start at 100, subtract for definite mismatches (not uncertain)
  const mismatchFindings = findings.filter((f) => f.type === "content_mismatch");
  const perLinePenalty = 100 / expectedLineCount;
  const content = Math.max(0, 100 - mismatchFindings.length * perLinePenalty);

  // Handwriting: Start at 100, subtract for handwriting issues
  const handwritingFindings = findings.filter(
    (f) => f.type === "missing_i_dot" || f.type === "uncrossed_t"
  );
  const handwriting = Math.max(0, 100 - handwritingFindings.length * 5);

  // Overall: Weighted average
  const overall = Math.round(completeness * 0.2 + content * 0.5 + handwriting * 0.3);

  return {
    completeness: Math.round(completeness),
    content: Math.round(content),
    handwriting: Math.round(handwriting),
    overall,
  };
}
