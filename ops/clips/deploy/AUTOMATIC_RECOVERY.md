# Automatic recovery

Recovery runs on Contabo inside the existing worker. No desktop, Chrome session,
MCP server or unrestricted code-writing agent is required.

- iCloud preparation: retain the share, retry every minute for up to 30 minutes.
- Network timeouts and selected provider 408/429/5xx errors: up to three retries
  per stage and unchanged media inputs, with exponential delay.
- Invalid selection: pass precise validation errors to the existing editorial
  model for up to two corrections; validate again before creating any cuts.
- Missing master: rebuild from existing audio/video only after validating the
  saved synchronization plan. Never guess a new plan or bypass its checks.
- Local rendering failures and generated description failures: retry bounded
  replay-safe work. Source recordings are never modified by recovery.
- DailyVest unavailable: record sanitized bridge health, show quota/outage reason
  and keep checking. Do not silently present an upstream outage as a missing file.

Recovery records live in Clips meta keys `auto-recovery:<episode>:<stage>` and
selection-window repair records. Unknown defects, authentication failures,
identity mismatches and failed content checks remain actionable errors.
No external publication, Opus project creation, subscription purchase, secret
change or arbitrary shell/code patch is authorized by the recovery module.

Brief Mood uses independent factual audits and targeted corrections before
research regeneration. Scheduled and cockpit jobs share bounded retries, recorded
in `recovery_log`. Its server timer retries morning failures without duplicate
SMTP delivery. SMTP `sending`/`uncertain` still requires reconciliation.
