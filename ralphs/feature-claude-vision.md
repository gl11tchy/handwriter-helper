# Feature: Claude Vision Verification Layer for Uncertain OCR Results

## Goal

Add Claude Vision as a secondary verification layer to resolve "uncertain" OCR results. When Google Vision returns low-confidence readings (< `LINE_CONFIDENCE_UNCERTAIN`, currently 0.50) or when OCR confidence is below `OCR_HIGH_CONFIDENCE` (currently 0.65) with moderate similarity, invoke Claude Vision for a second opinion. This reduces the ~10-20% of lines currently marked "uncertain" by providing a more definitive verification.

> **Note**: Threshold values are defined as constants in `src/lib/pipeline/index.ts`. Refer to `LINE_CONFIDENCE_UNCERTAIN`, `OCR_HIGH_CONFIDENCE`, and `FINDING_CONFIDENCE_THRESHOLD` for current values.

**Why this matters:** Users currently receive no clear feedback on uncertain lines, which degrades the grading experience. Claude's vision capabilities can often read handwriting that Google Vision struggles with.

## Design

### Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                       Pipeline Flow                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [verifyContent()]                                                   │
│        │                                                             │
│        ▼                                                             │
│  lineMetrics with decision: "uncertain"                              │
│        │                                                             │
│        ▼                                                             │
│  ┌──────────────────────────────────────┐                           │
│  │ NEW: Claude Vision Verification       │ ◄── Only if enabled      │
│  │ (for uncertain lines only)            │                          │
│  └──────────────────────────────────────┘                           │
│        │                                                             │
│        ▼                                                             │
│  Updated findings + lineMetrics                                      │
│        │                                                             │
│        ▼                                                             │
│  [quality_gate] → [score]                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow for Claude Verification

```text
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Uncertain   │    │ Crop Line   │    │ POST /api/  │    │ Update      │
│ Lines from  │───▶│ Image from  │───▶│ verify-with │───▶│ Findings &  │
│ lineMetrics │    │ Page Canvas │    │ -claude     │    │ Metrics     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Worker Endpoint Design

**Endpoint:** `POST /api/verify-with-claude`

**Request:**
```typescript
interface ClaudeVerificationRequest {
  imageB64: string;      // Cropped line image, base64 encoded
  expectedText: string;  // What the line should say
  lineIndex: number;     // For tracking
}
```

**Response:**
```typescript
interface ClaudeVerificationResponse {
  transcription: string;        // What Claude reads in the image
  matchesExpected: boolean;     // Claude's judgment
  confidence: "high" | "medium" | "low";  // Claude's confidence in its reading
  reasoning?: string;           // Optional explanation
}
```

### Configuration

Add to `PipelineOptions`:
```typescript
export type PipelineOptions = {
  onProgress: (progress: PipelineProgress) => void;
  signal?: AbortSignal;
  enableClaudeVerification?: boolean;  // NEW: opt-in flag, default false
};
```

## Requirements (TDD Order)

### Phase 1: Types & API Client

- [x] **Write test:** Type definitions compile correctly
- [x] Add `ClaudeVerificationRequest` and `ClaudeVerificationResponse` to `/src/types/index.ts`
- [x] Add `enableClaudeVerification` to `PipelineOptions` type in `/src/lib/pipeline/index.ts`

- [x] **Write test:** API client method exists and has correct signature
- [x] Add `verifyWithClaude(request: ClaudeVerificationRequest): Promise<ClaudeVerificationResponse>` to `/src/lib/api.ts`

### Phase 2: Worker Endpoint

- [x] **Write test:** Endpoint returns 503 when ANTHROPIC_API_KEY not configured
- [x] **Write test:** Endpoint returns 400 when missing required fields
- [x] **Write test:** Endpoint returns valid response structure on success

- [x] Add `ANTHROPIC_API_KEY?: string` to `/worker/env.ts` Env interface
- [x] Implement `/api/verify-with-claude` endpoint in `/worker/index.ts`:
  - Validate request body (imageB64, expectedText required)
  - Call Anthropic API with Claude Vision model (claude-3-5-sonnet-20241022 or claude-3-haiku for cost)
  - Use structured prompt to get transcription + match judgment
  - Return structured response

### Phase 3: Image Cropping Utility

- [x] **Write test:** `cropLineImage()` returns valid base64 for given bbox
- [x] **Write test:** `cropLineImage()` handles edge cases (bbox at image edge)

- [x] Add `cropLineImage(canvas: HTMLCanvasElement, bbox: BoundingBox): string` utility function in `/src/lib/pipeline/index.ts`
  - Creates temporary canvas
  - Draws cropped region
  - Returns base64 encoded JPEG

### Phase 4: Pipeline Integration

- [x] **Write test:** Pipeline skips Claude verification when `enableClaudeVerification` is false
- [x] **Write test:** Pipeline calls Claude verification for uncertain lines when enabled
- [x] **Write test:** Pipeline updates findings from "content_uncertain" to "content_mismatch" when Claude confirms mismatch
- [x] **Write test:** Pipeline removes uncertain finding when Claude confirms match
- [x] **Write test:** Pipeline falls back gracefully when Claude API fails

- [x] Add new step constant: `"verify_with_claude"` to `PIPELINE_STEPS` (between `verify_content` and `check_handwriting`)
- [x] Implement `verifyUncertainLinesWithClaude()` function:
  ```typescript
  async function verifyUncertainLinesWithClaude(
    pageCanvases: PageCanvas[],
    lineMetrics: LineConfidenceRecord[],
    contentFindings: Finding[],
    options: PipelineOptions
  ): Promise<{ updatedFindings: Finding[]; updatedMetrics: LineConfidenceRecord[] }>
  ```
- [x] Integrate into `runPipeline()` after `verifyContent()` call
- [x] Add progress reporting for Claude verification step

### Phase 5: Error Handling & Fallback

- [x] **Write test:** Single line failure doesn't stop other verifications
- [x] **Write test:** Network timeout falls back to original uncertain status

- [x] Wrap each Claude call in try/catch
- [x] On failure, preserve original uncertain status
- [x] Log failures for debugging (in DEV mode)

### Phase 6: Cost Optimization

- [x] **Write test:** Lines with very low confidence (< 0.3) are skipped (image likely unreadable)
- [x] **Write test:** Maximum of N lines per submission sent to Claude (configurable)

- [x] Add `maxClaudeVerifications?: number` to options (default: 10)
- [x] Skip lines with OCR confidence < 0.3 (image likely unreadable by any model)
- [x] Prioritize lines by OCR confidence (higher confidence = more likely Claude can help)

## File Changes Summary

| File | Changes |
|------|---------|
| `/worker/env.ts` | Add `ANTHROPIC_API_KEY?: string` |
| `/worker/index.ts` | Add `/api/verify-with-claude` endpoint |
| `/src/types/index.ts` | Add `ClaudeVerificationRequest`, `ClaudeVerificationResponse` types |
| `/src/lib/api.ts` | Add `verifyWithClaude()` method |
| `/src/lib/pipeline/index.ts` | Add `cropLineImage()`, `verifyUncertainLinesWithClaude()`, integrate into pipeline |
| `wrangler.toml` | Document `ANTHROPIC_API_KEY` variable |

## Claude Vision Prompt Design

```text
You are analyzing a cropped image of a single handwritten line from a writing assignment.

Expected text: "${expectedText}"

Please:
1. Transcribe exactly what you see written in the image
2. Compare your transcription to the expected text
3. Determine if they match (allowing for minor variations in handwriting)

Respond in JSON format:
{
  "transcription": "what you read",
  "matchesExpected": true/false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation if not a match"
}
```

## Acceptance Criteria

- [x] Lines marked "uncertain" get a second verification via Claude Vision when `enableClaudeVerification: true`
- [x] Claude's response is used to upgrade "uncertain" to either "verified" or "mismatch"
- [x] Feature is behind `enableClaudeVerification` flag (default: false)
- [x] Proper error handling if Claude API fails (fall back to original uncertain result)
- [x] Cost-conscious: only invoke for truly uncertain cases (not all lines)
- [x] Progress indicator shows Claude verification step
- [x] Works with both single images and multi-page PDFs

## Cost Considerations

**Token Formula**: Anthropic calculates image tokens as `tokens ≈ (width_px × height_px) / 750`

**Example token counts for cropped line images:**

| Dimensions | Calculation | Tokens |
|------------|-------------|--------|
| 1000×100 px (typical line) | 100,000 / 750 | ~133 |
| 800×60 px (compact line) | 48,000 / 750 | ~64 |
| 500×50 px (small line) | 25,000 / 750 | ~33 |
| 1000×1000 px (full region) | 1,000,000 / 750 | ~1,334 |

**Pricing (input tokens, as of January 2026 — per [Anthropic pricing](https://www.anthropic.com/pricing)):**
- **Claude 3.5 Haiku**: $0.80/million input tokens, $4/million output tokens
- **Claude 3.5 Sonnet**: $3/million input tokens, $15/million output tokens

**Estimated cost per line** (assuming ~100 token image + ~50 token prompt + ~100 token response):
- **Haiku**: ~150 input tokens × $0.80/M + ~100 output tokens × $4/M ≈ **$0.0005/line** ($0.50 per 1K lines)
- **Sonnet**: ~150 input tokens × $3/M + ~100 output tokens × $15/M ≈ **$0.002/line** ($2.00 per 1K lines)

Recommend starting with Haiku for cost efficiency. With max 10 uncertain lines per submission, worst-case cost is ~$0.005 (Haiku) or ~$0.02 (Sonnet) per submission.

## Future Enhancements (Out of Scope)

1. Batch multiple uncertain lines in single Claude request (reduce API overhead)
2. Cache Claude results for identical line images
3. User preference for accuracy vs. cost (Haiku vs. Sonnet)
4. Analytics dashboard showing Claude verification success rates

---

*Plan created: 2026-01-23*
*Status: Implemented (PR #23)*
