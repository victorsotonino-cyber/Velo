from __future__ import annotations

import unittest
from datetime import datetime, timezone

import discord
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from datashop.bot import DataShopBot
from datashop.config import Settings
from datashop.cogs.tickets import DEFAULT_STAFF_ROLE_ID, PUBLIC_TICKET_TYPE_KEYS, TICKET_TYPES, Tickets, TicketPanelView, TicketRatingView, _build_html_transcript, _canned_reply_key, _is_ticket, _parse_inactivity_minutes, _staff_role_ids
from datashop.cogs.community import LEGIT_INITIAL_COUNT, LegitVoteView, _legit_display_count, _legit_yes_count, _normalize_legit_votes
from datashop.cogs.store import ShopPanelView, _safe_int, _safe_money



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


class LegitVotingTests(unittest.TestCase):
    def test_legit_vote_normalization_keeps_one_valid_vote_per_user(self) -> None:
        votes = _normalize_legit_votes({
            "123": "yes",
            "456": "no",
            "789": "maybe",
            "not-an-id": "yes",
            987: "yes",
        })
        self.assertEqual(votes, {"123": "yes", "456": "no", "987": "yes"})
        self.assertEqual(_legit_yes_count(votes), 2)

    def test_legit_display_starts_at_nineteen_and_tracks_new_yes_votes(self) -> None:
        self.assertEqual(LEGIT_INITIAL_COUNT, 19)
        self.assertEqual(_legit_display_count({}), 19)
        self.assertEqual(_legit_display_count({"123": "yes"}), 20)
        self.assertEqual(_legit_display_count({"123": "no"}), 19)
        self.assertEqual(_legit_display_count({"123": "yes", "456": "yes", "789": "no"}), 21)

    def test_legit_panel_view_is_persistent_with_yes_no_buttons(self) -> None:
        view = LegitVoteView(SimpleNamespace(), guild_id=123456)
        self.assertIsNone(view.timeout)
        self.assertEqual(len(view.children), 2)
        self.assertEqual(
            [child.custom_id for child in view.children],
            ["datashop:legit:123456:yes", "datashop:legit:123456:no"],
        )
        self.assertEqual(
            [child.style for child in view.children],
            [discord.ButtonStyle.success, discord.ButtonStyle.danger],
        )
        view.stop()


class CannedReplyKeyTests(unittest.TestCase):
    def test_canned_reply_keys_are_normalized_and_reject_injection(self) -> None:
        self.assertEqual(_canned_reply_key("  REFUND-STATUS "), "refund-status")
        self.assertEqual(_canned_reply_key("billing_2"), "billing_2")
        self.assertIsNone(_canned_reply_key(""))
        self.assertIsNone(_canned_reply_key("two words"))
        self.assertIsNone(_canned_reply_key("name/../../secret"))
        self.assertIsNone(_canned_reply_key("x" * 33))
        self.assertIsNone(_canned_reply_key(None))


class TicketRuntimeRegressionTests(unittest.TestCase):
    def test_ticket_detection_uses_owner_metadata(self) -> None:
        self.assertTrue(_is_ticket(SimpleNamespace(topic="DATASHOP_OWNER=123;DATASHOP_CLOSED=0")))
        self.assertFalse(_is_ticket(SimpleNamespace(topic="ordinary channel")))
        self.assertFalse(_is_ticket(SimpleNamespace(topic="DATASHOP_OWNER=invalid")))

    def test_registered_rating_keys_are_a_set(self) -> None:
        cog = Tickets(SimpleNamespace())
        self.assertIsInstance(cog._registered_rating_keys, set)
        cog._registered_rating_keys.add((123, 456))
        self.assertIn((123, 456), cog._registered_rating_keys)


class TicketInactivityValidationTests(unittest.TestCase):
    def test_inactivity_window_has_safe_bounds(self) -> None:
        self.assertEqual(_parse_inactivity_minutes(5), 5)
        self.assertEqual(_parse_inactivity_minutes("1440"), 1440)
        self.assertEqual(_parse_inactivity_minutes(10080), 10080)
        self.assertIsNone(_parse_inactivity_minutes(4))
        self.assertIsNone(_parse_inactivity_minutes(10081))
        self.assertIsNone(_parse_inactivity_minutes("invalid"))
        self.assertIsNone(_parse_inactivity_minutes(None))


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
        self.assertEqual(purchase_roles, {100, 200, 400, DEFAULT_STAFF_ROLE_ID})
        self.assertNotIn(300, purchase_roles)

    def test_invalid_and_missing_role_ids_are_ignored(self) -> None:
        settings = {
            "staff_role_id": "not-an-id",
            "ticket_types": {"refund": {"staff_role_id": None}},
        }
        self.assertEqual(_staff_role_ids(settings, None, "refund"), {DEFAULT_STAFF_ROLE_ID})

class TicketPanelBrandingTests(unittest.TestCase):
    def test_public_ticket_menu_has_five_requested_categories_and_emojis(self) -> None:
        view = TicketPanelView(SimpleNamespace())
        selector = next(child for child in view.children if isinstance(child, discord.ui.Select))
        self.assertEqual(
            [option.value for option in selector.options],
            list(PUBLIC_TICKET_TYPE_KEYS),
        )
        self.assertEqual(
            [option.emoji.id for option in selector.options],
            [
                1561518116826255441,
                1550144965404004502,
                1561921833203142757,
                1550146329915949077,
                1561925621578469450,
            ],
        )
        self.assertEqual(TICKET_TYPES["purchase"][0], "Comprar un artículo")
        self.assertEqual(TICKET_TYPES["support"][0], "Hacer una consulta")
        self.assertEqual(TICKET_TYPES["report"][0], "Reportar un problema")
        self.assertEqual(TICKET_TYPES["reward"][0], "Recibir una recompensa")
        self.assertEqual(TICKET_TYPES["workers"][0], "Postular a Workers")
        self.assertIn(DEFAULT_STAFF_ROLE_ID, _staff_role_ids({}, None))
        view.stop()


class InteractivePanelTests(unittest.TestCase):
    def test_shop_panel_is_persistent_and_has_distinct_component_ids(self) -> None:
        fake_cog = SimpleNamespace(bot=SimpleNamespace(settings=SimpleNamespace(currency="USD")))
        view = ShopPanelView(
            fake_cog,
            guild_id=1234,
            products={"PRD1": {"name": "Nitro", "price": 9.99, "stock": 4}},
        )
        self.assertIsNone(view.timeout)
        custom_ids = [item.custom_id for item in view.children]
        self.assertEqual(len(custom_ids), len(set(custom_ids)))
        self.assertTrue(all(custom_id for custom_id in custom_ids))
        self.assertEqual(len(view.children), 4)
        view.stop()

    def test_ticket_panel_is_persistent_and_has_help_shortcuts(self) -> None:
        view = TicketPanelView(SimpleNamespace())
        self.assertIsNone(view.timeout)
        custom_ids = [item.custom_id for item in view.children]
        self.assertEqual(len(custom_ids), len(set(custom_ids)))
        self.assertIn("datashop:tickets:quick-help", custom_ids)
        self.assertIn("datashop:tickets:my-tickets", custom_ids)
        view.stop()


class TicketTranscriptTests(unittest.IsolatedAsyncioTestCase):
    async def test_html_transcript_escapes_untrusted_message_and_guild_names(self) -> None:
        author = SimpleNamespace(id=123456, name="ticket-user")
        message = SimpleNamespace(
            clean_content='<script>alert("x")</script><img src=x onerror=alert(1)>',
            author=author,
            created_at=datetime(2026, 10, 27, tzinfo=timezone.utc),
            attachments=[],
            embeds=[],
        )

        class FakeChannel:
            id = 987654321
            name = "ticket-test"
            guild = SimpleNamespace(name='<Guild "unsafe">')

            def history(self, *, limit: int, oldest_first: bool):
                async def generate():
                    yield message
                return generate()

        payload, message_count = await _build_html_transcript(FakeChannel(), limit=10)
        document = payload.decode("utf-8")
        self.assertEqual(message_count, 1)
        self.assertNotIn('<script>alert("x")</script>', document)
        self.assertNotIn('<img src=x onerror=alert(1)>', document)
        self.assertIn("&lt;script&gt;", document)
        self.assertIn("&lt;Guild &quot;unsafe&quot;&gt;", document)

    def test_ticket_rating_view_is_persistent_and_uses_unique_custom_ids(self) -> None:
        view = TicketRatingView(guild_id=1, channel_id=2, owner_id=3)
        self.assertIsNone(view.timeout)
        custom_ids = [item.custom_id for item in view.children]
        self.assertEqual(len(custom_ids), 5)
        self.assertEqual(len(set(custom_ids)), 5)
        self.assertTrue(all("datashop:ticket-rating:2:" in item for item in custom_ids))
        view.stop()


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
                "ban", "unban", "kick", "timeout", "untimeout", "warn", "warnings", "clear", "purge-user",
                "slowmode", "lock", "unlock", "nick", "role",
                "ticket", "shop", "vouch", "suggestion", "poll", "legit", "botconfig",
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
                "timer", "stoptimer", "client", "remember", "control",
            }
            self.assertTrue(
                expected_ticket_commands.issubset(ticket_names),
                f"Faltan subcomandos ticket: {sorted(expected_ticket_commands - ticket_names)}",
            )
            control_group = next(command for command in ticket_group.commands if command.name == "control")
            self.assertTrue(
                {"lock", "unlock", "pin", "autoclose", "autoclose-off", "canned-list", "canned-add", "canned-remove", "canned-use"}.issubset(
                    {command.name for command in control_group.commands}
                )
            )
            note_group = next(command for command in ticket_group.commands if command.name == "note")
            self.assertTrue({"add", "list"}.issubset({command.name for command in note_group.commands}))

            shop_group = commands_by_name["shop"]
            shop_names = {command.name for command in shop_group.commands}
            expected_shop_commands = {
                "list", "add", "edit", "stock", "remove", "image", "payment", "order-expiry",
                "panel", "browse", "cart-add", "cart-remove", "cart-view", "cart-clear", "checkout",
                "order", "my-orders", "orders", "order-status", "cancel", "stats", "low-stock",
                "review", "reviews",
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
            self.assertTrue({"panel", "logs", "automod", "blockword-add", "blockword-remove"}.issubset(config_names))
        finally:
            await bot.close()


if __name__ == "__main__":
    unittest.main()
