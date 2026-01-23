# Technical Architecture

## Frontend (React SPA)

### Routes (`/src/routes/`)
- `Home.tsx` - Assignment creation and main landing
- `AssignmentRunner.tsx` - Submit handwriting for grading
- `ReportViewer.tsx` - View grading results
- `About.tsx` - Information page

### Key Components
- `ProgressStepper` - Shows pipeline progress
- `ScoreCard` - Displays grading scores
- `AnnotatedViewer` - Shows findings on images
- `FindingsTable` - Lists all findings
- `UploadDropzone` - File upload UI

### UI Components (`/src/components/ui/`)
shadcn/ui-style components using Radix primitives:
- button, card, dialog, input, label, select, tabs, etc.

## Backend (Cloudflare Worker)

### Endpoints (`/worker/index.ts`)
- `POST /api/ocr` - Proxy to Google Vision API
- `POST /api/assignments` - Create signed assignments
- `GET /api/assignments/:id` - Retrieve assignments
- `POST /api/reports` - Upload encrypted reports
- `GET /api/reports/:id` - Retrieve encrypted reports
- `POST /api/email` - Send result notifications

### Security Features
- Rate limiting (per IP)
- Payload size limits (MAX_PAYLOAD_SIZE)
- HMAC signatures for assignments
- No decryption keys on server

## Pipeline (`/src/lib/pipeline/`)

### Main Entry
`runPipeline(file, assignment, onProgress)` orchestrates all steps.

### Key Functions
- `loadFile()` / `loadPDF()` - File loading with PDF.js
- `preprocessImage()` - Contrast enhancement, quality metrics
- `detectLines()` - Line detection algorithm
- `performOCR()` - Calls worker OCR endpoint
- `verifyContent()` - Compares OCR vs expected text
- `checkHandwriting()` - Detects i-dot, t-cross issues
- `computeQualityGate()` - Determines result reliability
- `calculateScore()` - Final scoring

### Threshold Constants
```typescript
FINDING_CONFIDENCE_THRESHOLD = 0.92
HANDWRITING_CONFIDENCE_THRESHOLD = 0.95
LINE_CONFIDENCE_UNCERTAIN = 0.7
OCR_HIGH_CONFIDENCE = 0.8
QUALITY_COVERAGE_MIN = 0.8
```

## Crypto (`/src/lib/crypto/`)
- AES-GCM encryption for reports
- Key derivation from random bytes
- Base64 URL-safe encoding

## PDF Support
- PDF.js lazy-loaded to minimize bundle
- 2x render scale (~200 DPI)
- Global line indexing across pages
