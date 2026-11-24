import runpy
import unittest
from pathlib import Path

collector = runpy.run_path(str(Path(__file__).with_name("collect-evidence.py")))


class ProviderEvidenceTests(unittest.TestCase):
    def test_only_accepts_the_single_checkout_and_matching_azure_deployment(self):
        active = "c0dc1a50-9b11-4782-bb42-1a2ac9610cc1"
        revision = "a" * 40
        log = (f"2026-11-23T10:00:00Z [command]/usr/bin/git log -1 --format=%H\n"
               f"2026-11-23T10:00:01Z {revision}\n"
               f"2026-11-23T10:01:00Z Deploy logs can be viewed at https://***.scm.azurewebsites.net/api/deployments/{active}/log")
        receipt = collector["checkout_receipt"]
        self.assertEqual(receipt(log, active), revision)
        self.assertIsNone(receipt(log + "\n" + log, active))
        self.assertIsNone(receipt(log, active[::-1]))
        self.assertIsNone(receipt(log.replace("git log -1", "trigger SHA"), active))

    def test_advisory_scope_includes_nested_and_aliased_packages(self):
        inspect = collector["lodash_observation"]
        receipt = {"revision": "a" * 40, "resourceId": "/sites/test", "repositoryUrl": "https://github.com/example/test"}
        def outcome(entries):
            return inspect({"lockfileVersion": 3, "packages": entries}, receipt, "2026-11-23T10:00:00Z")["controls"]["advisory"]
        self.assertEqual(outcome({"node_modules/outer/node_modules/lodash": {"version": "4.17.20"}}), "fail")
        self.assertEqual(outcome({"node_modules/alias": {"name": "lodash", "version": "4.17.21"}}), "pass")
        self.assertEqual(outcome({"node_modules/lodash": {"version": "file:local"}}), "unknown")
        self.assertIsNone(inspect({"lockfileVersion": 1}, receipt, "2026-11-23T10:00:00Z"))


if __name__ == "__main__":
    unittest.main()
