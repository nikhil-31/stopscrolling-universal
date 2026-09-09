# StopScrolling Electron

Cross-platform desktop client for StopScrolling. Matches the Mac app’s tracking, timelines, auth, sync, leaderboard, and devices — without blocking.

## Develop

```sh
cd apps/electron-app
npm install
npm run dev
```

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Default API base URL is `http://localhost` (same as the Mac app). Sign in on Account, then enable backend sync in Settings.
