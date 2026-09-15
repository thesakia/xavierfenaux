# Xavier cockpit

The PHP cockpit remains on the website VPS at `/master/`. Radar, Clips and
Newsletter run on Contabo and retain their existing public entry points.

## Social data

Private runtime data is outside the repository/webroot in `/var/lib/xavier-master`.
It must be owned by www-data, mode 0700, and backed up with the service data.
`social.json` contains daily reports and source metadata. `connections.json`
contains OAuth tokens. Never expose or commit the latter.

`MASTER_SOCIAL_FILE` and `MASTER_PROVIDERS_FILE` can override the default paths
for isolated tests. Production provider settings live in
`/etc/xavier-master/providers.json`, owned root:www-data, mode 0640.
The example JSON intentionally contains no credentials.

## Activate connections

Register an OAuth application in each provider console and put its client ID
and client secret into the matching configuration entry. No passwords are needed
by the cockpit. These application credentials are not the Xavier master login.
Register this exact callback for all six applications:

`https://xavierfenaux.com/master/connect.php`

- X: OAuth 2.0 confidential web application, tweet.read/users.read/offline.access.
- Instagram: Instagram Login, a professional account and
  instagram_business_basic/instagram_business_manage_insights permissions.
- TikTok: Login Kit and approved user.info.basic/user.info.profile/user.info.stats/video.list scopes.
- YouTube: Web OAuth client with YouTube Data API v3 and YouTube Analytics API enabled;
  youtube.readonly and yt-analytics.readonly. Set channel_id to pin the channel;
  otherwise the connection checks the InteractivTrading channel name.
- Twitch: registered application, moderator:read:followers on the broadcaster account.
- Spotify: registered Web API application. This connects public show metadata,
  not ownership of the podcast or private Creators analytics.

Each user then clicks Connecter, authorizes on the provider, and returns to the
cockpit. The button disappears only after token exchange AND successful account
identity/statistics verification. Incorrect profiles are rejected. Reconnection
appears on expired or rejected credentials. Revocation from the provider itself
is available in that provider's application settings.

Install `ops/master-social.cron` in `/etc/cron.d/xavier-master-social`, root:root
0644, and create `/var/log/xavier-master-sync.log` writable by www-data. The job
checks once a minute, collects hourly, or after an explicit refresh. A lock
prevents overlapping runs. Set logrotate for the log. OAuth refresh tokens are
renewed server-side. Instagram long-lived tokens are refreshed before expiry.

## Metric meanings and limitations

- followers: snapshot of the total on a date, not a daily gain.
- posts/reactions/views/comments/shares: quantities for that day only.
- totalPosts/totalViews/totalLikes: lifetime profile totals, never summed as daily activity.
- Reactions in this cockpit means received likes, not a mixture of likes/comments/shares.
- A gain is shown only with follower snapshots on both exact period boundaries.
- Sparse totals explicitly display days/accounts covered; null never becomes zero.
- Sources are retained separately for each metric when manual and API values mix.
- The six provider links were supplied/confirmed by FT on 2026-09-15.
- YouTube daily analytics uses the reporting timezone of YouTube, and may lag.
- Spotify does not expose private podcast analytics through this Web API connection.
  Those require a Creators export or a manual daily report.
- Current API collectors retrieve follower/profile totals where available and
  YouTube daily views/likes/comments/shares. Other daily values require imports.

CSV imports use the cockpit template, not arbitrary vendor exports. They are
validated as a complete batch before saving; a repeated date updates that date
without doubling totals. Blank fields preserve existing values. Authentication
and CSRF validation are required for every mutation. Tokens are never sent in
the JSON response or rendered in the browser.

## Verification

Run `node --test ops/master-metrics.test.cjs` and PHP lint on the master PHP files.
Run `php ops/master-store.test.php` with a writable temporary directory.
Verify login, six accounts, disconnected/configuration states, form validation,
CSV import and export, filters, navigation and mobile overflow in a browser.
OAuth end-to-end requires actual registered provider applications and user consent;
do not describe an unconfigured integration as live or tested end-to-end.
