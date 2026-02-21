# Handwriter Helper — Project State

## Overview
A React/Vite frontend plus Cloudflare Worker backend for creating signed handwriting assignments, grading handwritten line submissions with OCR, optional AI verification, and storing encrypted reports in R2.

## Architecture
- **Stack:** TypeScript + React 19 + Vite, plus Cloudflare Worker backend
- **Frontend:** React SPA (`src/`) served through Cloudflare assets
- **Backend:** Cloudflare Worker (`worker/index.ts`) handling API + static asset passthrough
- **Storage:** Cloudflare R2 (`STORAGE` binding) used for assignments, reports, and metadata
- **Auth:** None in-app for assignment/report flows (signed assignment payloads via HMAC; optional email alerts)
- **Hosting:** Cloudflare (Wrangler)
- **Repo:** `https://github.com/gl11tchy/handwriter-helper.git`
- **Package Manager:** npm

## Data Model
- **Assignment (`StoredAssignment`)** in R2 key `assignments/{id}.json`:
  - `payload`: `AssignmentPayload` (assignmentId, required line count/style/paper/numbering/content, etc.)
  - `signature`: HMAC signature generated with `SIGNING_SECRET`
- **Report (`/reports/*.json.enc`)** in R2:
  - `ciphertextB64`, `nonceB64` (AES-GCM encrypted report blob)
  - `meta`: createdAt + size
- **Report format (client-side encrypted payload):** `Report` with assignment payload, extracted text per line, detections, findings, quality gate, score, and `inputFile` metadata

## Key Files
- `src/main.tsx` — app bootstrap
- `src/App.tsx` — top-level routes + shared layout wrapper
- `src/routes/Home.tsx` — assignment creation and quick grade UX
- `src/routes/AssignmentRunner.tsx` — assignment verification flow, grading, report upload/link generation
- `src/routes/ReportViewer.tsx` — encrypted report fetch/decrypt/render
- `src/routes/About.tsx` — about page
- `src/lib/api.ts` — typed API client for all backend endpoints
- `src/lib/analytics.ts` — vendor-neutral analytics abstraction for funnel events
- `src/lib/pipeline/index.ts` — client-side OCR/line detection/scoring pipeline
- `src/lib/crypto/encryption.ts` — AES-GCM encryption and URL-fragment key utilities
- `src/lib/pipeline/index.test.ts` — pipeline unit tests
- `src/lib/crypto/encryption.test.ts` — crypto utils tests
- `src/lib/analytics.test.ts` — analytics event payload tests
- `worker/index.ts` — all backend routes/logic (`/api/*`, assignment/report handling, OCR proxies, signing)
- `worker/env.ts` — worker env bindings/types
- `src/types/index.ts` — shared domain types
- `src/components/` — feature-owned UI bits (`upload-dropzone`, `annotated-viewer`, `findings-table`, `score-card`, `progress-stepper`)
- `vite.config.ts` — Vite + Cloudflare plugin config
- `wrangler.toml` — CF worker config (assets + R2 + vars)
- `package.json` — scripts/dependencies
- `.cloudflare-deploy` / `CLAUDE.md` — deployment/run notes
- `scripts/check-launch-env.sh` — launch env validation script
- `scripts/smoke/smoke-report-flow.sh` — deployment smoke test script
- `docs/ops/launch-gate.md` — launch gates + rollout progression
- `docs/ops/incidents.md` — OCR/Claude/R2/email incident runbook
- `docs/ops/funnel-metrics.md` — funnel KPI specification
- `docs/legal/data-retention-policy.md` — 30-day retention and deletion policy

## Routes / Pages
- **Frontend routes:** `/`, `/a/:assignmentId`, `/r/:reportId`, `/about`, `/privacy`
- **API routes (worker):**
  - `GET /api/health`
  - `POST /api/ocr`
  - `POST /api/verify-with-claude`
  - `POST /api/assignment`
  - `GET /api/assignment/:assignmentId`
  - `POST /api/report`
  - `GET /api/report/:reportId`
  - All other paths fall through to SPA asset handling (`/` plus static frontend)

## Scripts
- `npm run dev` → `vite`
- `npm run build` → `tsc -b && vite build`
- `npm run lint` / `npm run lint:fix` → ESLint
- `npm run test` → `vitest run`
- `npm run test:watch` → Vitest watch mode
- `npm run test:coverage` → Vitest coverage
- `bash scripts/check-launch-env.sh` → launch env validation
- `BASE_URL=... bash scripts/smoke/smoke-report-flow.sh` → deployment smoke flow
- Deploy command used in notes: `npx wrangler deploy`

## Environment
- `GOOGLE_CLOUD_API_KEY` — OCR backend API key (required for `/api/ocr`)
- `SIGNING_SECRET` — HMAC key for assignment signing/verification
- `RESEND_API_KEY` — optional email notification for report completion
- `ANTHROPIC_API_KEY` — optional Claude Vision verification for uncertain lines
- `STORAGE` (R2 binding) — required for assignment/report persistence
- `ASSETS` (binding) — required for frontend serving
- `APP_URL` — base URL for emails/URLs
- `ENVIRONMENT` — runtime mode flag (configured as production in `wrangler.toml`)

## Tests
- Framework: Vitest + React/jsdom
- Validation status (latest run):
  - `npm run lint` → pass (warning-only findings)
  - `npm run test` → pass
  - `npm run build` → pass

## Deploy
- Platform: Cloudflare Workers (`wrangler`)
- Deploy command: `npx wrangler deploy`
- Worker config expects:
  - static assets from `./dist` (`wrangler.toml`)
  - SPA fallback (`not_found_handling = "single-page-application"`)
  - R2 bucket: `handwriter-helper-storage`
- No CI workflows or automation files found in repo (`.github/workflows` absent)

## Known Issues / TODOs
- No `.github` workflow directory or deployment automation
- No explicit auth/session layer for multi-tenant access; assignment access control is by signed payload + storage key
- Existing lint warnings remain in `src/lib/pipeline/index.ts`, `src/routes/AssignmentRunner.tsx`, and `worker/index.ts`

## Maintenance
- Keep this `STATE.md` updated **after every commit**.

## Last Scanned
2026-02-21
