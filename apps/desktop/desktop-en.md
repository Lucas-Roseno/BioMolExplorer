# 🧬 BioMolExplorer - Desktop Environment & Distribution

This directory contains all the instructions needed to generate an installable and distributable **Desktop Application** of BioMolExplorer for end users.

---

## 📂 Directory Structure

```text
desktop/
├── BioMolExplorer-Launcher/        # Auxiliary files included in every release
│   ├── biomolexplorer.tar          # Exported Docker image (generated in Step 1)
│   ├── init.bat                    # Startup engine for Windows
│   └── init.sh                     # Startup engine for Linux/macOS
│
└── wrapper/                        # Source code for the visual executable (Electron)
    ├── main.js                     # Electron logic (splash screen + bridge to scripts)
    ├── package.json                # Dependencies and electron-builder configuration
    ├── assets/                     # Icons (.ico, .icns, .png)
    ├── scripts/
    │   └── pack-release.js         # Script that assembles the final .zip per platform
    └── dist/                       # Intermediate output from electron-builder
```

After the build, the final distribution `.zip` is generated **at the root of `desktop/`**, outside the `wrapper/` folder.

---

## ⚙️ Initial Setup (first time only)

Before the first build, install the wrapper dependencies:

```bash
cd apps/desktop/wrapper
npm install --no-workspaces
```

Repeat this step only if:
- You clone the repository on a new machine.
- You add/update dependencies in `package.json`.

---

## 👨‍💻 Developer Guide: Generating a New Release

Whenever there are changes to the system (Frontend/Backend) and a new version needs to be released, follow these **2 steps**:

### Step 1: Generate the Docker Image

From the root of the main project, generate the latest version of the image and export it to the Launcher folder:

```bash
# 1. Build the image
docker build -t biomolexplorer .

# 2. Export to .tar
docker save -o apps/desktop/BioMolExplorer-Launcher/biomolexplorer.tar biomolexplorer
```

### Step 2: Generate the Package for the Desired Platform

```bash
cd apps/desktop/wrapper

# For Windows
npm run build:win

# For Linux
npm run build:linux

# For macOS (must be run on a Mac)
npm run build:mac
```

Each command does **everything at once**: compiles Electron, validates the auxiliary files, and produces the final `.zip` ready for delivery.

The final package is generated at:

```text
desktop/BioMolExplorer-Launcher-win.zip
desktop/BioMolExplorer-Launcher-linux.zip
desktop/BioMolExplorer-Launcher-mac.zip
```

Each `.zip` contains a `BioMolExplorer-Launcher/` folder with the correct structure for "Extract here":

```text
BioMolExplorer-Launcher-win.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.exe
    ├── biomolexplorer.tar
    └── init.bat

BioMolExplorer-Launcher-linux.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.AppImage
    ├── biomolexplorer.tar
    └── init.sh

BioMolExplorer-Launcher-mac.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.dmg
    ├── biomolexplorer.tar
    └── init.sh
```

> ⚠️ **Prerequisite:** the `biomolexplorer.tar` (Step 1) must be in `apps/desktop/BioMolExplorer-Launcher/` before running the build, otherwise the script fails with a clear error message.

> ℹ️ **About cross-platform builds:** `build:win` and `build:linux` run on any OS. `build:mac` **only works on macOS** (Apple limitation). For Linux builds from Windows, using WSL2 is recommended to avoid permission issues.

---

## 📖 End-User Instructions

(Copy and send to the client along with the `.zip` corresponding to their OS.)

### 🪟 Windows

1. Extract the `.zip` on your computer (e.g., Desktop).
2. Open the `BioMolExplorer-Launcher/` folder.
3. Double-click **`BioMolExplorer.exe`**.
4. If Windows asks for Administrator permission, click "Yes".
5. Wait for the loading screen: Docker and the servers will start in the background, and the application will open shortly after.

> On the first run, an internet connection is required if Docker is not yet installed.

---

### 🐧 Linux

1. Extract the `.zip` on your computer.
2. Open the `BioMolExplorer-Launcher/` folder.
3. Double-click **`BioMolExplorer.AppImage`**.

If the system complains about permissions, open a terminal in the extracted folder and run:

```bash
chmod +x BioMolExplorer.AppImage
./BioMolExplorer.AppImage
```

> On some distros (Ubuntu 22.04+), you may need to install `libfuse2` for the AppImage to work:
> ```bash
> sudo apt install libfuse2
> ```

---

### 🍎 macOS

1. Extract the `.zip`.
2. Double-click **`BioMolExplorer.dmg`** to open it.
3. Drag the BioMolExplorer icon to the **Applications** folder.
4. Open the app for the first time (you may need to right-click → "Open" to authorize it, since the app is not signed).

> On the first run, an internet connection is required if Docker Desktop is not yet installed.
