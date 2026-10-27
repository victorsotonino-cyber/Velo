from __future__ import annotations

import io
import re

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


def _get_settings(guild_id: int) -> dict:
    value = get_guild_data("settings.json", guild_id, {})
    return value if isinstance(value, dict) else {}


def _topic_value(channel: discord.TextChannel, key: str) -> str | None:
    prefix = f"{key}="
    for part in (channel.topic or "").split(";"):
        if part.startswith(prefix):
            return part[len(prefix):]
    return None


def _ticket_owner(channel: discord.TextChannel) -> int | None:
    raw = _topic_value(channel, "DATASHOP_OWNER")
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


def _set_topic_value(channel: discord.TextChannel, key: str, value: str | None) -> str:
    parts = [part for part in (channel.topic or "").split(";") if part and not part.startswith(f"{key}=")]
    if value is not None:
        parts.append(f"{key}={value}")
    return ";".join(parts)


def _is_staff(member: discord.Member) -> bool:
    return member.guild_permissions.manage_channels or member.guild_permissions.administrator


class TicketPanelView(discord.ui.View):
    def __init__(self, cog: "Tickets") -> None:
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(
        label="Abrir ticket",
        emoji="🎫",
        style=discord.ButtonStyle.primary,
        custom_id="datashop:tickets:open",
    )
    async def open_ticket(
        self,
        interaction: discord.Interaction,
        _button: discord.ui.Button,
    ) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este panel solo funciona dentro de un servidor.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            channel = await self.cog.create_ticket(interaction.guild, interaction.user)
        except discord.HTTPException:
            channel = None
        if channel is None:
            await interaction.followup.send(
                "Ya tienes un ticket abierto o no pude crear el canal. Revisa la categoría y mis permisos.",
                ephemeral=True,
            )
        else:
            await interaction.followup.send(f"Tu ticket está listo: {channel.mention}", ephemeral=True)


class CloseTicketView(discord.ui.View):
    def __init__(self, cog: "Tickets") -> None:
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(
        label="Cerrar ticket",
        emoji="🔒",
        style=discord.ButtonStyle.danger,
        custom_id="datashop:tickets:close",
    )
    async def close_ticket_button(
        self,
        interaction: discord.Interaction,
        _button: discord.ui.Button,
    ) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este botón solo funciona dentro de un servidor.", ephemeral=True)
            return
        if not isinstance(interaction.channel, discord.TextChannel):
            await interaction.response.send_message("No pude identificar el canal del ticket.", ephemeral=True)
            return
        owner_id = _ticket_owner(interaction.channel)
        if owner_id is None:
            await interaction.response.send_message("Este canal no parece ser un ticket de DATASHOP.", ephemeral=True)
            return
        if not self.cog.is_staff(interaction.user) and interaction.user.id != owner_id:
            await interaction.response.send_message("Solo el creador del ticket o el personal puede cerrarlo.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        await self.cog.close_channel(interaction.channel, interaction.user)
        await interaction.followup.send("Ticket cerrado.", ephemeral=True)


class Tickets(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def cog_load(self) -> None:
        self.bot.add_view(TicketPanelView(self))
        self.bot.add_view(CloseTicketView(self))

    def is_staff(self, member: discord.Member) -> bool:
        if _is_staff(member):
            return True
        settings = _get_settings(member.guild.id)
        role_id = settings.get("staff_role_id") or self.bot.settings.staff_role_id
        return bool(role_id and any(role.id == int(role_id) for role in member.roles))

    async def create_ticket(
        self,
        guild: discord.Guild,
        member: discord.Member,
    ) -> discord.TextChannel | None:
        settings = _get_settings(guild.id)
        blacklist = get_guild_data("ticket_blacklist.json", guild.id, {})
        if isinstance(blacklist, dict) and str(member.id) in blacklist:
            return None

        try:
            max_open = max(1, min(5, int(settings.get("max_open_tickets", 1))))
        except (TypeError, ValueError):
            max_open = 1
        existing = [
            channel for channel in guild.text_channels
            if _ticket_owner(channel) == member.id and _topic_value(channel, "DATASHOP_CLOSED") != "1"
        ]
        if len(existing) >= max_open:
            return None

        ticket_type = str(settings.get("default_ticket_type", "support"))
        routes = settings.get("ticket_types", {})
        route = routes.get(ticket_type, {}) if isinstance(routes, dict) else {}
        if not isinstance(route, dict):
            route = {}
        category_id = route.get("category_id") or settings.get("ticket_category_id") or self.bot.settings.ticket_category_id
        category = guild.get_channel(int(category_id)) if category_id else None
        support_role_id = route.get("staff_role_id") or settings.get("staff_role_id") or self.bot.settings.staff_role_id
        support_role = guild.get_role(int(support_role_id)) if support_role_id else None

        overwrites: dict[discord.abc.Snowflake, discord.PermissionOverwrite] = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            member: discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                attach_files=True,
                embed_links=True,
            ),
        }
        if guild.me:
            overwrites[guild.me] = discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                manage_channels=True,
                manage_messages=True,
                attach_files=True,
            )
        if support_role:
            overwrites[support_role] = discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
            )

        if not isinstance(category, discord.CategoryChannel):
            category = await guild.create_category(
                "DATASHOP • Tickets",
                overwrites={guild.default_role: discord.PermissionOverwrite(view_channel=False)},
            )
            settings["ticket_category_id"] = category.id
            set_guild_data("settings.json", guild.id, settings)

        safe_name = "".join(ch.lower() if ch.isalnum() else "-" for ch in member.display_name)
        safe_name = "-".join(part for part in safe_name.split("-") if part)[:35] or "cliente"
        channel = await guild.create_text_channel(
            name=f"ticket-{safe_name}"[:90],
            category=category,
            overwrites=overwrites,
            topic=f"DATASHOP_OWNER={member.id};DATASHOP_CLOSED=0",
            reason=f"Ticket abierto por {member} ({member.id})",
        )
        embed = discord.Embed(
            title="🎫 DATASHOP • Ticket abierto",
            description=(
                f"Hola {member.mention}. Describe tu consulta con el mayor detalle posible.\n\n"
                "El equipo de soporte te atenderá aquí. No publiques contraseñas ni tokens."
            ),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_footer(text="Usa los botones y comandos del ticket para gestionarlo.")
        await channel.send(
            content=support_role.mention if support_role else None,
            embed=embed,
            view=CloseTicketView(self),
            allowed_mentions=discord.AllowedMentions(roles=bool(support_role), users=False),
        )
        return channel

    async def close_channel(self, channel: discord.TextChannel, member: discord.Member) -> None:
        owner_id = _ticket_owner(channel)
        owner = channel.guild.get_member(owner_id) if owner_id else None
        if owner:
            await channel.set_permissions(owner, view_channel=False, send_messages=False)
        topic = _set_topic_value(channel, "DATASHOP_CLOSED", "1")
        new_name = channel.name if channel.name.startswith("cerrado-") else f"cerrado-{channel.name}"
        await channel.edit(name=new_name[:100], topic=topic)
        await channel.send(f"🔒 Ticket cerrado por {member.mention}.")

    async def reopen_channel(self, channel: discord.TextChannel, member: discord.Member) -> None:
        owner_id = _ticket_owner(channel)
        owner = channel.guild.get_member(owner_id) if owner_id else None
        if owner:
            await channel.set_permissions(
                owner,
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                attach_files=True,
                embed_links=True,
            )
        topic = _set_topic_value(channel, "DATASHOP_CLOSED", "0")
        new_name = re.sub(r"^cerrado-", "", channel.name)
        await channel.edit(name=new_name[:100], topic=topic)
        await channel.send(f"🔓 Ticket reabierto por {member.mention}.")

    def _valid_ticket(self, channel: discord.TextChannel) -> bool:
        return _ticket_owner(channel) is not None

    @commands.hybrid_group(name="ticket", description="Configura y administra los tickets.", invoke_without_command=True)
    @commands.guild_only()
    async def ticket(self, ctx: commands.Context) -> None:
        await send_context(
            ctx,
            "Comandos: ticket setup, close, claim, unclaim, reopen, add, remove y transcript.",
            ephemeral=ctx.interaction is not None,
        )

    @ticket.command(name="setup", description="Publica un panel de tickets en este canal.")
    async def setup_panel(
        self,
        ctx: commands.Context,
        category: discord.CategoryChannel | None = None,
        staff_role: discord.Role | None = None,
    ) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para publicar el panel.")
            return
        settings = _get_settings(ctx.guild.id)
        if category is not None:
            settings["ticket_category_id"] = category.id
        if staff_role is not None:
            settings["staff_role_id"] = staff_role.id
        if category is not None or staff_role is not None:
            set_guild_data("settings.json", ctx.guild.id, settings)
        embed = discord.Embed(
            title="DATASHOP • Centro de soporte",
            description=(
                "Pulsa el botón para abrir un canal privado con el equipo de soporte.\n\n"
                "El sistema permite reclamar, cerrar, reabrir y añadir participantes al ticket."
            ),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_footer(text="No envíes contraseñas, tokens ni datos de pago privados.")
        await send_context(ctx, embed=embed, view=TicketPanelView(self))

    @ticket.command(name="close", description="Cierra el ticket actual.")
    async def close(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel):
            await send_context(ctx, "Este comando solo funciona en un canal de texto.")
            return
        owner_id = _ticket_owner(ctx.channel)
        if owner_id is None:
            await send_context(ctx, "Este canal no parece ser un ticket de DATASHOP.")
            return
        author = ctx.author if isinstance(ctx.author, discord.Member) else None
        if author is None or (not self.is_staff(author) and author.id != owner_id):
            await send_context(ctx, "Solo el creador del ticket o el personal puede cerrarlo.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1":
            await send_context(ctx, "Este ticket ya está cerrado.")
            return
        await self.close_channel(ctx.channel, author)
        await send_context(ctx, "Ticket cerrado.", ephemeral=ctx.interaction is not None)

    @ticket.command(name="claim", description="Reclama el ticket actual como personal de soporte.")
    async def claim(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        author = ctx.author if isinstance(ctx.author, discord.Member) else None
        if author is None or not self.is_staff(author):
            await send_context(ctx, "Solo el personal configurado puede reclamar tickets.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1":
            await send_context(ctx, "Reabre el ticket antes de reclamarlo.")
            return
        current = _topic_value(ctx.channel, "DATASHOP_CLAIMED_BY")
        if current and current != str(author.id):
            await send_context(ctx, f"Este ticket ya está reclamado por <@{current}>.")
            return
        await ctx.channel.edit(topic=_set_topic_value(ctx.channel, "DATASHOP_CLAIMED_BY", str(author.id)))
        await send_context(ctx, f"✋ Ticket reclamado por {author.mention}.")

    @ticket.command(name="unclaim", description="Libera el ticket reclamado.")
    async def unclaim(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        author = ctx.author if isinstance(ctx.author, discord.Member) else None
        if author is None or not self.is_staff(author):
            await send_context(ctx, "Solo el personal configurado puede liberar tickets.")
            return
        current = _topic_value(ctx.channel, "DATASHOP_CLAIMED_BY")
        if current is None:
            await send_context(ctx, "Este ticket no está reclamado.")
            return
        if current != str(author.id) and not author.guild_permissions.manage_channels and not author.guild_permissions.administrator:
            await send_context(ctx, "Solo quien lo reclamó o un moderador con Gestionar canales puede liberarlo.")
            return
        await ctx.channel.edit(topic=_set_topic_value(ctx.channel, "DATASHOP_CLAIMED_BY", None))
        await send_context(ctx, "✅ Ticket liberado para el equipo.")

    @ticket.command(name="reopen", description="Reabre un ticket cerrado.")
    async def reopen(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel):
            await send_context(ctx, "Este comando solo funciona en un canal de texto.")
            return
        owner_id = _ticket_owner(ctx.channel)
        author = ctx.author if isinstance(ctx.author, discord.Member) else None
        if owner_id is None or author is None:
            await send_context(ctx, "Este canal no parece ser un ticket de DATASHOP.")
            return
        if not self.is_staff(author) and author.id != owner_id:
            await send_context(ctx, "Solo el creador del ticket o el personal puede reabrirlo.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") != "1":
            await send_context(ctx, "Este ticket ya está abierto.")
            return
        await self.reopen_channel(ctx.channel, author)
        await send_context(ctx, "Ticket reabierto.", ephemeral=ctx.interaction is not None)

    @ticket.command(name="add", description="Da acceso al ticket actual a un miembro.")
    async def add_member(self, ctx: commands.Context, member: discord.Member) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede añadir miembros al ticket.")
            return
        await ctx.channel.set_permissions(
            member,
            view_channel=True,
            send_messages=True,
            read_message_history=True,
            attach_files=True,
        )
        await send_context(ctx, f"✅ {member.mention} ahora tiene acceso al ticket.")

    @ticket.command(name="remove", description="Retira el acceso de un participante del ticket.")
    async def remove_member(self, ctx: commands.Context, member: discord.Member) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede retirar miembros del ticket.")
            return
        if member.id == _ticket_owner(ctx.channel):
            await send_context(ctx, "No puedes retirar al creador. Cierra el ticket o transfiere el caso.")
            return
        await ctx.channel.set_permissions(member, overwrite=None)
        await send_context(ctx, f"✅ Se retiró el acceso de {member.mention} al ticket.")

    @ticket.command(name="transcript", description="Genera un registro de texto del ticket.")
    async def transcript(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede generar transcripciones.")
            return
        lines: list[str] = []
        async for message in ctx.channel.history(limit=1000, oldest_first=True):
            timestamp = message.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            body = message.clean_content.replace("\n", " ")
            if message.attachments:
                body += " " + " ".join(attachment.url for attachment in message.attachments)
            if message.embeds:
                body += f" [embeds: {len(message.embeds)}]"
            lines.append(f"[{timestamp}] {message.author} ({message.author.id}): {body}")
        payload = "\n".join(lines).encode("utf-8") or b"Sin mensajes."
        file = discord.File(io.BytesIO(payload), filename=f"{ctx.channel.name}-transcript.txt")
        await send_context(ctx, "Transcripción del ticket:", file=file, ephemeral=ctx.interaction is not None)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Tickets(bot))
