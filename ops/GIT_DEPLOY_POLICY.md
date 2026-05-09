# Git and deploy policy

This document records the current safe operating model for the VPS projects.

## Source of truth

The production VPS content was treated as the source of truth during the May 2026 audit. After the audit, active projects should now use GitHub as the source of truth:

- `thesakia/xavierfenaux` deploys to Parents de Jumeaux VPS, `/var/www/xavierfenaux`.
- `thesakia/parentsdejumeaux` deploys to Parents de Jumeaux VPS, `/var/www/parents`.
- `thesakia/servicecompris` deploys to Service Compris VPS, `/var/www/servicecompris`.

For these projects, the expected workflow is:

1. Change files in Git.
2. Commit and push to the main branch.
3. GitHub Actions deploys the pushed version to the VPS.

Direct edits on the VPS should be emergency-only. If a direct VPS edit is made, commit and push it back to GitHub immediately.

The live `/var/www/...` directories for automatically deployed sites are deployment artifacts. Their active Git commit is recorded in `.deploy-revision`; Git history lives on GitHub.

## Snapshot repositories

These repositories are backups of what was found on the VPS. They are not automatic deployment sources unless explicitly promoted later:

- `thesakia/dashboardapp-parentsdejumeaux`
- `thesakia/pocketbase-parentsdejumeaux`
- `thesakia/umami-parentsdejumeaux`
- `thesakia/aiforge-vps`
- `thesakia/gwladysmonnier-vps`
- `thesakia/streammate-vps`

Snapshot repositories should not run automatic deploys on push by default. If one needs to become an active project, first review its workflow, secrets, and target directory.

## Deploy credentials

GitHub Actions uses a dedicated SSH deploy key stored as a repository secret. The key is authorized on the target VPS hosts and is separate from personal SSH keys.

Do not commit private keys, tokens, `.env` files, or server-only credentials.
