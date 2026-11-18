# JARVIS gamma intelligence — initial research run

Date: November 12, 2026, approximately 00:10–00:15 Pacific. Cycle: overnight initialization before the requested 06:00 premarket cycle. Status: methodology and source investigation completed; numerical positioning analysis blocked by unavailable validated inputs.

## Executive summary

No current SPY, QQQ or SPX gamma map can be established from the data obtained in this run. Current underlying prices, complete chains, timestamped Greeks and effective-date open interest were not verified together. Consequently this report supplies no numerical call walls, put walls, gamma nodes, flips or live triggers. This is a missing-input result, not evidence of low gamma or an absence of meaningful market concentrations.

JARVIS has useful existing infrastructure: a local Robinhood MCP client, option-chain/instrument/quote call sites, a public Cboe delayed-chain reader, and several strategies using completed intraday candles. However, those components do not yet establish a research-grade gamma dataset. The local client intentionally prevents requests outside its market window. The session exposes no direct Robinhood tools. The public-chain requests attempted here failed.

The most consequential quantitative correction concerns scenario interpretation. The prompt's short-call/long-put assumption and its exact opposite generate opposite signed GEX curves with identical zero crossings. Agreement between their flips cannot establish a reliable dealer regime. Gross concentrations can be useful descriptive reference points without knowing the inventory sign, but any trading interpretation requires independent validation.

The priority is therefore a timestamped chain capture with explicit coverage checks, followed by forward observations and a controlled comparison against existing signals. No production changes, brokerage actions, commits or pushes were made.

## Market/session check

The current Cboe holiday schedule does not list November 12 as a holiday or shortened session. The requested equity-session monitoring window corresponds to 06:30–13:00 Pacific; product-specific option hours can differ. SPX has overnight trading, so this run is outside equity regular hours rather than a claim that every options market is closed. The current data connection was not verified for that overnight session. [Calendar and hours](https://www.cboe.com/about/hours/us-options).

## Instrument maps

| Required field | SPY | QQQ | SPX |
| --- | --- | --- | --- |
| Verified underlying reference price/time | Unavailable | Unavailable | Unavailable |
| Validated contract count / expiry coverage | Unknown | Unknown | Unknown |
| OI call/put walls | Not calculated | Not calculated | Not calculated |
| Gross gamma call/put walls and nodes | Not calculated | Not calculated | Not calculated |
| Signed scenario A/B | Not calculated | Not calculated | Not calculated |
| Repriced gamma flips | Not calculated | Not calculated | Not calculated |
| 0DTE concentration | Unverified | Unverified | Unverified |
| Current setup status | Research hypotheses only | Research hypotheses only | Research hypotheses only |

No cross-market confluence or SPY/SPX conversion is calculated without contemporaneous underlying references. SPX standard and SPXW contracts must be tracked separately because last trading and settlement differ. [Contract specifications](https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications/).

## Source and repository findings

The available session tools contain no Robinhood market endpoints; a plugin search also returned no match. This does not contradict the presence of the existing JARVIS connection. `modules/robinhood-client.mjs` permits named market-data tools and enforces a market-window check. No authorization files were opened and no settings were changed to bypass that check. Actual authenticated endpoint capability therefore remains unverified.

The saved local Robinhood snapshot has capture time 2026-11-11T17:44:20.110Z and top-level quotes/history. It does not supply an options chain. A target-symbol field lookup did not establish current SPY/QQQ/SPX quotes, and this run does not treat its capture time as the time of any specific quote.

`modules/public-options.mjs` reads Cboe delayed JSON for stock-style symbols. Its parser trims strikes to a 4% neighborhood and the first three expiries, caps returned contracts, and does not retain source spot in the parsed result. Feeding those filtered results into an aggregate gamma calculation without disclosing exclusions could create misleading walls or flips. The raw-source adapter would need to preserve coverage and SPX/SPXW identities in an isolated experiment before any production use.

Direct fetches for SPY, QQQ and _SPX each returned a fetch failure in this environment. Firecrawl's request for the SPY raw endpoint returned a transport failure. No response fields can be inferred from either failure. Public exchange research was retrievable, establishing that research access and live chain access are separate capabilities.

## Research evidence and interpretation

Cboe's May 2, 2025 article describes balanced customer flow and limited net dealer hedging in its analyzed setting. The useful implication is that large gross 0DTE activity need not mean large net exposure. It does not establish today's positioning, nor does it show that every future high-gamma event is harmless. This exchange-authored evidence should be considered alongside independent replication. [Article](https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact/).

Amaya, Garcia-Ares, Pearson and Vasquez's January 2025 paper constructs market-maker positions from proprietary trade data and models volatility effects. That data requirement is materially stronger than an OI-only sign heuristic. Its historical sample cannot directly establish a current wall-rejection win rate for JARVIS; no replication or numerical performance claim is made here. [Paper](https://cdn.cboe.com/resources/education/research_publications/gammasqueezes.pdf).

These sources support distinguishing inventory-aware analysis from unsigned concentration maps. They do not validate the proposed six setups. Research on average volatility effects also cannot establish that buying options near a strike is profitable after spread, decay and execution costs.

## Conditional setups to test

All rows are untested research hypotheses. Levels, direction and current trigger status are unavailable. Use completed 3-minute candles and preserve the original strategy's entry and risk rules in the baseline cohort.

| Hypothesis | Required trigger/confirmation | Invalidation / exit for an isolated test | Primary comparison |
| --- | --- | --- | --- |
| Wall rejection | Previously observed gross node touched; completed candle closes back outside the touch band; subsequent break confirms reversal | Breach of rejection extreme; next-observable stop or preregistered time exit | Matched ordinary price-level touches |
| Wall breakout | Completed close beyond a pre-observed cluster; later retest holds with acceptable spread and volume | Close back through the cluster; fixed baseline stop/exit | Existing ORB/continuation signals without the filter |
| Flip transition | Fresh, repriced root zone crossed; relative inventory/surface sensitivity documented | Return through the zone; fixed forward evaluation horizon | Matched non-root crossings, measuring realized volatility first |
| Node mean reversion | Price departs an earlier node and a separate price-action signal confirms reversal | Departure extreme invalidation; node touch or fixed horizon | Equal-distance departures from control levels |
| 0DTE acceleration | Verified same-day series, proximity to gross gamma concentration, expanding realized volatility and sufficient liquidity | Failed continuation or predeclared time/stop exit | Similar volatility/time-of-day events without concentration |
| Cross-market confirmation | SPY/SPX zones aligned using timestamp-matched spot ratio; original directional signal confirms | Original signal invalidation; original exit retained | Same strategy with and without confluence |

Contract selection is a separate experiment: verify expiration/settlement, valid bid/ask, spread as a fraction of premium, displayed liquidity, timestamp, delta and remaining life. No specific contract is selected. Underlying candle tests cannot stand in for historical option P&L. Delayed gamma observations must only be available to a test after their actual publication/retrieval time.

## JARVIS integration experiments

The inspected strategy registry includes EMA34 initial cross/retest, 5- and 15-minute ORB/retest, VWAP pullback, momentum and dedicated special strategies. The documented EMA9/VWAP strategy specifically uses completed 3-minute candles, a five-candle retest window, immediate-next-candle confirmation, and its own stop/exit rules.

Start with that existing 3-minute EMA9/VWAP cohort: add gamma features to research observations without changing entry eligibility. Compare gross-node distance at entry with forward outcomes, retaining all trades. Then test a single preregistered filter in shadow results. Keep the original execution path and data gates intact. Repeat for ORB only after the first experiment is evaluated; do not search every strategy/threshold combination and publish the best in-sample result.

For each comparison report sessions, independent events, effect size, day-clustered uncertainty, costs and a chronological holdout. Record null/negative findings. A minimum sample threshold must be selected from a power/effect-size analysis rather than declaring an arbitrary number sufficient. No historical options snapshots or backtest outputs were obtained during this run.

## Persistent records and scheduling

The accompanying methodology specifies inputs, GEX units, sign scenarios, node ranking, flip modeling and validation. The source registry and initialization snapshot retain the inspection results. There is no previous gamma report in the newly created research directory, so persistence and snapshot-to-snapshot change analysis have not yet been demonstrated.

Automation lookup returned zero tasks visible to this session. The exposed scheduler permits at most hourly cadence, so the requested 30-minute intraday schedule cannot be created with it. No schedule was created or represented as active. A supported hourly schedule would require a changed cadence; a separate authorized local scheduler could potentially preserve 30-minute cadence, but none was installed or configured in this run.

## Next prerequisite

During the local client's permitted market window, obtain a read-only, complete timestamped chain for each supported target, verify pagination and OI effective date, and retain a coverage manifest. If SPX is unsupported, use an authorized alternative with equivalent contract-level fields. Until then, numerical levels, current setups, dealer regime and trading edge remain undetermined.
