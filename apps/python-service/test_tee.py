
import sys
import io

class Tee(object):
    def __init__(self, *files):
        self.files = files
    def write(self, obj):
        pass
    def flush(self):
        pass

log_stream = io.StringIO()
sys.stdout = Tee(log_stream, sys.__stdout__)

print(f"Has fileno: {hasattr(sys.stdout, 'fileno')}")
try:
    print(f"Fileno: {sys.stdout.fileno()}")
except Exception as e:
    print(f"Error calling fileno: {e}")

import subprocess
print("Running subprocess.run(stdout=None)")
subprocess.run(["echo", "hello"], stdout=None)
print("Success")
