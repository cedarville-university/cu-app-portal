"""A private Git repository for end-to-end tests in slots without a GitHub installation identity."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

scanner = Path(os.environ.get("CU_SECURITY_SCANNER_DIR", "/opt/cu-security"))
sys.path.insert(0, str(scanner))
from scan import scan_tree

action, directory, *args = sys.argv[1:]
repo = Path(directory)


def git(*args):
    return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.DEVNULL).decode().strip()


if action == "advance":
    if not (repo / ".git").exists():
        git("init", "-q", "-b", "main")
    for i in range(int(args[0])):
        with (repo / "app.py").open("a") as file:
            file.write("enabled = True\n")
        git("add", "app.py")
        git("-c", "user.name=CU Launch test", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Update fixture")
elif action == "head":
    print(git("rev-parse", "refs/heads/main"))
elif action == "scan":
    with tempfile.TemporaryDirectory() as root:
        print(json.dumps(scan_tree(repo, args[0], Path(root), scanner / "rules", str(scanner / "venv/bin/semgrep"))))
else:
    raise ValueError("Unexpected fixture action")
