# DailyVest transcript bridge

DailyVest (`mood-worker`) stays on VPS1 (76.13.48.6); Clips runs on Contabo
(169.58.52.139). Do not run `docker exec mood-worker` locally on Contabo.

The 2026-09-16 incident affected both podcasts published that morning. Their
transcripts already existed in DailyVest, but the migrated export timer still
looked for a local container. This was not a latest-episode or same-date collision.
Caches are keyed by SHA-256 of the Acast GUID, and Clips validates the original
GUID again before selection. No additional transcription was needed.

## Deployed layout

- VPS1: `export_transcripts.py` installed root-owned at
  `/usr/local/libexec/ft-clips-export-transcripts.py`. Its `--stdout` mode performs
  only the existing read-only transcript/segment queries in `mood-worker`.
- VPS2: the same script at `/opt/ft-clips/deploy/export_transcripts.py`, used by
  `ft-clips-transcripts.service`. Install `ft-clips-transcripts-remote.conf` as
  `/etc/systemd/system/ft-clips-transcripts.service.d/remote.conf`, then run
  `systemctl daemon-reload`. The existing two-minute timer remains enabled.
- VPS2 has a dedicated Ed25519 key at `/root/.ssh/ft-clips-transcripts` (0600).
  No DailyVest database credential is copied to Clips.
- The corresponding public key on VPS1 is restricted to the Contabo source IP,
  disables forwarding/PTY, and always runs the fixed read-only export command.
  Install with `authorize_transcript_source.py PUBLIC_KEY --source-ip 169.58.52.139`.
  It preserves existing authorized keys and refuses to modify different permissions
  on an already-installed matching key.
- VPS2 pins VPS1's Ed25519 host key in `/etc/ft-clips-transcript-known-hosts`.
  Obtain that public host key through an already-trusted administrator connection,
  not an unauthenticated first-connection prompt. SSH uses strict host-key checking.

All source data is fetched and validated before any cache update. Files are
atomically replaced, owned root:ft-clips (0640), under `/var/lib/ft-clips-transcripts`.
Failed transfers leave the previous cache intact. Existing empty transcripts are
not written. The operation neither transcribes nor regenerates DailyVest content.

## Check

```
python3 -m unittest discover -s /opt/ft-clips/tests -p test_transcript_export.py -v
systemctl start ft-clips-transcripts.service
journalctl -u ft-clips-transcripts.service -n 10 --no-pager
systemctl is-active ft-clips-transcripts.timer
```

A second successful export with unchanged data reports zero changed files.
Clips retries waiting transcripts automatically. Subsequent Groq selection limits
are independent of transcript availability; cached selection windows survive retries.
