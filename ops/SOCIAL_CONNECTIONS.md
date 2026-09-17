# Social connections

No developer application credentials were present on 2026-09-16. The cockpit
operator must register/approve the platform's applications once and supply their
client IDs/secrets. Xavier then only completes the official network authorization;
he does not need to create a developer account for each connection.
No social password, browser session cookie or developer-account password is collected.

Instagram, TikTok, YouTube and Twitch use the existing read-only OAuth flow. The
Connect button posts directly to the authorization endpoint once configured. The
configuration dialog is now in the separate maintenance view
`/master/#integrations`, not in Xavier's connection modal. This view uses the
same authenticated master account; it is not a separate administrator role.
It exposes each official developer portal and the fixed callback:
https://xavierfenaux.com/master/connect.php

Settings submitted with a master session and CSRF token are saved in
/var/lib/xavier-master/providers.json (0600, directory 0700). This overlays the
root-provisioned /etc/xavier-master/providers.json without making /etc writable.
Credentials never appear in public JSON responses or form defaults. Saving OAuth
settings is not a successful account connection; identity checks run on callback.

YouTube also supports a Data API key plus the InteractivTrading channel ID. The
server verifies a channel read before saving and activating this mode. It reads
only subscribers, total videos and cumulative views, hourly through the existing
sync worker, within the project's free quota. Subscriber counts may be rounded by
YouTube. Private daily analytics still require OAuth. Disconnecting removes the
sync enrollment; saved settings alone do not restart it.

X API reads are pay-per-use, so new authorization and background API calls are
disabled by policy. X opens its official dashboard; availability there depends on
the user's X plan. No paid subscription or credits are activated.

Spotify Web API does not provide the private podcast audience analytics required
here. Spotify for Creators opens directly, with existing manual/CSV entry for
bringing figures into the cockpit. Opening it never marks the cockpit connected.

There is no Buffer/Publer relay or API dependency. Those products are UX references
only. The social workspace at `/master/#social` includes an aggregate view and
deep-linked network views (`#social/instagram-ivt`, etc.), period filters,
per-metric coverage, audience distribution, daily history and CSV export.
Percentage changes require identical accounts and complete comparable periods;
podcast listens are excluded from the aggregate video-views KPI and chart.

Morning Mood is hosted by Acast. Its RSS is already used by Clips. The podcast
view links to Acast Insights separately: the public Publishing API explicitly
does not expose analytics and requires Pro or Creator Network access. Never add
all-platform Acast downloads to Spotify listens, which may overlap.
https://learn.acast.com/en/articles/5790019-acast-publishing-api

Platform prerequisites and references, checked 2026-09-16:
- Instagram: professional account, Instagram Login application and permissions;
  tester roles or review as appropriate. https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- TikTok: Login Kit + Display API approval (or approved sandbox test accounts).
  https://developers.tiktok.com/doc/display-api-get-started/
- Google: Web OAuth client with Data API and Analytics API enabled, consent/test
  users configured. https://developers.google.com/youtube/v3/getting-started
- Twitch: developer app and owner 2FA. https://dev.twitch.tv/docs/authentication/register-app/
- X pricing: https://docs.x.com/x-api/fundamentals/post-cap
- Spotify API scope: https://developer.spotify.com/documentation/web-api

Tests: php ops/master-connections.test.php. Real end-to-end OAuth and API-key
verification require owner-provided application credentials; these cannot be
validated with placeholder IDs. Do not report an account active before that step.

UI/metrics tests: `node --test ops/master-metrics.test.cjs` and
`node ops/master-social-ui.test.cjs` (requires Playwright and an isolated authenticated
test state in `.deploy/master-browser-state.json`). Browser fixtures never write
test statistics to the live API; screenshots containing fixtures are named as such.
