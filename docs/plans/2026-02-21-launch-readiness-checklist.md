# Launch Readiness Checklist (v2)

## Current Status (2026-02-21)

- `npm run build`: pass
- `npm run lint`: pass (warnings only)
- `npm run test`: pass (`128/128`)
- Trust/Privacy UX pass: completed (`/privacy` page + in-app copy alignment)

## Rollout Levels

### internal
- Entry:
  - Launch gates are documented with owner/date/SLA/fallback
  - Env validation and smoke scripts are available
  - Branch checks (`lint`, `test`, `build`) pass
- Exit:
  - All P0 gates pass in deployed environment
  - 24h internal error-rate baseline collected

### pilot
- Entry:
  - Internal exit criteria complete
  - Pilot cohort of 5-10 users active
  - Daily triage rhythm in place
- Exit:
  - No open P0/P1 issues
  - Funnel and error-rate targets are within launch thresholds

### public
- Entry:
  - Pilot exit criteria complete
  - Go/no-go decision recorded by launch owner

## P0 Launch Gates (Must Be Green)

| Gate | Status | Owner | Target Date | SLA | Fallback Action |
| --- | --- | --- | --- | --- | --- |
| Secrets configured in production (`APP_URL`, `GOOGLE_CLOUD_API_KEY`, `SIGNING_SECRET`) | [ ] | Engineering | 2026-02-22 | Block launch until fixed | Hold rollout at `internal`; re-run env validation |
| R2 read/write works in production (`STORAGE`) | [ ] | Engineering | 2026-02-22 | Recover within 1h | Pause rollout; fix binding/policy; re-run smoke |
| Smoke flow passes (create assignment -> submit -> view report) | [ ] | Engineering + QA | 2026-02-22 | Recover within 2h | Stop progression; hotfix and rerun smoke |
| Error-path validation complete (OCR/Claude/report upload failure branches) | [ ] | Engineering | 2026-02-22 | Acknowledge 1h, mitigate 4h | Disable optional Claude path, keep retry UX, hold promotion |
| Observability triage readiness (request IDs + runbook) | [ ] | Engineering + Ops | 2026-02-22 | Ack in 15m | Freeze rollout; execute incident playbook |

## P1 (Before Scaled Traffic)

| Item | Status | Owner | Target Date | SLA | Fallback Action |
| --- | --- | --- | --- | --- | --- |
| Publish retention/deletion policy | [ ] | Product + Engineering | 2026-02-23 | Complete before paid traffic | Keep launch in `pilot` only |
| Support path for broken links/OCR failures | [ ] | Support + Engineering | 2026-02-23 | First response < 1 business day | Route requests to manual support inbox |
| Health dashboard and alerting for `/api/health`, OCR failures, report failures | [ ] | Ops | 2026-02-24 | Alert within 5m of threshold breach | Manual log checks every 4h |
| Incident runbook for Google Vision/Anthropic/Resend/R2 | [ ] | Engineering + Ops | 2026-02-23 | Draft before public launch | Pause at `pilot` until completed |

## P2 (Growth And Conversion)

| Item | Status | Owner | Target Date | SLA | Fallback Action |
| --- | --- | --- | --- | --- | --- |
| Landing page CTA messaging test | [ ] | Product | 2026-02-28 | Weekly review | Use current baseline copy |
| Funnel instrumentation (`assignment_created`, `submission_started`, `grading_completed`, `report_link_generated`, `report_viewed`) | [ ] | Engineering | 2026-02-24 | Daily KPI refresh | Manual event sampling |
| Pilot feedback loop (5-10 users, weekly triage) | [ ] | Product + Engineering | 2026-02-28 | Weekly triage | Extend pilot window |

## Recommendation

Proceed to `internal` immediately, then promote only when every P0 gate above is green.

## Controlled Launch Steps

### Step 1: Internal launch
- [ ] Run `bash scripts/check-launch-env.sh` in production-like environment.
- [ ] Run `BASE_URL=\"https://<deployed-url>\" bash scripts/smoke/smoke-report-flow.sh`.
- [ ] Run `npm run lint && npm run test && npm run build`.
- [ ] Collect 24h baseline error rate and capture request IDs for any failures.

### Step 2: Pilot launch (5-10 users)
- [ ] Enable pilot cohort and capture structured feedback daily.
- [ ] Track funnel conversion and median processing duration.
- [ ] Restrict pilot fixes to P0/P1 issues.

### Step 3: Public launch go/no-go
- [ ] Confirm all P0 gates are green.
- [ ] Confirm pilot error rate and funnel completion are within target ranges.
- [ ] Record launch owner decision and timestamp.

### Step 4: Post-launch first week
- [ ] Run daily metrics review.
- [ ] Run daily incident triage checkpoint using request IDs.
- [ ] Log new launch risks and update fallback actions.
