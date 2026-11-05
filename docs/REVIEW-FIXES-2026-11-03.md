# November 3 JARVIS review fixes

## Changes

All ten review items are fixed.

| Item | Behavior | Files |
| --- | --- | --- |
| 1. Daily learning | Both learning paths exclude the five special strategies from fixed-R batches. Workers return successful runs and identify individual failures. A FIFO queue serializes overlapping manual, daily and timer requests. | `modules/special-strategies.mjs`, `modules/intelligence.mjs`, `modules/engine.mjs`, `modules/replay-worker.mjs`, `modules/replay-queue.mjs`, `server.mjs` |
| 2. Paper ledger | The hot file retains active signals and pending observations. It keeps at least the newest 500 signals and 250 observations and batches archival after 64 additional rows. Ordered history remains available to stats, reports, frozen option lookups, journal comparisons and exports. | `modules/paper-ledger.mjs`, `modules/ledger-storage.mjs`, `modules/ledger-archive.mjs`, `modules/record-archive.mjs`, `modules/signal-outcomes.mjs`, `modules/model-review.mjs`, `scripts/analyze-ledger.mjs`, `server.mjs` |
| 3. Chart patterns | Failed and expired formations older than 24 hours relative to the newest evaluated candle move into an immutable archive. History preserves all records in order. Evaluations schedule a deferred write and shutdown flushes pending work. Explicit settings changes acknowledge durable storage. | `modules/chart-pattern-store.mjs`, `modules/deferred-save.mjs`, `modules/record-archive.mjs`, `server.mjs` |
| 4. Live charts | Normal trades replace the last minute or append one. Chart candles, volume and persistent indicator lines update at most four times per second. Official corrections recompute the affected suffix. An occasional feed snapshot drops evicted history. Layout writes are debounced and unchanged asset refreshes reuse the existing chart. | `modules/alpaca-chart.mjs`, `modules/live-chart-data.mjs`, `modules/workspace-chart.mjs`, `modules/chart-indicators.mjs` |
| 5. EMA9 entry window | No-trigger expiry requires coverage of the eligible whole minutes. Late candles can still fill the original order inside its original time window. A 15-minute grace period after expiry allows delayed data to arrive. Uncovered windows then become unmeasurable. | `modules/ema9-vwap.mjs` |
| 6. Stock VWAP | Stock chart VWAP starts at the regular open, uses HLC3 and actual volume, respects exchange closures and clips buckets spanning extended hours. Missing session anchors or internal gaps prevent a continuous VWAP. | `modules/chart-indicators.mjs`, `modules/workspace-chart.mjs`, `app.js` |
| 7. EMA9 series cache | Strategy evaluation and paper resolution reuse completed three-minute history per symbol, source, interval and calendar. A newly completed interval, backfill or historical correction invalidates the cache. | `modules/ema9-vwap.mjs` |
| 8. EMA9 settings | New rows share the existing profile settings pool. Legacy rows restore their frozen settings on load. Distinct legacy settings under the same profile get separate content-addressed entries. | `modules/ema9-vwap.mjs`, `modules/jarvis-forward.mjs`, `modules/record-archive.mjs` |
| 9. Scanner quotes | Fresh connected Robinhood quotes cover available symbols. Missing symbols use Yahoo. Batch failures and chart-feed outages back off independently, with a one-hour ceiling for batches and 15 minutes for chart quotes. | `modules/scanner.mjs` |
| 10. Mac launcher | Finder reads `jarvis-port.txt`, honors a nonempty `JARVIS_PORT` override, validates 1024–65535, and falls back to 8765 when the file is absent. | `Start JARVIS.command`, `scripts/launch-port.mjs` |

## Isolated timing and integrity checks

The inputs were copies of the November 3 stores in ignored `work/` directories on the same Windows host running Node 26.12.0. Each timing measures an explicit synchronous save with a high-resolution process clock. The first reading is the first measured call in that process. The following two are repeat calls. Migrated measurements start after the one-time archival operation and include all hot-file serialization, writes and renames.

| Store | Original bytes | Migrated hot bytes | Original saves (ms) | Migrated saves (ms) |
| --- | ---: | ---: | --- | --- |
| Paper ledger | 123,268,577 | 2,767,945 | 2,421 / 967 / 961 | 20 / 18 / 18 |
| Chart patterns | 28,953,681 | 8,252,122 | 100 / 62 / 122 | 21 / 16 / 20 |

The hot ledger contained 501 signals and 255 observations after migration. The archive held 120,805,913 bytes. The pattern archive held 20,758,602 bytes. The timing for patterns measures an actual write. The normal chart evaluation path schedules this work.

Verification compared every one of the 26,348 signal records and 25,276 observation records in order, including frozen fields and settings. The complete `analyzeLedger` result matched. All 11,594 pattern records matched the original export. SHA-256 hashes of both backup files matched the corresponding live input files. The hosted application was not started against live data during verification.

## Migration and rollback

On the next JARVIS start, each store checks its hot file. Before the first split, JARVIS makes a byte-verified `.before-archive` backup beside the file. Eligible records go into `data/ledger-archive/` or `data/pattern-archive/`. Each segment is named by its SHA-256 digest. The store verifies the segment before switching the hot file to the new manifest through an atomic rename. A retry can reuse an already written segment. Loading a referenced missing or damaged segment surfaces an error and preserves the hot file. Legacy EMA9 settings get a separate `auto-paper.json.before-ema-settings-pool` backup on their first compacting save.

1. To roll back, stop JARVIS and copy the **current** hot files, archive directories and backup files to a separate location. Keep this copy to retain observations collected since migration.
2. To recover the original November review-era format at the instant of migration, copy the corresponding `.before-archive` file over its hot file. For EMA settings, use the `.before-ema-settings-pool` copy if it was created.
3. Start the old software with the restored hot files. Starting the new software instead will apply retention again. The restored backups reflect their creation time. Keep the newer saved generation and its archives together if later records are needed.
4. To move or back up the **current** format, stop JARVIS and copy both hot files and their referenced archive directories together.

Complete exports and history-wide reports still scale with total history. The initial migration needs additional disk space for backups and archive segments. The measurements describe this host and dataset. Alpaca and scanner behavior was verified with fixtures, including official corrections and provider failures. Finder itself was not run on macOS.

## Tests

`npm test` passed **587 of 587** tests with zero skipped. The offline HTTP integration tests require localhost access. Added or updated regression files are `tests/review-replay.test.mjs`, `tests/review-storage.test.mjs`, `tests/review-quotes-port.test.mjs`, `tests/alpaca-chart.test.mjs`, `tests/chart-indicators.test.mjs`, `tests/chart-navigation.test.mjs`, `tests/chart-pattern-store.test.mjs` and `tests/ema9-vwap.test.mjs`. Coverage includes an EMA9-enabled daily cycle, interrupted migration, archive checksum failure, deferred write retry, frozen report/page parity, delayed candles, scanner backoff and launcher precedence.
