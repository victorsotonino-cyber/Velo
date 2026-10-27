from __future__ import annotations

import unittest

import discord
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from datashop.bot import DataShopBot
from datashop.config import Settings
from datashop.cogs.tickets import _staff_role_ids
from datashop.cogs.store import _safe_int, _safe_money



class CommandSyncFallbackTests(unittest.IsolatedAsyncioTestCase):
    def _settings(self, guild_id: int | None) -> Settings:
        return Settings(
            token="test-token",
            prefix="!",
            guild_id=guild_id,
            port=10000,
            data_dir=Path("./data"),
            welcome_channel_id=None,
            logs_channel_id=None,
            ticket_category_id=None,
            staff_role_id=None,
            member_role_id=None,
            currency="USD",
        )

    async def test_forbidden_guild_sync_falls_back_to_global_commands(self) -> None:
        bot = DataShopBot(self._settings(123456789))
        forbidden = discord.Forbidden(
            SimpleNamespace(status=403, reason="Forbidden"),
            {"message": "Missing Access", "code": 50001},
        )
        try:
            with patch.object(bot.tree, "copy_global_to") as copy_global_to, patch.object(
                bot.tree, "sync", new_callable=AsyncMock
            ) as sync:
                sync.side_effect = [forbidden, []]
                await bot.sync_application_commands()
                copy_global_to.assert_called_once()
                self.assertEqual(sync.await_count, 2)
                self.assertIn("guild", sync.await_args_list[0].kwargs)
                self.assertEqual(sync.await_args_list[1].kwargs, {})
        finally:
            await bot.close()

    async def test_global_sync_failure_is_logged_and_does_not_abort_setup(self) -> None:
        bot = DataShopBot(self._settings(None))
        failure = discord.HTTPException(
            SimpleNamespace(status=500, reason="Server Error"),
            {"message": "Temporary failure", "code": 0},
        )
        try:
            with patch.object(bot.tree, "sync", new_callable=AsyncMock) as sync:
                sync.side_effect = failure
                await bot.sync_application_commands()
                sync.assert_awaited_once_with()
        finally:
            await bot.close()


class StoreInputSafetyTests(unittest.TestCase):
    def test_invalid_stock_values_fall_back_safely(self) -> None:
        self.assertEqual(_safe_int(None), 0)
        self.assertEqual(_safe_int("broken"), 0)
        self.assertEqual(_safe_int("7"), 7)

    def test_non_finite_money_values_are_not_counted_as_revenue(self) -> None:
        self.assertEqual(_safe_money("not-money"), 0.0)
        self.assertEqual(_safe_money("NaN"), 0.0)
        self.assertEqual(_safe_money(float("inf")), 0.0)
        self.assertEqual(_safe_money("12.50"), 12.5)


class TicketRouteRoleTests(unittest.TestCase):
    def test_current_route_staff_role_is_authorized_without_leaking_other_routes(self) -> None:
        settings = {
            "staff_role_id": "200",
            "ticket_types": {
                "support": {"staff_role_id": "300"},
                "purchase": {"staff_role_id": "400"},
            },
        }
        purchase_roles = _staff_role_ids(settings, 100, "purchase")
        self.assertEqual(purchase_roles, {100, 200, 400})
        self.assertNotIn(300, purchase_roles)

    def test_invalid_and_missing_role_ids_are_ignored(self) -> None:
        settings = {
            "staff_role_id": "not-an-id",
            "ticket_types": {"refund": {"staff_role_id": None}},
        }
        self.assertEqual(_staff_role_ids(settings, None, "refund"), set())

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
                "datashop.cogs.engagement",
                "datashop.cogs.configuration",
            ):
                await bot.load_extension(extension)

            commands_by_name = {command.name: command for command in bot.tree.get_commands()}
            expected = {
                "help", "ping", "serverinfo", "userinfo",
                "ban", "kick", "timeout", "untimeout", "warn", "warnings", "clear",
                "slowmode", "lock", "unlock", "nick", "role",
                "ticket", "shop", "vouch", "suggestion", "poll", "botconfig",
                "afk", "remind", "reminders", "reminder-cancel", "rank", "leaderboard",
                "giveaway", "say", "announce",
            }
            self.assertTrue(
                expected.issubset(commands_by_name),
                f"Faltan comandos slash: {sorted(expected - set(commands_by_name))}",
            )

            ticket_group = commands_by_name["ticket"]
            ticket_names = {command.name for command in ticket_group.commands}
            expected_ticket_commands = {
                "setup", "close", "claim", "unclaim", "reopen", "add", "remove", "rename",
                "transfer", "priority", "move", "route", "max-open", "blacklist-add",
                "blacklist-remove", "note", "list", "stats", "delete", "transcript",
            }
            self.assertTrue(
                expected_ticket_commands.issubset(ticket_names),
                f"Faltan subcomandos ticket: {sorted(expected_ticket_commands - ticket_names)}",
            )
            note_group = next(command for command in ticket_group.commands if command.name == "note")
            self.assertTrue({"add", "list"}.issubset({command.name for command in note_group.commands}))

            shop_group = commands_by_name["shop"]
            shop_names = {command.name for command in shop_group.commands}
            expected_shop_commands = {
                "list", "add", "edit", "stock", "remove", "payment",
                "browse", "order", "my-orders", "orders", "order-status", "cancel", "stats", "low-stock",
            }
            self.assertTrue(
                expected_shop_commands.issubset(shop_names),
                f"Faltan subcomandos shop: {sorted(expected_shop_commands - shop_names)}",
            )
            payment_group = next(command for command in shop_group.commands if command.name == "payment")
            self.assertTrue({"add", "remove"}.issubset({command.name for command in payment_group.commands}))

            giveaway_group = commands_by_name["giveaway"]
            self.assertTrue({"start", "end", "reroll"}.issubset({command.name for command in giveaway_group.commands}))

            role_group = commands_by_name["role"]
            self.assertTrue({"add", "remove"}.issubset({command.name for command in role_group.commands}))

            config_group = commands_by_name["botconfig"]
            config_names = {command.name for command in config_group.commands}
            self.assertTrue({"logs", "automod", "blockword-add", "blockword-remove"}.issubset(config_names))
        finally:
            await bot.close()


if __name__ == "__main__":
    unittest.main()
