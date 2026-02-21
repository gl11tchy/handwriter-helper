# Launch Gate

## Purpose
This document defines launch pass/fail gates, rollout levels, and ownership details for a controlled market launch.

## P0 Gate Criteria (Must Pass)

| Gate | Pass Criteria | Owner | Target Date | SLA | Fallback Action |
| --- | --- | --- | --- | --- | --- |
| Production secrets configured | `APP_URL`, `GOOGLE_CLOUD_API_KEY`, and `SIGNING_SECRET` are present and valid in production. Optional keys (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`) are set intentionally (enabled or intentionally omitted). | Engineering | 2026-02-22 | Block release until validated in prod env check | Keep launch mode at `internal`, fix env, re-run env check script |
| R2 read/write verified | Production worker can write and read assignment/report objects from `STORAGE` without errors. | Engineering | 2026-02-22 | Resolve within 1 hour during launch windows | Pause rollout, validate R2 binding and bucket policy, retry smoke flow |
| End-to-end smoke flow verified | Deployed flow succeeds: create assignment -> submit sample -> view generated report. | Engineering + QA | 2026-02-22 | Resolve within 2 hours before mode progression | Stay in current mode, hotfix P0 issue, rerun smoke harness |
| Error path validation | Forced failure-path tests confirm safe behavior for OCR errors, Claude errors, and report upload failures. | Engineering | 2026-02-22 | Triage within 1 hour; mitigation within 4 hours | Disable optional Claude path if needed, show retry UX, hold progression |
| Observability and triage readiness | Request IDs are present in error responses/logs, and incident runbook (`docs/ops/incidents.md`) exists for OCR/Claude/R2/email issues. | Engineering + Ops | 2026-02-22 | Incident acknowledgment within 15 minutes | Freeze rollout and run incident playbook |

## Rollout Modes

### internal
- Entry criteria:
  - P0 gates drafted with owners and fallbacks
  - Env validation and smoke script available
  - Core checks passing in branch (`lint`, `test`, `build`)
- Exit criteria:
  - All P0 gates green in deployed environment
  - 24h baseline error rate collected

### pilot
- Entry criteria:
  - Internal mode exit criteria met
  - 5-10 pilot users identified
  - Feedback/triage channel active
- Exit criteria:
  - No unresolved P0/P1 defects
  - Pilot completion funnel and error rate within target ranges

### public
- Entry criteria:
  - Pilot exit criteria met
  - Go/no-go decision recorded by owner
- Exit criteria:
  - N/A (steady-state operations)

## Operational Verification Commands

```bash
npm run lint
npm run test
npm run build
```

For deployed verification:

```bash
bash scripts/check-launch-env.sh
BASE_URL="https://<deployed-host>" bash scripts/smoke/smoke-report-flow.sh
```

## Smoke Script Inputs
- Required:
  - `BASE_URL` - deployed app URL used for `/api/*` checks
- Optional:
  - `SMOKE_AUTH_HEADER` - reserved for future protected environments (`Header: value`)

## Launch Progression Rules
- Do not promote to `pilot` unless all P0 gates pass.
- During `pilot`, fix only P0/P1 issues before `public`.
- Promote to `public` only after explicit go/no-go review and pilot metrics validation.

## Request-ID Validation For Error Paths
- Force at least one known failure per critical route before launch:
  - `/api/ocr`
  - `/api/verify-with-claude`
  - `/api/report`
- Confirm both are present:
  - response header `X-Request-Id`
  - error payload field `requestId`
- Confirm worker logs include:
  - `route`
  - `failureType`
  - `requestId`

## Controlled Launch Execution

### Internal Launch
- Run:
  - `bash scripts/check-launch-env.sh`
  - `BASE_URL="https://<internal-or-staging-url>" bash scripts/smoke/smoke-report-flow.sh`
  - `npm run lint && npm run test && npm run build`
- Collect:
  - 24h baseline error rate from worker logs
  - representative request IDs for any failures

### Pilot Launch (5-10 users)
- Enable access for pilot cohort only.
- Review daily:
  - P0/P1 bug list
  - funnel conversion between instrumented steps
  - median processing duration
- Policy:
  - fix only P0/P1 issues during pilot window
  - defer non-critical polish to post-public backlog

### Public Launch Decision
- Require before promotion:
  - all P0 gates green
  - pilot error rate within acceptable launch threshold
  - pilot funnel completion within expected range
- Record explicit go/no-go owner sign-off.

### Post-Launch Week 1
- Daily checkpoints:
  - metrics review (funnel + latency + report-open rate)
  - incident triage review with request-ID evidence
  - launch gate regression scan
