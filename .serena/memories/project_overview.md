# Project Overview: Writing Lines (handwriter-helper)

## Purpose
Writing Lines (writinglines.com) is a web application that grades handwritten line assignments using OCR. Users create assignments with expected text and repetition count, then submit handwritten PDFs/images for grading on completeness, content accuracy, and handwriting quality.

## Tech Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite 6
- **Backend**: Cloudflare Worker (`/worker/index.ts`)
- **Storage**: Cloudflare R2 for encrypted reports
- **OCR**: Google Cloud Vision API (called via worker)
- **Testing**: Vitest with jsdom
- **Linting**: ESLint 9 with TypeScript and React plugins

## Privacy Model
Reports are encrypted client-side with AES-GCM before storage. The encryption key is kept in the URL fragment (`#k=<key>`) and never sent to the server. The server only stores ciphertext.

## Key Directories
- `/src/routes/` - Page components (Home, ReportViewer, About, AssignmentRunner)
- `/src/lib/pipeline/` - 8-step grading pipeline
- `/src/lib/crypto/` - AES-GCM encryption for reports
- `/src/lib/api.ts` - API client
- `/src/components/` - Reusable UI components
- `/src/components/ui/` - shadcn/ui-style base components
- `/src/types/` - TypeScript type definitions
- `/worker/` - Cloudflare Worker API endpoints

## Pipeline Steps
1. load - Load PDF/image files
2. preprocess - Enhance contrast, detect quality metrics
3. detect_lines - Find writing lines in the image
4. ocr - Perform OCR using Google Vision API
5. verify_content - Check text matches expected content
6. check_handwriting - Detect handwriting issues (i-dots, t-crosses)
7. quality_gate - Determine if results are reliable
8. score - Calculate final scores

## Pipeline Thresholds (Conservative)
- Content verification: 92%+ confidence required
- Handwriting findings: 95%+ confidence required
- Uses Levenshtein distance for fuzzy text matching
