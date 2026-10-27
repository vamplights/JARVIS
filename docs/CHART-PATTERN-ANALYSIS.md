# Chart Pattern Analysis Mode

Implemented for JARVIS 1.25.0. This is an independent analysis workspace. It does not produce trading signals, entries, position sizes, stops, targets, options selections, probabilities, alerts, paper entries, or model samples.

## Using it

1. After an authorized restart loads the updated server, open Overview, Stocks & Options, or Crypto. The PC integration includes the startup-performance fixes; refresh the browser after the updated server restarts.
2. Find **Chart Pattern Analysis** immediately below the price chart. Its visible switch defaults to **OFF**. Switch it ON to evaluate the already-collected candle cache.
3. Choose the chart asset/timeframe. Select a formation in **Pattern overlay**. Each option includes name, status, direction, and recognition time to distinguish overlapping formations. **Hide drawings** retains the selected analysis text while hiding its drawing.
4. Read the boundaries, confirmation level, structural invalidation level, first-knowable time, confirmation time, data freshness, and detection evidence. Times in this panel are explicitly UTC. Chart labels retain JARVIS's existing timezone.
5. Expand **Independent analysis settings** to change lookback/duration, pivot confirmation, ATR tolerances, formation size, boundary slopes/convergence, prior trend/impulse, breakout buffer, volume requirement, expiration, moving-average periods, opening range, freshness, and timeframes. These save to a dedicated endpoint and file.
6. Switch OFF to stop detection and hide live findings/drawings. The history count and **Export historical analysis records** remain available. The export opens the complete JSON history, including old providers and older settings.

The mode cannot obtain a timeframe finer than the existing source candles. It never downloads missing candles. Hourly/daily caches are reused when already available. VWAP needs a complete session anchor and genuine positive volume. Opening setups need the actual regular-session opening candle and prior regular close where applicable.

## Coverage matrix

Every requested family below has a named detector. A generic breakout alone is not counted as flag, triangle, cup, reversal, or candle-pattern support. Existing strategy detectors remain independent and unchanged.

| Setup / evidence | Before this update | Analysis implementation and specific requirements | Coverage |
|---|---|---|---|
| Bull / bear flags | No named analysis detector | Prior impulse; at least two confirmed touches per boundary; shallow countertrend parallel channel; buffered directional close | Added, both directions |
| Bull / bear pennants | No named analysis detector | Prior impulse plus compact, converging upper/lower boundaries | Added, both directions |
| Ascending / descending triangles | No named analysis detector | Repeated flat resistance with higher lows / flat support with lower highs; convergence and size checks | Added, both directions |
| Symmetrical triangles | No named analysis detector | Descending highs and ascending lows; remains neutral until the actual upper/lower break | Added, either break direction |
| Rectangle / range breakouts | Generic strategy momentum breakout existed | Independently requires two touches of each fitted horizontal boundary | Added, either break direction |
| Cup-and-handle / inverted cup-and-handle | No named analysis detector | Balanced curved rims, gradual descent/ascent, prior impulse, and a shallow handle; separate rim confirmation | Added, both directions |
| Double / triple tops and bottoms | No named analysis detector | Alternating confirmed extrema, comparable extremes, intervening neckline, minimum depth/duration, opposing prior trend | Added, all four |
| Head-and-shoulders / inverse | No named analysis detector | Five alternating pivots, comparable shoulders, deeper head, prior trend, extrapolated neckline | Added, both directions |
| Rising / falling wedges | No named analysis detector | Same-direction boundaries converge after the appropriate prior trend; opposite-direction boundary break | Added, both directions |
| Rounding tops / bottoms | No named analysis detector | Balanced quarter means, gradual reversal curvature, minimum depth and prior opposing trend | Added, both directions |
| Support bounce / resistance rejection | Strategy helpers existed for different entry rules | Two confirmed zone touches; approach/rejection context; prior high/low resumption | Added, both directions |
| Resistance breakout / support breakdown | Generic strategy breakout existed | Repeated horizontal zone and ATR-buffered close | Added, both directions |
| Breakout / breakdown retests | Existing strategy continuation helper | Analysis-only revisit/hold of an actual originating breakout; durable `originId` | Added, both directions |
| Failed breakouts / failed breakdowns | Existing strategies could invalidate plans | Separate opposite-interpretation analysis records after a completed close back through the originating zone | Added, both directions |
| Higher-low / lower-high pullbacks | Existing strategy continuation concepts | Successive confirmed rising lows / falling highs, trend context, and structural resumption | Added, both directions |
| Moving-average crosses / retests | EMA 34 cross/retest strategies existed | Independently configurable fast/slow EMA cross; trending slow-average touch with prior-high/low resumption | Added, both directions |
| VWAP reclaim, rejection, pullback | VWAP strategy existed | Session-anchored cross/reclaim or loss; four prior closes on the appropriate side before a pullback/rejection | Added; bullish reclaim/pullback, bearish loss/rejection |
| Opening-range breakout / retest | 5/15-minute ORB strategies existed | Complete configurable regular-session opening range, directional break, linked retest | Added, both directions |
| Opening gap / gap fill / gap-and-go | Opening gap used in existing in-play strategy context | Actual previous regular close and session open; minimum ATR displacement; closing fill; early continuation of an unfilled gap | Added, both directions |
| Bullish / bearish engulfing | No named analysis detector | Opposing prior trend and recent-extreme location; opposite prior body engulfed by a larger directional body | Added, both directions |
| Hammer / shooting star | No named analysis detector | Trend/location context; dominant wick at least twice the body; small opposite wick | Added, both directions |
| Morning / evening star | No named analysis detector | Large first body, small separated middle body, directional recovery through the first body's midpoint; context required | Added, both directions |
| Piercing line / dark-cloud cover | No named analysis detector | Opposite large prior body; opening gap outside prior range; close beyond midpoint but inside prior body | Added, both directions |
| Bullish / bearish harami | No named analysis detector | Small opposite-direction body strictly inside a large prior body; trend/location required | Added, both directions |
| Doji | No separate context record | Small body relative to range; always neutral/indecision, including after confirmation | Added, neutral only |
| Volume expansion / contraction | Volume indicator/filter existed | Ratio to preceding 20-candle mean; unavailable if volume is missing, zero, or marked synthetic | Reused inputs; added supporting evidence |
| Bullish / bearish RSI divergence | No analysis evidence record | Two confirmed price extrema with opposite 14-change simple-average RSI movement | Added supporting evidence, both directions |
| Bullish / bearish MACD divergence | No analysis evidence record | Two confirmed price extrema with opposite EMA(12)-EMA(26) movement | Added supporting evidence, both directions |
| Extended-hours / crypto opening-range and opening-gap conventions | No analysis mode | Opening detectors use US equity regular sessions | Unsupported variants |
| Wick-only gap-fill confirmation | No analysis mode | This implementation requires a closing fill | Unsupported variant |
| Exhaustive duration search / complex rounded variants | No analysis mode | Bounded duration windows and conservative curvature rules | Unsupported variants |

RSI, MACD, and volume are supporting evidence, not additional named setup detectors. Their checklist does not estimate profitability. Optional volume evidence can weaken a finding without blocking it; enabling **Require valid volume expansion** makes that evidence mandatory for confirmation.

## Causality, identity, lifecycle, and isolation

- Reuses `aggregate`, EMA, ATR, VWAP, `parts`, and `session` from the unchanged engine. Read-only exchange-calendar overrides are respected. It reads the same Robinhood/Coinbase/shared public/historical caches as the chart. There are no market-data requests in the analysis modules.
- Confirmed pivots need `swing` completed candles on both sides. Pivot timestamps identify the extreme; `knownAt` and formation `firstKnownAt` identify when its confirming candle had actually closed.
- Forming records wait for their own qualifying event. Unfinished candles can only create **provisional** triggers. **Confirmed** requires a completed candle and any mandatory volume check. A confirmed doji still means neutral indecision.
- Completed closes beyond the structural boundary plus tolerance mark **failed**. **Expired** counts subsequent evaluated completed candles, rather than overnight/weekend wall time. Confirmation resets that age. OFF pauses analysis and its lifecycle processing; available intervening candles are evaluated causally on resumption.
- Identity includes symbol, timeframe, provider, named detector, structural anchor, and an analysis-only rules fingerprint. Refreshes, toggles, and restarts with the same rules reuse identities. Changing detection rules can create a separately auditable interpretation; this fingerprint never enters a trading/model cohort.
- Confirmation freezes geometry, pivot coordinates, original evidence, levels, rules, and confirmation timestamp. Subsequent lifecycle updates retain those originals. Retests/failures link to their originating breakout. Provider-specific records are never overlaid on a different provider's chart.
- Missing intraday candles reset analysis warmup. An equity overnight gap is allowed only between an observed regular close and next observed regular open. Mixed providers, unordered/invalid OHLC, unsupported source intervals, stale quotes/candles, and closed live equity sessions block new evaluation. Historical imports are labeled historical; fallback/snapshot observations are delayed; stale state remains visible.
- `chart-pattern-analysis.json` is separate from `journal-settings.json`, paper ledgers, alerts, learning/model files, and their cohort keys. Corrupt analysis history fails closed and preserves its original bytes. Settings/history saves use a temporary file and rename.
- Server integration appends a separate `chartPatterns` property after the existing signal, paper, and model processing. Findings are never passed to `signals`, Top Picks, alert registration, paper observers, execution, or training. Existing active paper-position management continues normally.

## Work bounds and limitations

- Default lookback is 240 aggregated candles; maximum is 600. Geometric boundary fitting samples minimum, midpoint, and maximum configured durations. Rounded forms sample two duration windows. This is intentionally conservative and can miss otherwise recognizable formations at other durations.
- Geometry is a deterministic approximation: strict confirmed pivots, fitted straight boundaries, and quarter-mean curvature. It is not human visual recognition. Rounded variants with uneven rims, complex shoulders, very irregular handles, ambiguous flat extrema, or uncommon gap conventions may be rejected. Several valid interpretations can overlap.
- At least 17 usable candles and positive ATR are needed before any family is evaluated; longer indicator/pivot/session requirements can need more. RSI uses simple average gains/losses, not Wilder smoothing. MACD divergence uses the MACD line, not its histogram.
- Gap fills require a qualifying **close** at/beyond the prior regular close. A wick-only fill does not confirm this implementation. Gap-and-go is limited to the first regular-session hour. Opening setups are US regular-session equity setups; extended-hours and crypto opening-range/gap conventions are unsupported.
- There is no synthetic history repair. Missing or synthetic volume suppresses VWAP and positive volume evidence conservatively over the supplied source window. Undeclared bad source data cannot be inferred reliably from OHLC alone.
- Background work rotates across supported symbol/timeframe jobs with an approximately 30 ms cooperative detection budget per snapshot; selected-chart catch-up uses approximately 25 ms. Individual detection calls and synchronous persistence may exceed that budget. Prefix cursors and candle fingerprints suppress repeated detection; active-record indexing avoids walking all terminal history during each candle update. Live responses are capped at 200 overall / 500 for a selected symbol; the history export retains every record.
- Existing caches determine available history. The mode does not independently fetch finer frames or recover candles older than its bounded lookback. Historical replay/live equality applies to the same supplied causal candle sequence, source, and settings.
- The durable history is currently one local JSON file. Very long-running archives can increase save/startup cost. A segmented archive/compaction format and a worker-based strict latency budget are potential future improvements, not implemented features.
- No statistical win rates, trade outcomes, profitability claims, calibrated pattern quality, new notification integrations, trading integrations, or training integrations are implemented. Synthetic fixtures demonstrate software behavior only.

## Validation

The complete suite passes **512 tests: 443 existing + 69 new**, with zero failures, cancellations, skips, or TODOs. New tests include named bullish/bearish examples, lookalikes, neutral patterns, actual break direction, all lifecycle states, unfinished candles, source/freshness/volume gates, causal pivots, overnight gaps and expiration, identities/restarts, frozen confirmations, linked retests, replay/incremental equality, SVG coordinates, independent API persistence, preserved Top Picks/alerts/paper/model state, and identical management of an existing paper position through its exit.

Controlled UI inspection used `scripts/chart-pattern-ui-fixture.mjs`, isolated under `work/chart-pattern-ui-fixture`, offline, on port 18791. Verified switch persistence after reload, OFF drawing/result removal with retained history, settings save, overlapping triangle selection, zoom/pan, and timeframe isolation. The production JARVIS instance and its runtime data were not used for these checks.

- Full test log: `work/chart-pattern-regression.tap`.
- Test command on this laptop: `rtk proxy node scripts/run-pattern-regression.mjs`. The wrapper places temporary files under `work/chart-pattern-test-temp` because the sandbox's default Windows temporary directory prevented atomic file renames. Loopback API tests require local networking permission in restricted execution environments.
- One existing test had an encoded-space Windows path bug; its test-only helper path now decodes the URL before executing it. No corresponding strategy code changed.
- SHA-256 checks confirm `engine.mjs`, `settings.mjs`, `strategy-controls.mjs`, `continuations.mjs`, `auto-paper.mjs`, `model-review.mjs`, and `signal-policy.mjs` remain byte-identical to the inspected version.

Local fixture screenshots are saved under `outputs/chart-pattern-analysis-preview.png` and `outputs/chart-pattern-analysis-ui.png`. Generated screenshots remain local and are excluded from Git.

## Changed source files

| Files | Purpose |
|---|---|
| `chart-patterns.mjs` | Independent settings validation, detectors, evidence, source gates, causal pivots, lifecycle, IDs |
| `chart-pattern-store.mjs` | Separate persistence, prefix cache, active indexes, work budgeting, history |
| `chart-pattern-view.mjs` | Panel, explanations, selection, provider filtering, timestamp-to-chart overlays |
| `server.mjs` | Read shared cached datasets, attach separate analysis response, independent settings/history routes, serve view module |
| `app.js` | Toggle, analysis form, selected overlays, chart polling, freshness and form-refresh handling |
| `style.css`, `panel-disclosures.mjs` | Visible accessible switch, analysis layout, initially expanded panel |
| `tests/chart-patterns.test.mjs`, `tests/chart-pattern-store.test.mjs`, `tests/chart-pattern-intraday.test.mjs`, `tests/chart-pattern-api.test.mjs`, `tests/chart-pattern-fixtures.mjs` | Deterministic detector, lifecycle, isolation, API, chart and replay fixtures/tests |
| `tests/strict-continuations.test.mjs` | Windows encoded-space test helper fix |
| `scripts/run-pattern-regression.mjs`, `scripts/chart-pattern-ui-fixture.mjs` | Reproducible local validation |
| `README.md`, `docs/CHART-PATTERN-ANALYSIS.md` | Usage, coverage, rules, validation, limitations, file list |

Implementation and local testing did not merge, deploy, restart production, or place trades. GitHub publication requires a separate explicit user request. Publication does not restart the running installation; loading the changed server remains a separate user-authorized action.
