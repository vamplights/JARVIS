# Jarvis 1.0 — local operation

All strategy evaluation, model training, reports and storage run on this PC. Free public quote/history/news endpoints require internet. There is no hosted JARVIS backend, subscription service or real order route.

Start JARVIS before **09:25 ET / 06:25 PT** on trading days. The 09:35 ET opening scan needs 14 prior opening-volume sessions. ORB-in-play entries require the opening selection to have been recorded by 09:36 ET; a late or incomplete selection is excluded rather than treated as an on-time decision. Missing bars are shown as missing, never filled in. Initial downloads across the scan universe can take time. Keep the PC powered and connected overnight for this first download. Quote sources can restrict or delay free data; blocked endpoints are skipped and listed under Source issues.

Configure crypto venue and per-side fees in Settings. The default 60 bps warning stays visible until that fee changes. Stock defaults are 3m/5m/15m; crypto defaults are 1h/daily. One-minute source collection remains enabled for opening-range strategies.

Auto Paper-Trading compares fixed, ATR-trailing and swing-trailing exits in separate scenarios. All signals use fixed dollar risk; the Realistic account view additionally applies share rounding, cash limits, trade caps and loss lockouts chronologically. Intraday and swing results remain separate. Model-unready confirmed trades are labeled uncalibrated. Stock shorts assume borrow availability and exclude borrow charges. Reports measure the underlying stock/spot setup, not option execution.

The scanner uses public Yahoo feeds and quote endpoints, SEC feeds/APIs, current S&P 500 membership from DataHub's public dataset, and Nasdaq's public Nasdaq-100 list. Membership is not a historical point-in-time universe. Add permitted company IR RSS feeds in Settings. Set a descriptive SEC User-Agent including your contact email to enable SEC requests. Requests are cached and serialized with at least 300 ms between same-host requests. Bloomberg, paywalled articles and authenticated quote endpoints are not bypassed.

Outages trigger available history backfills. Missed cycles and missed opens appear on report cards. Past news lists and forecasts cannot be invented after an outage, so backfilled cards explicitly say what was unavailable. `/health` and `data/local-health.json` expose a minute heartbeat.

## Optional Windows service setup

1. Download NSSM from its official site, https://nssm.cc/download, and extract the matching `nssm.exe` locally.
2. Open PowerShell **as Administrator** in this project folder and run:

   ```powershell
   .\scripts\setup-windows-service.ps1 -NssmPath 'C:\path\to\nssm.exe'
   ```

   This installs the local auto-start/restart service, disables sleep and hibernation timeouts on AC and battery, and asks for your Windows account password (not your PIN). Using your account preserves access to existing Windows-encrypted authorization. The password is stored by Windows Service Control Manager, not in JARVIS files. Consider battery and power implications before running the setup.
3. Existing **Start JARVIS** and **Restart JARVIS** launchers continue to work. The supervisor restarts crashed or hung Node processes; NSSM restarts the supervisor.
4. After your next planned reboot, run `scripts\verify-service.ps1`. It checks the changed boot time, automatic running service, and local health endpoint, then records the verification. Setup does not reboot your computer or claim an untested reboot passed.

To remove the service, use NSSM's remove command as Administrator. Restore your preferred sleep timeouts in Windows Power settings. Back up `data` with JARVIS stopped; it contains journals, credentials and research history and should stay private.

Daily trend returns use 63 / 126 / 252 trading sessions for the 3 / 6 / 12-month checks. Daily stock candles close at the exchange session end, including early closes and DST; crypto daily candles close at 00:00 UTC. Unresolved outcomes are never replaced with guessed exits. Historical ORB-in-play replay requires an opening list actually archived for that settings cohort; historical news lists or universe rankings are not invented. Post-earnings replay requires dated, available earnings metadata and keeps unknown surprise values unknown.
