# BioMolExplorer - Desktop Environment & Distribution

This directory contains all the instructions to generate a distributable Desktop application of BioMolExplorer for end users.

---

## Directory Structure

```text
desktop/
├── BioMolExplorer-Launcher/        # Auxiliary files included in the release
│   ├── biomolexplorer-src.tar.gz   # Compressed source code (auto-generated)
│   └── init-native.sh              # Native launcher for Linux/macOS (Conda + Node.js)
│
└── wrapper/                        # Electron executable source code
    ├── main.js                     # Main logic (splash screen + bridge to init-native.sh)
    ├── package.json                # Dependencies and electron-builder configuration
    ├── assets/                     # Icons (.png for Linux, .icns for Mac)
    ├── scripts/
    │   ├── pack-source.js          # Generates biomolexplorer-src.tar.gz
    │   └── pack-release.js         # Assembles the final .zip for distribution
    └── dist/                       # electron-builder output (AppImage, .dmg)
```

The final `.zip` is generated at the root of `desktop/`, outside `wrapper/`.

---

## Platform Status

| Platform | Mode | Script | Status |
|---|---|---|---|
| Linux | Native (Conda + Node.js) | `init-native.sh` | ✅ Implemented and working |
| macOS | Native (Conda + Node.js) | `init-native.sh` | 🟡 Script ready, not yet tested on Mac |

> The only active build currently distributed is **`linux-native`**.

---

## Current Distribution Mode: Native (Conda + Node.js)

The current mode is **Native**, without Docker. The launcher automatically installs Miniconda and the scientific environment on the user's machine. The user only needs to click the executable.

> **End-user prerequisite:** Node.js 18+ installed (`node --version` must return 18+).
> Miniconda, RDKit, OpenBabel, Vina, PyMOL, and Flask are installed automatically on the first run.

---

## Developer Guide: Generating a New Release

### Full Build (single command)

Generates the tarball, compiles Electron, and assembles the `.zip` in one step:

```bash
cd apps/desktop/wrapper

# Linux (only active build currently)
npm run build:linux-native

# macOS — script ready, requires a Mac machine to build
# npm run build:mac-native
```

Internally, `build:linux-native` runs:
1. `node scripts/pack-source.js` → generates `BioMolExplorer-Launcher/biomolexplorer-src.tar.gz`
2. `electron-builder --linux AppImage` → compiles Electron to `dist/BioMolExplorer.AppImage`
3. `node scripts/pack-release.js linux-native` → assembles the final `.zip`

---

### Package Output

```text
desktop/BioMolExplorer-Launcher-linux-native.zip   ← only active package currently
```

Contents of the `.zip` (Linux native mode):

```text
BioMolExplorer-Launcher-linux-native.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.AppImage      ← executable — user double-clicks here
    ├── init-native.sh               ← startup engine (called by the AppImage)
    └── biomolexplorer-src.tar.gz    ← source code extracted on first run
```

---

## End-User Instructions

### Linux — Native Mode

**Prerequisite:** Node.js 18+ installed. To check:
```bash
node --version   # must return v18.x.x or higher
```
If not installed, get it at [nodejs.org](https://nodejs.org/) or via your package manager.

**Steps:**

1. Extract the `.zip` to any folder on your computer.
2. Open the `BioMolExplorer-Launcher/` folder.
3. Double-click **`BioMolExplorer.AppImage`** to launch the app.

If the system complains about permissions, open a terminal in the folder and run:
```bash
chmod +x BioMolExplorer.AppImage
./BioMolExplorer.AppImage
```

**On the first run**, the launcher will automatically (no user action required):
- Install Miniconda at `~/.biomolexplorer/miniconda/`
- Create the Conda environment with RDKit, OpenBabel, Vina, PyMOL, Flask, etc. *(5–15 minutes)*
- Install JavaScript dependencies

Subsequent runs are fast — it just starts the services.

> **Ubuntu 22.04+ / Debian:** you may need to install `libfuse2` to run AppImages:
> ```bash
> sudo apt install libfuse2
> ```

---

### macOS — Native Mode

> Not yet tested. The `init-native.sh` script supports macOS (bash + Conda), but no Mac build has been validated.

1. Extract the `.zip`.
2. Open the `BioMolExplorer-Launcher/` folder.
3. Double-click **`BioMolExplorer.dmg`**.
4. Drag the BioMolExplorer icon to the **Applications** folder.
5. On first open: right-click the icon → **Open** to authorize it.
