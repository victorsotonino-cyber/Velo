from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from datashop.storage import get_guild_data, read_json, set_guild_data, write_json


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.previous_data_directory = os.environ.get("DATASHOP_DATA_DIR")
        os.environ["DATASHOP_DATA_DIR"] = self.temporary_directory.name

    def tearDown(self) -> None:
        if self.previous_data_directory is None:
            os.environ.pop("DATASHOP_DATA_DIR", None)
        else:
            os.environ["DATASHOP_DATA_DIR"] = self.previous_data_directory
        self.temporary_directory.cleanup()

    def test_missing_file_returns_independent_default(self) -> None:
        default = {"items": []}
        first = read_json("missing.json", default)
        first["items"].append("changed")
        second = read_json("missing.json", default)
        self.assertEqual(second, {"items": []})

    def test_json_is_written_and_loaded_as_utf8(self) -> None:
        write_json("sample.json", {"message": "¡Hola DATASHOP!"})
        self.assertEqual(read_json("sample.json", {}), {"message": "¡Hola DATASHOP!"})
        self.assertTrue((Path(self.temporary_directory.name) / "sample.json").exists())

    def test_guild_data_is_isolated(self) -> None:
        set_guild_data("settings.json", 123456, {"prefix": "?"})
        set_guild_data("settings.json", 654321, {"prefix": "!"})
        self.assertEqual(get_guild_data("settings.json", 123456, {}), {"prefix": "?"})
        self.assertEqual(get_guild_data("settings.json", 654321, {}), {"prefix": "!"})
        self.assertEqual(get_guild_data("settings.json", 999999, {}), {})

    def test_invalid_file_path_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            read_json("../unsafe.json", {})


if __name__ == "__main__":
    unittest.main()
