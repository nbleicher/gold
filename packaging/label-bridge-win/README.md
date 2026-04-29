# Windows label bridge release (`label-server.js`)

Produces a **portable folder** (`dist/GoldLabelBridge/`) containing:

- `node.exe` (official Node.js Windows x64 zip, version in [`.node-version`](./.node-version))
- `label-server.js` (copied from the **repo root**)
- `node_modules` with **`node-hid`** and **`canvas`** built for that Node version

Then you can zip that folder or compile **Inno Setup** to build `Setup.exe` for end users.

## Requirements (maintainer machine)

- **Windows x64** (native addons are not portable from macOS/Linux builds).
- **PowerShell 5+**
- **Node.js** (same **major** as `.node-version`, used for `npm ci` so ABI matches bundled `node.exe`).
- **Internet** once, to download the Node zip from `nodejs.org`.
- **Inno Setup 6** (optional), to turn `dist\GoldLabelBridge` into `Setup.exe`.

Prerequisites for **building** `canvas` / `node-hid` on Windows:

- Visual Studio Build Tools with **Desktop development with C++** (MSVC + Windows SDK).

The committed [`package-lock.json`](./package-lock.json) was generated with `npm install --package-lock-only --ignore-scripts` so macOS/Linux devs do not need Cairo to refresh the lock. **Release builds must run `npm ci` on Windows x64** so `canvas` / `node-hid` compile (or use prebuilds) for that platform.

## Build the staging folder + zip

From the **repository root**:

```powershell
powershell -ExecutionPolicy Bypass -File packaging/label-bridge-win/scripts/build-release.ps1
```

Or:

```bash
npm run label-server:pack-win
```

Outputs:

- `packaging/label-bridge-win/dist/GoldLabelBridge/` — copy or ship this tree
- `packaging/label-bridge-win/output/GoldLabelBridge-win-x64.zip`

## Build `Setup.exe` (Inno Setup)

After a successful `build-release.ps1`:

1. Install [Inno Setup](https://jrsoftware.org/isdl.php).
2. Open `packaging/label-bridge-win/installer/GoldLabelBridge.iss` in Inno Setup **or** run:

```text
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\label-bridge-win\installer\GoldLabelBridge.iss
```

The installer is written to `packaging/label-bridge-win/output/GoldLabelBridge-Setup.exe` (see `#define OutputBaseFilename` in the `.iss` file).

## End users

They install from `Setup.exe` or unzip the portable folder, then run **Start Gold Label Bridge.bat**. They still need **Python 3** on PATH (`python3`, `py -3`, or `python`) — see `assets/README-USER.txt` copied into the dist folder.
