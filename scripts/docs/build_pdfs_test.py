import unittest

import build_pdfs


class BuildPdfsTest(unittest.TestCase):
    def test_uses_exact_cu_launch_brand_palette(self):
        self.assertEqual(build_pdfs.NAVY.hexval(), "0x0b1d3a")
        self.assertEqual(build_pdfs.GOLD.hexval(), "0xffb300")

    def test_resolves_portal_links_to_the_official_absolute_origin(self):
        rendered = build_pdfs.inline_markup(
            "See [Troubleshooting](/help/troubleshooting)."
        )

        self.assertIn(
            'href="https://cu-app-portal.azurewebsites.net/help/troubleshooting"',
            rendered,
        )


if __name__ == "__main__":
    unittest.main()
