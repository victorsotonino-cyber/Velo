from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import discord
from discord.ext import commands, tasks

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


def _as_utc(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _current_level(xp: int) -> int:
    return int((max(0, xp) / 100) ** 0.5)


class Engagement(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def cog_load(self) -> None:
        if not self.maintenance.is_running():
            self.maintenance.start()

    async def cog_unload(self) -> None:
        self.maintenance.cancel()

    @tasks.loop(seconds=15.0)
    async def maintenance(self) -> None:
        for guild in list(self.bot.guilds):
            await self._process_reminders(guild)
            await self._process_giveaways(guild)

    @maintenance.before_loop
    async def before_maintenance(self) -> None:
        await self.bot.wait_until_ready()

    async def _process_reminders(self, guild: discord.Guild) -> None:
        reminders = get_guild_data("reminders.json", guild.id, [])
        if not isinstance(reminders, list):
            return
        now = discord.utils.utcnow()
        changed = False
        for reminder in reminders:
            if not isinstance(reminder, dict) or reminder.get("status") != "pending":
                continue
            due = _as_utc(str(reminder.get("due_at", "")))
            if due is None:
                reminder["status"] = "failed"
                reminder["error"] = "invalid_due_at"
                changed = True
                continue
            if due > now:
                continue
            try:
                channel_id = int(reminder.get("channel_id", 0))
                user_id = int(reminder.get("user_id", 0))
            except (TypeError, ValueError):
                reminder["status"] = "failed"
                reminder["error"] = "invalid_target"
                changed = True
                continue
            channel = guild.get_channel(channel_id)
            try:
                if isinstance(channel, (discord.TextChannel, discord.Thread)):
                    await channel.send(
                        f"⏰ <@{user_id}> recordatorio: {str(reminder.get('message', ''))[:500]}",
                        allowed_mentions=discord.AllowedMentions(users=True),
                    )
                else:
                    reminder["status"] = "failed"
                    reminder["error"] = "channel_unavailable"
                    changed = True
                    continue
                reminder["status"] = "sent"
                reminder["sent_at"] = now.isoformat()
            except discord.HTTPException:
                reminder["status"] = "failed"
                reminder["error"] = "delivery_failed"
            changed = True
        if changed:
            set_guild_data("reminders.json", guild.id, reminders)

    async def _process_giveaways(self, guild: discord.Guild) -> None:
        giveaways = get_guild_data("giveaways.json", guild.id, [])
        if not isinstance(giveaways, list):
            return
        now = discord.utils.utcnow()
        due_ids: list[int] = []
        for item in giveaways:
            if not isinstance(item, dict) or item.get("status") != "active":
                continue
            end_at = _as_utc(str(item.get("end_at", "")))
            try:
                message_id = int(item.get("message_id", 0))
            except (TypeError, ValueError):
                continue
            if end_at is not None and end_at <= now:
                due_ids.append(message_id)
        for message_id in due_ids:
            await self._finish_giveaway(guild, message_id)

    def _find_giveaway(self, guild_id: int, message_id: int) -> tuple[list[dict[str, Any]], dict[str, Any]] | None:
        giveaways = get_guild_data("giveaways.json", guild_id, [])
        if not isinstance(giveaways, list):
            return None
        for item in giveaways:
            if not isinstance(item, dict):
                continue
            try:
                existing_id = int(item.get("message_id", 0))
            except (TypeError, ValueError):
                continue
            if existing_id == message_id:
                return giveaways, item
        return None

    async def _finish_giveaway(self, guild: discord.Guild, message_id: int) -> None:
        found = self._find_giveaway(guild.id, message_id)
        if found is None:
            return
        giveaways, item = found
        if item.get("status") != "active":
            return
        try:
            winner_count = max(1, min(10, int(item.get("winner_count", 1))))
            entrants = [int(value) for value in item.get("entrants", [])]
        except (TypeError, ValueError):
            winner_count, entrants = 1, []
        eligible = [user_id for user_id in dict.fromkeys(entrants) if guild.get_member(user_id) is not None]
        winners = random.SystemRandom().sample(eligible, min(winner_count, len(eligible))) if eligible else []
        item["status"] = "ended"
        item["winner_ids"] = winners
        item["ended_at"] = discord.utils.utcnow().isoformat()
        set_guild_data("giveaways.json", guild.id, giveaways)

        try:
            channel_id = int(item.get("channel_id", 0))
        except (TypeError, ValueError):
            return
        channel = guild.get_channel(channel_id)
        if not isinstance(channel, (discord.TextChannel, discord.Thread)):
            return
        try:
            message = await channel.fetch_message(message_id)
            embed = discord.Embed(
                title="🎉 Sorteo finalizado",
                description=(
                    f"Premio: **{str(item.get('prize', 'Premio'))[:200]}**\n"
                    + (f"Ganador(es): {', '.join(f'<@{user_id}>' for user_id in winners)}" if winners else "No hubo participantes elegibles.")
                ),
                color=discord.Color.from_str("#8B5CF6"),
            )
            embed.set_footer(text="Participación gratuita · No era necesario comprar nada.")
            await message.edit(embed=embed)
            if winners:
                await channel.send(
                    f"🎊 Ganador(es) del sorteo **{str(item.get('prize', 'Premio'))[:150]}**: "
                    + ", ".join(f"<@{user_id}>" for user_id in winners),
                    allowed_mentions=discord.AllowedMentions(users=True),
                )
            else:
                await channel.send("El sorteo terminó sin participantes elegibles.")
        except discord.HTTPException:
            return

    @commands.hybrid_command(name="afk", description="Activa tu estado AFK con un motivo opcional.")
    @commands.guild_only()
    async def afk(self, ctx: commands.Context, *, reason: str = "AFK") -> None:
        data = get_guild_data("afk.json", ctx.guild.id, {})
        if not isinstance(data, dict):
            data = {}
        data[str(ctx.author.id)] = {
            "reason": reason.strip()[:200] or "AFK",
            "since": discord.utils.utcnow().isoformat(),
        }
        set_guild_data("afk.json", ctx.guild.id, data)
        await send_context(ctx, f"💤 Te marqué como AFK: {reason.strip()[:200] or 'AFK'}.")

    @commands.hybrid_command(name="remind", description="Programa un recordatorio en el canal actual.")
    @commands.guild_only()
    async def remind(self, ctx: commands.Context, minutes: int, *, message: str) -> None:
        if not 1 <= minutes <= 10080:
            await send_context(ctx, "El recordatorio debe ser de 1 minuto a 7 días.")
            return
        message = message.strip()
        if not message or len(message) > 500:
            await send_context(ctx, "El texto debe tener entre 1 y 500 caracteres.")
            return
        reminders = get_guild_data("reminders.json", ctx.guild.id, [])
        if not isinstance(reminders, list):
            reminders = []
        reminder_id = secrets.token_hex(3).upper()
        due_at = discord.utils.utcnow() + timedelta(minutes=minutes)
        reminders.append({
            "id": reminder_id,
            "user_id": ctx.author.id,
            "channel_id": ctx.channel.id,
            "message": message,
            "created_at": discord.utils.utcnow().isoformat(),
            "due_at": due_at.isoformat(),
            "status": "pending",
        })
        set_guild_data("reminders.json", ctx.guild.id, reminders)
        await send_context(ctx, f"⏰ Recordatorio {reminder_id} programado para <t:{int(due_at.timestamp())}:R>.")

    @commands.hybrid_command(name="reminders", description="Lista tus recordatorios próximos.")
    @commands.guild_only()
    async def reminders(self, ctx: commands.Context) -> None:
        reminders = get_guild_data("reminders.json", ctx.guild.id, [])
        if not isinstance(reminders, list):
            reminders = []
        own = [
            row for row in reminders
            if isinstance(row, dict) and row.get("user_id") == ctx.author.id and row.get("status") == "pending"
        ]
        lines = [
            f"**{row.get('id', '?')}** · <#{row.get('channel_id', 0)}> · "
            f"<t:{int((_as_utc(str(row.get('due_at', ''))) or discord.utils.utcnow()).timestamp())}:R>\n"
            f"{str(row.get('message', ''))[:140]}"
            for row in own[:10]
        ]
        embed = discord.Embed(
            title="⏰ Tus recordatorios",
            description="\n\n".join(lines) if lines else "No tienes recordatorios pendientes.",
            color=discord.Color.from_str("#8B5CF6"),
        )
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="reminder-cancel", description="Cancela uno de tus recordatorios pendientes.")
    @commands.guild_only()
    async def reminder_cancel(self, ctx: commands.Context, reminder_id: str) -> None:
        reminders = get_guild_data("reminders.json", ctx.guild.id, [])
        if not isinstance(reminders, list):
            reminders = []
        item = next(
            (row for row in reminders if isinstance(row, dict) and str(row.get("id", "")).upper() == reminder_id.strip().upper()),
            None,
        )
        if item is None or item.get("user_id") != ctx.author.id:
            await send_context(ctx, "No encontré ese recordatorio tuyo.")
            return
        if item.get("status") != "pending":
            await send_context(ctx, "Ese recordatorio ya fue enviado o cancelado.")
            return
        item["status"] = "cancelled"
        set_guild_data("reminders.json", ctx.guild.id, reminders)
        await send_context(ctx, f"✅ Recordatorio {item.get('id')} cancelado.")

    @commands.hybrid_command(name="rank", description="Muestra la experiencia y el nivel de un miembro.")
    @commands.guild_only()
    async def rank(self, ctx: commands.Context, member: discord.Member | None = None) -> None:
        target = member or ctx.author
        levels = get_guild_data("levels.json", ctx.guild.id, {})
        row = levels.get(str(target.id), {}) if isinstance(levels, dict) else {}
        xp = max(0, int(row.get("xp", 0))) if isinstance(row, dict) else 0
        level = _current_level(xp)
        next_threshold = (level + 1) ** 2 * 100
        previous_threshold = level ** 2 * 100
        needed = max(0, next_threshold - xp)
        embed = discord.Embed(
            title=f"🏆 Nivel · {target.display_name}",
            description=f"**Nivel:** {level}\n**XP total:** {xp}\n**XP para el siguiente nivel:** {needed}",
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_thumbnail(url=target.display_avatar.url)
        embed.add_field(name="Progreso", value=f"{max(0, xp - previous_threshold)}/{max(1, next_threshold - previous_threshold)} XP")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="leaderboard", description="Muestra el top 10 de niveles del servidor.")
    @commands.guild_only()
    async def leaderboard(self, ctx: commands.Context) -> None:
        levels = get_guild_data("levels.json", ctx.guild.id, {})
        if not isinstance(levels, dict):
            levels = {}
        rows = []
        for user_id, data in levels.items():
            if not isinstance(data, dict):
                continue
            try:
                xp = max(0, int(data.get("xp", 0)))
                uid = int(user_id)
            except (TypeError, ValueError):
                continue
            rows.append((uid, xp))
        rows.sort(key=lambda item: item[1], reverse=True)
        lines = []
        for place, (user_id, xp) in enumerate(rows[:10], start=1):
            lines.append(f"**{place}.** <@{user_id}> — nivel {_current_level(xp)} · {xp} XP")
        embed = discord.Embed(
            title="🏆 Ranking de niveles",
            description="\n".join(lines) if lines else "Todavía no hay experiencia registrada.",
            color=discord.Color.from_str("#8B5CF6"),
        )
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_group(name="giveaway", description="Administra sorteos gratuitos.", invoke_without_command=True)
    @commands.guild_only()
    async def giveaway(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa giveaway start, giveaway end o giveaway reroll.")

    @giveaway.command(name="start", description="Crea un sorteo gratuito en el canal actual.")
    async def giveaway_start(
        self,
        ctx: commands.Context,
        duration_minutes: int,
        winners: int,
        *,
        prize: str,
    ) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para iniciar sorteos.")
            return
        if not 1 <= duration_minutes <= 10080:
            await send_context(ctx, "La duración debe ser de 1 minuto a 7 días.")
            return
        if not 1 <= winners <= 10:
            await send_context(ctx, "El número de ganadores debe estar entre 1 y 10.")
            return
        prize = prize.strip()
        if not prize or len(prize) > 200:
            await send_context(ctx, "El premio debe tener entre 1 y 200 caracteres.")
            return
        end_at = discord.utils.utcnow() + timedelta(minutes=duration_minutes)
        embed = discord.Embed(
            title="🎉 Sorteo gratuito",
            description=(
                f"**Premio:** {prize}\n**Ganadores:** {winners}\n"
                f"**Finaliza:** <t:{int(end_at.timestamp())}:R>\n\n"
                "Reacciona con 🎉 para participar.\n**No hace falta comprar nada para participar.**"
            ),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_footer(text=f"Organizado por {ctx.author.display_name}")
        message = await ctx.send(embed=embed)
        giveaways = get_guild_data("giveaways.json", ctx.guild.id, [])
        if not isinstance(giveaways, list):
            giveaways = []
        giveaways.append({
            "message_id": message.id,
            "channel_id": ctx.channel.id,
            "prize": prize,
            "winner_count": winners,
            "created_by": ctx.author.id,
            "created_at": discord.utils.utcnow().isoformat(),
            "end_at": end_at.isoformat(),
            "status": "active",
            "entrants": [],
            "winner_ids": [],
        })
        set_guild_data("giveaways.json", ctx.guild.id, giveaways)
        try:
            await message.add_reaction("🎉")
        except discord.HTTPException:
            giveaways[-1]["status"] = "cancelled"
            set_guild_data("giveaways.json", ctx.guild.id, giveaways)
            await send_context(ctx, "No pude añadir la reacción; el sorteo se ha cancelado.")
            return
        await send_context(ctx, f"✅ Sorteo creado. ID del mensaje: {message.id}. Participación gratuita.")

    @giveaway.command(name="end", description="Finaliza inmediatamente un sorteo activo.")
    async def giveaway_end(self, ctx: commands.Context, message_id: str) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para finalizar sorteos.")
            return
        try:
            parsed_id = int(message_id)
        except ValueError:
            await send_context(ctx, "Indica el ID numérico del mensaje del sorteo.")
            return
        found = self._find_giveaway(ctx.guild.id, parsed_id)
        if found is None or found[1].get("status") != "active":
            await send_context(ctx, "No encontré un sorteo activo con ese ID.")
            return
        found[1]["end_at"] = discord.utils.utcnow().isoformat()
        set_guild_data("giveaways.json", ctx.guild.id, found[0])
        await self._finish_giveaway(ctx.guild, parsed_id)
        await send_context(ctx, "Sorteo finalizado.")

    @giveaway.command(name="reroll", description="Elige un nuevo ganador de un sorteo finalizado.")
    async def giveaway_reroll(self, ctx: commands.Context, message_id: str) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para volver a sortear.")
            return
        try:
            parsed_id = int(message_id)
        except ValueError:
            await send_context(ctx, "Indica el ID numérico del mensaje del sorteo.")
            return
        found = self._find_giveaway(ctx.guild.id, parsed_id)
        if found is None or found[1].get("status") != "ended":
            await send_context(ctx, "No encontré un sorteo finalizado con ese ID.")
            return
        item = found[1]
        entrants = item.get("entrants", [])
        if not isinstance(entrants, list):
            entrants = []
        eligible = []
        for value in entrants:
            try:
                uid = int(value)
            except (TypeError, ValueError):
                continue
            if ctx.guild.get_member(uid) is not None and uid not in eligible:
                eligible.append(uid)
        winners = random.SystemRandom().sample(eligible, min(int(item.get("winner_count", 1)), len(eligible))) if eligible else []
        item["winner_ids"] = winners
        item["rerolled_at"] = discord.utils.utcnow().isoformat()
        set_guild_data("giveaways.json", ctx.guild.id, found[0])
        await send_context(
            ctx,
            ("🎊 Nuevos ganadores: " + ", ".join(f"<@{uid}>" for uid in winners)) if winners else "No quedan participantes elegibles.",
        )

    @commands.hybrid_command(name="say", description="Publica un mensaje como DATASHOP.")
    @commands.guild_only()
    async def say(self, ctx: commands.Context, *, text: str) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_messages:
            await send_context(ctx, "Necesitas Gestionar mensajes para usar este comando.")
            return
        text = text.strip()
        if not text or len(text) > 2000:
            await send_context(ctx, "El mensaje debe tener entre 1 y 2000 caracteres.")
            return
        await ctx.send(text, allowed_mentions=discord.AllowedMentions.none())

    @commands.hybrid_command(name="announce", description="Publica un anuncio en formato embed.")
    @commands.guild_only()
    async def announce(self, ctx: commands.Context, title: str, *, description: str) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para publicar anuncios.")
            return
        if not title.strip() or len(title) > 256 or not description.strip() or len(description) > 3500:
            await send_context(ctx, "El título admite hasta 256 caracteres y la descripción hasta 3500.")
            return
        embed = discord.Embed(
            title=title.strip(),
            description=description.strip(),
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        embed.set_footer(text=f"Anuncio de {ctx.guild.name}")
        await ctx.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        if payload.guild_id is None or payload.emoji.name != "🎉" or self.bot.user is None or payload.user_id == self.bot.user.id:
            return
        guild = self.bot.get_guild(payload.guild_id)
        if guild is None:
            return
        giveaways = get_guild_data("giveaways.json", guild.id, [])
        if not isinstance(giveaways, list):
            return
        for item in giveaways:
            if not isinstance(item, dict) or item.get("status") != "active" or item.get("message_id") != payload.message_id:
                continue
            member = payload.member or guild.get_member(payload.user_id)
            if member is None or member.bot:
                return
            entrants = item.get("entrants", [])
            if not isinstance(entrants, list):
                entrants = []
            if payload.user_id not in entrants:
                entrants.append(payload.user_id)
                item["entrants"] = entrants
                set_guild_data("giveaways.json", guild.id, giveaways)
            return

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, payload: discord.RawReactionActionEvent) -> None:
        if payload.guild_id is None or payload.emoji.name != "🎉" or self.bot.user is None or payload.user_id == self.bot.user.id:
            return
        guild = self.bot.get_guild(payload.guild_id)
        if guild is None:
            return
        giveaways = get_guild_data("giveaways.json", guild.id, [])
        if not isinstance(giveaways, list):
            return
        for item in giveaways:
            if not isinstance(item, dict) or item.get("status") != "active" or item.get("message_id") != payload.message_id:
                continue
            entrants = item.get("entrants", [])
            if isinstance(entrants, list) and payload.user_id in entrants:
                item["entrants"] = [uid for uid in entrants if uid != payload.user_id]
                set_guild_data("giveaways.json", guild.id, giveaways)
            return

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot or not isinstance(message.author, discord.Member):
            return
        guild_id = message.guild.id

        afk = get_guild_data("afk.json", guild_id, {})
        if not isinstance(afk, dict):
            afk = {}
        own_key = str(message.author.id)
        if own_key in afk:
            afk.pop(own_key, None)
            set_guild_data("afk.json", guild_id, afk)
            try:
                await message.reply("👋 Te quité el estado AFK porque has vuelto.", mention_author=False)
            except discord.HTTPException:
                pass
        if message.mentions:
            notices = []
            for mentioned in message.mentions[:5]:
                status = afk.get(str(mentioned.id))
                if isinstance(status, dict):
                    notices.append(f"💤 {mentioned.display_name} está AFK: {str(status.get('reason', 'AFK'))[:140]}")
            if notices:
                try:
                    await message.reply("\n".join(notices)[:1800], mention_author=False)
                except discord.HTTPException:
                    pass

        prefix = self.bot.settings.prefix
        if message.content.startswith(prefix) or len(message.content.strip()) < 4:
            return
        levels = get_guild_data("levels.json", guild_id, {})
        if not isinstance(levels, dict):
            levels = {}
        row = levels.get(own_key, {})
        if not isinstance(row, dict):
            row = {}
        last = _as_utc(str(row.get("last_xp_at", ""))) if row.get("last_xp_at") else None
        now = discord.utils.utcnow()
        if last and (now - last).total_seconds() < 60:
            return
        try:
            old_xp = max(0, int(row.get("xp", 0) or 0))
        except (TypeError, ValueError):
            old_xp = 0
        old_level = _current_level(old_xp)
        new_xp = old_xp + random.randint(5, 20)
        new_level = _current_level(new_xp)
        row.update({"xp": new_xp, "last_xp_at": now.isoformat(), "updated_at": now.isoformat()})
        levels[own_key] = row
        set_guild_data("levels.json", guild_id, levels)
        if new_level > old_level:
            try:
                await message.channel.send(
                    f"🎉 {message.author.mention} subió al nivel **{new_level}**.",
                    allowed_mentions=discord.AllowedMentions(users=[message.author]),
                )
            except discord.HTTPException:
                pass


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Engagement(bot))
