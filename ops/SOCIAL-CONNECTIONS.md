# Social statistics deployment and prerequisites

All six confirmed profiles remain under `/master/#social`, independent of Buffer.
Website analytics remain exclusively under `/master/#analytics`.

## Actual deployment state (2026-09-16)

The server provider configuration contains no client ID, client secret or YouTube
API key. No social account is authorized. Therefore live social statistics are
not yet available. Adding collectors does not change this authorization state.
Never mark a profile connected just because its public URL is known or its
analytics page has been opened.

X Analytics uses https://x.com/i/account_analytics. Opening it in a logged-in
browser does not grant the website/server permission to read it. Cross-origin
browser isolation and the networks' embedding restrictions are not removed.
No cookies/passwords are copied to the server, and no paid API reads are enabled.

## Official connections

One platform application must be configured by the cockpit operator for each
provider. Xavier then uses the normal provider login/consent page. Configuration
is in the existing maintenance screen `/master/#integrations`. Callback for all:
`https://xavierfenaux.com/master/connect.php`.

- Instagram: professional account; Meta application with Instagram Login and
  `instagram_business_basic,instagram_business_manage_insights` access.
- TikTok: Login Kit and Display API; `user.info.basic,user.info.profile,
  user.info.stats,video.list` approved or account included in sandbox.
- YouTube: Google Web OAuth client, YouTube Data API and Analytics API enabled;
  readonly and yt-analytics.readonly scopes. Public API key mode remains available
  for public profile counts only.
- Twitch: confidential Twitch application, registered callback, account 2FA;
  `moderator:read:followers` scope.
- X: automatic API reads remain disabled because the user's requirement is free
  access. A normal X web session is not an OAuth client configuration.
- Spotify/Acast: Spotify Web API and Acast Publishing API do not expose private
  podcast listening analytics. An unrelated Spotify listener login is not used
  as a fake podcast connection.

## Collected metrics

`master-social-sync.php` uses the existing scheduled worker. JSON files are
private to the service account (0600), not encrypted by the application; tokens
are not returned by public connection status. No new service is required.

- Profile follower and cumulative publication counts are snapshots.
- YouTube: 90-day daily activity, subscriber gains/losses and watch minutes. Dates
  retain YouTube's reporting day. Current/incomplete days are not filled with zero.
- Instagram: seven individually queried UTC day intervals for views, likes,
  comments, shares and saves; latest 50 posts with lifetime likes/comments.
- TikTok: up to 100 videos with lifetime views/likes/comments/shares. Pagination
  is bounded; incomplete coverage is explicitly identified. These values are
  NOT added to daily activity totals.
- Twitch: current stream audience snapshot and up to 100 archived video metrics.
- Publication collector failure preserves the last successful snapshot, with a
  visible warning and observation timestamp. Missing values remain missing.

## Verification

Run PHP tests `master-insights.test.php`, `master-connections.test.php`,
`master-store.test.php`; Node `master-metrics.test.cjs`; Playwright
`master-social-ui.test.cjs` with an authenticated test storage state. Browser/API
fixtures are isolated from production; no synthetic records are written live.
Real OAuth/metric retrieval remains to be tested after the operator supplies the
provider applications and Xavier authorizes each account.

Primary references:
- https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list
- https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object
- https://developers.google.com/youtube/analytics/channel_reports
- https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/
- https://dev.twitch.tv/docs/api/reference/
- https://docs.x.com/x-api/fundamentals/post-cap
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
