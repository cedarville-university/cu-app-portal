"""Read regular source blobs from an immutable Git commit. Never check out or run an app."""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.186.0"
RULES_SHA = "a5ad1714f00c9f7fde980cab0ea1d6dc6d414fd2"
EXTENSIONS = {".js", ".jsx", ".cjs", ".mjs", ".ts", ".tsx", ".cts", ".mts", ".py"}
RULE_DIRS = ("javascript/lang/security", "javascript/browser/security", "javascript/node-crypto/security",
             "typescript/lang/security", "typescript/react/security", "python/lang/security")


def scan_tree(repo, sha, root, rules, executable):
    rules = rules.resolve()
    if (rules / "REVISION").read_text().strip() != RULES_SHA:
        raise ValueError("Unexpected rules revision")
    configs = sorted(f for directory in RULE_DIRS for f in (rules / directory).rglob("*.yaml"))
    if not all(any(f.is_relative_to(rules / directory) for f in configs) for directory in RULE_DIRS):
        raise ValueError("Incomplete rules installation")
    source = root / "source"
    source.mkdir()
    # The target tree contains only our selected tracked blobs. Disable Semgrep's default
    # ignore list (which otherwise skips directories such as tests and vendor).
    (source / ".semgrepignore").write_text("")

    env = {"PATH": str(Path(executable).parent) + os.pathsep + os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(root), "LANG": "C.UTF-8",
           "SEMGREP_SETTINGS_FILE": str(root / "settings.yml"), "SEMGREP_LOG_FILE": str(root / "scan.log")}
    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args], env=env, stderr=subprocess.DEVNULL, timeout=30)
    if git("rev-parse", "--verify", sha + "^{commit}").decode().strip() != sha:
        raise ValueError("Commit mismatch")
    files = set()
    total = 0
    objects = []
    for record in git("ls-tree", "-rlz", sha).split(b"\0"):
        if not record:
            continue
        meta, name = record.split(b"\t", 1)
        mode, _, oid, size = meta.split()
        path = Path(os.fsdecode(name))
        if mode not in (b"100644", b"100755") or path.suffix.lower() not in EXTENSIONS:
            continue
        if path.is_absolute() or ".." in path.parts or any(p.lower() == ".git" for p in path.parts):
            raise ValueError("Unexpected source path")
        total += int(size)
        if total > 128 * 1024**2 or len(objects) >= 20000:
            raise ValueError("Repository exceeds source scan capacity")
        objects.append((path, oid.decode(), int(size)))
        files.add(str(path))
    # Batch blobs through one git process. Each file's bytes and path come from the same tree.
    with tempfile.TemporaryFile() as ids:
        ids.write(b"".join(oid.encode() + b"\n" for _, oid, _ in objects))
        ids.seek(0)
        with subprocess.Popen(["git", "-C", str(repo), "cat-file", "--batch"], env=env, stdin=ids,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as proc:
            for path, oid, size in objects:
                if proc.stdout.readline().split() != [oid.encode(), b"blob", str(size).encode()]:
                    raise ValueError("Unexpected Git object")
                data = proc.stdout.read(size)
                if len(data) != size or proc.stdout.read(1) != b"\n":
                    raise ValueError("Incomplete Git object")
                target = source / path
                target.parent.mkdir(exist_ok=True, parents=True)
                target.write_bytes(data)
            if proc.wait(timeout=10) != 0:
                raise ValueError("Git blob export failed")
    result = {"version": VERSION, "rulesRevision": RULES_SHA, "ruleFiles": len(configs), "scannedFiles": 0,
              "skippedFiles": 0, "scanErrors": 0, "complete": True, "findings": []}
    if files:
        args = [executable, "scan", "--oss-only", "--jobs", "1", "--metrics", "off", "--disable-version-check",
                "--no-git-ignore", "--max-target-bytes", "0", "--disable-nosem", "--no-rewrite-rule-ids", "--json"]
        for directory in RULE_DIRS:
            args += ["--config", str(rules / directory)]
        proc = subprocess.run([*args, "."], cwd=source, env=env, capture_output=True, timeout=125)
        data = json.loads(proc.stdout)
        scanned = {str(Path(name)) for name in data["paths"]["scanned"]} - {".semgrepignore"}
        if proc.returncode or data["version"] != VERSION or data["errors"] or scanned != files:
            raise ValueError("Incomplete Semgrep coverage")
        result["scannedFiles"] = len(scanned)
        result["findings"] = [{"file": f["path"], "rule": f["check_id"], "severity": f["extra"]["severity"],
                              "line": f["start"]["line"]} for f in data["results"] if f["path"] in files]
    return {**result, "checkedAt": datetime.now(timezone.utc).isoformat()}


def main():
    request = json.load(sys.stdin)
    url, sha = request["repository"], request["sha"]
    if not re.fullmatch(r"https://github\.com/[A-Za-z0-9-]+/[\w.-]+", url, re.ASCII) or not re.fullmatch("[0-9a-f]{40}", sha):
        raise ValueError("Invalid source identity")
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        repo = root / "objects.git"
        env = {"PATH": os.environ["PATH"], "HOME": directory, "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"}
        subprocess.run(["git", "init", "--bare", "-q", str(repo)], env=env, check=True)
        auth = base64.b64encode(("x-access-token:" + request.pop("token")).encode()).decode()
        subprocess.run(["git", "-C", str(repo), "-c", "http.followRedirects=false", "fetch", "-q", "--no-tags", "--depth=1",
                        url + ".git", sha], env={**env, "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.extraHeader",
                        "GIT_CONFIG_VALUE_0": "Authorization: Basic " + auth}, stderr=subprocess.DEVNULL, check=True, timeout=65)
        print(json.dumps(scan_tree(repo, sha, root, Path(sys.argv[1]), sys.argv[2])))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.exit("Nightly source scan failed (" + type(exc).__name__ + ")")
