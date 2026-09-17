# Clips imports

The existing authenticated raw-body `POST /api/episodes/{id}/video` accepts
MP4/MOV/M4V/MKV/WebM and ZIP. ZIP must contain exactly one video; Apple metadata
and other non-video files are ignored. No files are extracted using their paths.
Encrypted archives, symlinks, traversal, extreme compression, large directories
and oversized expanded videos are rejected. Both compressed and expanded files
are limited by `CLIPS_MAX_UPLOAD_MB`, and processing disk space is reserved.

`POST /api/episodes/{id}/icloud` accepts JSON `{ "url": "https://share.icloud.com/photos/..." }`.
It atomically stores the public share ID and queues a server-side import, returning
202 without holding the browser connection open. No Apple password, developer
account, browser session or third-party downloader is required. Private shares,
Drive links, expired links and multiple-video shares are rejected. Prefer the
original video when it fits the upload limit. If it is oversized, select Apple's
shared MP4 rendition, or its HDR medium rendition, within the same size limit
and with at least 720 pixels on the shorter side. Small previews are never used.
The shared rendition can be smaller and lower-resolution than the original;
the stored filename uses its actual container extension.

The resolver follows the anonymous CloudKit flow used by Apple's Photos web app:
`records/resolve` returns `anonymousPublicAccess`, the zone and database scope;
`records/query` reads that shared zone using `sharing_url_key` and the public
access token, then downloads the selected `CPLMaster.resOriginalRes`,
`resVidMedRes` or `resVidHDRMedRes` asset. Only Apple
CloudKit API hosts and icloud-content.com media hosts are allowed, with HTTPS,
public DNS address checks and redirect/size/time limits. This is Apple's web
protocol, not a guaranteed supported third-party API; Apple changes may require
an update. The public access token is never persisted or exposed to the browser.
Share IDs are removed after success or failure. Logs must not include share URLs
or Apple response bodies.

Protocol reference inspected on 2026-09-16:
https://www.icloud.com/applications/photos3/2634Build19/en-us/main.js
Apple public sharing help:
https://support.apple.com/en-asia/guide/icloud/mm93a9b98683/icloud

States: `zip_queued -> extracting -> sync_queued` and
`icloud_queued -> icloud_downloading -> sync_queued`. Import failures return to
`waiting_video` with a readable error and allow replacing the file/link. On
restart, interrupted downloads/extractions restart from the retained share ID or
ZIP. Transfers are serialized using the existing episode job queue. Progress is
stored separately and exposed only for active imports.

Deployment: back up app.py, worker.py and static/app.js/style.css; deploy those
files plus imports.py together on VPS2 under /opt/ft-clips. No new production
dependencies or database migration. Wait for active processing and uploads to
finish before restarting ft-clips.service. The website GitHub deploy does not
deploy this Python service.

Tests: `python -m pytest tests/test_imports.py tests/test_mobile_upload.py -q`
using an isolated copy of the service and a disposable database. Includes a real
HEVC MOV inside ZIP. iCloud success uses protocol fixtures; a current user-provided
public video link is needed for an end-to-end Apple download verification.
