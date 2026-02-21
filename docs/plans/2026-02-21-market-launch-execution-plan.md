# Market Launch Execution Plan

**Goal:** Ship a controlled, market-ready launch of Handwriter Helper with production reliability, trust transparency, and measurable funnel outcomes.

**Architecture:** Keep the existing React/Vite frontend and Cloudflare Worker backend architecture. Focus execution on launch blockers: production config validation, reliability hardening, observability, trust/compliance surface, and launch funnel instrumentation.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Workers, Cloudflare R2, Vitest, ESLint

---

## Task 1: Launch Gate Baseline And Go/No-Go Criteria

**Files:**
- Create: `docs/ops/launch-gate.md`
- Modify: `docs/plans/2026-02-21-launch-readiness-checklist.md`

**Step 1: Define launch gates**
- Add explicit pass/fail gates for:
  - secrets configured in production
  - R2 read/write verified
  - create assignment -> submit -> view report smoke flow
  - error-path validation for OCR/Claude/report upload

**Step 2: Define launch levels**
- Add rollout modes:
  - `internal`
  - `pilot`
  - `public`
- Define entry/exit criteria for each mode.

**Step 3: Add owner + SLA fields**
- Add owner, target date, and fallback action for each gate item.

**Step 4: Validate docs build quality**
Run: `npm run lint && npm run test && npm run build`
Expected: all pass.

---

## Task 2: Production Configuration Verification Script

**Files:**
- Create: `scripts/check-launch-env.sh`
- Modify: `README.md`

**Step 1: Add script that validates required env inputs**
- Validate required names:
  - `APP_URL`
  - `GOOGLE_CLOUD_API_KEY`
  - `SIGNING_SECRET`
- Validate optional names:
  - `RESEND_API_KEY`
  - `ANTHROPIC_API_KEY`

**Step 2: Add lightweight format checks**
- `APP_URL` must be absolute `https://`
- secrets must be non-empty.

**Step 3: Document script usage**
- Add command and expected output in `README.md`.

**Step 4: Validate**
Run: `bash scripts/check-launch-env.sh` (with sample env setup)
Expected: clear pass/fail output and non-zero exit on failure.

---

## Task 3: End-To-End Smoke Harness For Critical User Flow

**Files:**
- Create: `scripts/smoke/smoke-report-flow.sh`
- Modify: `docs/ops/launch-gate.md`

**Step 1: Implement API smoke flow**
- Health check: `GET /api/health`
- Create assignment: `POST /api/assignment`
- Retrieve assignment: `GET /api/assignment/:id`
- Upload synthetic encrypted report payload: `POST /api/report`
- Retrieve report: `GET /api/report/:id`

**Step 2: Add deterministic pass/fail output**
- Emit concise status lines for each step.
- Exit non-zero if any step fails.

**Step 3: Document required env vars for script**
- `BASE_URL`
- optional auth headers if needed later.

**Step 4: Validate**
Run: `bash scripts/smoke/smoke-report-flow.sh`
Expected: all steps pass in staging/prod before launch.

---

## Task 4: Reliability Hardening For External Service Failures

**Files:**
- Modify: `worker/index.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/routes/Home.tsx`
- Modify: `src/routes/AssignmentRunner.tsx`
- Modify: `src/routes/ReportViewer.tsx`
- Test: `worker/index.test.ts`
- Test: `src/lib/api.test.ts`

**Step 1: Normalize upstream failure responses**
- Add stable error codes/messages for OCR/Claude/report failures in worker responses.

**Step 2: Improve client mapping for retry UX**
- Map error codes to actionable user messages.
- Ensure all critical flows provide retry affordance.

**Step 3: Add tests for failure branches**
- Worker tests for upstream timeout/error paths.
- API client tests for structured error parsing.

**Step 4: Validate**
Run: `npm run test && npm run lint && npm run build`
Expected: all pass with new failure-path coverage.

---

## Task 5: Observability And Incident Triage Surface

**Files:**
- Modify: `worker/index.ts`
- Create: `docs/ops/incidents.md`
- Modify: `docs/ops/launch-gate.md`

**Step 1: Add request correlation id handling**
- Generate/request-pass-through a request id.
- Include it in error responses and logs.

**Step 2: Add structured error logs**
- Log route, failure type, and request id.
- Avoid sensitive payloads.

**Step 3: Write incident runbook**
- OCR outage playbook
- Claude outage playbook
- R2 degradation playbook
- email failure playbook

**Step 4: Validate**
- Confirm logs include request ids on forced error-path tests.

---

## Task 6: Trust Surface Completion For Market Launch

**Files:**
- Modify: `src/routes/Privacy.tsx`
- Modify: `src/routes/About.tsx`
- Modify: `README.md`
- Create: `docs/legal/data-retention-policy.md`

**Step 1: Add explicit retention policy text**
- Define retention duration for assignment/report artifacts.
- Define deletion request path (manual support process if no UI yet).

**Step 2: Align all trust language**
- Ensure in-app and docs use identical wording for:
  - OCR processing
  - optional Claude usage
  - encryption key behavior (standard flow vs email flow)

**Step 3: Validate consistency**
- Grep audit for conflicting statements.
Run: `rg -n "processed in your browser|never uploaded|key.*never sent" src README.md docs`
Expected: no contradictory trust claims.

---

## Task 7: Funnel Instrumentation For Pilot-To-Public Growth

**Files:**
- Modify: `src/routes/Home.tsx`
- Modify: `src/routes/AssignmentRunner.tsx`
- Modify: `src/routes/ReportViewer.tsx`
- Create: `src/lib/analytics.ts`
- Create: `docs/ops/funnel-metrics.md`

**Step 1: Add minimal analytics abstraction**
- Add event function with pluggable transport.
- No vendor lock in initial implementation.

**Step 2: Emit key events**
- `assignment_created`
- `submission_started`
- `grading_completed`
- `report_link_generated`
- `report_viewed`

**Step 3: Define KPI dashboard spec**
- conversion rates between funnel steps
- median processing duration
- report-open rate

**Step 4: Validate**
- Unit-test event payload shaping where practical.
- Manual verification via browser devtools logs.

---

## Task 8: Controlled Launch Execution

**Files:**
- Modify: `docs/ops/launch-gate.md`
- Modify: `docs/plans/2026-02-21-launch-readiness-checklist.md`

**Step 1: Internal launch**
- Run smoke scripts and full verification.
- Collect 24h error-rate baseline.

**Step 2: Pilot launch (5-10 users)**
- Collect user feedback and bug triage.
- Fix only P0/P1 issues during pilot window.

**Step 3: Public launch decision**
- Require all P0 gates green.
- Require pilot error rate and completion funnel within targets.

**Step 4: Post-launch first week plan**
- Daily metrics review + incident triage checkpoint.

---

## Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8

## Acceptance Criteria

- P0 launch gates are explicit, owned, and measurable.
- All critical flows have smoke coverage and retry-ready error UX.
- `npm audit`, `npm run lint`, `npm run test`, `npm run build` pass on launch branch.
- Privacy/trust language is consistent across app and docs.
- Funnel metrics are available to evaluate pilot and public launch readiness.
