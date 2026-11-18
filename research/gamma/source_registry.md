# Source registry

Initial inspection: 2026-11-12, approximately 00:10–00:15 America/Los_Angeles. No licensed dataset was purchased.

| Source | Evidence obtained | Scope / limitations |
| --- | --- | --- |
| Session MCP tool inventory and plugin discovery | No exposed Robinhood market tools; Robinhood plugin search returned no match | Does not establish that the user's local connection is absent |
| `modules/robinhood-client.mjs` and `modules/robinhood-live.mjs` | Read-only market-tool allowlist and chain/instrument/quote call sites; market-window gate | Code inspection confirms implementation, not authenticated endpoint availability or complete SPX coverage; no credentials opened |
| `data/robinhood-snapshot.json` | Provider label Robinhood MCP; capture time 2026-11-11T17:44:20.110Z; inspected selected public-market fields only | Stores quotes/history, no options chain at top level; attempted symbol-field match did not yield SPY/QQQ/SPX, so no target quote was verified |
| `modules/public-options.mjs` | Public Cboe chain reader | Existing parser restricts strikes to +/-4% and first three expiries, caps 5,000 contracts, accepts stock-style roots, and does not retain underlying spot in its output; unsuitable as a complete SPX gamma pipeline unchanged |
| Cboe delayed-chain JSON endpoints for SPY, QQQ, _SPX | Direct Node fetches all failed; Firecrawl SPY JSON attempt returned Transport closed | No response body, contract count, source timestamp, Greeks or OI obtained; failure is not proof the public endpoints are unavailable generally |
| [Cboe options hours/calendar](https://www.cboe.com/about/hours/us-options) | Current published hours and 2026 holiday table | November 12 is not listed as a holiday/early close; account for SPX overnight and product-specific hours |
| [SPX specifications](https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications/) | Exchange multiplier and last-trading conventions | Verify individual series; distinguish AM settlement from PM expiration |
| [Cboe 0DTEs Decoded, May 2, 2025](https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact/) | Article retrieved through Firecrawl; source cache timestamp 2026-11-11T18:50:55.569Z | Historical exchange analysis, not current November 2026 inventory; full linked report not retrieved |
| [Amaya et al., January 25, 2025](https://cdn.cboe.com/resources/education/research_publications/gammasqueezes.pdf) | Paper abstract/introduction and search excerpts | Uses proprietary trade-level positions; data and results not independently replicated in this run |
| [Cboe 2023 market-impact article](https://www.cboe.com/insights/posts/volatility-insights-evaluating-the-market-impact-of-spx-0-dte-options/) | Search excerpt | Historical background only; not a present-day signal |

Research access succeeded for public exchange publications. No transaction-level dealer inventory, complete historical chain snapshots, or current validated option chain was obtained. Community/vendor estimates were not substituted for independently computed levels.
