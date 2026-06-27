## End User Instructions

### Linux — Native Mode

1. Download the `biomolexplorer_amd64.deb` file.
2. Double-click the file to open it in the **App Center** and click **Install**.

   Or via terminal:
   ```bash
   sudo dpkg -i biomolexplorer_amd64.deb
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