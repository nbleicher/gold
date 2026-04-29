Gold Label Bridge (USB print server)
=====================================

This program lets the Gold web app print labels to the Katasymbol T50M Pro on this PC.

Before first run
----------------
1. Connect the T50M Pro with USB and turn it on.
2. Install Python 3 from https://www.python.org/downloads/
   - On Windows: check "Add python.exe to PATH" (or use the "py" launcher).
   The bridge needs Python only for label compression (stdlib "lzma").

Start the bridge
----------------
Double-click:  Start Gold Label Bridge.bat

Leave the window open while printing. The app talks to:
  http://127.0.0.1:4242

Quick check
-----------
Open a browser or PowerShell on this machine:
  http://127.0.0.1:4242/health

You should see JSON with "ok": true. "printerFound" means Windows sees the printer USB device.

Troubleshooting
---------------
- If the window closes immediately: install Python 3 and Visual C++ Redistributable; reinstall this package.
- If Print in the browser fails: confirm this bridge is running and you are on the same PC as the printer.
