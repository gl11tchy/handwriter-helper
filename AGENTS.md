# AGENTS.md - Handwriter Helper

This folder is the project workspace. Treat this as source of local truth for behavior and maintenance.

## Context & Purpose

Handwriter Helper is a React/Vite frontend + Cloudflare Worker backend for handwriting assignment creation, OCR grading, optional AI verification, and encrypted report storage.

## Working Rules

- Before making any code changes, verify current structure and guidance from:
  - `STATE.md` (required)
  - `README.md`
  - `CLAUDE.md`
- Do not assume behavior from memory. Read the relevant files first.
- Keep changes scoped and explicit; avoid broad refactors unless requested.

## Required Maintenance

- **Update `STATE.md` after every commit** to reflect current state.
- If `STATE.md` is missing details for a new change, extend it as part of the same change set.

## Verification

- Primary checks for this repo:
  - `npm install`
  - `npm run build`
  - `npm run test`
  - `npm run lint`
- If dependencies are not installed, note that test/build checks are blocked and include it in your status.

## Security & Ops Notes

- No in-app auth/session model for public assignment flow; trust model is signed payload + R2-scoped object keys.
- Never commit secrets or tokens. Secrets belong to deployment env only.
- Worker logs are for ops debugging only; avoid putting raw sensitive payloads there.

## Project Conventions

- Prefer small, isolated edits.
- Route handling:
  - Frontend routes under `src/routes/*`
  - Worker API routes under `worker/index.ts`
- Keep documentation short and actionable.
