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

            commands_by_name = {command.name: command for command in bot.tree.get_commands()}
            expected = {
                "help", "ping", "serverinfo", "userinfo",
                "ban", "kick", "timeout", "untimeout", "warn", "warnings", "clear",
                "ticket", "shop", "vouch", "suggestion", "poll", "botconfig",
            }
            self.assertTrue(
                expected.issubset(commands_by_name),
                f"Faltan comandos slash: {sorted(expected - set(commands_by_name))}",
            )

            ticket_group = commands_by_name["ticket"]
            ticket_names = {command.name for command in ticket_group.commands}
            expected_ticket_commands = {
                "setup", "close", "claim", "unclaim", "reopen", "add", "remove", "transcript",
            }
            self.assertTrue(
                expected_ticket_commands.issubset(ticket_names),
                f"Faltan subcomandos ticket: {sorted(expected_ticket_commands - ticket_names)}",
            )

            shop_group = commands_by_name["shop"]
            shop_names = {command.name for command in shop_group.commands}
            expected_shop_commands = {
                "list", "add", "edit", "stock", "remove", "payment",
                "order", "my-orders", "orders", "order-status",
            }
            self.assertTrue(
                expected_shop_commands.issubset(shop_names),
                f"Faltan subcomandos shop: {sorted(expected_shop_commands - shop_names)}",
            )
            payment_group = next(command for command in shop_group.commands if command.name == "payment")
            payment_names = {command.name for command in payment_group.commands}
            self.assertTrue({"add", "remove"}.issubset(payment_names))
        finally:
            await bot.close()


if __name__ == "__main__":
    unittest.main()
