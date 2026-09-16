# Services removed on 2026-09-16

At the owner's request: Radar Xavier (Next dashboard), IVT Day, Deck Live,
Newsletter IVT, Tournage IVT and Archives IVT.

The website deployment removes their tracked sources and all cockpit references.
The strategy source document remains archived at www/dashboard/strategy.
At the owner's subsequent request, master/strategy.php and its cockpit entries
are also removed; that endpoint returns HTTP 404 after deployment.
The old /dashboard URL itself returns HTTP 410.

After website deployment, run ops/retire-xavier-services.sh vps1 on the website VPS.
For Contabo, stage this script and ops/nginx/vps2-xavier-services.conf with the same
relative layout, then run the script with vps2. These are explicit destructive
maintenance commands, not part of the recurring website deployment.

The script verifies the existing Nginx configuration before replacing it, validates
Nginx, disables and removes newsletter units and timer, deletes its dedicated app
and generated files, and removes the separate dashboard Compose project including
its two dedicated database volumes and four application images. Shared Docker
images and unrelated projects are untouched. VPS1 also removes the Tournage PM2
entry, IVT Remote service and obsolete morning-news cron entry.

IVT Radar, its daily timer, its shared Python libraries/database and machine token
remain intact. Its retired newsletter API routes return HTTP 410 at both gateways.
Clips, Recall, social account connections, the public website and
Xavier-only Umami analytics remain available.

Verify with php ops/master-services.test.php and php ops/master-access.test.php,
then check HTTP 410 on removed URLs, login to master, open Clips and IVT Radar,
and inspect both hosts for remaining processes or listeners of removed services.
