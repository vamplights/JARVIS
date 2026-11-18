# JARVIS for Windows prototype

Double-click **Start JARVIS Prototype.cmd** to open the prototype. The launcher needs Node.js 22 or newer and a built Pake executable. If the executable is missing, run the build once from PowerShell in the project root. The build needs Rust, the Visual Studio C++ desktop tools, and the Windows SDK.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\desktop\Build-JARVIS.ps1
```

The build puts the executable and installer in `outputs/desktop-prototype/dist`. The launcher closes its command window and starts the Node server and Pake window together. Closing the Pake window shuts down the prototype server. WebView2 is required at runtime. If startup fails, the launcher shows a message and writes details to `outputs/desktop-prototype/launch.log`.

The prototype starts on `http://127.0.0.1:18796` with its own data directory at `outputs/desktop-prototype/data`. It starts from a verified copy of the existing JARVIS data folder, including saved settings, journal entries, trades, and archives. The first import can take a few seconds. If files keep changing during import, close regular JARVIS and try again.

The two copies save changes independently from then on. The prototype continues to run offline. If you used an earlier prototype, keep its data folder under a separate name before importing so both copies are preserved.

To transfer theme, sidebar, Market Pulse, chart, and other interface preferences, open **Settings → Color themes** in your regular JARVIS browser and choose **Export browser preferences**. Open the same section in the prototype, choose **Import browser preferences**, select the downloaded JSON file, then choose **Reload JARVIS**. If the controls are missing, refresh the regular JARVIS tab first. The export contains interface preferences only.

The window reads the interface and API from the Node server in this checkout. Close the prototype, update the checkout using your normal update workflow, and open it again to pick up routine code changes with the same executable. Changes to the window, icon, or port require rebuilding the shell. Automatic release downloads and live broker sign-in are outside this prototype.

To verify the launcher and server without opening the desktop window, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\desktop\Start-JARVIS.ps1 -Check
```
