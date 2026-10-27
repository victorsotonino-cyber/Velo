from __future__ import annotations

import logging

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
            f"Bienvenida: <#{welcome_id}>" if welcome_id else "Bienvenida: sin configurar",
            f"Registros: <#{logs_id}>" if logs_id else "Registros: sin configurar",
            f"Autorol: <@&{autorole_id}>" if autorole_id else "Autorol: desactivado",
            f"AutoMod: {'activo' if settings.get('automod_enabled', False) else 'desactivado'}",
            f"Categoría de tickets: <#{settings.get('ticket_category_id')}>" if settings.get("ticket_category_id") else "Categoría de tickets: se creará al abrir el primer ticket",
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

    @botconfig.command(name="automod", description="Activa o desactiva la protección básica contra invitaciones.")
    async def set_automod(self, ctx: commands.Context, enabled: bool) -> None:
        if not _is_admin(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar la configuración.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["automod_enabled"] = enabled
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"AutoMod {'activado' if enabled else 'desactivado'}.")

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
                await channel.send(
                    embed=embed,
                    allowed_mentions=discord.AllowedMentions(users=[member]),
                )
            except discord.HTTPException:
                log.exception("No se pudo enviar la bienvenida en %s", member.guild.id)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot:
            return
        settings = _get_settings(message.guild.id)
        if not settings.get("automod_enabled", False):
            return
        if not message.author.guild_permissions.manage_messages and "discord.gg/" in message.content.lower():
            try:
                await message.delete()
                await message.channel.send(
                    f"{message.author.mention}, las invitaciones de Discord están bloqueadas por AutoMod.",
                    delete_after=6,
                    allowed_mentions=discord.AllowedMentions(users=[message.author]),
                )
            except discord.HTTPException:
                log.exception("AutoMod no pudo eliminar una invitación en el servidor %s", message.guild.id)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Configuration(bot))
