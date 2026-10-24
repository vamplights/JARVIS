# Development handoff

JARVIS 1.25 is Node ESM, using built-in Node APIs; Node >=22 with WebSocket support. There are no package dependencies or real order routes.

Preserve frozen confirmed entry/stop/target plans, closed-candle evaluation, chronological/embargoed training, market-specific costs, source/freshness labels and settings-cohort isolation.

Current behavior:
- Compact signal cards; setup score /100 is visible separately from estimated win percent.
- Percent badges: displayed 0–27 red, 28–49 yellow, 50+ green.
- Called time/countdown strip only on CONFIRMED cards.
- Same-day option expiry is preferred; nearest future listed expiry is the fallback.
- Top Picks use current confirmed patterns, score 80+, and a 35% model threshold when available. Preliminary estimates are not proof of edge. Historical fallback requires 15 matching outcomes; no-model picks are labeled uncalibrated.
- Automatic notifications only for new Top Picks; startup/duplicate suppression, quiet hours and rate limits remain active.
- Automatic paper trades fresh confirmed signals with closed 1-minute fills and frozen selected R exits. Manual option sandbox remains separate; estimated option P&L is not trusted training truth.
- Personal attribution is absent from visible UI text. Internal compatibility identifiers are preserved.

The imported application passed 392 tests. The Git checkout adds first-start initialization from config/settings.shared.json; test that initializer as well before changes are published.

Use the shared configuration only for initial setup. Never commit data/, credentials, snapshots, real journals, reports, histories or local model results. No private runtime data was imported into this checkout.
