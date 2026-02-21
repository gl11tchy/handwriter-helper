# Funnel Metrics

## Event Definitions
- `assignment_created`: assignment link created successfully.
- `submission_started`: user started an upload+grade flow.
- `grading_completed`: grading pipeline completed.
- `report_link_generated`: encrypted report link generated successfully.
- `report_viewed`: report page opened and decrypted successfully.

## KPI Specification

### Conversion Rates
- Assignment -> Submission start:
  - `submission_started / assignment_created`
- Submission start -> Grading complete:
  - `grading_completed / submission_started`
- Grading complete -> Report link generated:
  - `report_link_generated / grading_completed`
- Report link generated -> Report viewed:
  - `report_viewed / report_link_generated`

### Median Processing Duration
- Definition:
  - median time from `submission_started` to `grading_completed`
- Segment by:
  - route source (`home_quick_grade`, `assignment_runner`)
  - file type (`image/*`, `application/pdf`)

### Report Open Rate
- Definition:
  - `report_viewed / report_link_generated`
- Watch for drops by cohort during pilot.

## Pilot Targets (Initial)
- Keep grading completion conversion stable day-over-day.
- Keep median processing duration within acceptable user wait tolerance.
- Maintain report open rate high enough to indicate links are usable and trusted.

## Validation Notes
- Default analytics transport logs events to browser devtools (`[analytics]` prefix).
- During pilot, verify event sequence manually before wiring a production sink.
