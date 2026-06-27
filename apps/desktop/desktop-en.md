# BioMolExplorer - Desktop Environment & Distribution

This directory contains all the instructions to generate a distributable Desktop interface for BioMolExplorer end users.

---

## Directory Structure

```text
desktop/
├── BioMolExplorer-Launcher/        # Auxiliary files bundled inside the .deb
│   ├── biomolexplorer-src.tar.gz   # Compressed source code (generated automatically)
│   └── init-native.sh              # Native Engine for Linux/macOS (Conda + Node.js)
│
└── wrapper/                        # Electron executable source code
    ├── main.js                     # Main logic (splash screen + bridge to init-native.sh)
    ├── package.json                # Dependencies and electron-builder configuration
    ├── assets/                     # Icons (.png for Linux, .icns for Mac)
    ├── scripts/
    │   └── pack-source.js          # Generates biomolexplorer-src.tar.gz
    └── dist/                       # electron-builder output (.deb, .dmg)
```

---

## Platform Status

| Platform | Mode | Script | Status |
|---|---|---|---|
| Linux | Native (Conda + Node.js) | `init-native.sh` | ✅ Implemented and working |
| macOS | Native (Conda + Node.js) | `init-native.sh` | 🟡 Script ready, not tested on Mac |

> The currently active and distributed build is **`linux-native`**.

---

## Current Distribution Mode: Native (Conda + Node.js)

The current mode is **Native**, without Docker. The launcher automatically installs Miniconda, Node.js and the scientific environment on the user's machine. The user only needs to install the `.deb` and open the application.

> Miniconda, Node.js, RDKit, OpenBabel, Vina, PyMOL and Flask are installed automatically on the first run. No additional prerequisites are required.

---

## Developer Guide: Generating a New Release

### Full Build (single command)

Syncs the version, generates the tarball and compiles the `.deb` in a single command:

```bash
cd apps/desktop/wrapper

# Linux (only active mode currently)
npm run build:linux-native

# macOS — script ready, requires a Mac machine to build
# npm run build:mac-native
```

Internally, `build:linux-native` runs:
1. `npm run sync-version` → syncs the version with the root `package.json`
2. `node scripts/pack-source.js` → generates `BioMolExplorer-Launcher/biomolexplorer-src.tar.gz`
3. `electron-builder --linux deb` → compiles Electron and generates the `.deb` in `dist/`

---

### Package Output

```text
wrapper/dist/biomolexplorer_X.Y.Z_amd64.deb   ← only artifact generated
```

The `.deb` already contains everything the user needs:
- The Electron executable (graphical interface)
- The `init-native.sh` (initialization engine)
- The `biomolexplorer-src.tar.gz` (source code extracted on first run)

---

## End User Instructions

### Linux — Native Mode

1. Download the `biomolexplorer_X.Y.Z_amd64.deb` file.
2. Double-click the file to open it in the **App Center** and click **Install**.

   Or via terminal:
   ```bash
   sudo dpkg -i biomolexplorer_X.Y.Z_amd64.deb
   ```

3. Open **BioMolExplorer** from the application menu or via terminal:
   ```bash
   biomolexplorer
   ```

**On the first run**, the launcher will (automatically, without any user action):
- Install Miniconda at `~/.biomolexplorer/miniconda/`
- Install Node.js at `~/.biomolexplorer/nvm/`
- Create the Conda environment with RDKit, OpenBabel, Vina, PyMOL, Flask etc. *(5 to 15 minutes)*
- Install JavaScript dependencies

Subsequent runs are fast — it only starts the services.

---

### macOS — Native Mode

> Not yet tested. The `init-native.sh` script supports macOS (bash + Conda), but no build has been validated on Mac.

1. Download the `BioMolExplorer.dmg` file.
2. Open the `.dmg` and drag the BioMolExplorer icon to the **Applications** folder.
3. On first launch: right-click the icon → **Open** to authorize execution.
