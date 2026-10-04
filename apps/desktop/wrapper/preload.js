const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('biomolDesktop', {
  selectWorkspaceParent: () => ipcRenderer.invoke('biomol:select-workspace-parent'),
});
