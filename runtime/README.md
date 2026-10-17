# Odessa runtime review — 2026-10-17

The Termux + tgcloud runtime was audited against the user's full phone backup.

Reviewed artifact delivered in the ChatGPT conversation: `odessa-core-fixed-20261017.tar.gz`
SHA-256: `7f582ee94fbf22a6f0f82adc015adb6340d7d34166bb0ff9535f62b53b16477f`

The binary archive itself is intentionally **not** stored in this GitHub repository after an integrity mismatch was detected during an attempted binary upload. Use the SHA-256 above to verify the conversation artifact before applying it.

Reviewed behavior:
- radar source: `odessagolovna`
- one Termux radar worker: `odessa-live.cjs`
- 5 second radar polling
- blocks news, questions, ads, collections/donations and source promotion
- source links are stripped before publishing
- source-specific state/deduplication prevents collisions with the old `odessa_inform` source
- radar media hydration also uses `odessagolovna`
- radar posts expire after 24 hours
- electricity source: `svet_odesaa`
- electricity posts are limited to power/outage content
- electricity source links/promotion are stripped
- only actual post photo wrappers are copied, not channel avatars/logos
- group comments/replies/reactions remain included

GitHub Actions alert workflow is manual-only backup. Automatic strong-news workflow is disabled.

Do not store Telegram bot tokens or local state/log files in this repository.
