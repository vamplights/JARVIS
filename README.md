<p align="center">
  <img src="jarvis-logo.svg" width="80" height="80" alt="JARVIS logo">
</p>

# JARVIS

A local workspace for stock, options, and crypto research. Follow the market, review signal cards and Top Picks, and track ideas through paper trading in one browser dashboard.

JARVIS runs on your computer with Node.js. It combines live and historical market data with strategy evaluation, charts, journals, and local learning tools. It does not route real orders.

## 🔎 Inside the workspace

- **Market charts:** explore stocks and crypto with timeframe controls, EMA and VWAP overlays, and visible feed status. An optional Alpaca connection supplies stock chart data; crypto charts use the existing Coinbase feed.
- **Signals and Top Picks:** review completed-candle setups, entry plans, risk levels, source freshness, and model estimates. Setup scores and estimated win percentages are presented separately; preliminary estimates are not evidence of a profitable edge.
- **Options research:** inspect contract plans and available quotes alongside stock setups, with a separate manual option sandbox for testing ideas.
- **Paper trading and review:** follow simulated entries and exits, compare outcomes, and keep a local journal. Research and model results depend on the available data and the settings used to collect them.
- **Chart Pattern Analysis:** turn on an independent research workspace for formations, chart drawings, detection evidence, and historical analysis records. It defaults to **OFF** and does not feed signals, Top Picks, notifications, paper trades, or model training.

Available history and live coverage depend on the connected provider. Source and freshness labels matter: delayed, imported, or fallback data should be read in that context.

## 🚀 Get started

Install **Node.js 22 or newer** and **Git**, then clone this repository into a local folder. JARVIS uses built-in Node APIs and a bundled chart renderer; no npm package installation is required.

| Platform | Launch |
| --- | --- |
| Windows | Double-click `Start JARVIS.cmd` |
| macOS | Double-click `Start JARVIS.command` |
| Terminal | Run `npm start` from the project folder |

Open [http://127.0.0.1:8765](http://127.0.0.1:8765) if the dashboard does not open automatically. The server listens on the local loopback address; market feeds need an internet connection.

On first start, JARVIS copies [the shared configuration](config/settings.shared.json) into `data/journal-settings.json` with an empty journal. Existing settings and journals are preserved. This template supplies the starting watchlists and risk preferences, so each installation can then be configured independently.

Connect your own Robinhood session in **System Status** for the associated live data. See the [chart guide](docs/LIVE-STOCK-CHART.md) for the optional Alpaca chart connection and indicator controls.

On macOS, keep the launcher's Terminal window open while using JARVIS and press **Control-C** to stop it. If the launcher reports a permission error, run this once from the project folder:

```sh
chmod +x "Start JARVIS.command"
```

Robinhood authorization stays in memory on macOS, so reconnect after restarting JARVIS. On Windows, saved authorization uses Windows account encryption and belongs to that account on that computer.

If you launch with `node server.mjs` directly, run `node scripts/init-settings.mjs` first to seed the included configuration. `npm start` and the launchers already perform that step.

## 🔒 Your data stays with your installation

The `data/` directory is ignored by Git. It holds local credentials, account snapshots, journals, paper trades, reports, market history, model files, and logs. Those files do not sync through GitHub. Browser layout preferences and notification history also stay local to each browser.

Keep backups of the local data you want to retain, and do not force-add `data/` to Git. The versioned [shared settings](config/settings.shared.json) are a starting template, not a backup of your installation. Keep tokens, contact details, and private feed URLs out of that file.

To move an existing installation into this checkout, stop JARVIS, back up its data, and copy its `data/` folder into the checkout while both instances are stopped. Stop any other JARVIS instance using the same port before launching. Sign in independently on each computer rather than copying Windows-encrypted authorization between machines.

## 🛠️ Develop and sync between computers

Pull the latest code before editing:

```sh
git pull --ff-only
```

After making changes, run the suite and review what will be committed:

```sh
npm test
git status
git diff
git add <files-you-changed>
git commit -m "Describe the change"
git push
```

Finish committing and pushing on one computer before switching to another. Resolve local changes or divergent branches before pulling, and restart JARVIS after updating its code. Each computer keeps its own runtime data and local settings.

## 📁 Project map

| Path | Purpose |
| --- | --- |
| [server.mjs](server.mjs) | Local HTTP API, market collectors, and application coordination |
| [modules/](modules/) | Signal engines, feeds, chart tools, paper trading, learning, and browser components |
| [app.js](app.js), [index.html](index.html), [style.css](style.css) | Browser entry point, page shell, and styles |
| [config/](config/) | Versioned starting configuration |
| [scripts/](scripts/) | Launcher support, initialization, maintenance, and optional Windows service tools |
| [tests/](tests/) | Node test suite, run with `npm test` |
| [vendor/](vendor/) | Bundled third-party browser assets and their notices |
| [docs/](docs/) | Feature guides, validation notes, and development handoff |
| `data/`, `work/` | Ignored local runtime files and development output |

## 📚 Guides and development notes

- [Chart controls, feeds, EMA, and VWAP](docs/LIVE-STOCK-CHART.md)
- [Chart Pattern Analysis: usage, coverage, validation, and limitations](docs/CHART-PATTERN-ANALYSIS.md)
- [EMA9 + VWAP strategy and its dedicated forward paper test](docs/EMA9-VWAP-STRATEGY.md)
- [Market calendar sources](docs/CALENDAR-SOURCES.md)
- [Development handoff](docs/HANDOFF.md)
- [Verification phases](docs/VERIFY-PHASES.md)
- [Codex coding workflow and routing configuration](docs/CODEX-ROUTING.md)
