"""Offline regression check for the built worker's scanner, including its default ignore behavior."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

scanner = Path(os.getenv("CU_SECURITY_SCANNER_DIR", "/opt/cu-security"))
sys.path.insert(0, str(scanner))
from scan import scan_tree


class WorkerScannerTest(unittest.TestCase):
    def test_regular_blobs_and_test_directories_at_the_selected_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo = root / "repo"
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            (repo / "test").mkdir()
            (repo / "app.py").write_text("title = 'Example'\n")
            (repo / "test" / "sample.test.js").write_text("const example = 5;\n")
            (repo / "link.ts").symlink_to("app.py")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                            "commit", "-qm", "fixture"], check=True)
            sha = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"]).decode().strip()
            (repo / "untracked.ts").write_text("const unused = 1;\n")
            result = scan_tree(repo, sha, root, scanner / "rules", str(scanner / "venv/bin/semgrep"))
            self.assertTrue(result["complete"])
            self.assertEqual(result["scannedFiles"], 2)
            self.assertEqual(result["findings"], [])


if __name__ == "__main__":
    unittest.main()
