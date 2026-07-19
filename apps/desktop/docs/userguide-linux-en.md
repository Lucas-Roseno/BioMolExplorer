# BioMolExplorer — User Guide (Linux)

## Requirements

- Ubuntu 20.04+ or any Debian-based distribution (64-bit)
- Internet connection on the first run
- At least **10 GB** of free disk space (for Miniconda and the scientific environment)

---

## Installation

### Option 1 — Graphical installer (recommended)

1. Download the `biomolexplorer_amd64.deb` file.
2. Double-click the file to open it in the **App Center** (or **Software Install**).
3. Click **Install** and enter your password when prompted.

### Option 2 — Terminal

Install with `apt` (recommended — it resolves dependencies automatically):

```bash
sudo apt install ./biomolexplorer_amd64.deb
```

> Run the command from the folder where you downloaded the file. The `./` before the name is required so `apt` treats it as a local file.

Alternatively, with `dpkg`:

```bash
sudo dpkg -i biomolexplorer_amd64.deb
sudo apt-get install -f   # resolves any missing dependencies
```

---

## Running the Application

Open **BioMolExplorer** from the application menu, or via terminal:

```bash
biomolexplorer
```

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

```bash
sudo dpkg -r biomolexplorer
```

To also remove the scientific environment installed in your home directory:

```bash
rm -rf ~/.biomolexplorer
```

---

## Troubleshooting

**The application opens but shows a blank screen**
Wait a few seconds — the backend may still be starting up.

**First-run setup fails midway**
Check your internet connection and relaunch the application. The setup process is resumable.

**"dpkg: error" during installation**
Run `sudo apt-get install -f` to resolve missing dependencies.
