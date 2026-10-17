# ОДЕССА Online — automation status

Updated: 2026-10-17

## Telegram alerts

- Primary live publisher: the Termux `odessa-live.cjs` process on the phone/server environment.
- Primary source: `odessagolovna`.
- GitHub Actions alert workflow is **manual backup only** and must not be run at the same time as the primary live publisher, otherwise duplicate posts are possible.
- GitHub backup workflow: `.github/workflows/odessa-alerts.yml`.
- GitHub backup script: `scripts/odessa-alerts.mjs`.
- Backup polling interval: 10 seconds while manually running.
- Old `scripts/odessa-radar.mjs` publisher is disabled.

The backup alert filter accepts current Odesa/Odesa-region alert, clear and live threat information (UAV/Shahed, missile, ballistic and related live movement cues) and rejects news, questions/polls, advertising, fundraising/donations, service posts and promotional links.

## News

Automatic news publishing from GitHub Actions is **disabled**. `.github/workflows/odessa-news.yml` can no longer publish news; a manual run only prints a disabled message.

## State safety

`data/odessa-alert-state.json` is reset so the first manual backup run establishes a fresh baseline for `odessagolovna` instead of replaying old posts.

## Duplicate prevention rule

Never run more than one alert publisher at the same time. Normal mode is Termux only. GitHub Actions is an emergency/manual backup.
