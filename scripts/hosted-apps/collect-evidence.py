"""Read control-plane metadata for an explicit cohort. Never contact an app URL."""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, timeout=60, check=True)
        return result.stdout
    except (OSError, subprocess.SubprocessError):
        return None


def github_runs(repo):
    path = f"repos/{repo}/actions/workflows/deploy-azure-app-service.yml/runs?per_page=30"
    raw = command(["gh", "api", path, "--jq",
                   "[.workflow_runs[] | {id:(.id|tostring), event, headSha:.head_sha, conclusion}]"])
    return json.loads(raw) if raw else []


def checkout_receipt(log, active_id):
    # The managed job emits the checked-out SHA and Azure's deploy-log link.
    # Require a single checkout and deploy. Multiple matches need manual review.
    commits = re.findall(r"\[command\][^\n]*/git log -1 --format=%H\r?\n\S+ ([a-f0-9]{40})\s*$", log, re.M)
    deployments = re.findall(r"Deploy logs can be viewed at https://[^\s/]+/api/deployments/([0-9a-f-]+)/log", log)
    if len(commits) == 1 and deployments == [active_id] and re.fullmatch(r"[a-f0-9-]{36}", active_id):
        return commits[0]
    return None


def match_release(repo, active, candidates):
    for run in candidates:
        jobs = command(["gh", "api", f"repos/{repo}/actions/runs/{run}/jobs", "--jq",
                        '[.jobs[] | select(.name=="deploy" and .conclusion=="success") | .id]'])
        ids = json.loads(jobs or "[]")
        if len(ids) != 1:
            continue
        # Job logs may contain ANSI colors. Capture bytes privately and parse only receipt markers.
        log = command(["gh", "api", "--allow-escape-sequences", f"repos/{repo}/actions/jobs/{ids[0]}/logs"])
        revision = checkout_receipt((log or b"").decode("utf8", errors="replace"), active["id"])
        if revision:
            return {"resourceId": active["resourceId"], "deploymentId": active["id"], "revision": revision,
                    "repositoryUrl": f"https://github.com/{repo}",
                    "evidenceRef": f"https://github.com/{repo}/actions/runs/{run}/job/{ids[0]}"}, run
    return None, None


def repository_json(repo, revision, path):
    raw = command(["gh", "api", f"repos/{repo}/contents/{path}?ref={revision}",
                   "-H", "Accept: application/vnd.github.raw+json"])
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def deployment_profile(repo, revision, event):
    manifest = repository_json(repo, revision, "app-portal/deployment-manifest.json")
    if not manifest:
        return None
    try:
        if manifest.get("schemaVersion") not in ("1.0.0", "1.1.0") or manifest["hosting"]["service"] != "app-service":
            return None
        framework = manifest["runtime"]["framework"]
        auth = manifest.get("auth", {})
        database = manifest["defaults"]["azure"].get("database", {})
        return {"revision": revision, "framework": framework if framework in ("express", "nextjs", "fastapi", "static") else "unknown",
                "audience": "public" if not auth else "entra" if auth.get("provider") == "microsoft-entra-id" else "unknown",
                "database": "none" if not database else "postgresql" if database.get("provider") == "postgresql" else "unknown",
                "trigger": {"push": "push", "workflow_dispatch": "portal-dispatch"}.get(event, "unknown")}
    except (ValueError, KeyError, TypeError, AttributeError):
        return None


def lodash_observation(lock, receipt, checked_at):
    if not isinstance(lock, dict) or lock.get("lockfileVersion") not in (2, 3) or not isinstance(lock.get("packages"), dict):
        return None
    results = []
    for path, entry in lock["packages"].items():
        if not isinstance(entry, dict):
            return None
        if entry.get("name") != "lodash" and not re.search(r"(?:^|/)node_modules/lodash$", path):
            continue
        version = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", str(entry.get("version")))
        verdict = "unknown" if not version else "fail" if tuple(map(int, version.groups())) < (4, 17, 21) else "pass"
        results.append(verdict)
    verdict = "fail" if "fail" in results else "unknown" if "unknown" in results else "pass"
    return {"rule": "dependency", "component": "npm-lock/lodash/GHSA-35jh-r3h4-6jhm",
            "revision": receipt["revision"], "resourceId": receipt["resourceId"], "checkedAt": checked_at,
            "evidenceRef": receipt["repositoryUrl"] + "/blob/" + receipt["revision"] + "/package-lock.json",
            "controls": {"advisory": verdict}}


def collect(row, selection):
    resource_id = row["sites"][0]["resourceId"]
    parts = re.fullmatch(r"/subscriptions/([\w-]+)/resourceGroups/([\w.-]+)/providers/Microsoft.Web/sites/([\w-]+)",
                         resource_id, re.IGNORECASE)
    repo_url = row["app"]["repositoryUrl"]
    if not parts or not repo_url or not re.fullmatch(r"https://github\.com/[\w.-]+/[\w.-]+", repo_url):
        raise ValueError("Expected a verified Web App and managed repository")
    subscription, group, site = parts.groups()
    repo = urlparse(repo_url).path.strip("/")
    raw = command(["az", "webapp", "log", "deployment", "list", "--subscription", subscription,
                   "-g", group, "-n", site, "--only-show-errors", "-o", "json", "--query",
                   "[].{id:id,active:active,succeeded:status==\u00604\u0060,finishedAt:end_time}"])
    deployments = [{**d, "resourceId": resource_id} for d in json.loads(raw or "[]")]
    runs = github_runs(repo)
    dependabot = command(["node", "--import", "tsx", str(Path(__file__).with_name("dependabot.ts")), "read", repo])
    caps = {"dependency": "readable" if dependabot is not None else "unavailable"}
    for name, endpoint in [("code", "code-scanning"), ("secret", "secret-scanning")]:
        # Silent reads test availability without returning alert bodies to the report.
        ok = command(["gh", "api", "--silent", f"repos/{repo}/{endpoint}/alerts?per_page=1"])
        caps[name] = "unavailable" if ok is None else "readable"
    portal_run = re.fullmatch(re.escape(repo_url) + r"/actions/runs/(\d+)", selection.get("workflowUrl") or "")
    result = {"requestId": row["requestId"], "deployments": deployments, "deploymentsComplete": raw is not None,
            "capabilities": caps, "portalRunId": portal_run[1] if portal_run else None,
            "workflowRuns": runs, "receipts": [], "observations": []}
    if dependabot:
        result["dependabot"] = json.loads(dependabot)
    active = [d for d in deployments if d["active"]]
    if len(active) == 1 and active[0]["succeeded"]:
        candidates = [r["id"] for r in runs if r["conclusion"] == "success"]
        if portal_run and portal_run[1] not in candidates:
            candidates.append(portal_run[1])
        receipt, run = match_release(repo, active[0], candidates)
        if receipt:
            result["receipts"] = [receipt]
            event = next((r["event"] for r in runs if r["id"] == run), None)
            profile = deployment_profile(repo, receipt["revision"], event)
            if profile:
                result["profile"] = profile
            lock = repository_json(repo, receipt["revision"], "package-lock.json")
            observation = lodash_observation(lock, receipt, datetime.now(timezone.utc).isoformat())
            if observation:
                result["observations"].append(observation)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--semgrep", type=Path, help="Local Slide Show-Inator scan receipt")
    args = parser.parse_args()
    report = json.loads(args.inventory.read_text())
    cohort = json.loads(args.cohort.read_text())
    rows = {r["requestId"]: r for r in report["rows"] if r["status"] == "matched"}
    if len(cohort) not in (1, 6, 7, 8) or len({item["id"] for item in cohort}) != len(cohort):
        parser.error("Select one registration for a rerun or six to eight distinct pilot registrations.")
    if any(item["id"] not in rows for item in cohort):
        parser.error("Every selected app needs a unique matched resource.")
    apps = [collect(rows[item["id"]], item) for item in cohort]
    if args.semgrep:
        scan = json.loads(args.semgrep.read_text())
        matches = [app for app in apps if rows[app["requestId"]]["app"]["repositoryUrl"] == scan["repository"]]
        if len(matches) != 1:
            parser.error("The Semgrep receipt must match one selected repository.")
        matches[0]["semgrep"] = scan
    print(json.dumps({"observedAt": datetime.now(timezone.utc).isoformat(), "apps": apps}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError):
        sys.exit("Unable to collect evidence. Check the cohort and input formats.")
