"""Run the two synthetic releases in the CU Launch testing slot under a private, unique path."""
import hashlib
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib import error, request

GROUP, SITE, SLOT = "rg-cu-app-portal", "cu-app-portal", "testing"
HOST = "cu-app-portal-testing.azurewebsites.net"
SCM = "https://cu-app-portal-testing.scm.azurewebsites.net"
TARGET = ["-g", GROUP, "-n", SITE, "--slot", SLOT]
HERE = Path(__file__).resolve().parent


def az(*args):
    return subprocess.check_output(["az", *args, "--only-show-errors"], timeout=120)


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main(bundle_dir, output_dir):
    if az("webapp", "show", *TARGET, "--query", "defaultHostName", "-o", "tsv").decode().strip() != HOST:
        raise ValueError("Unexpected slot hostname")
    if json.loads(az("webapp", "config", "show", *TARGET, "--query", "{autoSwap:autoSwapSlotName}"))["autoSwap"]:
        raise ValueError("Auto-swap is enabled")
    token = az("account", "get-access-token", "--resource", "https://management.azure.com/",
               "--query", "accessToken", "-o", "tsv").decode().strip()
    run = "pilot-" + uuid.uuid4().hex
    directory = "/home/site/" + run
    opener = request.build_opener(NoRedirect())

    def vfs(method, filename="", data=None, etag=None):
        url = SCM + "/api/vfs/site/" + run + "/" + filename
        headers = {"Authorization": "Bearer " + token, "Content-Type": "application/octet-stream"}
        if etag:
            headers["If-Match"] = etag
        with opener.open(request.Request(url, data=data, headers=headers, method=method), timeout=45) as response:
            return response.read(), response.headers.get("ETag")

    vfs("PUT", data=b"")
    bundles = {}
    for name in ["inventory.cjs", "fixture-smoke.cjs"]:
        data = (bundle_dir / name).read_bytes()
        vfs("PUT", name, data)
        if vfs("GET", name)[0] != data:
            raise ValueError("Slot bundle verification failed")
        bundles[name] = hashlib.sha256(data).hexdigest()
    meta = {"scope": "synthetic-slot-test", "collectedAt": "2026-11-23T00:00:00Z", "complete": True}
    app = {"id": "fixture", "ownerId": "fixture-owner", "repositoryUrl": "https://github.com/example/fixture",
           "sourceOfTruth": "IMPORTED_REPOSITORY", "publishStatus": "NOT_STARTED", "hasLiveUrl": True}
    site = {"resourceId": "/synthetic/site", "manager": "cu-app-portal", "requestId": "fixture", "state": "Running"}
    vfs("PUT", "portal.json", json.dumps({**meta, "rows": [app]}).encode())
    vfs("PUT", "azure.json", json.dumps({**meta, "rows": [site]}).encode())
    for phase in ["baseline", "fixed"]:
        data = (HERE / "fixtures" / (phase + ".json")).read_bytes()
        etag = vfs("GET", "release.json")[1] if phase == "fixed" else None
        vfs("PUT", "release.json", data, etag)
        digest = hashlib.sha256(data).hexdigest()
        previous = " baseline.result" if phase == "fixed" else ""
        # All command arguments are constants or generated hex identifiers.
        cmd = (f"cd {directory} && node inventory.cjs --portal portal.json --azure azure.json > {phase}.inventory"
               f" && node fixture-smoke.cjs release.json {digest} {run}-{phase}{previous}"
               f" > {phase}.pending && mv {phase}.pending {phase}.result")
        az("webapp", "exec", *TARGET, "--mode", "execute", "--shell-command", cmd)
        for attempt in range(30):
            try:
                body = vfs("GET", phase + ".result")[0]
                break
            except error.HTTPError as exc:
                if exc.code != 404 or attempt == 29:
                    raise
                time.sleep(2)
        report = json.loads(body)
        replay = vfs("GET", phase + ".inventory")[0]
        if json.loads(replay)["counts"] != {"matched": 1}:
            raise ValueError("Slot CLI inventory mismatch")
        if phase == "baseline":
            baseline_inventory = replay
        elif replay != baseline_inventory:
            raise ValueError("Slot CLI replay changed")
        if report["pilot"][0]["revision"] != "sha256:" + digest:
            raise ValueError("Slot revision mismatch")
        output_dir.mkdir(mode=0o700, exist_ok=True, parents=True)
        (output_dir / (phase + ".json")).write_bytes(body)
        print(f"{phase}: verified {digest}", flush=True)
    receipt = {"slot": HOST, "privatePath": directory, "runId": run, "inventoryReplay": "identical", "bundleSha256": bundles,
               "verifiedFixes": len([f for f in report["findings"] if f["status"] == "verified-fixed"])}
    (output_dir / "slot.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: test-slot.py BUNDLE_DIR EVIDENCE_DIR")
    try:
        main(Path(sys.argv[1]), Path(sys.argv[2]))
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        # Do not serialize exception request headers or authentication material.
        status = getattr(exc, "code", None)
        sys.exit(f"Testing-slot check failed ({type(exc).__name__}, status={status}).")
