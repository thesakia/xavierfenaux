# Brief Mood

Production: `https://xavierfenaux.com/brief-mood/`. Hosted on Contabo under
`/opt/brief-mood`, data in `/var/lib/brief-mood`, loopback port 8790. The website
VPS only proxies the tool after the existing master SSO check. No new password.
The upstream connection uses TLS on port 8791 with certificate verification.
The self-signed `brief-mood.internal` certificate is explicitly trusted on VPS1;
its private key stays on VPS2 (0600). UFW and Nginx restrict access to VPS1.
The certificate installed September 2026 expires September 2036; renew and copy
the public certificate to VPS1 before then, with coordinated Nginx reloads.

## Daily Workflow

- Research starts at 03:00 Europe/Paris, every day including weekends.
- The server sends to `xfenaux@gmail.com` and `fenauxft@gmail.com` as soon as
  preparation succeeds, via systemd OnSuccess. There is no fixed 04:00 send.
  The preparation timer follows the Europe/Paris IANA timezone.
- The 58-minute preparation timeout bounds the run. Failed or
  incomplete research produces an explicit failure email via OnFailure, never yesterday's text.
- These are production systemd timers, independent of the desktop app being open.
  A separate Codex thread heartbeat checks the outcome at 04:10 and is quiet on
  success. It must never send a duplicate email.
- RSS leads use the Radar collector, but its database, daily job and source
  configuration are unchanged. The existing Codex login performs live search,
  writing and an independent source audit. No API billing fallback is configured.
- A generated edition can be selected, revised, exported, copied, completed with
  polarities and marked as read by Xavier. Research and validation notes are
  separate from the plain text export. Nothing is posted to social networks.

## Research Controls

`prompts.md` contains the editorial contract supplied by the user. A structured
research dossier separates published events from scheduled announcements, includes
the previous actual US session and concrete company news, and records evidence
and sources. The source audit also checks qualitative market reactions against
the appropriate session. Numeric index/equity changes are allowed sparingly when
useful, sourced and contextualized; their presence alone never blocks an edition.

Length is an editorial target, not a delivery gate. Drafting aims for 700-800
words including headings, within the preferred 600-900 range. Up to three
editorial correction passes address length and formatting before the independent
factual audit. Remaining length deviations are recorded in audit.editorial_notes
but do not prevent delivery. Unverified facts and missing sources still block it.
Intermediate drafts are saved so a failed run does not discard the writing.
Drafts remain visible, copyable and downloadable while checks run or fail.
Marking a failed draft as read never changes its verification state or sends it.

After a positive factual audit, unconfirmed source URLs trigger up to two
targeted searches for canonical pages or reliable replacements. Every replacement
must explicitly support all associated claims; facts and texts remain unchanged.
Original failed checks and replacement evidence remain in the audit trail.
`core.py recover` retries this step for today's latest failed edition only,
requiring a positive factual audit, and sends it through the idempotent mailer
only after full source coverage and validation.

Ready edition history and imported published examples are given to subsequent
research/audit runs. Known examples from September 11 and 16 were imported at
setup. This is not a claim that all historical X posts have been imported.
Fresh developments in a continuing story must be distinguished from repetition.
Missing polarities are never invented; the email indicates they need completion.
Each day varies the closing theme and format, not merely the protagonist.
Discipline, sport, quotations and a trading moral are not mandatory. Original
reflections without external factual claims may have a null closing source;
anecdotes, quotations and external factual claims still require source auditing.
All stored prior ready editions supply a
closing archive; exact story, repeated source (ignoring tracking query strings),
and repeated final-text checks complement the semantic source audit. The prompt
requests a different protagonist from the previous day when using an anecdote.
Model checks reduce errors but are not a guarantee of factual correctness;
Xavier can inspect each source and approve the edition.
An unsuccessful source audit gets one correction pass and a fresh audit.
Persistent factual/source failures block publication and normal content delivery.

## Email

The old website's local mail relay was rejected by Gmail for missing sender
authentication. Brief Mood instead uses the existing authenticated Gmail SMTP
configuration owned by FT, copied privately from the Recall service configuration
to `/etc/brief-mood.env` (root, 0600). The Recall service itself is not changed.
Sender: `Brief Mood <fenauxft@gmail.com>`. No credentials belong in Git, logs,
API responses, prompts or the browser. The model subprocess receives a minimal
environment without SMTP credentials.

SQLite journals sends per day/recipient. A confirmed brief is not sent again.
A confirmed failure notice does not prevent one subsequent recovered brief;
the two message kinds have different deterministic Message-IDs.
`sending` or `uncertain` is never retried automatically because SMTP may already
have accepted the message. Definitive connection/authentication failures may be
retried up to the systemd start limit. `accepted` means the authenticated SMTP
server accepted the message, not proof it was read or placed in the inbox.

## Install / Verify

1. Copy this directory to `/opt/brief-mood` and run `deploy.py` as root with the
   Radar virtualenv. It privately imports SMTP settings and installs units.
2. Enable the web service. Install the `brief-mood-vps1.conf` and
   `brief-mood-vps2.conf` Nginx snippets and include each in the Xavier vhost.
   Install `brief-mood-tls-vps2.conf` as a VPS2 vhost, create the TLS certificate
   with SAN `DNS:brief-mood.internal`, and install its public certificate at
   `/etc/nginx/brief-mood-upstream.crt` on both hosts. Keep its private key only
   on VPS2 at `/etc/nginx/brief-mood-upstream.key`. Allow TCP 8791 from VPS1 only.
   Back up the original configs, run `nginx -t`, then reload.
3. Deploy the small master navigation/service registry changes to the website.
4. Run tests using the isolated test virtualenv and production dependencies.
5. Verify one real research/write/audit run, desktop/mobile pages, exports and
   authenticated SMTP delivery before considering installation complete.
6. Enable `brief-mood-prepare.timer`; disable the obsolete `brief-mood-send.timer`.
   The prepare service triggers the send service on success or failure. Check the
   next trigger with `systemctl list-timers` and `systemd-analyze calendar`.

Useful controls: `systemctl start brief-mood-prepare.service` and
`systemctl start brief-mood-send.service`. The latter is a real email send,
not a dry run. Do not use it as a health check. Health/state lives in SQLite
and the authenticated `api/state` endpoint.

Queued/working editions older than two hours are marked interrupted on the next
creation. Restart recovery respects a generation lock held by a separate daily
job. There is no automatic bypass of source or editorial validation.

## Backups

Website master files: `/var/backups/xavier-master-before-brief-mood.tgz` on VPS1.
Nginx originals: `/etc/nginx/xavierfenaux.before-brief-mood.conf` on VPS1 and
`/etc/nginx/xavier-services.before-brief-mood.conf` on VPS2.
Disabling Brief Mood's preparation timer and web service does not affect Radar, Clips,
Recall or the public website.
