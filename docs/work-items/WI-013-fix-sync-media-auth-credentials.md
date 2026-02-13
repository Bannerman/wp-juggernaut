# WI-013: Fix Sync Media Auth Credentials

## Status
Done

## Description
`sync.ts` currently fetches media using static credential exports from `wp-client`, which can diverge from active credentials in Electron/site-config flows. Update media fetch auth to use the same dynamic credential resolution as the rest of the app.

## Module
sync-engine

## Acceptance Criteria
- Media fetch in sync uses dynamic credentials (`getWpCredentials()` path).
- Sync media fetch works in both dev/browser mode and Electron mode.
- Regression test(s) added or updated for credential selection behavior.
