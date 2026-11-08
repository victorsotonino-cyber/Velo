from __future__ import annotations

import logging

import discord
from discord.ext import commands

from datashop.respond import send_context

log = logging.getLogger("datashop.templane")

ROLE_NAMES = (
    "USER", "BUYER", "SELLER", "STAFF", "SOPORTE",
    "MODERADOR", "ADMIN", "COORDINADOR", "MANAGER", "OWNER",
)

# Categories/channels are intentionally simple so the owner can rearrange them later.
LAYOUT = (
    ("@Myst Market", ("welcome", "invites", "telegram", "payments-methods", "scammers")),
    ("Important", ("news", "terms", "website", "ticket", "restock")),
    ("Leg1t", ("l3g1t", "m4k3-a-r3v1ew", "r3v1ew")),
    ("GENERAL", ("chat", "cmds", "how-to-secure")),
    ("SLOTS", ("keilse", "benito")),
    ("Ally/s can scam", ("affys", "plantilla")),
)


class Template(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.group(name="templane", invoke_without_command=True)
    @commands.guild_only()
    async def templane(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa `!templane todo` para crear la plantilla completa.")

    @templane.command(name="todo")
    @commands.guild_only()
    @commands.has_guild_permissions(manage_guild=True)
    async def todo(self, ctx: commands.Context) -> None:
        guild = ctx.guild
        if guild is None:
            return
        me = guild.me
        if me is None or not me.guild_permissions.manage_roles or not me.guild_permissions.manage_channels:
            await send_context(ctx, "❌ Necesito los permisos **Gestionar roles** y **Gestionar canales**.")
            return

        await ctx.typing()
        created_roles = 0
        existing_roles = 0
        created_categories = 0
        created_channels = 0

        # Create roles from lowest to highest. Discord's hierarchy is controlled by the bot's top role.
        for name in ROLE_NAMES:
            role = discord.utils.get(guild.roles, name=name)
            if role is not None:
                existing_roles += 1
                continue
            try:
                await guild.create_role(
                    name=name,
                    permissions=discord.Permissions.none(),
                    hoist=name in {"STAFF", "SOPORTE", "MODERADOR", "ADMIN", "COORDINADOR", "MANAGER", "OWNER"},
                    mentionable=name in {"BUYER", "SELLER", "STAFF"},
                    reason="DATASHOP: configuración de plantilla",
                )
                created_roles += 1
            except discord.Forbidden:
                await send_context(ctx, "❌ No puedo crear roles. Sube mi rol por encima del lugar donde deben quedar y revisa Gestionar roles.")
                return
            except discord.HTTPException:
                log.exception("No se pudo crear el rol %s en %s", name, guild.id)

        for category_name, channel_names in LAYOUT:
            category = discord.utils.get(guild.categories, name=category_name)
            if category is None:
                try:
                    category = await guild.create_category(
                        category_name,
                        reason="DATASHOP: configuración de plantilla",
                    )
                    created_categories += 1
                except discord.Forbidden:
                    await send_context(ctx, "❌ No puedo crear categorías. Revisa Gestionar canales.")
                    return
                except discord.HTTPException:
                    log.exception("No se pudo crear la categoría %s", category_name)
                    continue

            for channel_name in channel_names:
                existing = discord.utils.get(guild.text_channels, name=channel_name)
                if existing is not None:
                    if existing.category_id != category.id:
                        try:
                            await existing.edit(category=category, reason="DATASHOP: organizar plantilla")
                        except discord.HTTPException:
                            log.warning("No se pudo mover el canal %s", channel_name)
                    continue
                try:
                    await guild.create_text_channel(
                        channel_name,
                        category=category,
                        reason="DATASHOP: configuración de plantilla",
                    )
                    created_channels += 1
                except discord.Forbidden:
                    await send_context(ctx, "❌ No puedo crear canales. Revisa Gestionar canales.")
                    return
                except discord.HTTPException:
                    log.exception("No se pudo crear el canal %s", channel_name)

        embed = discord.Embed(
            title="DATASHOP • Plantilla creada",
            description=(
                "La estructura ya está preparada. Puedes cambiar el orden, nombres y permisos "
                "desde los ajustes de tu servidor. Los roles se crean sin permisos administrativos "
                "automáticos por seguridad."
            ),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.add_field(name="Roles nuevos", value=str(created_roles), inline=True)
        embed.add_field(name="Roles existentes", value=str(existing_roles), inline=True)
        embed.add_field(name="Categorías nuevas", value=str(created_categories), inline=True)
        embed.add_field(name="Canales nuevos", value=str(created_channels), inline=True)
        await send_context(ctx, embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Template(bot))
