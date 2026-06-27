# BioMolExplorer — User Guide (macOS)

> **Note:** macOS support is currently in progress. The installation script supports macOS, but no official build has been validated yet. Proceed with caution and report any issues.

## Requirements

- macOS 11 (Big Sur) or later
- Internet connection on the first run
- At least **10 GB** of free disk space (for Miniconda and the scientific environment)

---

## Installation

1. Download the `BioMolExplorer.dmg` file.
2. Double-click the `.dmg` to mount it.
3. Drag the **BioMolExplorer** icon to the **Applications** folder.
4. Eject the disk image.

---

## Running the Application

1. Open the **Applications** folder and locate **BioMolExplorer**.
2. **On the first launch**, macOS may block the app because it is from an unidentified developer. To authorize it:
   - Right-click (or Control-click) the icon → **Open**.
   - Click **Open** in the confirmation dialog.

   > This step is only required once. After that, you can open the app normally.

3. From the second launch onwards, open BioMolExplorer normally from the Applications folder or via Spotlight (`Cmd + Space` → type "BioMolExplorer").

---

## First Run

On the **first launch**, the application automatically performs the following setup steps (no user action required):

| Step | Description | Approximate time |
|------|-------------|-----------------|
| 1 | Download and install Miniconda at `~/.biomolexplorer/miniconda/` | 2–5 min |
| 2 | Install Node.js via NVM at `~/.biomolexplorer/nvm/` | 1–2 min |
| 3 | Create the Conda environment (RDKit, OpenBabel, Vina, PyMOL, Flask, etc.) | 5–10 min |
| 4 | Install JavaScript dependencies | 1–2 min |

> **Total first-run time: 5 to 15 minutes**, depending on your internet connection.

After setup, the BioMolExplorer interface will open automatically in the app window.

Subsequent launches are fast — the launcher only starts the already-installed services.

---

## Uninstalling

1. Drag **BioMolExplorer** from the Applications folder to the Trash.
2. To also remove the scientific environment installed in your home directory:

```bash
rm -rf ~/.biomolexplorer
```

---

## Troubleshooting

**"BioMolExplorer cannot be opened because it is from an unidentified developer"**
Right-click the icon and choose **Open** instead of double-clicking. This bypasses Gatekeeper for untrusted apps.

**The application opens but shows a blank screen**
Wait a few seconds — the backend may still be starting up.

**First-run setup fails midway**
Check your internet connection and relaunch the application. The setup process is resumable.
