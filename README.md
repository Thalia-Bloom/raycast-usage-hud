# Usage HUD

See your Claude, Codex, and Gemini usage limits in Raycast: session and weekly
percentages, reset times, and how fresh each reading is.

This extension is the Raycast companion to
[Usage HUD](https://hud.thaliabloom.com/?utm_source=raycast&utm_campaign=mk-002),
a macOS menu-bar app ($9, one-time). The app collects the readings; this
extension shows them. Without the app, the command shows how to get it.

## Setup

1. Install and open [Usage HUD](https://hud.thaliabloom.com/?utm_source=raycast&utm_campaign=mk-002).
2. Use Claude Code or Codex once so the app records a reading.
3. Run **Show Usage Limits** in Raycast.

## Privacy

The extension reads only the snapshot files that Usage HUD writes to
`~/.codex-usage-hud/` (legacy folders `~/.bloom-usage/` and
`~/Library/Application Support/Bloom Usage HUD/state/` are also checked).

- It does not read any Claude, Codex, or Gemini credentials or the Keychain.
- It makes no network requests.
- It collects no analytics.

## Preferences

- **State Folder** (optional): a custom snapshot folder, if you set
  `CODEX_USAGE_HUD_STATE_DIR` for the app.

## What the labels mean

Each provider shows a confidence label from the app (`official`, `high`,
`medium`, `manual`, or `unknown`) and when it was last updated. A reading older
than 30 minutes is marked `stale`.
