# Implement a paper-only extreme-move reversal experiment

Status: PLANNED. Written November 18, 2026 against HEAD ba31e86 and the current dirty working tree. Nothing in this plan establishes a profitable strategy.

## Objective and boundaries

Add one independently versioned SPY research experiment to Jarvis. Detect unusually large intraday moves, wait for reversal confirmation, record executable option quotes, and compare a baseline with a spread-filtered variant. Keep long and short results separate. Start disabled. Existing production strategies, default contract selection, alerts, model training, and performance cohorts must retain their behavior.

This document is implementation authorization only when the user asks an executor to execute it. It does not authorize orders, account/balance access, new paid services, dependency installation, commits, pushes, or deployment. Research enablement is a local, reversible setting; no additional approval is needed to implement and test the feature. Leave collection disabled until deliberately enabled.

## Current state verified during planning

- Node ES modules; Node >=22. `npm test` runs `node --test tests/*.test.mjs`. There is no separate lint/build command in package.json.
- `modules/engine.mjs`: `parts`, `session`, `normalizeBars`, `aggregate`. Session handling includes holidays and early closes. `aggregate` checks completeness but groups by epoch; prove exchange-open alignment for requested frames. `normalizeBars` does not retain every raw provenance flag: reject synthetic input before it is stripped.
- `modules/robinhood-client.mjs`: `RobinhoodClient`, read-only `MARKET_TOOLS`, priority queue. Market reads are gated by session availability. Reuse its transport and backoff.
- `modules/robinhood-live.mjs`: `RobinhoodLive`, `optionQuote`, `ensureChain`, `selectOptions`, quote/history refresh. The selected options object is shared with the UI. Research must not change the user's selected chain. Current provider quote freshness, polling cadence, availability, and supported history need a focused capability check.
- `modules/public-options.mjs`: public Cboe chain explicitly delayed about 15 minutes. Exclude from contemporaneous option fills.
- `modules/option-plan.mjs`: current `suggestedExpiry` chooses the nearest listed expiration; shared eligibility adds spread/OI/volume/delta gates. These differ from this experiment. Do not modify global selection or silently import those gates into the experiment.
- `modules/option-outcomes.mjs`: `observeOptionOutcomes` already illustrates later-ask entry/later-bid exit and missing-quote outcomes. Its horizon is `signal.tf * 12` minutes, not this experiment's 30 minutes. Its fixed modeled fee is not verified broker pricing. Reuse ideas or compatible pure helpers; do not change existing cohort semantics.
- `modules/paper-ledger.mjs` and `modules/auto-paper.mjs`: existing production paper records and training inputs. Research rows must never enter these cohorts.
- `modules/atomic-write.mjs`: `writeFileAtomic`, `renameReplace`; reuse for separate experimental persistence. It is currently untracked, so recheck its presence before importing and do not assume it is committed.
- `modules/research-workspace.mjs`: Research, Confidence & Outcomes includes Strategy Lab. `app.js` composes and refreshes it. Use that location for one compact experiment panel.
- `server.mjs`, `modules/local-cycle.mjs`: application collection/lifecycle and request integration. Collect on a backend data cycle, not only while the browser panel is open. Keep background quote polling responsive.
- Testing examples: `tests/engine.test.mjs`, `tests/public-options.test.mjs`, `tests/robinhood-live.test.mjs`, `tests/research-workspace.test.mjs`, and `tests/server.test.mjs`.

Many relevant files already have user edits, including app.js, server.mjs, engine, Robinhood-adjacent data modules, auto-paper, and paper-ledger. Run `git status --short` and inspect targeted diffs first. Do not reset, stash, format, or revert unrelated work. A HEAD-only drift comparison is insufficient because the tree was dirty when planned.

## Frozen research specification: extreme-reversal-v1

All thresholds below are proposed experimental defaults, not empirically validated settings.

### Data and clock

- SPY only, regular U.S. session. Store timestamps in UTC milliseconds; make trading decisions using America/New_York and the existing calendar.
- Require real, complete, consecutive one-minute bars for every current lookback and confirmation window. Never infer one-minute candles from five-minute candles. Reject synthetic/interpolated, duplicate, invalid, out-of-order unnormalized, or missing input. Keep provider, adjustment basis, raw flags, event time, and receipt time.
- Build candles from 09:30 ET. Implement generic supported intervals [1,2,3,5,10,15], but the initial forward experiment uses 3 only.
- Use 60 preceding valid full regular sessions as warmup. For each candidate timestamp, calculate the simple 60-minute return from the completed close at t to the completed close at t-60 minutes. Current-session endpoints must both exist.
- Estimate sample standard deviation (denominator n-1) from those same exchange-local 60-minute windows in the 60 prior sessions. Exclude today and incomplete/early-close sessions from this full-session reference sample. If 60 valid historical windows are unavailable, show WARMING UP and the available count. Do not reduce the required count or fabricate history.
- Flag when abs(current return) >= max(0.005, 3 * historical standard deviation). A zero historical standard deviation still leaves the 0.5% floor.
- Evaluate completed candle endpoints from 10:30 through 14:30 ET, capped on early-close days at session close minus 30 minutes. Skip unknown calendars. No overnight return in the 60-minute measure.

### Candidate lifecycle

- States: warming-up, idle, candidate, confirmed/awaiting-entry, active, closed, rejected, expired, and unmeasurable. Keep rejected and expired observations.
- Arm once when the threshold condition transitions from false to true. Do not repeatedly arm while it stays true. Require a later false observation before rearming. After reload restore the state rather than treating an existing condition as a new transition. Do not open overlapping candidates or positions for the same experiment/ticker.
- After a negative move, a later completed candle must close strictly above its preceding candle's high. After a positive move, it must close strictly below the preceding candle's low. The candle that first flags the extreme cannot also confirm it.
- Confirmation must occur within 15 minutes of flagging, and no later than the allowed entry-window end. While waiting, update the move's extreme. For a long, use the lowest low from the start of the original 60-minute window through confirmation; for a short use the highest high. Freeze the stop at confirmation: low minus $0.01 or high plus $0.01.
- Stable ID includes experiment version, symbol, direction, and candidate timestamp. Repeated ticks/restarts must not create duplicate candidates or trades.

### Entry, contract, and paired variants

- Freeze one immutable parameter profile per run, plus a hash including data rules, calendar overrides, quote age, fees, slippage, contract rule, and exits. Changes start a new run; never rewrite old results.
- At confirmation choose the next exchange trading session's listed SPY expiration, excluding today. If that exact expiry is unavailable, record NO_MATCHING_EXPIRY; do not silently substitute 0DTE or a later expiry. Missing future calendar coverage blocks selection.
- Buy a call after a decline and a put after an advance. Choose the standard listed contract with multiplier 100 and strike nearest the underlying confirmation close. On an equal-distance tie prefer the ITM strike (lower for calls, higher for puts); break any remaining tie by stable contract ID. Select before looking for a favorable quote. Do not replace the contract just because its spread is wide. Keep the contract catalog's availability/receipt timestamp.
- Valid entry requires a real, non-delayed, positive two-sided option quote and a valid underlying two-sided quote. At processing time each quote must be at most 5 seconds old; neither may be future-dated. Both event times must be strictly after confirmation, and their times must differ by no more than 5 seconds. Both must have actually arrived by that processing time. No public delayed data, midpoint fills, previous option quote, option last price, or estimated premium.
- Entry must occur within 30 seconds after confirmation. If metadata or valid quotes do not arrive by then, record expiration/rejection. Do not extend the deadline after a provider failure.
- Underlying entry reference is ask for long exposure and bid for short exposure, from that entry observation. Options are long premium in both cases: ask entry. Reject if the frozen underlying stop is already crossed or the distance is not positive.
- One notional option contract per accepted signal, without compounding or production position sizing. Keep premium debit and full-premium risk visible. An underlying stop does not cap option loss.
- Baseline accepts every otherwise valid entry. Spread-filtered accepts the identical entry only if (ask-bid)/midpoint <= 0.05. Exactly 5% passes. No hidden OI, volume, delta, or production score gate. Record available OI, volume, Greeks, underlying spread, and quote quality for analysis; missing nonessential fields are null, never invented.
- Maintain one master opportunity and two eligibility labels. Both accepted variants use the same contract, timestamps, and execution observations. Track wide-spread rejected baseline trades to their actual subsequent outcomes. Do not request two duplicate quote streams.

### Exits and execution

- Initial R is the underlying distance from entry reference to frozen stop. Target is entry reference +/- 1.5R. No trailing or changing stop.
- Exit trigger: underlying stop, target, 30 minutes from actual entry, or session end, whichever happens first. For live trigger checks use bid for long exposure and ask for short exposure. Entry-window capping must prevent routine cross-close holds.
- Record exit-trigger time and the first valid option bid whose event time is strictly after it. Use the same event/receipt/freshness rules. Allow at most 30 seconds for an exit observation. Missing quotes produce UNMEASURABLE with the exit reason and data gap, not zero P&L or a fabricated fill.
- Resume known positions after restarts. Missing data during an outage invalidates any unobservable trigger path: preserve the row and mark its outcome unmeasurable when it cannot be established from valid recorded observations. Do not retroactively invent a live paper fill from a later historical download.
- Base option P&L = (exit bid - entry ask) * 100 - entry fee - exit fee. Configure modeled fee per contract per side; proposed starting assumption $0.65 is a scenario, not a claim about Robinhood's actual fees. Always show the chosen fee.
- Add a stress scenario with $0.01 adverse premium slippage per share per side. Ask-to-bid already includes spread; do not subtract spread again. Underlying bps/R and option dollars/premium returns are separate measures.
- Historical underlying-only replay uses next-minute open after confirmation, conservative gap-stop execution, and stop-first if both thresholds occur in the same minute. Use the same stop, 1.5R target, and 30-minute horizon, but label this different execution basis. Do not combine it with live quote-triggered options outcomes.

### Persistence and reporting

- Separate research storage under the app's existing data directory, e.g. `research/extreme-reversal-v1/`. This is runtime data, not repository fixtures. Do not use `auto-paper.json`, `signal-paper-ledger.json`, production journals, alerts, or training datasets.
- Save parameters, inputs needed to explain the threshold, signal and receipt timestamps, chosen contract/catalog timestamp, quoted entry/exit, rejection reasons, delays, fee/slippage scenarios, outcome status, source quality, and run ID. Keep raw observations used for decisions. Secrets and account identifiers are out of scope.
- Reuse existing safe-write/lifecycle patterns; serialized writes, visible failures, flush on shutdown. Unreadable existing research storage must be preserved and reported, not replaced with an empty ledger. Restore active and pending state idempotently. Define conservative behavior for a crash between observation and persistence.
- Research panel: disabled/collecting/warming-up/data-unavailable states, coverage, parameters/run, open observations, rejected counts, baseline versus filtered results. Separate long and short, underlying and option results, replay and forward runs. No win-probability claim or production recommendation badge.
- Report completed count, accepted/rejected/unmeasurable counts, win rate, average winner/loser, expectancy, profit factor, closed-trade drawdown, duration, execution delays, and quote coverage. Show null/N/A for undefined quantities. Do not turn missing outcomes into losses or silently omit them.
- Show both return per filled trade and contribution per eligible opportunity; filtered nonentries contribute zero strategy return when the corresponding baseline outcome is measurable, while the filter decision and baseline outcome remain visible. Report paired cohort differences, not only a selected-trade win rate.
- For future replay compare all six candle intervals on identical audited dates. Keep symbols, sides, regime/time buckets, and parameter trials explicit. Warmup precedes the evaluation interval. Select parameters only on development dates, then freeze before loading a reserved chronological evaluation segment. Existing recent SPY data are already explored and are not a fresh holdout.
- A test suite pass does not validate an edge. Require later positive cost-adjusted evidence, adequate independent session coverage, day-clustered uncertainty estimates, and robustness to costs/parameters before proposing promotion. No automatic promotion.

## Implementation sequence and copy-ready prompts

Use these prompts one at a time in the same Jarvis chat. In a fresh chat, give the absolute path to this document. Complete the stage's checks before continuing. Default to direct execution using the project's ordinary Sol Low policy; no routine subagents.

### Stage 1 — Freeze specification and validate data prerequisites

Scope: read relevant adapters and tests; add an isolated experiment config/manifest, a research data validator, and fixtures/tests. Suggested new files: `modules/extreme-reversal.mjs`, `tests/extreme-reversal.test.mjs`. No production wiring yet.

Prompt:

> Execute Stage 1 only of plans/001-extreme-move-reversal.md. Read its complete frozen specification and applicable AGENTS.md. Preserve the dirty working tree. Inspect existing date/session/aggregation and read-only market-data adapters. Add the disabled-by-default versioned experiment configuration and pure input-quality/history-readiness checks. Validate real one-minute provenance before normalization strips flags; require 60 prior valid same-time session windows. Document any provider coverage/polling limitations without adding services or relaxing requirements. Add deterministic fixtures for real, incomplete, synthetic, duplicate, invalid, DST, holiday and early-close cases. No detector, UI wiring, orders, account reads, production configuration changes, or dependency installs. Run the focused new tests and existing engine tests. Report files changed, results, blockers, and the next stage.

Acceptance: fabricated history, delayed/synthetic inputs, incomplete windows and unknown calendars cannot qualify. Exactly 60 valid prior sessions qualifies. Current-day information cannot change historical thresholds. Node test commands exit 0.

Commands: `node --test tests/extreme-reversal.test.mjs tests/engine.test.mjs`.

### Stage 2 — Build the deterministic setup detector

Scope: isolated detector and its tests, using Stage 1 helpers. Reuse session functions without changing their global behavior.

Prompt:

> Execute Stage 2 only of plans/001-extreme-move-reversal.md. Implement the frozen extreme-reversal-v1 candidate lifecycle in the isolated module. Use completed session-aligned candles, the exact 60-minute return and prior-60-session sample deviation, a later confirming candle, 15-minute candidate expiry, frozen extreme-based stop, deterministic IDs and false-to-true rearming. Enforce window/early-close bounds, one active candidate/position, and idempotent restart state. Support all six specified intervals for replay while forward defaults to 3 minutes. Never inject signals into production scanners, alerts, training or paper ledgers. Add mirrored long/short fixtures and assertions for future-data immunity, no same-candle confirmation, missing bars, time boundaries, duplicate ticks, and rearm behavior. Run focused tests and report the result.

Acceptance: appending future bars cannot alter already emitted results under the same frozen data version. One qualifying event produces one ID. Both directions obey identical mirrored rules. A persistent extreme does not generate repeated candidates.

Commands: `node --test tests/extreme-reversal.test.mjs tests/engine.test.mjs`.

### Stage 3 — Add observed-quote paper execution and durable records

Scope: suggested `modules/extreme-reversal-paper.mjs`, `tests/extreme-reversal-paper.test.mjs`. Reuse verified safe-write and pure quote helpers only when behavior matches this specification.

Prompt:

> Execute Stage 3 only of plans/001-extreme-move-reversal.md. Add an isolated research paper state machine and durable ledger. Follow exact next-trading-session ATM selection/ties, actual post-confirmation synchronized fresh quotes, 30-second entry deadline, ask entry, stop/1.5R/30-minute underlying exit triggers, later-bid exit with a 30-second deadline, and one-contract sizing. Store one master observation with baseline/5%-spread eligibility; preserve rejected and unmeasurable cases. Use configured modeled fees and an additional one-cent-per-share-per-side stress scenario without double-counting spread. Keep option P&L separate from underlying R. Persist/restores pending and active states with safe serialized writes; preserve corrupt files and surface write failures. Test Friday/holiday expiry, no matching expiry, ATM ties, exact 5% boundary, stale/future/delayed/missing quotes, receipt-time leakage, gaps, stops, targets, timeouts, negative risk, restart idempotency and outages. No network wiring, production ledger writes or orders. Run focused tests.

Acceptance: no valid later quotes means no invented option P&L. Example arithmetic: ask 2.00, later bid 2.20, multiplier 100 and modeled fee .65 per side produces $18.70 base and $16.70 with the specified stress. Show these as unit-test fixtures, never as historical trades. A wide-spread quote changes eligibility, not the chosen contract.

Commands: `node --test tests/extreme-reversal.test.mjs tests/extreme-reversal-paper.test.mjs`.

### Stage 4 — Connect collection and the existing Strategy Lab

Scope: additive server lifecycle/data hooks; small existing research-panel extension. Suggested tests: `tests/extreme-reversal-integration.test.mjs`. Touch `server.mjs`, `app.js`, or `modules/robinhood-live.mjs` only where necessary after inspecting current user diffs. Prefer a dedicated read-only research adapter over changing shared UI-selected option state.

Prompt:

> Execute Stage 4 only of plans/001-extreme-move-reversal.md. Connect the tested isolated experiment to existing backend market-data cycles, a separate runtime research store and a compact Strategy Lab panel. Keep it disabled by default with explicit reversible enable/disable. Use existing read-only Robinhood transport/backoff and queue priorities; never alter the user's selected option chain or access accounts/balances/orders. Collection must work when the panel is closed. Expose history readiness and fresh-quote coverage; if five-second freshness or historical warmup is unavailable, show the true blocked state. Do not use public delayed chains to simulate contemporary fills. Add bounded validated API operations with existing same-origin protections, serialized collection, deduplication, shutdown flush and failure isolation. Disabling blocks new entries but preserves records and permits existing observations to resolve while data remains available. Render long/short baseline-versus-filtered results separately from production and replay cohorts. Use current UI conventions and accessible controls. Test disabled-by-default, enable/disable, page-independent collection, stale/missing data, restart, response validation, and absence of writes to production ledgers/training/alerts. Run targeted integration and existing relevant regression tests. Do not turn the experiment on or commit/deploy.

Acceptance: a fixture signal completes the full research path without appearing in existing strategy results or alerts. Disconnected/stale/delayed states are visible. Production request cadence and selected chain remain unchanged apart from bounded independent research requests when explicitly enabled. No network dependency in automated tests; inject fixtures.

Commands: `node --test tests/extreme-reversal-integration.test.mjs tests/research-workspace.test.mjs tests/robinhood-live.test.mjs tests/public-options.test.mjs tests/server.test.mjs`.

### Stage 5 — Add reproducible evaluation and complete release checks

Scope: isolated reporting/replay entry point and tests. Suggested `scripts/replay-extreme-reversal.mjs`, `tests/extreme-reversal-replay.test.mjs`; reuse detector and execution/report helpers, not a duplicate strategy implementation. Final command flags should be documented by the executor rather than guessed in advance.

Prompt:

> Execute Stage 5 only of plans/001-extreme-move-reversal.md. Add a deterministic offline underlying-only replay command and research summaries using the same detector/specification. Require explicit input data, source metadata, warmup/evaluation dates and chronological split. Audit coverage, reject synthetic/missing required data, compare 1/2/3/5/10/15-minute frames on identical audited evaluation dates, and separate longs/shorts, baseline/filtered forward options, and historical underlying-only outcomes. Historical bars alone cannot populate an options spread-filter result. Use next-minute-open replay entry, conservative gap stops and stop-first ambiguous minutes; label costs and all modeled execution. Report expectancy, PF, drawdown, win/loss size, duration, missing-data counts, and paired opportunity/filled-trade comparisons where actually measurable. Add day-clustered confidence intervals when sufficient sessions exist; otherwise state insufficient evidence. Record all tested variants and prohibit automatic optimization/promotion. Test deterministic replay, no future-data effect, split/warmup leakage, metric arithmetic, no-trade/all-win cases, rejected/unmeasurable denominators, and reproducible profile IDs. Run focused tests then npm test once; compare any failures with the pre-change baseline. Review the final diff for unrelated edits and secret exposure. Report actual commands, results, limitations and how to enable paper collection; leave it disabled. Do not claim profits without real input data or fabricate backtests.

Acceptance: fixtures give repeatable expected results; unavailable option evidence remains unavailable. Baseline and filtered forward results share identical master opportunities. Full regression suite passes or pre-existing/environment failures are precisely documented. Tests passing means implementation works, not strategy validation.

Commands: `node --test tests/extreme-reversal-replay.test.mjs`; `npm test`; `git diff --check`.

## Execution and evidence checklist

Before the first change, capture `node --version`, `git status --short`, relevant user diffs, and a test baseline. Use temporary directories and injected clocks/providers in tests. Do not run the application against the user's actual data just to test persistence. No install is needed for this dependency-free Node project unless a concrete prerequisite is missing and authorized.

After implementation, review changed-file scope and run the commands above. Run a mocked end-to-end long and short, disabled/enabled operation, restart, stale feed, late quote and early-close scenario. If manually checking the UI, verify keyboard access, labels, stable page refresh and that no collection requires the panel to stay open. Real provider coverage is an empirical prerequisite, not something fixture tests prove.

Stop conditions: an existing helper disagrees with the specification; a change requires altering production trading behavior; an important user edit conflicts; history/provenance is insufficient; adequate quotes require a new service or paid tier. Complete unaffected isolated components and surface the exact remaining prerequisite. Do not loosen the statistical history, quote-age or expiry rule to manufacture activity.

## Research rollout

1. Complete all stages and fixture-based acceptance checks.
2. Review actual source coverage and quote timing during a regular session. If valid, deliberately enable paper collection locally. With insufficient historical warmup, remain warming up while accumulating valid sessions; a longer timeframe cannot substitute for minute history.
3. Use the first observations to verify instrumentation and missing-data rates. Do not use those same observations as untouched evaluation evidence after modifying rules.
4. Freeze a run profile before collecting a new evaluation period. Aim for broad session coverage and sufficient completed trades in each direction; calendar time or a minimum trade count alone is not validation.
5. Consider a separate production integration proposal only after positive net results, meaningful uncertainty bounds, paired filter comparisons and cost/parameter robustness. Keep losses and missing-data outcomes in the evidence record.

