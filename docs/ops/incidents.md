# Incident Runbook

## Purpose
Use this runbook to triage and mitigate launch-critical failures. Always capture `X-Request-Id` from failing responses and include it in incident notes.

## Global Triage Steps
1. Confirm impact scope:
   - failing endpoint(s)
   - first seen time
   - error rate trend
2. Capture at least three failing request IDs.
3. Correlate request IDs in Cloudflare logs by `route`, `failureType`, and `requestId`.
4. Apply service-specific playbook below.
5. Post status update with mitigation ETA.

## OCR Outage Playbook
- Symptoms:
  - `/api/ocr` returns `OCR_UPSTREAM_FAILURE` or `OCR_UPSTREAM_TIMEOUT`
- Immediate actions:
  - Confirm `GOOGLE_CLOUD_API_KEY` is still configured.
  - Check provider status and quota usage.
  - Validate payload size distribution for spikes.
- Mitigation:
  - Instruct support/users to retry while outage is active.
  - If sustained outage > 30 min, pause launch progression and communicate degraded grading.

## Claude Outage Playbook
- Symptoms:
  - `/api/verify-with-claude` returns `CLAUDE_UPSTREAM_FAILURE` or `CLAUDE_UPSTREAM_TIMEOUT`
- Immediate actions:
  - Verify `ANTHROPIC_API_KEY` availability.
  - Check provider status and request limits.
- Mitigation:
  - Keep core grading flow active and disable optional Claude verification until stable.
  - Log this as an optional feature operating in degraded mode, not a full service outage.

## R2 Degradation Playbook
- Symptoms:
  - report or assignment routes return `REPORT_STORAGE_FAILURE` or `ASSIGNMENT_STORAGE_FAILURE`
- Immediate actions:
  - Validate `STORAGE` binding and bucket health.
  - Run smoke script against production URL to confirm write/read failure.
- Mitigation:
  - Pause new rollout promotions.
  - Retry after R2 health recovery and confirm with smoke script.

## Email Failure Playbook
- Symptoms:
  - report uploads succeed but notification emails are not delivered
  - logs show `report_notification_email_error`
- Immediate actions:
  - Validate `RESEND_API_KEY` and sender domain state.
  - Check provider status and bounce/suppression info.
- Mitigation:
  - Keep report generation active.
  - Provide report link manually to affected users.
  - Treat as non-blocking for core grading unless pilot SLA is breached.

## Escalation And Closure
- Escalate to on-call engineer when:
  - P0 gate blocked for > 15 minutes
  - repeated failures across multiple providers
- Close incident only after:
  - error rates return to baseline
  - smoke flow passes
  - post-incident notes include representative request IDs
