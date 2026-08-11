# BioMolExplorer — User Guide (Linux)

## Requirements

- Ubuntu 20.04+ or any Debian-based distribution (64-bit)
- Internet connection on the first run
- At least **10 GB** of free disk space (for Miniconda and the scientific environment)
- **UCSF Chimera** and **DOCK6** installed beforehand and available on your `PATH` — they are licensed third-party tools and cannot be bundled with the app. The application checks for both (plus DMS, which is bundled) every time it starts and **will not launch** if either is missing:
  - **Chimera**: download the `.bin` installer at [rbvi.ucsf.edu/chimera](https://www.rbvi.ucsf.edu/chimera/download.html), run it, and make sure the `chimera` command is on your `PATH`.
  - **DOCK6**: request/download it at [dock.compbio.ucsf.edu](http://dock.compbio.ucsf.edu/), build it, then either add its `bin/` folder to `PATH`, set the `DOCK6_PATH` environment variable to the install directory, or install it at `~/progs/dock6/`.

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
| 1 | Check for Chimera, DOCK6 and DMS — **stops here with instructions if any is missing** | instant |
| 2 | Download and install Miniconda at `~/.biomolexplorer/miniconda/` | 2–5 min |
| 3 | Install Node.js via NVM at `~/.biomolexplorer/nvm/` | 1–2 min |
| 4 | Create the Conda environment (RDKit, OpenBabel, Vina, PyMOL, Flask, etc.) | 5–10 min |
| 5 | Install JavaScript dependencies | 1–2 min |

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

**"Required external tool(s) not found: Chimera, DOCK6" on startup**
The app checks for Chimera, DOCK6 and DMS before starting and refuses to launch if any is missing. Install the tool(s) named in the error screen (see [Requirements](#requirements) above for links), then reopen BioMolExplorer.
