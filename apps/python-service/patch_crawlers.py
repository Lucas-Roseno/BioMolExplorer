import os, glob

helper_code = """
    def _get_full_outputpath(self):
        if not self.__outputpath: return self.__path
        if os.path.isabs(self.__outputpath): return self.__outputpath
        return os.path.join(self.__path, self.__outputpath.lstrip('/'))

    def _get_full_targetpath(self):
        if getattr(self, '_Bioactivity__targetpath', None):
            path = self.__targetpath
        elif getattr(self, '_Molecule__targetpath', None):
            path = self.__targetpath
        elif getattr(self, '_SimilarMols__targetpath', None):
            path = self.__targetpath
        else:
            return self.__path
        if os.path.isabs(path): return path
        return os.path.join(self.__path, path.lstrip('/'))
"""

for fpath in glob.glob("BioMolExplorer/src/crawlers/*.py"):
    with open(fpath, "r") as f:
        content = f.read()
    
    if "set_outputpath" in content and "_get_full_outputpath" not in content:
        # Find def set_outputpath
        idx = content.find("def set_outputpath")
        if idx != -1:
            content = content[:idx] + helper_code + "\n    " + content[idx:]
            with open(fpath, "w") as f:
                f.write(content)
