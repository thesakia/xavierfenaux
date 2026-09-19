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
