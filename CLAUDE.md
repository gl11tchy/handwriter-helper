# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run test         # Run tests once
npm run test:watch   # Watch mode
```

Deploy to Cloudflare:
```bash
npx wrangler deploy
```

## Architecture

**Writing Lines** (writinglines.com) grades handwritten line assignments using OCR. Create assignments with expected text and repetition count, then submit handwritten PDFs/images for grading on completeness, content accuracy, and handwriting quality.

### Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite
- **Backend**: Cloudflare Worker (`/worker/index.ts`)
- **Storage**: Cloudflare R2 for encrypted reports
- **OCR**: Google Cloud Vision API (called via worker)

### Key Directories
- `/src/routes/` - Page components (Home, ReportViewer, About)
- `/src/lib/pipeline/` - 8-step grading pipeline (load → preprocess → detect lines → OCR → verify content → check handwriting → quality gate → score)
- `/src/lib/crypto/` - AES-GCM encryption for reports
- `/src/lib/api.ts` - API client
- `/worker/` - Cloudflare Worker API endpoints

### Privacy Model
Reports are encrypted client-side with AES-GCM before storage. The encryption key is kept in the URL fragment (`#k=<key>`) and never sent to the server. The server only stores ciphertext.

### Pipeline Thresholds
The grading pipeline uses conservative confidence thresholds to minimize false positives:
- Content verification: 92%+ confidence required
- Handwriting findings: 95%+ confidence required
- Uses Levenshtein distance for fuzzy text matching

### PDF Support
PDF.js is lazy-loaded to minimize bundle size. PDFs are rendered at 2x scale (~200 DPI) with global line indexing across pages.
