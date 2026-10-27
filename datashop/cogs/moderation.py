from __future__ import annotations

from datetime import timedelta

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


def _member(ctx: commands.Context) -> discord.Member | None:
    return ctx.author if isinstance(ctx.author, discord.Member) else None


async def _require(ctx: commands.Context, permission: str) -> bool:
    author = _member(ctx)
    if author is None:
        await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
        return False
    if not getattr(author.guild_permissions, permission, False):
        await send_context(ctx, "No tienes permiso para realizar esta acción.")
        return False
    return True


class Moderation(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.hybrid_command(name="ban", description="Banea a un miembro del servidor.")
    @commands.guild_only()
    async def ban(
        self,
        ctx: commands.Context,
        member: discord.Member,
        *,
        reason: str = "Sin razón indicada",
    ) -> None:
        if not await _require(ctx, "ban_members"):
            return
        author = _member(ctx)
        if member == ctx.guild.me or member == author:
            await send_context(ctx, "No puedes aplicar esa sanción a ese miembro.")
            return
        if author and member.top_role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del miembro elegido.")
            return
        await member.ban(reason=f"{ctx.author} ({ctx.author.id}): {reason[:400]}")
        await send_context(ctx, f"🔨 {member} ha sido baneado. Motivo: {reason[:300]}")

    @commands.hybrid_command(name="kick", description="Expulsa a un miembro del servidor.")
    @commands.guild_only()
    async def kick(
        self,
        ctx: commands.Context,
        member: discord.Member,
        *,
        reason: str = "Sin razón indicada",
    ) -> None:
        if not await _require(ctx, "kick_members"):
            return
        author = _member(ctx)
        if member == ctx.guild.me or member == author:
            await send_context(ctx, "No puedes expulsar a ese miembro.")
            return
        if author and member.top_role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del miembro elegido.")
            return
        await member.kick(reason=f"{ctx.author} ({ctx.author.id}): {reason[:400]}")
        await send_context(ctx, f"👢 {member} ha sido expulsado. Motivo: {reason[:300]}")

    @commands.hybrid_command(name="timeout", description="Silencia temporalmente a un miembro.")
    @commands.guild_only()
    async def timeout(
        self,
        ctx: commands.Context,
        member: discord.Member,
        minutes: int,
        *,
        reason: str = "Sin razón indicada",
    ) -> None:
        if not await _require(ctx, "moderate_members"):
            return
        if not 1 <= minutes <= 40320:
            await send_context(ctx, "La duración debe ser de 1 a 40320 minutos (28 días).")
            return
        author = _member(ctx)
        if member == ctx.guild.me or member == author:
            await send_context(ctx, "No puedes aplicar un timeout a ese miembro.")
            return
        if author and member.top_role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del miembro elegido.")
            return
        await member.timeout(timedelta(minutes=minutes), reason=f"{ctx.author} ({ctx.author.id}): {reason[:400]}")
        await send_context(ctx, f"⏳ {member.mention} recibió timeout por {minutes} minutos. Motivo: {reason[:250]}")

    @commands.hybrid_command(name="untimeout", description="Retira el timeout de un miembro.")
    @commands.guild_only()
    async def untimeout(self, ctx: commands.Context, member: discord.Member) -> None:
        if not await _require(ctx, "moderate_members"):
            return
        author = _member(ctx)
        if author and member.top_role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del miembro elegido.")
            return
        await member.timeout(None, reason=f"Timeout retirado por {ctx.author} ({ctx.author.id})")
        await send_context(ctx, f"✅ Se retiró el timeout de {member.mention}.")

    @commands.hybrid_command(name="warn", description="Añade una advertencia a un miembro.")
    @commands.guild_only()
    async def warn(
        self,
        ctx: commands.Context,
        member: discord.Member,
        *,
        reason: str = "Sin razón indicada",
    ) -> None:
        if not await _require(ctx, "moderate_members"):
            return
        data = get_guild_data("warnings.json", ctx.guild.id, {})
        if not isinstance(data, dict):
            data = {}
        user_warnings = data.get(str(member.id), [])
        if not isinstance(user_warnings, list):
            user_warnings = []
        user_warnings.append({
            "reason": reason[:400],
            "moderator_id": ctx.author.id,
            "moderator": str(ctx.author),
            "timestamp": discord.utils.utcnow().isoformat(),
        })
        data[str(member.id)] = user_warnings
        set_guild_data("warnings.json", ctx.guild.id, data)
        await send_context(ctx, f"⚠️ Advertencia registrada para {member.mention}. Total: {len(user_warnings)}.")

    @commands.hybrid_command(name="warnings", description="Consulta las advertencias de un miembro.")
    @commands.guild_only()
    async def warnings(self, ctx: commands.Context, member: discord.Member | None = None) -> None:
        if not await _require(ctx, "moderate_members"):
            return
        member = member or _member(ctx)
        if member is None:
            await send_context(ctx, "Indica un miembro del servidor.")
            return
        data = get_guild_data("warnings.json", ctx.guild.id, {})
        entries = data.get(str(member.id), []) if isinstance(data, dict) else []
        embed = discord.Embed(
            title=f"Advertencias • {member}",
            description="\n".join(
                f"**{index}.** {item.get('reason', 'Sin motivo')} — por {item.get('moderator', 'desconocido')}"
                for index, item in enumerate(entries[-10:], start=max(1, len(entries) - 9))
            ) or "Este miembro no tiene advertencias registradas.",
            color=discord.Color.orange(),
        )
        embed.set_footer(text=f"Total: {len(entries)}")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="clear", description="Elimina mensajes recientes.")
    @commands.guild_only()
    async def clear(self, ctx: commands.Context, amount: int) -> None:
        if not await _require(ctx, "manage_messages"):
            return
        if not 1 <= amount <= 100:
            await send_context(ctx, "Indica una cantidad entre 1 y 100.")
            return
        if ctx.interaction:
            await ctx.defer(ephemeral=True)
        deleted = await ctx.channel.purge(limit=amount)
        await send_context(
            ctx,
            f"🧹 Se eliminaron {len(deleted)} mensajes.",
            ephemeral=True,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Moderation(bot))
