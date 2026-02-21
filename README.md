# Handwriter Helper

Handwriter Helper (writinglines.com) is a React + Cloudflare Worker app for handwriting assignments.

## What It Does

- Creates signed assignment links for handwriting practice
- Grades uploaded handwriting using OCR
- Optionally verifies uncertain OCR lines with Claude Vision
- Stores encrypted reports in R2 and shares them by link

## Stack

- Frontend: React 19 + TypeScript + Vite + Tailwind CSS 4
- Backend: Cloudflare Worker (`worker/index.ts`)
- Storage: Cloudflare R2 (`STORAGE` binding)
- OCR: Google Cloud Vision (via Worker proxy)

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
```

## Core Routes

- `/` - Create assignment and quick grade
- `/a/:assignmentId` - Run a signed assignment submission
- `/r/:reportId` - View encrypted report
- `/about` - Product overview
- `/privacy` - Privacy and data handling details

## API Endpoints

- `GET /api/health`
- `POST /api/ocr`
- `POST /api/verify-with-claude`
- `POST /api/assignment`
- `GET /api/assignment/:assignmentId`
- `POST /api/report`
- `GET /api/report/:reportId`

## Environment

Cloudflare Worker secrets:

- `GOOGLE_CLOUD_API_KEY` (required for OCR)
- `SIGNING_SECRET` (required for assignment signing/verification)
- `RESEND_API_KEY` (optional, assignment email notifications)
- `ANTHROPIC_API_KEY` (optional, Claude verification for uncertain lines)

Worker vars/bindings configured in `wrangler.toml`:

- `APP_URL`
- `ENVIRONMENT`
- `STORAGE` (R2 bucket binding)
- `ASSETS` (static asset binding)

## Launch Env Validation

Use the launch check script before pilot/public rollout:

```bash
APP_URL="https://writinglines.com" \
GOOGLE_CLOUD_API_KEY="set-in-shell-or-secret-loader" \
SIGNING_SECRET="set-in-shell-or-secret-loader" \
bash scripts/check-launch-env.sh
```

Expected output shape:

```text
Checking launch environment configuration...
[PASS] APP_URL uses https:// and appears absolute
[PASS] GOOGLE_CLOUD_API_KEY is set
[PASS] SIGNING_SECRET is set
[WARN] RESEND_API_KEY not set (feature disabled)
[WARN] ANTHROPIC_API_KEY not set (feature disabled)

Launch environment check PASSED.
```

The script exits non-zero when required variables are missing/invalid.

## Privacy Model

- Uploaded images or PDFs are sent to backend OCR services for grading.
- Google Cloud Vision is used for OCR processing.
- If enabled by deployment settings, uncertain line snippets may be sent to Anthropic Claude for secondary verification.
- Reports are encrypted in your browser before upload.
- In the standard flow, the decryption key stays in the URL fragment (`#k=<key>`) and is not sent with report upload.
- If assignment email notifications are enabled, the decryption key is included with report upload only so the backend can send a usable emailed report link; stored report objects remain ciphertext plus metadata.
- Signed assignment payloads and encrypted reports are retained for up to 30 days.
- Deletion requests are handled manually via support at `support@writinglines.com`.

## Deploy

```bash
npx wrangler deploy
```
