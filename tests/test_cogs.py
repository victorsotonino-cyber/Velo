from __future__ import annotations

import unittest
from pathlib import Path

from datashop.bot import DataShopBot
from datashop.config import Settings


class CommandRegistrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_cogs_load_and_expose_expected_slash_commands(self) -> None:
        settings = Settings(
            token="test-token",
            prefix="!",
            guild_id=None,
            port=10000,
            data_dir=Path("./data"),
            welcome_channel_id=None,
            logs_channel_id=None,
            ticket_category_id=None,
            staff_role_id=None,
            member_role_id=None,
            currency="USD",
        )
        bot = DataShopBot(settings)
        try:
            for extension in (
                "datashop.cogs.general",
                "datashop.cogs.moderation",
                "datashop.cogs.tickets",
                "datashop.cogs.store",
                "datashop.cogs.community",
                "datashop.cogs.configuration",
            ):
                await bot.load_extension(extension)

            names = {command.name for command in bot.tree.get_commands()}
            expected = {
                "help", "ping", "serverinfo", "userinfo",
                "ban", "kick", "timeout", "untimeout", "warn", "warnings", "clear",
                "ticket", "shop", "vouch", "suggestion", "poll", "botconfig",
            }
            self.assertTrue(expected.issubset(names), f"Faltan comandos slash: {sorted(expected - names)}")
        finally:
            await bot.close()


if __name__ == "__main__":
    unittest.main()
