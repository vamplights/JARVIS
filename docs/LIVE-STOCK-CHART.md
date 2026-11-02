# Workspace chart: Alpaca, existing feeds, EMA and VWAP

The Lightweight Charts renderer replaces the old SVG charts in Overview, Stocks & Options, and Crypto. Chart Pattern Analysis stays alongside the chart. Stocks use the Alpaca IEX stream when configured; otherwise their existing JARVIS source remains visible. Crypto uses the existing Coinbase source. Feed name, status and last-data time appear directly above the candles.

**Alpaca connection** opens only a local credential form. Enter paper keys there; optionally remember them with Windows account encryption. Memory-only credentials last until the server stops. Disconnect forgets saved credentials. Keys are never included in chart payloads or browser storage.

Under **Indicators · EMA & VWAP**, add up to six EMAs, set periods and colors, or hide individual lines. Enable or disable session VWAP and choose its color. **Apply & save** stores these display preferences locally in the browser. EMA uses recursive smoothing seeded at the first available close, with a full-period plotting warmup. VWAP uses typical price times volume, resetting on the New York date for stocks (including available extended hours) and on the UTC date for crypto. Neither indicator modifies strategy parameters.

Pattern drawings come only from the matching symbol, timeframe and chart feed. Alpaca analysis evaluates the same cached IEX one-minute candles used by the chart, independently of the signal engines. The original analysis enable switch, settings panel, source labels and durable detection history remain. Unsupported or unavailable analysis is flagged; drawings from other providers are excluded. Sparse IEX data can reduce the available analysis window. Volume is IEX-only on that feed.

Custom Pine Script import is not included. Individual scripts can be assessed and translated later. This version adds only EMA and VWAP as display indicators.

Bundled renderer: TradingView Lightweight Charts 5.2.1, with LICENSE and NOTICE in vendor/lightweight-charts/ and visible attribution. No external script CDN is used.
