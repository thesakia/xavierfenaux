# Brief Mood task agents

The daily server pipeline invokes separate ephemeral Codex sessions. These are
production agents, not desktop threads. It uses the existing server subscription;
no new provider, API key or paid external service has been introduced.

| Agent | Default model | Reasoning | Tools |
| --- | --- | --- | --- |
| Financial research | gpt-5.6-sol | high | public web |
| Closing editorial | gpt-5.6-terra | medium | public web for attributions |
| French brief writer | gpt-5.6-terra | medium | none |
| Podcast and SEO | gpt-5.6-luna | medium | none |
| Editorial repair | gpt-5.6-terra | medium | none |
| Independent auditor | gpt-5.6-sol | high | public web |
| Factual repair | gpt-5.6-sol | high | public web |
| Source recovery | gpt-5.6-sol | high | public web |

Collection, scheduling, schema/date rules, orchestration and SMTP delivery remain
deterministic code: no AI tokens for those tasks. Repair agents run only when
needed. Closing receives only the day and closing history; podcast receives the
brief and its evidence, not the research session's conversation.

Lighter agents fall back to Sol on execution/JSON failures. Editorial generation
after a failed factual audit uses Sol directly. The independent auditor and the
existing verified-delivery policy remain unchanged. No model can send mail.

Override models with `BRIEF_MODEL_<ROLE>` in the private service environment.
Only choose models available to the server account. Agent usage and wall time
are recorded in `/var/lib/brief-mood/agent-runs.jsonl`; no prompts or credentials
are in that telemetry. Subscription usage is not equivalent to API dollar costs.
Savings and comparative quality require real runs; they are not guaranteed by
this routing table. Avoid adding more agents without a measured benefit.

The server starts at 03:00 Europe/Paris and checks every 20 minutes until 11:40.
A ready edition skips all generation; SMTP delivery is idempotent. Failed runs
reuse the same day's dossier and draft when its evidence has not changed, then
run an independent audit again. Three attempts per run remain bounded by the
service timeout. A running service is not started twice by its timer. An outage
can still prevent delivery; accepted failure alerts never count as a sent brief.
The reserved citation `previous_us_session` refers to `session_source`, which
must still be verified by the audit. Unknown news identifiers remain errors and
are reported explicitly to the repair agent.

Failed factual audits first trigger a targeted draft correction, preserving
unaffected passages, followed by a new independent audit. Only if that fails
does the pipeline repair the research dossier and regenerate. Resuming a failed
edition also applies its saved audit before checking the same text again.
