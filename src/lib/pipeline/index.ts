// Processing Pipeline for Handwriting Assessment
// This is a client-side pipeline that processes uploaded images and PDFs
// Uses Google Cloud Vision API for production-grade handwriting recognition

import { api } from "@/lib/api";
import type {
  AssignmentPayload,
  PipelineProgress,
  PipelineStep,
  PageData,
  ExtractedLine,
  Finding,
  QualityGate,
  ScoreBreakdown,
  DetectedLine,
  ImageQualityMetrics,
} from "@/types";

// Lazy-loaded PDF.js module (only loaded when needed)
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;

  // Dynamic import - only loads when a PDF is uploaded
  pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  return pdfjsLib;
}

// Character data from OCR for handwriting analysis
type CharacterData = {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  lineIndex: number;
  pageIndex: number;
};

// Extended extracted line with character data
type ExtractedLineWithChars = ExtractedLine & {
  characters: CharacterData[];
  pageIndex: number;
};

// Page canvas with metadata
type PageCanvas = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pageIndex: number;
};

export type PipelineResult = {
  pages: PageData[];
  extractedTextPerLine: ExtractedLine[];
  detectedLineCount: number;
  quality: QualityGate;
  findings: Finding[];
  score: ScoreBreakdown;
};

export type PipelineOptions = {
  onProgress: (progress: PipelineProgress) => void;
  signal?: AbortSignal;
};

const PIPELINE_STEPS: PipelineStep[] = [
  "load",
  "preprocess",
  "detect_lines",
  "ocr",
  "verify_content",
  "check_handwriting",
  "quality_gate",
  "score",
];

// Thresholds for conservative detection
const OCR_HIGH_CONFIDENCE = 0.85; // Only flag mismatches above this
const FINDING_CONFIDENCE_THRESHOLD = 0.92; // Very high threshold for findings
const QUALITY_COVERAGE_MIN = 0.6; // Min coverage for gradable results
const LINE_CONFIDENCE_UNCERTAIN = 0.7; // Below this, mark as uncertain
const HANDWRITING_CONFIDENCE_THRESHOLD = 0.95; // Extra high for handwriting findings

// Auto-preprocessing thresholds
const MIN_CONTRAST_THRESHOLD = 0.3; // Below this, auto-enhance
const MAX_BLUR_THRESHOLD = 0.15; // Below this blur score, image is too blurry
const MAX_GLARE_THRESHOLD = 0.25; // Above this, too much glare
const PDF_RENDER_SCALE = 2; // Render PDFs at 2x for ~200 DPI

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
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
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Normalize text for comparison (handles common OCR errors)
function normalizeText(text: string): string {
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
function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);

  return 1 - distance / maxLen;
}

function reportProgress(
  options: PipelineOptions,
  step: PipelineStep,
  message: string,
  stepProgress: number = 0
) {
  const stepIndex = PIPELINE_STEPS.indexOf(step);
  const baseProgress = stepIndex / PIPELINE_STEPS.length;
  const stepContribution = (1 / PIPELINE_STEPS.length) * stepProgress;

  options.onProgress({
    step,
    stepIndex,
    totalSteps: PIPELINE_STEPS.length,
    message,
    progress: baseProgress + stepContribution,
  });
}

// Load a single image file and convert to canvas
async function loadSingleImage(file: File): Promise<PageCanvas> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      // Scale down very large images for performance
      const maxDim = 2000;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(img.src);
      resolve({ canvas, width, height, pageIndex: 0 });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Load PDF file and render all pages to canvases
async function loadPDF(file: File, onProgress?: (page: number, total: number) => void): Promise<PageCanvas[]> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: PageCanvas[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(i, pdf.numPages);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas,
    } as Parameters<typeof page.render>[0]).promise;

    pages.push({
      canvas,
      width: viewport.width,
      height: viewport.height,
      pageIndex: i - 1,
    });
  }

  return pages;
}

// Load file (image or PDF) and return array of page canvases
async function loadFile(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PageCanvas[]> {
  const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPDF) {
    return loadPDF(file, onProgress);
  } else {
    const page = await loadSingleImage(file);
    return [page];
  }
}

// Auto-enhance contrast on a canvas
function enhanceContrast(canvas: HTMLCanvasElement, factor: number = 1.5): void {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Calculate average brightness for centering
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avgBrightness = totalBrightness / (data.length / 4);

  // Apply contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const value = data[i + c];
      const newValue = avgBrightness + (value - avgBrightness) * factor;
      data[i + c] = Math.max(0, Math.min(255, Math.round(newValue)));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// Preprocess image: analyze quality and apply auto-corrections
// Returns metrics and rejection reasons if image is ungradable
function preprocessImage(
  canvas: HTMLCanvasElement,
  applyCorrections: boolean = true
): { metrics: ImageQualityMetrics; rejectionReasons: string[] } {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const rejectionReasons: string[] = [];

  // Calculate brightness and contrast
  let totalBrightness = 0;
  let minBrightness = 255;
  let maxBrightness = 0;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    totalBrightness += brightness;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
  }

  const avgBrightness = totalBrightness / (data.length / 4);
  let contrast = (maxBrightness - minBrightness) / 255;

  // Simple blur detection using Laplacian variance
  let laplacianVariance = 0;
  const width = canvas.width;

  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      const neighbors = [
        ((y - 1) * width + x) * 4,
        ((y + 1) * width + x) * 4,
        (y * width + x - 1) * 4,
        (y * width + x + 1) * 4,
      ];

      let laplacian = -4 * center;
      for (const nIdx of neighbors) {
        laplacian += (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
      }

      laplacianVariance += laplacian * laplacian;
    }
  }

  laplacianVariance /= (canvas.width - 2) * (canvas.height - 2);
  const blurScore = Math.min(1, laplacianVariance / 500); // Higher = sharper

  // Glare detection (high brightness regions)
  let glarePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness > 240) glarePixels++;
  }
  const glareScore = glarePixels / (data.length / 4);

  // Check for ungradable conditions
  if (blurScore < MAX_BLUR_THRESHOLD) {
    rejectionReasons.push("Image is too blurry - please retake the photo with better focus");
  }

  if (glareScore > MAX_GLARE_THRESHOLD) {
    rejectionReasons.push("Too much glare detected - please retake without direct light reflection");
  }

  // Apply auto-corrections if enabled and image is salvageable
  if (applyCorrections && rejectionReasons.length === 0) {
    // Auto-enhance contrast if too low
    if (contrast < MIN_CONTRAST_THRESHOLD) {
      const enhanceFactor = Math.min(2.0, MIN_CONTRAST_THRESHOLD / contrast + 0.5);
      enhanceContrast(canvas, enhanceFactor);

      // Recalculate contrast after enhancement
      const newData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let newMin = 255, newMax = 0;
      for (let i = 0; i < newData.length; i += 4) {
        const b = (newData[i] + newData[i + 1] + newData[i + 2]) / 3;
        newMin = Math.min(newMin, b);
        newMax = Math.max(newMax, b);
      }
      contrast = (newMax - newMin) / 255;
    }
  }

  const metrics: ImageQualityMetrics = {
    blurScore,
    glareScore,
    skewAngle: 0, // Would need Hough transform for accurate skew detection
    brightness: avgBrightness,
    contrast,
  };

  return { metrics, rejectionReasons };
}

// Simple line detection based on horizontal projection
function detectLines(
  canvas: HTMLCanvasElement,
  expectedLineCount: number
): DetectedLine[] {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Create horizontal projection (row darkness)
  const projection: number[] = [];
  for (let y = 0; y < height; y++) {
    let darkness = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      darkness += 255 - brightness;
    }
    projection.push(darkness / width);
  }

  // Find peaks in projection (text lines)
  const threshold = Math.max(...projection) * 0.2;
  const lines: DetectedLine[] = [];
  let inLine = false;
  let lineStart = 0;
  let maxDarkness = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    if (projection[y] > threshold) {
      if (!inLine) {
        inLine = true;
        lineStart = y;
        maxDarkness = 0;
      }
      if (projection[y] > maxDarkness) {
        maxDarkness = projection[y];
        maxY = y;
      }
    } else if (inLine) {
      inLine = false;
      const lineHeight = y - lineStart;
      if (lineHeight > 10) { // Minimum line height
        lines.push({
          lineIndex: lines.length,
          bbox: {
            x: 0,
            y: lineStart,
            w: width,
            h: lineHeight,
          },
          baseline: maxY,
          confidence: Math.min(1, maxDarkness / 50),
        });
      }
    }
  }

  // If we detected too few or too many lines, adjust
  if (lines.length === 0) {
    // Fallback: divide image into equal parts
    // Minimum 10px per line for any text to be readable
    const minLineHeight = 10;
    const maxFeasibleLines = Math.floor(height / minLineHeight);
    const actualLineCount = Math.min(expectedLineCount, maxFeasibleLines);
    const lineHeight = actualLineCount > 0 ? Math.floor(height / actualLineCount) : height;

    for (let i = 0; i < actualLineCount; i++) {
      lines.push({
        lineIndex: i,
        bbox: {
          x: 0,
          y: i * lineHeight,
          w: width,
          h: lineHeight,
        },
        baseline: i * lineHeight + lineHeight / 2,
        confidence: 0.5,
      });
    }
  }

  return lines;
}

// Convert canvas to base64 (without data URL prefix)
function canvasToBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  // Remove "data:image/jpeg;base64," prefix
  return dataUrl.split(",")[1];
}

// Assign words to detected line regions based on vertical overlap
function assignWordsToLines(
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; w: number; h: number };
    symbols: Array<{
      text: string;
      confidence: number;
      bbox: { x: number; y: number; w: number; h: number };
    }>;
  }>,
  lines: DetectedLine[],
  pageIndex: number
): ExtractedLineWithChars[] {
  // Initialize results for each line
  const results: ExtractedLineWithChars[] = lines.map((line, i) => ({
    lineIndex: i,
    text: "",
    confidence: 0,
    bbox: line.bbox,
    characters: [],
    pageIndex,
  }));

  // Assign each word to the line it overlaps most with
  for (const word of words) {
    const wordCenterY = word.bbox.y + word.bbox.h / 2;

    // Find the line this word belongs to
    let bestLineIdx = -1;
    let bestOverlap = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTop = line.bbox.y;
      const lineBottom = line.bbox.y + line.bbox.h;

      // Check if word center is within line bounds
      if (wordCenterY >= lineTop && wordCenterY <= lineBottom) {
        const overlap = Math.min(lineBottom, word.bbox.y + word.bbox.h) -
                       Math.max(lineTop, word.bbox.y);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestLineIdx = i;
        }
      }
    }

    // If no line found, assign to closest line
    if (bestLineIdx === -1) {
      let minDist = Infinity;
      for (let i = 0; i < lines.length; i++) {
        const lineCenterY = lines[i].bbox.y + lines[i].bbox.h / 2;
        const dist = Math.abs(wordCenterY - lineCenterY);
        if (dist < minDist) {
          minDist = dist;
          bestLineIdx = i;
        }
      }
    }

    if (bestLineIdx >= 0) {
      const result = results[bestLineIdx];
      // Append word text (with space separator)
      result.text = result.text ? `${result.text} ${word.text}` : word.text;
      // Add symbols as characters
      for (const symbol of word.symbols) {
        result.characters.push({
          text: symbol.text,
          confidence: symbol.confidence,
          bbox: symbol.bbox,
          lineIndex: bestLineIdx,
          pageIndex,
        });
      }
    }
  }

  // Calculate confidence for each line
  for (const result of results) {
    if (result.characters.length > 0) {
      const totalConf = result.characters.reduce((sum, c) => sum + c.confidence, 0);
      result.confidence = totalConf / result.characters.length;
    }
  }

  return results;
}

// OCR result type that tracks failures
type OCRResult = {
  lines: ExtractedLineWithChars[];
  failed: boolean;
  errorMessage?: string;
};

// OCR using Google Cloud Vision API
async function performOCR(
  canvas: HTMLCanvasElement,
  lines: DetectedLine[],
  options: PipelineOptions,
  pageIndex: number = 0
): Promise<OCRResult> {
  reportProgress(options, "ocr", "Sending to Cloud Vision...", 0);

  if (options.signal?.aborted) {
    throw new Error("Pipeline cancelled");
  }

  try {
    // Convert canvas to base64
    const imageB64 = canvasToBase64(canvas);

    reportProgress(options, "ocr", "Processing with Cloud Vision...", 0.3);

    // Call Cloud Vision API
    const ocrResult = await api.ocr(imageB64);

    if (options.signal?.aborted) {
      throw new Error("Pipeline cancelled");
    }

    reportProgress(options, "ocr", "Mapping text to lines...", 0.8);

    // Assign words to detected lines
    const results = assignWordsToLines(ocrResult.words, lines, pageIndex);

    reportProgress(options, "ocr", "OCR complete", 1);

    return { lines: results, failed: false };
  } catch (err) {
    // Re-throw cancellation errors so pipeline actually stops
    if (err instanceof Error && err.message === "Pipeline cancelled") {
      throw err;
    }

    const errorMessage = err instanceof Error ? err.message : "Unknown OCR error";
    console.error("Cloud Vision OCR failed:", err);

    // Return empty results with failure flag
    return {
      lines: lines.map((line, i) => ({
        lineIndex: i,
        text: "",
        confidence: 0,
        bbox: line.bbox,
        characters: [],
        pageIndex,
      })),
      failed: true,
      errorMessage,
    };
  }
}

// Verify content against expected text using real comparison
function verifyContent(
  extracted: ExtractedLine[],
  expected: string[],
  _assignment: AssignmentPayload
): { findings: Finding[]; uncertainCount: number } {
  const findings: Finding[] = [];
  let uncertainCount = 0;

  for (let i = 0; i < expected.length; i++) {
    const expectedText = expected[i];
    const extractedLine = extracted[i];

    if (!extractedLine) {
      // Missing line
      findings.push({
        id: crypto.randomUUID(),
        pageIndex: 0,
        type: "content_mismatch",
        bbox: { x: 0, y: 0, w: 100, h: 30 },
        lineIndex: i,
        expectedText,
        observedText: "",
        confidence: 0.99,
        message: `Line ${i + 1} is missing`,
      });
      continue;
    }

    // Check confidence threshold - if OCR confidence is too low, mark as uncertain
    if (extractedLine.confidence < LINE_CONFIDENCE_UNCERTAIN) {
      findings.push({
        id: crypto.randomUUID(),
        pageIndex: 0,
        type: "content_uncertain",
        bbox: extractedLine.bbox || { x: 0, y: i * 30, w: 100, h: 30 },
        lineIndex: i,
        expectedText,
        observedText: extractedLine.text,
        confidence: extractedLine.confidence,
        message: `Line ${i + 1}: Unable to verify - image quality or OCR confidence too low`,
      });
      uncertainCount++;
      continue;
    }

    // Calculate similarity between expected and extracted text
    const similarity = calculateSimilarity(extractedLine.text, expectedText);

    // Only flag mismatch if:
    // 1. OCR confidence is high enough to trust the reading
    // 2. Similarity is low enough to indicate a real mismatch
    // 3. Combined confidence meets our threshold
    if (extractedLine.confidence >= OCR_HIGH_CONFIDENCE) {
      if (similarity >= 0.9) {
        // Good match - no finding needed
        continue;
      }

      // Calculate combined confidence for this finding
      // Higher OCR confidence + lower similarity = more confident mismatch
      const findingConfidence = extractedLine.confidence * (1 - similarity);

      if (findingConfidence >= FINDING_CONFIDENCE_THRESHOLD && similarity < 0.7) {
        // Definite mismatch with high confidence
        findings.push({
          id: crypto.randomUUID(),
          pageIndex: 0,
          type: "content_mismatch",
          bbox: extractedLine.bbox || { x: 0, y: i * 30, w: 100, h: 30 },
          lineIndex: i,
          expectedText,
          observedText: extractedLine.text,
          confidence: findingConfidence,
          message: `Line ${i + 1}: Content does not match expected text (${Math.round(similarity * 100)}% similar)`,
        });
      } else {
        // Moderate similarity - mark as uncertain to avoid false positives
        findings.push({
          id: crypto.randomUUID(),
          pageIndex: 0,
          type: "content_uncertain",
          bbox: extractedLine.bbox || { x: 0, y: i * 30, w: 100, h: 30 },
          lineIndex: i,
          expectedText,
          observedText: extractedLine.text,
          confidence: extractedLine.confidence,
          message: `Line ${i + 1}: Content verification uncertain (${Math.round(similarity * 100)}% similar)`,
        });
        uncertainCount++;
      }
    } else {
      // OCR confidence in middle range - mark as uncertain
      findings.push({
        id: crypto.randomUUID(),
        pageIndex: 0,
        type: "content_uncertain",
        bbox: extractedLine.bbox || { x: 0, y: i * 30, w: 100, h: 30 },
        lineIndex: i,
        expectedText,
        observedText: extractedLine.text,
        confidence: extractedLine.confidence,
        message: `Line ${i + 1}: Verification uncertain due to moderate OCR confidence`,
      });
      uncertainCount++;
    }
  }

  return { findings, uncertainCount };
}

// Check handwriting mechanics (i dots, t crosses)
// Uses character-level bounding boxes from OCR to detect missing elements
function checkHandwriting(
  canvas: HTMLCanvasElement,
  extractedLines: ExtractedLineWithChars[],
  _assignment: AssignmentPayload
): Finding[] {
  const findings: Finding[] = [];
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;

  // Helper to count dark pixels in a region
  function countDarkPixels(
    x: number,
    y: number,
    w: number,
    h: number,
    threshold: number = 128
  ): { dark: number; total: number } {
    let dark = 0;
    let total = 0;

    // Clamp to image bounds
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(canvas.width, Math.ceil(x + w));
    const y1 = Math.min(canvas.height, Math.ceil(y + h));

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = (py * width + px) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness < threshold) dark++;
        total++;
      }
    }

    return { dark, total };
  }

  // Check each line's characters
  for (const line of extractedLines) {
    for (const char of line.characters) {
      // Skip low-confidence characters
      if (char.confidence < HANDWRITING_CONFIDENCE_THRESHOLD) {
        continue;
      }

      const charLower = char.text.toLowerCase();

      // Check for missing i-dot
      if (charLower === "i") {
        // Define search region above the character for the dot
        // Dot should be in upper portion above the main body
        const dotRegion = {
          x: char.bbox.x + char.bbox.w * 0.2, // Centered horizontally
          y: char.bbox.y - char.bbox.h * 0.6, // Above the character
          w: char.bbox.w * 0.6,
          h: char.bbox.h * 0.4,
        };

        // Only check if the region is within bounds
        if (dotRegion.y >= 0) {
          const { dark, total } = countDarkPixels(
            dotRegion.x,
            dotRegion.y,
            dotRegion.w,
            dotRegion.h
          );

          // Expect at least 5% dark pixels for a dot
          // This is conservative - a real dot would have more
          const darkRatio = total > 0 ? dark / total : 0;

          if (darkRatio < 0.05 && char.confidence >= HANDWRITING_CONFIDENCE_THRESHOLD) {
            findings.push({
              id: crypto.randomUUID(),
              pageIndex: 0,
              type: "missing_i_dot",
              bbox: {
                x: Math.round(char.bbox.x),
                y: Math.round(char.bbox.y - char.bbox.h * 0.6),
                w: Math.round(char.bbox.w),
                h: Math.round(char.bbox.h * 1.6),
              },
              lineIndex: char.lineIndex,
              confidence: char.confidence * 0.95, // Slightly reduce confidence
              message: `Line ${char.lineIndex + 1}: Missing dot above letter 'i'`,
            });
          }
        }
      }

      // Check for uncrossed t
      if (charLower === "t") {
        // Define search region for the horizontal cross stroke
        // Cross should be in the upper third of the character
        const crossRegion = {
          x: char.bbox.x - char.bbox.w * 0.2, // Extend slightly left
          y: char.bbox.y + char.bbox.h * 0.15, // Upper portion
          w: char.bbox.w * 1.4, // Extend slightly right
          h: char.bbox.h * 0.2,
        };

        const { dark, total } = countDarkPixels(
          crossRegion.x,
          crossRegion.y,
          crossRegion.w,
          crossRegion.h
        );

        // For a proper cross, we need substantial dark pixels extending horizontally
        // This checks if there's enough ink in the cross region
        const darkRatio = total > 0 ? dark / total : 0;

        // A crossed 't' should have decent coverage in the cross region
        // Less than 8% suggests missing or very faint cross
        if (darkRatio < 0.08 && char.confidence >= HANDWRITING_CONFIDENCE_THRESHOLD) {
          findings.push({
            id: crypto.randomUUID(),
            pageIndex: 0,
            type: "uncrossed_t",
            bbox: {
              x: Math.round(char.bbox.x - char.bbox.w * 0.2),
              y: Math.round(char.bbox.y),
              w: Math.round(char.bbox.w * 1.4),
              h: Math.round(char.bbox.h),
            },
            lineIndex: char.lineIndex,
            confidence: char.confidence * 0.95,
            message: `Line ${char.lineIndex + 1}: Letter 't' appears to be uncrossed`,
          });
        }
      }
    }
  }

  return findings;
}

// Determine quality gate status
function computeQualityGate(
  extracted: ExtractedLine[],
  findings: Finding[],
  uncertainCount: number,
  expectedLineCount: number,
  ocrFailed: boolean = false,
  ocrErrorMessage?: string
): QualityGate {
  const reasons: string[] = [];

  // Check for OCR failure first - this is a critical error
  if (ocrFailed) {
    const errorDetail = ocrErrorMessage || "Text recognition service unavailable";
    reasons.push(`OCR failed: ${errorDetail}`);
    reasons.push("Please try again or check your internet connection.");
    return { status: "ungradable", reasons, confidenceCoverage: 0 };
  }

  // Check if we detected far fewer lines than expected (image too small)
  if (extracted.length < expectedLineCount * 0.5) {
    reasons.push(
      `Only ${extracted.length} lines detected out of ${expectedLineCount} expected. ` +
      `The image may be too small or low resolution for this many lines.`
    );
    return { status: "ungradable", reasons, confidenceCoverage: extracted.length / expectedLineCount };
  }

  // Calculate coverage
  const verifiedLines = extracted.filter((l) => l.confidence >= LINE_CONFIDENCE_UNCERTAIN).length;
  const confidenceCoverage = verifiedLines / expectedLineCount;

  // Check for ungradable conditions
  if (confidenceCoverage < QUALITY_COVERAGE_MIN) {
    reasons.push(
      `Only ${Math.round(confidenceCoverage * 100)}% of lines could be verified with sufficient confidence`
    );
    return { status: "ungradable", reasons, confidenceCoverage };
  }

  // High uncertainty should show a warning but NOT zero out scores
  // Reserve "ungradable" status for actual failures (OCR error, no lines detected, etc.)
  // Previously this would mark as "ungradable" at 40% uncertainty, which was too strict
  // especially for cursive handwriting that OCR struggles with
  if (uncertainCount > expectedLineCount * 0.4) {
    reasons.push(`${uncertainCount} of ${expectedLineCount} lines have uncertain verification`);
    // Return "uncertain" instead of "ungradable" - scores will still be calculated
    // but the user will see a warning about verification uncertainty
    return { status: "uncertain", reasons, confidenceCoverage };
  }

  // Check for uncertain status
  if (uncertainCount > 0) {
    reasons.push(`${uncertainCount} line(s) could not be verified with high confidence`);
  }

  const contentUncertainFindings = findings.filter((f) => f.type === "content_uncertain").length;
  if (contentUncertainFindings > 0) {
    reasons.push(`${contentUncertainFindings} line(s) marked as uncertain`);
  }

  if (reasons.length > 0) {
    return { status: "uncertain", reasons, confidenceCoverage };
  }

  return { status: "ok", reasons: [], confidenceCoverage };
}

// Calculate scores
function calculateScore(
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

// Main pipeline function - handles both single images and multi-page PDFs
export async function runPipeline(
  file: File,
  assignment: AssignmentPayload,
  options: PipelineOptions
): Promise<PipelineResult> {
  const { signal } = options;

  // Step 1: Load file (image or PDF)
  reportProgress(options, "load", "Loading file...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const pageCanvases = await loadFile(file, (page, total) => {
    reportProgress(options, "load", `Loading page ${page}/${total}...`, page / total);
  });

  if (pageCanvases.length === 0) {
    throw new Error("No pages found in file");
  }

  // Step 2: Preprocess all pages
  reportProgress(options, "preprocess", "Analyzing image quality...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const allRejectionReasons: string[] = [];
  const pageDataResults: PageData[] = [];

  for (let i = 0; i < pageCanvases.length; i++) {
    const pageCanvas = pageCanvases[i];
    reportProgress(
      options,
      "preprocess",
      `Processing page ${i + 1}/${pageCanvases.length}...`,
      i / pageCanvases.length
    );

    const { rejectionReasons } = preprocessImage(pageCanvas.canvas, true);

    // Collect rejection reasons with page reference
    for (const reason of rejectionReasons) {
      allRejectionReasons.push(`Page ${i + 1}: ${reason}`);
    }

    // Store page data
    pageDataResults.push({
      width: pageCanvas.width,
      height: pageCanvas.height,
      imageDataRef: pageCanvas.canvas.toDataURL("image/jpeg", 0.8),
    });
  }

  // If any page has quality issues that can't be fixed, return early as ungradable
  if (allRejectionReasons.length > 0) {
    options.onProgress({
      step: "complete",
      stepIndex: PIPELINE_STEPS.length,
      totalSteps: PIPELINE_STEPS.length,
      message: "Assessment complete - image quality issues detected",
      progress: 1,
    });

    return {
      pages: pageDataResults,
      extractedTextPerLine: [],
      detectedLineCount: 0,
      quality: {
        status: "ungradable",
        reasons: allRejectionReasons,
        confidenceCoverage: 0,
      },
      findings: [],
      score: { completeness: 0, content: 0, handwriting: 0, overall: 0 },
    };
  }

  // Step 3: Detect lines across all pages
  reportProgress(options, "detect_lines", "Detecting text lines...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  // For multi-page: distribute expected lines across pages
  const linesPerPage = Math.ceil(assignment.requiredLineCount / pageCanvases.length);
  const allDetectedLines: { lines: DetectedLine[]; pageIndex: number; canvas: HTMLCanvasElement }[] = [];
  let totalDetectedLines = 0;

  for (let i = 0; i < pageCanvases.length; i++) {
    const pageCanvas = pageCanvases[i];
    const expectedForPage = Math.min(
      linesPerPage,
      assignment.requiredLineCount - totalDetectedLines
    );

    const lines = detectLines(pageCanvas.canvas, expectedForPage);
    allDetectedLines.push({
      lines,
      pageIndex: i,
      canvas: pageCanvas.canvas,
    });
    totalDetectedLines += lines.length;

    reportProgress(
      options,
      "detect_lines",
      `Detected ${lines.length} lines on page ${i + 1}`,
      (i + 1) / pageCanvases.length
    );
  }

  // Step 4: OCR across all pages
  reportProgress(options, "ocr", "Recognizing text...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const allExtracted: ExtractedLineWithChars[] = [];
  let globalLineIndex = 0;
  let ocrFailed = false;
  let ocrErrorMessage: string | undefined;

  for (const pageData of allDetectedLines) {
    if (signal?.aborted) throw new Error("Pipeline cancelled");

    const ocrResult = await performOCR(pageData.canvas, pageData.lines, options, pageData.pageIndex);

    // Track OCR failures
    if (ocrResult.failed) {
      ocrFailed = true;
      ocrErrorMessage = ocrResult.errorMessage;
    }

    // Adjust line indices to be global and add page index
    for (const line of ocrResult.lines) {
      allExtracted.push({
        ...line,
        lineIndex: globalLineIndex,
        pageIndex: pageData.pageIndex,
        characters: line.characters.map((c) => ({
          ...c,
          lineIndex: globalLineIndex,
          pageIndex: pageData.pageIndex,
        })),
      });
      globalLineIndex++;
    }
  }

  // Step 5: Content verification
  reportProgress(options, "verify_content", "Verifying content...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const { findings: contentFindings, uncertainCount } = verifyContent(
    allExtracted,
    assignment.expectedContent.lines,
    assignment
  );

  // Update page indices on content findings
  const contentFindingsWithPages = contentFindings.map((f) => {
    const extractedLine = allExtracted.find((e) => e.lineIndex === f.lineIndex);
    return {
      ...f,
      pageIndex: extractedLine?.pageIndex ?? 0,
    };
  });

  // Step 6: Handwriting checks across all pages
  reportProgress(options, "check_handwriting", "Checking handwriting mechanics...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const allHandwritingFindings: Finding[] = [];

  for (const pageData of allDetectedLines) {
    const pageExtracted = allExtracted.filter((e) => e.pageIndex === pageData.pageIndex);
    const findings = checkHandwriting(pageData.canvas, pageExtracted, assignment);

    // Update page indices
    for (const f of findings) {
      allHandwritingFindings.push({
        ...f,
        pageIndex: pageData.pageIndex,
      });
    }
  }

  const allFindings = [...contentFindingsWithPages, ...allHandwritingFindings];

  // Step 7: Quality gate
  reportProgress(options, "quality_gate", "Evaluating quality...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const quality = computeQualityGate(
    allExtracted,
    allFindings,
    uncertainCount,
    assignment.requiredLineCount,
    ocrFailed,
    ocrErrorMessage
  );

  // Step 8: Scoring
  reportProgress(options, "score", "Calculating score...");
  if (signal?.aborted) throw new Error("Pipeline cancelled");

  const score = calculateScore(allExtracted, allFindings, quality, assignment.requiredLineCount);

  // Complete
  options.onProgress({
    step: "complete",
    stepIndex: PIPELINE_STEPS.length,
    totalSteps: PIPELINE_STEPS.length,
    message: "Assessment complete",
    progress: 1,
  });

  return {
    pages: pageDataResults,
    extractedTextPerLine: allExtracted.map(({ characters: _characters, ...rest }) => rest),
    detectedLineCount: totalDetectedLines,
    quality,
    findings: allFindings.filter(
      (f) => f.type !== "content_uncertain" || quality.status !== "ungradable"
    ),
    score,
  };
}
