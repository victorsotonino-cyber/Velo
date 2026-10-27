from __future__ import annotations

import logging
import time
from collections import defaultdict, deque

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data

log = logging.getLogger("datashop.configuration")


def _get_settings(guild_id: int) -> dict:
    value = get_guild_data("settings.json", guild_id, {})
    return value if isinstance(value, dict) else {}


def _is_admin(ctx: commands.Context) -> bool:
    return isinstance(ctx.author, discord.Member) and (
        ctx.author.guild_permissions.manage_guild or ctx.author.guild_permissions.administrator
    )


class Configuration(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._message_times: dict[tuple[int, int], deque[float]] = defaultdict(deque)

    async def _log_event(
        self,
        guild: discord.Guild,
        title: str,
        description: str,
        color: discord.Color | None = None,
    ) -> None:
        settings = _get_settings(guild.id)
        channel_id = settings.get("logs_channel_id") or self.bot.settings.logs_channel_id
        try:
            parsed_id = int(channel_id) if channel_id else None
        except (TypeError, ValueError):
            parsed_id = None
        channel = guild.get_channel(parsed_id) if parsed_id else None
        if not isinstance(channel, discord.TextChannel):
            return
        embed = discord.Embed(
            title=title[:250],
            description=description[:3800],
            color=color or discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        try:
            await channel.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException:
            log.exception("No se pudo publicar un registro en el servidor %s", guild.id)

    @commands.hybrid_group(name="botconfig", description="Configura DATASHOP para este servidor.", invoke_without_command=True)
    @commands.guild_only()
    async def botconfig(self, ctx: commands.Context) -> None:
        await self.show_settings(ctx)

    @botconfig.command(name="show", description="Muestra la configuración del bot.")
    async def show_settings(self, ctx: commands.Context) -> None:
        settings = _get_settings(ctx.guild.id)
        welcome_id = settings.get("welcome_channel_id") or self.bot.settings.welcome_channel_id
        logs_id = settings.get("logs_channel_id") or self.bot.settings.logs_channel_id
        autorole_id = settings.get("autorole_id") or self.bot.settings.member_role_id
        lines = [
            f"Bienvenida: <#{welcome_id}>" if welcome_id and not settings.get("welcome_disabled") else "Bienvenida: desactivada o sin configurar",
            f"Registros: <#{logs_id}>" if logs_id else "Registros: sin configurar",
            f"Autorol: <@&{autorole_id}>" if autorole_id and not settings.get("autorole_disabled") else "Autorol: desactivado",
            f"AutoMod: {'activo (invitaciones, flood y palabras configuradas)' if settings.get('automod_enabled', False) else 'desactivado'}",
            f"Categoría de tickets: <#{settings.get('ticket_category_id')}>" if settings.get("ticket_category_id") else "Categoría de tickets: se creará al abrir el primer ticket",
            f"Palabras filtradas: {len(settings.get('automod_blocked_words', []))}",
        ]
        embed = discord.Embed(
            title="DATASHOP • Configuración",
            description="\n".join(lines),
            color=discord.Color.from_str("#8B5CF6"),
        )
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @botconfig.command(name="welcome", description="Configura el canal de bienvenida.")
    async def set_welcome(self, ctx: commands.Context, channel: discord.TextChannel) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["welcome_channel_id"] = channel.id
        settings["welcome_disabled"] = False
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Bienvenidas configuradas en {channel.mention}.")

    @botconfig.command(name="welcome-off", description="Desactiva los mensajes de bienvenida.")
    async def disable_welcome(self, ctx: commands.Context) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["welcome_disabled"] = True
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, "Bienvenidas desactivadas.")

    @botconfig.command(name="logs", description="Configura el canal de registros.")
    async def set_logs(self, ctx: commands.Context, channel: discord.TextChannel) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["logs_channel_id"] = channel.id
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Registros configurados en {channel.mention}.")

    @botconfig.command(name="autorole", description="Configura el rol básico para nuevos miembros.")
    async def set_autorole(self, ctx: commands.Context, role: discord.Role) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        dangerous = (
            role.permissions.administrator
            or role.permissions.manage_guild
            or role.permissions.manage_roles
            or role.permissions.manage_channels
            or role.permissions.manage_messages
            or role.permissions.kick_members
            or role.permissions.ban_members
            or role.permissions.moderate_members
            or role.permissions.manage_webhooks
        )
        me = ctx.guild.me
        if role.is_default() or role.managed or dangerous:
            await send_context(ctx, "El autorol debe ser básico, no administrado y sin permisos de moderación o administración.")
            return
        if me is None or not me.guild_permissions.manage_roles or role >= me.top_role:
            await send_context(ctx, "Necesito Gestionar roles y mi rol más alto debe estar por encima del rol elegido.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["autorole_id"] = role.id
        settings["autorole_disabled"] = False
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Autorol configurado: {role.mention}.")

    @botconfig.command(name="autorole-off", description="Desactiva el rol automático.")
    async def disable_autorole(self, ctx: commands.Context) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["autorole_disabled"] = True
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, "Autorol desactivado.")

    @botconfig.command(name="automod", description="Activa o desactiva el filtro de invitaciones, flood y palabras configuradas.")
    async def set_automod(self, ctx: commands.Context, enabled: bool) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["automod_enabled"] = enabled
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(
            ctx,
            f"AutoMod {'activado' if enabled else 'desactivado'}. " +
            ("Filtra invitaciones, flood repetitivo y palabras configuradas." if enabled else "No se moderarán mensajes automáticamente."),
        )

    @botconfig.command(name="blockword-add", description="Añade una palabra o frase al filtro de AutoMod.")
    async def add_blocked_word(self, ctx: commands.Context, *, word: str) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar el filtro.")
            return
        word = word.strip().casefold()
        if not word or len(word) > 80:
            await send_context(ctx, "La palabra o frase debe tener entre 1 y 80 caracteres.")
            return
        settings = _get_settings(ctx.guild.id)
        words = settings.get("automod_blocked_words", [])
        if not isinstance(words, list):
            words = []
        if word in [str(existing).casefold() for existing in words]:
            await send_context(ctx, "Esa palabra o frase ya está en el filtro.")
            return
        words.append(word)
        settings["automod_blocked_words"] = words[:100]
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Se añadió al filtro: **{word}**.")

    @botconfig.command(name="blockword-remove", description="Retira una palabra o frase del filtro de AutoMod.")
    async def remove_blocked_word(self, ctx: commands.Context, *, word: str) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar el filtro.")
            return
        settings = _get_settings(ctx.guild.id)
        words = settings.get("automod_blocked_words", [])
        if not isinstance(words, list):
            words = []
        target = word.strip().casefold()
        kept = [str(existing) for existing in words if str(existing).casefold() != target]
        if len(kept) == len(words):
            await send_context(ctx, "Esa palabra o frase no está en el filtro.")
            return
        settings["automod_blocked_words"] = kept
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Se retiró del filtro: **{word.strip()}**.")

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        settings = _get_settings(member.guild.id)
        autorole_id = None if settings.get("autorole_disabled") else (
            settings.get("autorole_id") or self.bot.settings.member_role_id
        )
        if autorole_id:
            role = member.guild.get_role(int(autorole_id))
            me = member.guild.me
            if role and me and me.guild_permissions.manage_roles and role < me.top_role:
                risky = (
                    role.permissions.administrator
                    or role.permissions.manage_guild
                    or role.permissions.manage_roles
                    or role.permissions.manage_channels
                    or role.permissions.manage_messages
                    or role.permissions.kick_members
                    or role.permissions.ban_members
                    or role.permissions.moderate_members
                )
                if not role.managed and not risky:
                    try:
                        await member.add_roles(role, reason="DATASHOP autorol")
                    except discord.HTTPException:
                        log.exception("No se pudo asignar el autorol en %s", member.guild.id)

        await self._log_event(
            member.guild,
            "Miembro entró",
            f"{member.mention} ({member}, ID {member.id})",
            discord.Color.green(),
        )
        if settings.get("welcome_disabled"):
            return
        channel_id = settings.get("welcome_channel_id") or self.bot.settings.welcome_channel_id
        channel = member.guild.get_channel(int(channel_id)) if channel_id else None
        if isinstance(channel, discord.TextChannel):
            embed = discord.Embed(
                title="Welcome to DATASHOP",
                description=f"¡Bienvenido/a {member.mention} a **{member.guild.name}**!",
                color=discord.Color.from_str("#8B5CF6"),
            )
            embed.set_thumbnail(url=member.display_avatar.url)
            embed.set_footer(text=f"Miembro #{member.guild.member_count or 0}")
            try:
                await channel.send(embed=embed, allowed_mentions=discord.AllowedMentions(users=[member]))
            except discord.HTTPException:
                log.exception("No se pudo enviar la bienvenida en %s", member.guild.id)

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member) -> None:
        await self._log_event(
            member.guild,
            "Miembro salió",
            f"{member} (ID {member.id})",
            discord.Color.orange(),
        )

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        added = [role.mention for role in after.roles if role not in before.roles and not role.is_default()]
        removed = [role.mention for role in before.roles if role not in after.roles and not role.is_default()]
        if added or removed:
            lines = [f"Miembro: {after.mention} ({after.id})"]
            if added:
                lines.append("Roles añadidos: " + ", ".join(added))
            if removed:
                lines.append("Roles retirados: " + ", ".join(removed))
            await self._log_event(after.guild, "Cambios de roles", "\n".join(lines))
        if before.nick != after.nick:
            await self._log_event(
                after.guild,
                "Cambio de apodo",
                f"Miembro: {after.mention} ({after.id})\nAntes: {before.nick or before.name}\nDespués: {after.nick or after.name}",
            )

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot:
            return
        content = message.clean_content.strip() or "[sin texto]"
        if message.attachments:
            content += "\nAdjuntos: " + ", ".join(attachment.filename for attachment in message.attachments[:5])
        await self._log_event(
            message.guild,
            "Mensaje eliminado",
            f"Autor: {message.author.mention} ({message.author.id})\nCanal: {message.channel.mention}\nContenido: {content[:1800]}",
            discord.Color.orange(),
        )

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message) -> None:
        if after.guild is None or after.author.bot or before.content == after.content:
            return
        await self._log_event(
            after.guild,
            "Mensaje editado",
            f"Autor: {after.author.mention} ({after.author.id})\nCanal: {after.channel.mention}\n"
            f"Antes: {(before.clean_content or '[vacío]')[:1200]}\nDespués: {(after.clean_content or '[vacío]')[:1200]}",
        )

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot or not isinstance(message.author, discord.Member):
            return
        settings = _get_settings(message.guild.id)
        if not settings.get("automod_enabled", False):
            return
        if message.author.guild_permissions.manage_messages or message.author.guild_permissions.administrator:
            return

        content = message.content.casefold()
        blocked_words = settings.get("automod_blocked_words", [])
        if not isinstance(blocked_words, list):
            blocked_words = []
        blocked = next(
            (str(word) for word in blocked_words if str(word).strip() and str(word).casefold() in content),
            None,
        )
        invite = "discord.gg/" in content or "discord.com/invite/" in content

        key = (message.guild.id, message.author.id)
        history = self._message_times[key]
        now = time.monotonic()
        while history and now - history[0] > 8.0:
            history.popleft()
        history.append(now)
        flood = len(history) >= 7

        if not (blocked or invite or flood):
            return
        if blocked:
            reason = f"palabra o frase filtrada: {blocked}"
        elif invite:
            reason = "invitación de Discord"
        else:
            reason = "posible flood (7 mensajes en 8 segundos)"
            history.clear()
        try:
            await message.delete()
            await message.channel.send(
                f"{message.author.mention}, el mensaje se eliminó por AutoMod ({reason}).",
                delete_after=6,
                allowed_mentions=discord.AllowedMentions(users=[message.author]),
            )
            await self._log_event(
                message.guild,
                "AutoMod: mensaje eliminado",
                f"Usuario: {message.author.mention} ({message.author.id})\nCanal: {message.channel.mention}\nMotivo: {reason}",
                discord.Color.red(),
            )
        except discord.HTTPException:
            log.exception("AutoMod no pudo moderar el mensaje en el servidor %s", message.guild.id)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Configuration(bot))
