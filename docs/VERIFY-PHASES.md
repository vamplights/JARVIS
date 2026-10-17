# JARVIS Beta 0.05 — cost-aware signal verification

Start with Start JARVIS.ps1, or the double-click launcher in the containing project folder. This PC uses http://127.0.0.1:8766; jarvis-port.txt sets the port. Node 22+ with WebSocket support is required. Run the full automated suite from this folder with `node --test` using the compatible Node runtime.

## Verify the update

1. Open **Signal Outcomes**. The paper-trading switch and account simulation controls are removed. Passive forward observations continue automatically; the manual journal and historical records remain separate.
2. In Settings, verify separate stock and crypto fees, slippage and spread assumptions: stock defaults 0.3/2/2 bps; crypto 60/3/2. Fresh live bid/ask replaces an assumed spread. Legacy flat costs migrate to crypto only; the original journal/settings gets a backup before migration.
3. Check the stop floors: 0.75 ATR, 15 bps stocks, 25 bps crypto. A closer swing stop widens, then size and targets recalculate. Confirmed levels remain frozen. Signal details include stop ATR, ADX(14) and efficiency; ADX is not an entry gate.
4. Net target R uses the original price-stop distance. Conventional net reward/risk separately includes costs in the loss denominator. A 25bps stock stop and 2R target yield about 1.736 net target R, but about 1.373 conventional reward/risk, under default costs.
5. Check the Eastern no-entry windows: 09:30–09:35 and 11:30–13:30, start inclusive/end exclusive. They affect new stock and replay entries, not existing positions or crypto.
6. New-install strategy defaults use 3m/5m, with plain momentum disabled. Existing saved preferences remain unchanged. Edit them manually in Settings, or explicitly adopt the new frame defaults once using `node server.mjs --migrate-strategy-frames` or `JARVIS_MIGRATE_STRATEGY_FRAMES=1`. Clear the environment flag afterward.
7. Inspect the strategy × timeframe × direction × regime × ET-hour table. Confirmed/raw and capped/uncapped outcomes remain separate. It reports n, win rate, average after-cost R, profit factor and 95% bootstrap CI. n < 100 is insufficient. Zero-trade replay groups stay visible; old records without measured R do not become new evidence.
8. An entry reference needs a subsequent fresh quote. Later closed bars use stop-first ambiguity and worse-open stop gaps. Expiry requires a fresh quote near the deadline or the final closed bar. Missing closing data stays unmeasurable. MFE/MAE describe observed excursions, not guaranteed fills.
9. Learning uses up to 20 complete prior archived sessions, fixed-parameter walk-forward tests and 12-bar embargoes. Current/incomplete days are excluded. It pools unique OOS trade R across symbols, never summed dollar P/L. Review pooled expectancy and CI in Signal Outcomes and Research & Confidence.
10. Export the ledger from Signal Outcomes, or run `node scripts/analyze-ledger.mjs --json`. The CLI analyzes the full file; `/api/stats` filters to the current settings profile. Both keep raw, capped and legacy records out of the headline.
11. Check existing notifications, manual journal, live connections, options review, charts, frozen theses and local access protections. No brokerage order routes exist.

Read AUDIT-BETA-005.md for the changelog and assumptions. The trade bootstrap assumes independence and may understate uncertainty when outcomes overlap. Passing tests or a positive historical average alone does not establish an edge. No parameters are tuned on OOS results.
