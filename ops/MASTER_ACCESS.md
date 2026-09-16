# Persistent access and mobile Clips

## Master access

The master creates a random 256-bit persistent cookie valid for 30 days on
`xavierfenaux.com` (including www), Secure/HttpOnly/SameSite=Lax. Only its SHA-256
hash is stored in `/var/lib/xavier-master/access.json` (0600 inside a 0700 directory).
PHP sessions remain responsible for CSRF and OAuth flow state, not persistence.
Existing logged-in PHP sessions are upgraded once when they revisit master.

Nginx auth_request checks the master session before proxying Clips, Radar Xavier,
IVT Radar and Newsletter. Back-end Basic Auth credentials stay server-side.
The Next dashboard receives its own short session cookie as an upstream header;
it is obtained through the existing login API and cached for 10 hours. This avoids
changing the deployed Next application or forwarding a user-controlled identity.

For radar.ftfenaux.com, top-level redirects exchange a random 60-second, one-use,
host-bound ticket for a host-only persistent cookie linked to the original session.
Logging out of master revokes that session and all its linked grants immediately.
Existing browser data already loaded into a page is not remotely erased.
Sessions on other devices are independent.

`/etc/xavier-master/tool-access.json` contains the internal username/password used
for existing back-end authentication, mode 0640, root:www-data. Never commit it.
Nginx internal endpoints suppress request bodies, and SSO callback access logging
is disabled so tickets do not appear in access logs. Direct requests to the PHP
authentication helper and internal Nginx endpoints cannot obtain upstream secrets.

The TradingView and Clips provider webhooks keep their original validation.
The social networks' OAuth sessions are independent of the master login.
Public tools such as Tournage and Deck Live already open without another login.
Analytics now links to a master-authenticated, Xavier-only view of Umami data,
exported every five minutes with the existing reporting queries. No access to the
administration or to other websites is granted to Xavier.

## Deployment

Website code is deployed by GitHub Actions. `setup-master.sh` creates the private
directories and installs the analytics export cron. Provision tool-access.json
before running `bash ops/deploy-master-gateway.sh` on the website VPS. This script
checks the previous configuration hash, backs it up, runs nginx -t, and reloads;
it refuses to overwrite an independently modified configuration.

The files in `ops/clips` track the changed files from `/opt/ft-clips` on Contabo.
Deploy app.py, config.py and static assets there, keeping their root:ft-clips
ownership and existing permissions. Restart ft-clips only while no video job is
running. Dependencies, database, secrets and videos remain outside this repository.

## iPhone uploads

The two native file pickers accept video MIME types and MOV/MP4/M4V/MKV/WebM.
There is no forced camera capture, so Photos and Files remain available on iOS.
Raw File uploads use XMLHttpRequest with progress, cancel, a bounded timeout and
an optional screen wake lock. The page must stay open during transfer; browser
suspension can still interrupt uploads. Interrupted transfers can be retried.

The server accepts requests without Content-Length (bounded streaming), validates
the optional X-File-Size, counts actual bytes, maintains disk reserve, probes the
actual media and queues the existing workflow. MOV/HEVC, orientation and encoding
remain handled by FFmpeg. Existing limits remain 1000 MiB, 35s-90min, audio required.
Canonical and legacy HTTPS origins are allowlisted; arbitrary origins stay blocked.
Old stored media URLs are normalized to the working Xavier domain in the client.

## Tests

- `php ops/master-access.test.php`: session persistence independent of PHP, host
  binding, ticket replay rejection, logout across tools, and hashed storage.
- `pytest tests/test_mobile_upload.py`: origin checks, chunked uploads, byte limits,
  retry after failure and a real generated hvc1/HEVC MOV fixture.
- Browser: login once, visit Clips/Radar/Newsletter, restore browser state, verify
  access without a PHP session, then logout and check revocation on both domains.
- A real iPhone Photo Library/iCloud picker cannot be exercised by desktop browser
  emulation; its native interaction still benefits from a physical-device check.
