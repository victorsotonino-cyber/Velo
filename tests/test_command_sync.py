from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import discord

from datashop.bot import DataShopBot
from datashop.config import Settings


def make_settings(*, scope: str, guild_id: int | None) -> Settings:
    return Settings(
        token="unit-test-token",
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
        command_sync_scope=scope,
    )


class CommandSyncScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_guild_scope_copies_commands_and_removes_stale_global_commands(self) -> None:
        bot = DataShopBot(make_settings(scope="guild", guild_id=123456789))
        try:
            bot.tree.copy_global_to = Mock()
            bot.tree.clear_commands = Mock()
            bot.tree.sync = AsyncMock(side_effect=[[object()], []])

            await bot.sync_application_commands()

            bot.tree.copy_global_to.assert_called_once()
            copied_guild = bot.tree.copy_global_to.call_args.kwargs["guild"]
            self.assertEqual(copied_guild.id, 123456789)

            bot.tree.clear_commands.assert_called_once_with(guild=None)
            self.assertEqual(bot.tree.sync.await_count, 2)
            self.assertEqual(bot.tree.sync.await_args_list[0].kwargs["guild"].id, 123456789)
            self.assertEqual(bot.tree.sync.await_args_list[1].kwargs, {})
        finally:
            await bot.close()

    async def test_global_scope_removes_stale_guild_commands_first(self) -> None:
        bot = DataShopBot(make_settings(scope="global", guild_id=123456789))
        try:
            bot.tree.clear_commands = Mock()
            bot.tree.sync = AsyncMock(side_effect=[[], [object(), object()]])

            await bot.sync_application_commands()

            bot.tree.clear_commands.assert_called_once()
            cleared_guild = bot.tree.clear_commands.call_args.kwargs["guild"]
            self.assertEqual(cleared_guild.id, 123456789)
            self.assertEqual(bot.tree.sync.await_count, 2)
            self.assertEqual(bot.tree.sync.await_args_list[0].kwargs["guild"].id, 123456789)
            self.assertEqual(bot.tree.sync.await_args_list[1].kwargs, {})
        finally:
            await bot.close()

    async def test_guild_scope_without_guild_id_does_not_publish_global_commands(self) -> None:
        bot = DataShopBot(make_settings(scope="guild", guild_id=None))
        try:
            bot.tree.sync = AsyncMock()

            await bot.sync_application_commands()

            bot.tree.sync.assert_not_awaited()
        finally:
            await bot.close()


class CommandNamespaceTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_registered_root_and_group_command_names_are_unique(self) -> None:
        bot = DataShopBot(make_settings(scope="global", guild_id=None))
        extensions = (
            "datashop.cogs.general",
            "datashop.cogs.moderation",
            "datashop.cogs.tickets",
            "datashop.cogs.store",
            "datashop.cogs.community",
            "datashop.cogs.engagement",
            "datashop.cogs.configuration",
        )
        try:
            for extension in extensions:
                await bot.load_extension(extension)

            root_commands = bot.tree.get_commands()
            root_names = [command.name for command in root_commands]
            self.assertEqual(len(root_names), len(set(root_names)), "Hay comandos slash raíz duplicados.")

            for root in root_commands:
                if isinstance(root, discord.app_commands.Group):
                    names = [command.name for command in root.commands]
                    self.assertEqual(
                        len(names),
                        len(set(names)),
                        f"Hay subcomandos duplicados en /{root.name}.",
                    )
                    for child in root.commands:
                        if isinstance(child, discord.app_commands.Group):
                            nested_names = [command.name for command in child.commands]
                            self.assertEqual(
                                len(nested_names),
                                len(set(nested_names)),
                                f"Hay subcomandos duplicados en /{root.name} {child.name}.",
                            )
        finally:
            await bot.close()


if __name__ == "__main__":
    unittest.main()
