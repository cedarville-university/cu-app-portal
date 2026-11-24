"""Install only the reviewed YAML rule groups from the pinned community rules tree."""
import subprocess
import sys
from pathlib import Path
from scan import RULE_DIRS, RULES_SHA

repo, dest = map(Path, sys.argv[1:])
files = subprocess.check_output(["git", "-C", str(repo), "ls-tree", "-rz", RULES_SHA, "--", *RULE_DIRS])
dest.mkdir(parents=True, exist_ok=True)
for record in files.split(b"\0"):
    if not record:
        continue
    meta, raw = record.split(b"\t", 1)
    mode, kind, sha = meta.split()
    name = Path(raw.decode())
    if kind != b"blob" or mode != b"100644" or name.suffix != ".yaml":
        continue
    target = dest / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(subprocess.check_output(["git", "-C", str(repo), "cat-file", "blob", sha.decode()]))
(dest / "REVISION").write_text(RULES_SHA + "\n")
