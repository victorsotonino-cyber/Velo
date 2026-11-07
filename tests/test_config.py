from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from datashop.config import Settings


class CommandScopeConfigTests(unittest.TestCase):
    def _settings(self, **overrides: str) -> Settings:
        values = {"DISCORD_TOKEN": "unit-test-token"}
        values.update(overrides)
        with patch.dict(os.environ, values, clear=True):
            return Settings.from_env()

    def test_auto_scope_uses_guild_when_guild_id_is_configured(self) -> None:
        settings = self._settings(GUILD_ID="123456789", COMMAND_SYNC_SCOPE="auto")
        self.assertEqual(settings.guild_id, 123456789)
        self.assertEqual(settings.command_sync_scope, "guild")

    def test_auto_scope_uses_global_without_guild_id(self) -> None:
        settings = self._settings(COMMAND_SYNC_SCOPE="auto")
        self.assertIsNone(settings.guild_id)
        self.assertEqual(settings.command_sync_scope, "global")

    def test_explicit_guild_scope_requires_guild_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "requiere configurar GUILD_ID"):
            self._settings(COMMAND_SYNC_SCOPE="guild")

    def test_invalid_scope_is_rejected_before_startup(self) -> None:
        with self.assertRaisesRegex(ValueError, "debe ser auto, guild o global"):
            self._settings(COMMAND_SYNC_SCOPE="random")

    def test_explicit_global_scope_can_include_a_guild_id_for_cleanup(self) -> None:
        settings = self._settings(GUILD_ID="987654321", COMMAND_SYNC_SCOPE="global")
        self.assertEqual(settings.guild_id, 987654321)
        self.assertEqual(settings.command_sync_scope, "global")


if __name__ == "__main__":
    unittest.main()
