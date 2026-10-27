from __future__ import annotations

import discord
from discord.ext import commands

from datashop.respond import send_context


class General(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.hybrid_command(name="help", description="Muestra los comandos de DATASHOP.")
    async def help_command(self, ctx: commands.Context) -> None:
        names = sorted(
            command.qualified_name
            for command in self.bot.walk_commands()
            if not command.hidden and command.name != "help"
        )
        slash = sorted(command.name for command in self.bot.tree.get_commands())
        embed = discord.Embed(
            title="DATASHOP | Centro de ayuda",
            description=(
                "Bot de tienda y comunidad.\n"
                f"Prefijo actual: {self.bot.settings.prefix}\n"
                "Los comandos híbridos también están disponibles con prefijo."
            ),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.add_field(name="Comandos con prefijo", value=", ".join(names[:35]) or "Sin comandos", inline=False)
        embed.add_field(name="Comandos slash", value=", ".join("/" + name for name in slash[:25]) or "Sin comandos", inline=False)
        embed.set_footer(text="DATASHOP • Python + discord.py")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="ping", description="Comprueba la latencia de DATASHOP.")
    async def ping(self, ctx: commands.Context) -> None:
        gateway_ms = round(self.bot.latency * 1000)
        embed = discord.Embed(
            title="🏓 DATASHOP | Pong",
            description=f"Gateway: {gateway_ms} ms",
            color=discord.Color.from_str("#8B5CF6"),
        )
        if ctx.interaction:
            response_ms = max(
                0,
                round((discord.utils.utcnow() - ctx.interaction.created_at).total_seconds() * 1000),
            )
            embed.add_field(name="Respuesta", value=f"{response_ms} ms", inline=True)
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="serverinfo", description="Muestra información del servidor.")
    @commands.guild_only()
    async def serverinfo(self, ctx: commands.Context) -> None:
        guild = ctx.guild
        if guild is None:
            return
        embed = discord.Embed(
            title=f"Información del servidor • {guild.name}",
            color=discord.Color.from_str("#8B5CF6"),
        )
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        embed.add_field(name="ID", value=str(guild.id), inline=True)
        embed.add_field(name="Miembros", value=str(guild.member_count or 0), inline=True)
        embed.add_field(name="Canales", value=str(len(guild.channels)), inline=True)
        embed.add_field(name="Creado", value=discord.utils.format_dt(guild.created_at, style="F"), inline=False)
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="userinfo", description="Muestra información de un miembro.")
    @commands.guild_only()
    async def userinfo(self, ctx: commands.Context, member: discord.Member | None = None) -> None:
        member = member or ctx.author
        if not isinstance(member, discord.Member):
            await ctx.send("No pude encontrar a ese miembro.")
            return
        embed = discord.Embed(
            title=f"Información de usuario • {member}",
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.add_field(name="ID", value=str(member.id), inline=True)
        embed.add_field(name="Cuenta creada", value=discord.utils.format_dt(member.created_at, style="F"), inline=False)
        if member.joined_at:
            embed.add_field(name="Se unió al servidor", value=discord.utils.format_dt(member.joined_at, style="F"), inline=False)
        roles = [role.mention for role in reversed(member.roles) if role != ctx.guild.default_role]
        embed.add_field(name="Roles", value=" ".join(roles[:10]) or "Sin roles adicionales", inline=False)
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(General(bot))
