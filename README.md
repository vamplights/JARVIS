# JARVIS 1.25

Local market research, signal cards, Top Picks and paper trading. No real order routes.

## First setup on either computer

1. Install Node.js 22 or newer and Git.
2. Clone this **private repository** into a normal local folder on that computer.
3. Run **Start JARVIS.cmd** on Windows or double-click **Start JARVIS.command** on macOS. You can also run `npm start` in the project folder.
4. Connect your own Robinhood session in System Status. Authorization stays on that computer.

No npm packages are required. First start copies the clean configuration from `config/settings.shared.json` into `data/journal-settings.json` with an empty journal. It never overwrites an existing journal or settings file. Stock/crypto data and models build locally; internet is needed for market feeds. If you start with `node server.mjs` directly, run `node scripts/init-settings.mjs` first to seed the included configuration.

On macOS, the launcher opens the dashboard in your browser. Keep its Terminal window open while using JARVIS; press Control-C to stop it. If macOS reports a permission error, run `chmod +x "Start JARVIS.command"` in the project folder once. Node.js 22 or newer must be installed. Robinhood sign-in stays in memory on Mac, so reconnect after restarting JARVIS.

## Move work between laptop and PC

Before editing on either computer:

```powershell
git pull --ff-only
```

After editing and testing:

```powershell
node --test
git add .
git commit -m "Describe the change"
git push
```

Finish committing and pushing on one computer before switching to the other. If Git reports local changes or divergent branches, resolve them before pulling; avoid force pushes. Restart JARVIS after pulling code changes.

`data/` is deliberately ignored: Robinhood credentials, account snapshots, journals, paper trades, reports, model weights, history and logs do **not** sync through GitHub. Each computer maintains its own local state. Do not manually force-add that folder. Browser layout and notification history are local to each browser.

`config/settings.shared.json` is a clean, versioned starting configuration, including watchlists and risk preferences. Existing installations keep their local settings when code is updated. Edit the template deliberately if you want new installations to use different settings; never put contact details, tokens or private feed URLs there.

## Project map

- `server.mjs`: local API and collectors.
- `engine.mjs`, strategy modules: closed-candle signals and configured market costs.
- `app.js`, `card-view.mjs`, `style.css`: browser interface.
- `tests/`: regression suite; run `node --test` from this folder.
- `scripts/`: initialization, history, analysis and optional Windows service tools.
- `docs/`: operation and calendar notes.
- `HANDOFF.md`: concise context for continuing development on another computer.

The Desktop installation from which this code was prepared remains separate. Run and edit this Git checkout when developing so your changes can be committed and pushed. Keep its runtime data local.

## Switching from an existing installation

Stop any currently running JARVIS instance before starting this checkout on the same port. To keep that computer's existing local history, make a backup and copy its `data` folder into this checkout while JARVIS is stopped. That folder remains ignored by Git. Windows-encrypted Robinhood authorization is tied to the Windows account; sign in independently on the laptop rather than copying authorization between computers.
