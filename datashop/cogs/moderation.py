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


def _role_safe_for_management(role: discord.Role) -> bool:
    permissions = role.permissions
    return not (
        permissions.administrator
        or permissions.manage_guild
        or permissions.manage_roles
        or permissions.manage_channels
        or permissions.manage_messages
        or permissions.kick_members
        or permissions.ban_members
        or permissions.moderate_members
        or permissions.manage_webhooks
    )


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
        await send_context(ctx, f"🧹 Se eliminaron {len(deleted)} mensajes.", ephemeral=True)

    @commands.hybrid_command(name="slowmode", description="Configura el modo lento del canal actual.")
    @commands.guild_only()
    async def slowmode(self, ctx: commands.Context, seconds: int) -> None:
        if not await _require(ctx, "manage_channels"):
            return
        if not isinstance(ctx.channel, (discord.TextChannel, discord.Thread)):
            await send_context(ctx, "Este comando necesita un canal de texto o hilo.")
            return
        if not 0 <= seconds <= 21600:
            await send_context(ctx, "El tiempo debe estar entre 0 y 21600 segundos.")
            return
        try:
            if isinstance(ctx.channel, discord.Thread):
                await send_context(ctx, "Discord no permite configurar el modo lento de un hilo con este comando.")
                return
            await ctx.channel.edit(slowmode_delay=seconds, reason=f"Modo lento configurado por {ctx.author}")
        except discord.HTTPException:
            await send_context(ctx, "No pude cambiar el modo lento. Revisa mis permisos.")
            return
        await send_context(ctx, f"✅ Modo lento establecido en {seconds} segundos.")

    @commands.hybrid_command(name="lock", description="Bloquea mensajes para @everyone en el canal actual.")
    @commands.guild_only()
    async def lock(self, ctx: commands.Context, *, reason: str = "Sin razón indicada") -> None:
        if not await _require(ctx, "manage_channels"):
            return
        if not isinstance(ctx.channel, discord.TextChannel):
            await send_context(ctx, "Este comando solo funciona en canales de texto.")
            return
        try:
            overwrite = ctx.channel.overwrites_for(ctx.guild.default_role)
            overwrite.send_messages = False
            await ctx.channel.set_permissions(
                ctx.guild.default_role,
                overwrite=overwrite,
                reason=f"Canal bloqueado por {ctx.author}: {reason[:250]}",
            )
        except discord.HTTPException:
            await send_context(ctx, "No pude bloquear el canal. Revisa mis permisos.")
            return
        await send_context(ctx, f"🔒 Canal bloqueado para @everyone. Motivo: {reason[:250]}")

    @commands.hybrid_command(name="unlock", description="Retira el bloqueo de @everyone en el canal actual.")
    @commands.guild_only()
    async def unlock(self, ctx: commands.Context) -> None:
        if not await _require(ctx, "manage_channels"):
            return
        if not isinstance(ctx.channel, discord.TextChannel):
            await send_context(ctx, "Este comando solo funciona en canales de texto.")
            return
        try:
            overwrite = ctx.channel.overwrites_for(ctx.guild.default_role)
            overwrite.send_messages = None
            await ctx.channel.set_permissions(
                ctx.guild.default_role,
                overwrite=overwrite,
                reason=f"Canal desbloqueado por {ctx.author}",
            )
        except discord.HTTPException:
            await send_context(ctx, "No pude desbloquear el canal. Revisa mis permisos.")
            return
        await send_context(ctx, "🔓 Se retiró el bloqueo explícito para @everyone. Otros permisos del canal siguen vigentes.")

    @commands.hybrid_command(name="nick", description="Cambia o restablece el apodo de un miembro.")
    @commands.guild_only()
    async def nick(self, ctx: commands.Context, member: discord.Member, *, nickname: str | None = None) -> None:
        if not await _require(ctx, "manage_nicknames"):
            return
        author = _member(ctx)
        me = ctx.guild.me
        if member == ctx.guild.owner or member == me:
            await send_context(ctx, "No puedo cambiar ese apodo con este comando.")
            return
        if author and member.top_role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del miembro elegido.")
            return
        if me is None or member.top_role >= me.top_role:
            await send_context(ctx, "Mi rol debe estar por encima del miembro elegido.")
            return
        if nickname is not None and len(nickname) > 32:
            await send_context(ctx, "El apodo no puede superar 32 caracteres.")
            return
        try:
            await member.edit(nick=nickname, reason=f"Apodo cambiado por {ctx.author}")
        except discord.HTTPException:
            await send_context(ctx, "No pude cambiar el apodo. Revisa mis permisos.")
            return
        await send_context(ctx, f"✅ Apodo de {member.mention} actualizado.")

    @commands.hybrid_group(name="role", description="Administra roles básicos de miembros.", invoke_without_command=True)
    @commands.guild_only()
    async def role(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa role add @miembro @rol o role remove @miembro @rol.")

    @role.command(name="add", description="Asigna un rol a un miembro.")
    async def add_role(self, ctx: commands.Context, member: discord.Member, role: discord.Role) -> None:
        if not await _require(ctx, "manage_roles"):
            return
        author = _member(ctx)
        me = ctx.guild.me
        if role.is_default() or role.managed or not _role_safe_for_management(role):
            await send_context(ctx, "Por seguridad, solo puedes administrar roles no administrados y sin permisos de moderación/administración.")
            return
        if author and role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del rol que quieres asignar.")
            return
        if me is None or not me.guild_permissions.manage_roles or role >= me.top_role:
            await send_context(ctx, "Mi rol debe estar por encima del rol elegido y necesito Gestionar roles.")
            return
        if member == ctx.guild.me or member == ctx.guild.owner:
            await send_context(ctx, "No se puede modificar el propietario o al propio bot con este comando.")
            return
        try:
            await member.add_roles(role, reason=f"Rol asignado por {ctx.author}")
        except discord.HTTPException:
            await send_context(ctx, "No pude asignar el rol. Comprueba permisos y jerarquía.")
            return
        await send_context(ctx, f"✅ Se asignó {role.mention} a {member.mention}.")

    @role.command(name="remove", description="Retira un rol de un miembro.")
    async def remove_role(self, ctx: commands.Context, member: discord.Member, role: discord.Role) -> None:
        if not await _require(ctx, "manage_roles"):
            return
        author = _member(ctx)
        me = ctx.guild.me
        if role.is_default() or role.managed or not _role_safe_for_management(role):
            await send_context(ctx, "Por seguridad, solo puedes administrar roles no administrados y sin permisos de moderación/administración.")
            return
        if author and role >= author.top_role and ctx.guild.owner_id != author.id:
            await send_context(ctx, "Tu rol debe estar por encima del rol que quieres retirar.")
            return
        if me is None or not me.guild_permissions.manage_roles or role >= me.top_role:
            await send_context(ctx, "Mi rol debe estar por encima del rol elegido y necesito Gestionar roles.")
            return
        try:
            await member.remove_roles(role, reason=f"Rol retirado por {ctx.author}")
        except discord.HTTPException:
            await send_context(ctx, "No pude retirar el rol. Comprueba permisos y jerarquía.")
            return
        await send_context(ctx, f"✅ Se retiró {role.mention} de {member.mention}.")


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Moderation(bot))
