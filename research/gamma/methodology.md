# Gamma research methodology — v0.1

Status: specification; no live chain has passed validation and no trading edge has been established.

## Observation contract

Retain original authorized provider responses separately from normalized observations and derived output. Record provider URL/tool, retrieval time in UTC, source timestamp and timezone, OI effective date, requested and returned expiration coverage, pagination, contract counts, missing fields, and calculation version. Retrieval time is never a substitute for quote time. An unzoned timestamp remains ambiguous until the provider's timezone is verified.

Require instrument, contract identifier/root, strike, option type, exact last-trading and settlement timestamps, multiplier, underlying reference price/time, gamma units, OI and its effective date. Preserve bid, ask, volume, IV, and their timestamps when supplied. Missing numbers remain null, never zero. Reject negative OI or gamma for a vanilla long-option gamma input, nonfinite values, duplicate contracts, unknown multipliers, and post-expiration observations. Report exclusions and partial coverage. A partial chain can support a partial concentration map, not an unconditional aggregate regime claim.

Maintain separate SPY, QQQ, SPX and SPXW observations. Identify adjusted ETF contracts rather than assuming their deliverables. SPX/SPXW use a $100 multiplier; consult current specifications for expiration and settlement. An expiration date alone is insufficient to identify a tradable 0DTE series. Overnight SPX trading can coexist with closed ETF regular sessions; do not pair overnight option quotes with an unqualified stale cash-index reference.

## Exposure and positioning

For gamma measured as option-delta change per one-unit underlying move:

`grossGex1pct = gamma * openInterest * multiplier * spot ** 2 * 0.01`

Units: approximate dollars of delta-hedge notional change for a 1% underlying move, evaluated locally. This is neither option premium, predicted money flow, nor option P&L. Long vanilla calls and puts both have nonnegative gamma. OI represents outstanding contracts once; do not multiply it by two for the two sides.

| Scenario | Call multiplier | Put multiplier | Meaning |
| --- | ---: | ---: | --- |
| A | -1 | +1 | Prompt's assumed short-call/long-put dealer portfolio |
| B | +1 | -1 | Exact reversal of A |
| C | +1 | +1 | Unsigned gross concentration, not dealer inventory |

Avoid calling A a universally conventional sign convention: other GEX products use opposite conventions. Always print the actual signs. Neither A nor B is an inferred inventory estimate or confidence bound.

For every spot, B = -A. Their zero-crossing locations therefore coincide. This symmetry supplies no evidence of flip robustness. Additional sensitivity must change relative inventory weights, strike/expiry allocations, volatility surface behavior, or expiration coverage. Label these additional scenarios hypothetical too; do not invent empirically justified weights.

Aggregate by instrument, strike, expiry, type, DTE bucket and distance from spot. Publish call gross, put gross, total gross, A, B and a separate 0DTE slice. Mark stale OI as a prior snapshot weighted by updated Greeks, not current inventory.

## Levels

Keep OI, gross gamma and volume rankings separate. Publish the top five nearby strikes per measure, with their share of covered exposure and neighboring strikes. Rank within clearly stated expiration buckets before combining. A ranking is a candidate concentration, not proof of a wall's support/resistance effect.

Initial research-only clustering: adjacent listed strikes within the same expiry bucket; report cluster membership and total exposure. Pre-register any gap, distance, prominence or percentile thresholds before testing outcomes. Compare alternative thresholds on training sessions only. Empty or unavailable distributions produce unavailable levels.

Translate an SPY strike to an SPX reference with `SPYstrike * contemporaneousSPXspot / contemporaneousSPYspot`. Store both quote times; do not translate if the references cannot be aligned. Do not translate QQQ into SPX or mechanically sum SPY/SPX GEX.

## Gamma flips

Fixed current gamma multiplied by a changing spot-squared term cannot produce a meaningful repriced gamma curve. Recompute gamma at each hypothetical spot using exact time remaining. For European cash-settled contracts, a documented Black–Scholes/forward model is an approximation; document rates, dividends/forward basis and IV assumptions. American ETF contracts require an exercise-aware model or an explicitly bounded approximation, particularly around ex-dividend dates.

Compare sticky-strike versus an explicitly defined surface response; do not silently replace missing IV with guessed values. Report the tested range/grid, all sign-changing intervals, numerical refinement tolerance, and root sensitivity. Never infer a root outside the grid. Flat near-zero curves, tangencies and multiple crossings require separate labels. Scenario C has no signed dealer-regime flip. Suppress flips when inputs or coverage are insufficient.

## Trigger eligibility and validation

Only fresh, timestamp-aligned prices, options inputs and completed 3-minute candles can establish an intraday trigger. Delayed maps remain research context. No current data means no active setup classification beyond research hypothesis.

Pre-register touch bands, confirmation rules, event exclusions, holding horizons and one primary outcome. Use next-observable execution, conservative spread/slippage/fees, actual historical option quotes for option P&L, and point-in-time OI publication timing. Test underlying behavior separately when option history is unavailable. Split by session chronologically, purge overlapping outcome windows, reserve a final holdout, bootstrap by day and adjust for multiple hypotheses. Compare with matched prior-price levels and random controls, conditioning on time of day, volatility, trend and distance. Show sample sizes and uncertainty; a nonsignificant result is a valid finding.
