# EMA9 + VWAP cross and retest

Stock shares, 3-minute completed candles, regular sessions only (including early-close calendars). EMA9 uses Close, offset zero; VWAP uses HLC3 times volume and resets at the 09:30 New York anchor, with no bands. Missing anchor or intraday candles disable the VWAP sequence.

A crossover starts a five-candle retest window. The first candle spanning VWAP and closing beyond both indicators confirms. Only its immediate next candle can trigger a strict break of the confirmation extreme. An opposite crossover replaces the pending sequence. Stop stays one cent beyond the confirmation extreme, with no profit target. A completed 3-minute close across EMA9 requests an exit at the next observed price. Positions liquidate from 15:59 ET (12:59 on a 13:00 early close). Unavailable exit data is marked unmeasurable, never filled at an invented price.

The dedicated forward paper path records stock shares, one strategy position across symbols, at most two fills per New York session, whole-share sizing at 0.5% of simulated account equity, capped by unlevered buying power. Costs are deducted using existing stock assumptions; shorts assume borrow availability. Initial stop never trails. With unknown intrabar order, the stop takes precedence. Fresh subsequent quotes may trigger fills; completed minute bars are used only when their start is at or after observation, preventing backdated entries.

This strategy is separate from existing strategies, fixed-R forward tests, model training and automatic option trades. Its paper rows appear in the fixed-style Stocks view. The Realistic view retains this strategy's dedicated account sizing. Existing account-wide entry and news/data gates can still block radar eligibility. Use the individual strategy checkbox to disable it. EMA9/VWAP strategy parameters are fixed to the supplied specification; ordinary strategy parameter controls do not apply. Existing charts retain their display preferences.

Uses the existing stock signal feed (Robinhood when live); the Alpaca chart connection remains a chart feed. This implementation adds forward paper testing; the generic fixed-R replay intentionally rejects this strategy.
