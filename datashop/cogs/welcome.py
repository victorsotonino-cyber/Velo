from __future__ import annotations

import discord
from discord.ext import commands

from datashop.storage import get_guild_data, set_guild_data


def _settings(guild_id: int) -> dict:
    value = get_guild_data("settings.json", guild_id, {})
    return value if isinstance(value, dict) else {}


class Welcome(commands.Cog):
    """Configuración del sistema de bienvenida por servidor."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def _save(self, ctx: commands.Context, settings: dict) -> bool:
        try:
            set_guild_data("settings.json", ctx.guild.id, settings)
        except (RuntimeError, OSError, ValueError):
            await ctx.send("❌ No pude guardar la configuración. Comprueba el almacenamiento del bot.")
            return False
        return True

    @commands.group(name="welcome", aliases=["bienvenida"], invoke_without_command=True)
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def welcome(self, ctx: commands.Context) -> None:
        await ctx.send(
            "**👋 Configuración de bienvenida DATASHOP**\n"
            "!welcome setup #canal [mensaje] — configura el canal y, opcionalmente, el mensaje.\n"
            "!welcome message <texto> — cambia el mensaje.\n"
            "!welcome test — envía una prueba.\n"
            "!welcome on / !welcome off — activa o desactiva.\n"
            "!welcome status — muestra la configuración.\n"
            "Variables: {user}, {mention}, {server}, {count}."
        )

    @welcome.command(name="setup")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def setup(self, ctx: commands.Context, channel: discord.TextChannel, *, message: str | None = None) -> None:
        me = ctx.guild.me
        permissions = channel.permissions_for(me) if me else None
        if permissions is None or not permissions.send_messages or not permissions.embed_links:
            await ctx.send("❌ Necesito Enviar mensajes e Insertar enlaces en ese canal.")
            return
        settings = _settings(ctx.guild.id)
        settings["welcome_channel_id"] = channel.id
        settings["welcome_disabled"] = False
        if message:
            clean = message.strip()
            if not clean or len(clean) > 1500:
                await ctx.send("El mensaje debe tener entre 1 y 1500 caracteres.")
                return
            settings["welcome_message"] = clean
        if not await self._save(ctx, settings):
            return
        await ctx.send(
            f"✅ Bienvenida configurada en {channel.mention}. "
            "Usa !welcome test para comprobarla. Variables: {user}, {mention}, {server}, {count}."
        )

    @welcome.command(name="message")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def message(self, ctx: commands.Context, *, text: str) -> None:
        clean = text.strip()
        if not clean or len(clean) > 1500:
            await ctx.send("El mensaje debe tener entre 1 y 1500 caracteres.")
            return
        settings = _settings(ctx.guild.id)
        settings["welcome_message"] = clean
        if await self._save(ctx, settings):
            await ctx.send("✅ Mensaje de bienvenida actualizado.")

    @welcome.command(name="test")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def test(self, ctx: commands.Context) -> None:
        settings = _settings(ctx.guild.id)
        channel_id = settings.get("welcome_channel_id") or self.bot.settings.welcome_channel_id
        channel = ctx.guild.get_channel(int(channel_id)) if channel_id else None
        if not isinstance(channel, discord.TextChannel):
            await ctx.send("❌ No hay canal configurado. Usa !welcome setup #canal.")
            return
        template = str(settings.get("welcome_message") or "¡Bienvenido/a {mention} a **{server}**!")
        rendered = (
            template.replace("{user}", discord.utils.escape_markdown(str(ctx.author)))
            .replace("{mention}", ctx.author.mention)
            .replace("{server}", discord.utils.escape_markdown(ctx.guild.name))
            .replace("{count}", str(ctx.guild.member_count or 0))
        )
        color_raw = str(settings.get("welcome_color", "#8B5CF6"))
        try:
            color = discord.Color.from_str(color_raw)
        except (ValueError, TypeError):
            color = discord.Color.from_str("#8B5CF6")
        embed = discord.Embed(
            title=str(settings.get("welcome_title") or "👋 ¡Bienvenido/a!")[:256],
            description=rendered[:4000],
            color=color,
        )
        embed.set_thumbnail(url=ctx.author.display_avatar.url)
        embed.set_footer(text="Prueba del sistema de bienvenida · DATASHOP")
        try:
            await channel.send(embed=embed, allowed_mentions=discord.AllowedMentions(users=[ctx.author]))
        except discord.Forbidden:
            await ctx.send("❌ No tengo permisos para enviar la prueba en ese canal.")
            return
        except discord.HTTPException:
            await ctx.send("❌ Discord no pudo enviar el mensaje de prueba.")
            return
        await ctx.send(f"✅ Prueba enviada en {channel.mention}.")

    @welcome.command(name="on")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def enable(self, ctx: commands.Context) -> None:
        settings = _settings(ctx.guild.id)
        if not (settings.get("welcome_channel_id") or self.bot.settings.welcome_channel_id):
            await ctx.send("Configura primero el canal con !welcome setup #canal.")
            return
        settings["welcome_disabled"] = False
        if await self._save(ctx, settings):
            await ctx.send("✅ Sistema de bienvenida activado.")

    @welcome.command(name="off")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def disable(self, ctx: commands.Context) -> None:
        settings = _settings(ctx.guild.id)
        settings["welcome_disabled"] = True
        if await self._save(ctx, settings):
            await ctx.send("🔕 Sistema de bienvenida desactivado.")

    @welcome.command(name="status")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def status(self, ctx: commands.Context) -> None:
        settings = _settings(ctx.guild.id)
        channel_id = settings.get("welcome_channel_id") or self.bot.settings.welcome_channel_id
        channel = ctx.guild.get_channel(int(channel_id)) if channel_id else None
        enabled = bool(channel_id) and not settings.get("welcome_disabled", False)
        embed = discord.Embed(
            title="👋 Estado de bienvenida · DATASHOP",
            color=discord.Color.green() if enabled else discord.Color.orange(),
        )
        embed.add_field(name="Estado", value="🟢 Activo" if enabled else "🔴 Inactivo", inline=True)
        embed.add_field(name="Canal", value=channel.mention if channel else "Sin configurar", inline=True)
        embed.add_field(name="Mensaje", value="Personalizado" if settings.get("welcome_message") else "Predeterminado", inline=True)
        await ctx.send(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Welcome(bot))
