import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  normalizeText,
  calculateSimilarity,
  computeQualityGate,
  calculateScore,
} from "./utils";
import type { ExtractedLine, Finding, QualityGate } from "@/types";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns length of b for empty a", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
  });

  it("returns length of a for empty b", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
  });

  it("calculates correct distance for single substitution", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("calculates correct distance for single insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("calculates correct distance for single deletion", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("calculates correct distance for multiple operations", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("handles case-sensitive comparison", () => {
    expect(levenshteinDistance("Hello", "hello")).toBe(1);
  });
});

describe("normalizeText", () => {
  it("converts to lowercase", () => {
    expect(normalizeText("Hello World")).toBe("hello world");
  });

  it("trims whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("replaces 0 with o", () => {
    expect(normalizeText("hell0")).toBe("hello");
  });

  it("replaces 1 with l", () => {
    expect(normalizeText("he1lo")).toBe("hello");
  });

  it("normalizes quotes", () => {
    // Curly apostrophe becomes straight apostrophe
    expect(normalizeText("it\u2019s")).toBe("it's");
    // Backtick becomes straight apostrophe
    expect(normalizeText("it`s")).toBe("it's");
    // Curly quotes become straight quotes
    expect(normalizeText("\u201chello\u201d")).toBe("\"hello\"");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("hello    world")).toBe("hello world");
  });

  it("handles combined normalizations", () => {
    expect(normalizeText("  HE110   W0RLD  ")).toBe("hello world");
  });
});

describe("calculateSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(calculateSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 1 for strings identical after normalization", () => {
    expect(calculateSimilarity("Hello", "HELLO")).toBe(1);
    expect(calculateSimilarity("hell0", "hello")).toBe(1);
  });

  it("returns 0 for empty string comparison", () => {
    expect(calculateSimilarity("", "hello")).toBe(0);
    expect(calculateSimilarity("hello", "")).toBe(0);
  });

  it("returns high similarity for similar strings", () => {
    const similarity = calculateSimilarity("hello world", "hello worlb");
    expect(similarity).toBeGreaterThan(0.9);
  });

  it("returns low similarity for different strings", () => {
    const similarity = calculateSimilarity("hello", "xyz");
    expect(similarity).toBeLessThan(0.5);
  });

  it("handles OCR-like errors correctly", () => {
    // "hell0 w0rld" normalizes to same as "hello world"
    expect(calculateSimilarity("hell0 w0rld", "hello world")).toBe(1);
  });
});

describe("computeQualityGate", () => {
  const createExtractedLine = (
    lineIndex: number,
    confidence: number
  ): ExtractedLine => ({
    lineIndex,
    text: `Line ${lineIndex}`,
    confidence,
    bbox: { x: 0, y: lineIndex * 30, w: 100, h: 30 },
  });

  it("returns 'ok' when all conditions are met", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0, 0.9),
      createExtractedLine(1, 0.85),
      createExtractedLine(2, 0.95),
    ];
    const findings: Finding[] = [];

    const result = computeQualityGate(extracted, findings, 0, 3);

    expect(result.status).toBe("ok");
    expect(result.reasons).toHaveLength(0);
    expect(result.confidenceCoverage).toBe(1);
  });

  it("returns 'ungradable' when too few lines detected", () => {
    const extracted: ExtractedLine[] = [createExtractedLine(0, 0.9)];
    const findings: Finding[] = [];

    const result = computeQualityGate(extracted, findings, 0, 10);

    expect(result.status).toBe("ungradable");
    expect(result.reasons[0]).toContain("Only 1 lines detected");
  });

  it("returns 'ungradable' when confidence coverage is too low", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0, 0.5), // below threshold
      createExtractedLine(1, 0.5), // below threshold
      createExtractedLine(2, 0.9), // above threshold
    ];
    const findings: Finding[] = [];

    const result = computeQualityGate(extracted, findings, 0, 3);

    expect(result.status).toBe("ungradable");
    expect(result.reasons[0]).toContain("could be verified");
  });

  it("returns 'ungradable' when uncertainty is too high", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0, 0.9),
      createExtractedLine(1, 0.9),
      createExtractedLine(2, 0.9),
      createExtractedLine(3, 0.9),
      createExtractedLine(4, 0.9),
    ];
    const findings: Finding[] = [];

    // More than 40% uncertain
    const result = computeQualityGate(extracted, findings, 3, 5);

    expect(result.status).toBe("ungradable");
    expect(result.reasons[0]).toContain("uncertain verification");
  });

  it("returns 'uncertain' when some lines are uncertain", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0, 0.9),
      createExtractedLine(1, 0.9),
      createExtractedLine(2, 0.9),
      createExtractedLine(3, 0.9),
      createExtractedLine(4, 0.9),
    ];
    const findings: Finding[] = [];

    // 1 uncertain is below 40% threshold but > 0
    const result = computeQualityGate(extracted, findings, 1, 5);

    expect(result.status).toBe("uncertain");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns 'uncertain' when there are content_uncertain findings", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0, 0.9),
      createExtractedLine(1, 0.9),
    ];
    const findings: Finding[] = [
      {
        id: "1",
        pageIndex: 0,
        type: "content_uncertain",
        bbox: { x: 0, y: 0, w: 100, h: 30 },
        lineIndex: 0,
        confidence: 0.7,
        message: "Uncertain",
      },
    ];

    const result = computeQualityGate(extracted, findings, 0, 2);

    expect(result.status).toBe("uncertain");
    expect(result.reasons).toContain("1 line(s) marked as uncertain");
  });
});

describe("calculateScore", () => {
  const createExtractedLine = (lineIndex: number): ExtractedLine => ({
    lineIndex,
    text: `Line ${lineIndex}`,
    confidence: 0.9,
    bbox: { x: 0, y: lineIndex * 30, w: 100, h: 30 },
  });

  const okQuality: QualityGate = {
    status: "ok",
    reasons: [],
    confidenceCoverage: 1,
  };

  const ungradableQuality: QualityGate = {
    status: "ungradable",
    reasons: ["Too low quality"],
    confidenceCoverage: 0.3,
  };

  it("returns zero scores for ungradable quality", () => {
    const extracted: ExtractedLine[] = [createExtractedLine(0)];
    const findings: Finding[] = [];

    const result = calculateScore(extracted, findings, ungradableQuality, 5);

    expect(result.completeness).toBe(0);
    expect(result.content).toBe(0);
    expect(result.handwriting).toBe(0);
    expect(result.overall).toBe(0);
  });

  it("returns perfect scores with no findings", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0),
      createExtractedLine(1),
      createExtractedLine(2),
    ];
    const findings: Finding[] = [];

    const result = calculateScore(extracted, findings, okQuality, 3);

    expect(result.completeness).toBe(100);
    expect(result.content).toBe(100);
    expect(result.handwriting).toBe(100);
    expect(result.overall).toBe(100);
  });

  it("reduces content score for content_mismatch findings", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0),
      createExtractedLine(1),
      createExtractedLine(2),
      createExtractedLine(3),
    ];
    const findings: Finding[] = [
      {
        id: "1",
        pageIndex: 0,
        type: "content_mismatch",
        bbox: { x: 0, y: 0, w: 100, h: 30 },
        lineIndex: 0,
        confidence: 0.95,
        message: "Mismatch",
      },
    ];

    const result = calculateScore(extracted, findings, okQuality, 4);

    expect(result.completeness).toBe(100);
    expect(result.content).toBe(75); // 100 - (100/4) = 75
    expect(result.handwriting).toBe(100);
    expect(result.overall).toBeLessThan(100);
  });

  it("reduces handwriting score for missing_i_dot findings", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0),
      createExtractedLine(1),
    ];
    const findings: Finding[] = [
      {
        id: "1",
        pageIndex: 0,
        type: "missing_i_dot",
        bbox: { x: 0, y: 0, w: 10, h: 20 },
        lineIndex: 0,
        confidence: 0.95,
        message: "Missing i-dot",
      },
    ];

    const result = calculateScore(extracted, findings, okQuality, 2);

    expect(result.handwriting).toBe(95); // 100 - 5
  });

  it("reduces handwriting score for uncrossed_t findings", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0),
      createExtractedLine(1),
    ];
    const findings: Finding[] = [
      {
        id: "1",
        pageIndex: 0,
        type: "uncrossed_t",
        bbox: { x: 0, y: 0, w: 10, h: 20 },
        lineIndex: 0,
        confidence: 0.95,
        message: "Uncrossed t",
      },
      {
        id: "2",
        pageIndex: 0,
        type: "uncrossed_t",
        bbox: { x: 50, y: 0, w: 10, h: 20 },
        lineIndex: 0,
        confidence: 0.95,
        message: "Uncrossed t",
      },
    ];

    const result = calculateScore(extracted, findings, okQuality, 2);

    expect(result.handwriting).toBe(90); // 100 - (2 * 5)
  });

  it("calculates correct overall score with weighted average", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0),
      createExtractedLine(1),
    ];
    const findings: Finding[] = [];

    const result = calculateScore(extracted, findings, okQuality, 2);

    // completeness: 100, content: 100, handwriting: 100
    // overall: 100 * 0.2 + 100 * 0.5 + 100 * 0.3 = 100
    expect(result.overall).toBe(100);
  });

  it("caps completeness at 100 even with more lines than expected", () => {
    const extracted: ExtractedLine[] = [
      createExtractedLine(0),
      createExtractedLine(1),
      createExtractedLine(2),
      createExtractedLine(3),
    ];
    const findings: Finding[] = [];

    const result = calculateScore(extracted, findings, okQuality, 2);

    expect(result.completeness).toBe(100); // capped at 100
  });

  it("handles partial completeness", () => {
    const extracted: ExtractedLine[] = [createExtractedLine(0)];
    const findings: Finding[] = [];

    const result = calculateScore(extracted, findings, okQuality, 2);

    expect(result.completeness).toBe(50); // 1/2 = 50%
  });
});
