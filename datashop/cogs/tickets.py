from __future__ import annotations

import asyncio
import io
import logging
import re
from datetime import datetime, timedelta, timezone

import discord
from discord.ext import commands, tasks

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data

log = logging.getLogger("datashop.tickets")


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


def _staff_role_ids(
    settings: dict[str, Any],
    default_role_id: int | None,
    ticket_type: str | None = None,
) -> set[int]:
    """Return global and, for a specific ticket type, its routed staff role IDs."""
    candidates: list[Any] = [settings.get("staff_role_id"), default_role_id]
    routes = settings.get("ticket_types", {})
    route = routes.get(ticket_type, {}) if ticket_type and isinstance(routes, dict) else {}
    if isinstance(route, dict):
        candidates.append(route.get("staff_role_id"))
    role_ids: set[int] = set()
    for candidate in candidates:
        try:
            parsed = int(candidate) if candidate else None
        except (TypeError, ValueError):
            parsed = None
        if parsed and parsed > 0:
            role_ids.add(parsed)
    return role_ids


TICKET_TYPES = {
    "support": ("Soporte", "🛠️"),
    "purchase": ("Compras", "🛒"),
    "refund": ("Reclamación", "↩️"),
    "other": ("Otros", "💬"),
}
TICKET_PRIORITIES = {
    "low": ("Baja", "🟢"),
    "normal": ("Normal", "🟡"),
    "high": ("Alta", "🟠"),
    "urgent": ("Urgente", "🔴"),
}


class TicketRequestModal(discord.ui.Modal):
    def __init__(self, cog: "Tickets", ticket_type: str) -> None:
        label = TICKET_TYPES.get(ticket_type, TICKET_TYPES["support"])[0]
        super().__init__(title=f"Abrir ticket · {label}", timeout=300)
        self.cog = cog
        self.ticket_type = ticket_type if ticket_type in TICKET_TYPES else "support"
        self.subject = discord.ui.TextInput(
            label="Asunto",
            placeholder="Resume tu consulta",
            min_length=3,
            max_length=100,
        )
        self.details = discord.ui.TextInput(
            label="Descripción",
            placeholder="Explica lo que necesitas. No incluyas contraseñas ni tokens.",
            style=discord.TextStyle.paragraph,
            min_length=5,
            max_length=1200,
        )
        self.add_item(self.subject)
        self.add_item(self.details)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este formulario solo funciona dentro de un servidor.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            channel = await self.cog.create_ticket(
                interaction.guild,
                interaction.user,
                ticket_type=self.ticket_type,
                subject=str(self.subject),
                details=str(self.details),
            )
        except discord.HTTPException:
            log.exception("No se pudo crear un ticket para el usuario %s", interaction.user.id)
            channel = None
        if channel is None:
            await interaction.followup.send(
                "No pude crear el ticket. Comprueba si ya alcanzaste tu límite, si estás bloqueado o si faltan permisos.",
                ephemeral=True,
            )
        else:
            await interaction.followup.send(f"Tu ticket está listo: {channel.mention}", ephemeral=True)


class TicketTypeSelect(discord.ui.Select):
    def __init__(self, cog: "Tickets") -> None:
        options = [
            discord.SelectOption(label=label, value=key, emoji=emoji, description=f"Abrir un ticket de {label.lower()}")
            for key, (label, emoji) in TICKET_TYPES.items()
        ]
        super().__init__(
            placeholder="Selecciona el tipo de ticket…",
            min_values=1,
            max_values=1,
            options=options,
            custom_id="datashop:tickets:type",
            row=0,
        )
        self.cog = cog

    async def callback(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_modal(TicketRequestModal(self.cog, self.values[0]))


class TicketRatingView(discord.ui.View):
    def __init__(self, guild_id: int, channel_id: int, owner_id: int) -> None:
        super().__init__(timeout=86400)
        self.guild_id = guild_id
        self.channel_id = channel_id
        self.owner_id = owner_id
        for score in range(1, 6):
            button = discord.ui.Button(
                label=f"{score}/5",
                style=discord.ButtonStyle.secondary,
                custom_id=f"datashop:ticket-rating:{channel_id}:{score}",
            )
            button.callback = self._callback(score)
            self.add_item(button)

    def _callback(self, score: int):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.user.id != self.owner_id:
                await interaction.response.send_message("Esta encuesta pertenece a otro cliente.")
                return
            ratings = get_guild_data("ticket_ratings.json", self.guild_id, [])
            if not isinstance(ratings, list):
                ratings = []
            if any(isinstance(item, dict) and item.get("ticket_id") == self.channel_id for item in ratings):
                await interaction.response.send_message("Ya registraste una valoración para este ticket.")
                return
            ratings.append({
                "ticket_id": self.channel_id,
                "user_id": self.owner_id,
                "rating": score,
                "created_at": discord.utils.utcnow().isoformat(),
            })
            set_guild_data("ticket_ratings.json", self.guild_id, ratings)
            await interaction.response.send_message(f"Gracias por tu valoración: {score}/5.")
            try:
                await interaction.message.edit(view=None)
            except discord.HTTPException:
                pass
        return callback


class TicketPanelView(discord.ui.View):
    def __init__(self, cog: "Tickets") -> None:
        super().__init__(timeout=None)
        self.cog = cog
        self.add_item(TicketTypeSelect(cog))

    @discord.ui.button(
        label="Abrir ticket de soporte",
        emoji="🎫",
        style=discord.ButtonStyle.primary,
        custom_id="datashop:tickets:open",
        row=1,
    )
    async def open_ticket(
        self,
        interaction: discord.Interaction,
        _button: discord.ui.Button,
    ) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este panel solo funciona dentro de un servidor.", ephemeral=True)
            return
        await interaction.response.send_modal(TicketRequestModal(self.cog, "support"))


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
        if not self.cog.is_staff(interaction.user, interaction.channel if isinstance(interaction.channel, discord.TextChannel) else None) and interaction.user.id != owner_id:
            await interaction.response.send_message("Solo el creador del ticket o el personal puede cerrarlo.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        await self.cog.close_channel(interaction.channel, interaction.user)
        await interaction.followup.send("Ticket cerrado.", ephemeral=True)


    @discord.ui.button(
        label="Reclamar",
        emoji="🙋",
        style=discord.ButtonStyle.secondary,
        custom_id="datashop:tickets:claim",
        row=0,
    )
    async def claim_ticket_button(self, interaction: discord.Interaction, _button: discord.ui.Button) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este botón solo funciona en un servidor.", ephemeral=True)
            return
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel) or not _ticket_owner(channel):
            await interaction.response.send_message("Este canal no es un ticket de DATASHOP.", ephemeral=True)
            return
        if not self.cog.is_staff(interaction.user, channel):
            await interaction.response.send_message("Solo el personal configurado puede reclamar tickets.", ephemeral=True)
            return
        if _topic_value(channel, "DATASHOP_CLOSED") == "1":
            await interaction.response.send_message("Reabre el ticket antes de reclamarlo.", ephemeral=True)
            return
        current = _topic_value(channel, "DATASHOP_CLAIMED_BY")
        if current and current != str(interaction.user.id):
            await interaction.response.send_message(f"Ya está reclamado por <@{current}>.", ephemeral=True)
            return
        try:
            await channel.edit(topic=_set_topic_value(channel, "DATASHOP_CLAIMED_BY", str(interaction.user.id)))
        except discord.HTTPException:
            await interaction.response.send_message("No pude reclamarlo; comprueba mis permisos.", ephemeral=True)
            return
        await interaction.response.send_message("✅ Ticket reclamado.", ephemeral=True)

    @discord.ui.button(
        label="Reabrir",
        emoji="🔓",
        style=discord.ButtonStyle.success,
        custom_id="datashop:tickets:reopen",
        row=1,
    )
    async def reopen_ticket_button(self, interaction: discord.Interaction, _button: discord.ui.Button) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este botón solo funciona en un servidor.", ephemeral=True)
            return
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel) or not _ticket_owner(channel):
            await interaction.response.send_message("Este canal no es un ticket de DATASHOP.", ephemeral=True)
            return
        if not self.cog.is_staff(interaction.user, channel):
            await interaction.response.send_message("Solo el personal puede reabrir tickets desde el botón.", ephemeral=True)
            return
        if _topic_value(channel, "DATASHOP_CLOSED") != "1":
            await interaction.response.send_message("Este ticket ya está abierto.", ephemeral=True)
            return
        owner_id = _ticket_owner(channel)
        owner = channel.guild.get_member(owner_id) if owner_id else None
        if owner is None and owner_id:
            try:
                owner = await channel.guild.fetch_member(owner_id)
            except discord.HTTPException:
                owner = None
        try:
            if owner:
                await channel.set_permissions(
                    owner, view_channel=True, send_messages=True, read_message_history=True,
                    attach_files=True, embed_links=True,
                )
            topic = _set_topic_value(channel, "DATASHOP_CLOSED", "0")
            await channel.edit(name=re.sub(r"^cerrado-", "", channel.name)[:100], topic=topic)
            await channel.send(f"🔓 Ticket reabierto por {interaction.user.mention}.")
        except discord.HTTPException:
            await interaction.response.send_message("No pude reabrir el ticket; revisa mis permisos.", ephemeral=True)
            return
        await interaction.response.send_message("✅ Ticket reabierto.", ephemeral=True)


class Tickets(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._creation_locks: dict[tuple[int, int], asyncio.Lock] = {}

    async def cog_load(self) -> None:
        self.bot.add_view(TicketPanelView(self))
        self.bot.add_view(CloseTicketView(self))
        if not self.ticket_timer_worker.is_running():
            self.ticket_timer_worker.start()

    async def cog_unload(self) -> None:
        self.ticket_timer_worker.cancel()

    @tasks.loop(minutes=1)
    async def ticket_timer_worker(self) -> None:
        for guild in list(self.bot.guilds):
            await self._process_ticket_timers(guild)

    @ticket_timer_worker.before_loop
    async def before_ticket_timer_worker(self) -> None:
        await self.bot.wait_until_ready()

    async def _process_ticket_timers(self, guild: discord.Guild) -> None:
        timers = get_guild_data("ticket_timers.json", guild.id, {})
        if not isinstance(timers, dict):
            return
        now = discord.utils.utcnow()
        changed = False
        for channel_key, timer in list(timers.items()):
            if not isinstance(timer, dict) or timer.get("status") != "active":
                continue
            try:
                due_at = datetime.fromisoformat(str(timer.get("due_at", "")))
                if due_at.tzinfo is None:
                    due_at = due_at.replace(tzinfo=timezone.utc)
                due_at = due_at.astimezone(timezone.utc)
                channel_id = int(timer.get("channel_id", channel_key))
            except (TypeError, ValueError):
                timer["status"] = "failed"
                timer["error"] = "invalid_timer_data"
                changed = True
                continue
            if due_at > now:
                continue
            channel = guild.get_channel(channel_id)
            if not isinstance(channel, discord.TextChannel) or not _is_ticket(channel):
                timer["status"] = "cancelled"
                timer["error"] = "ticket_unavailable"
                changed = True
                continue
            if _topic_value(channel, "DATASHOP_CLOSED") == "1":
                timer["status"] = "cancelled"
                timer["error"] = "ticket_closed"
                changed = True
                continue
            embed = discord.Embed(
                title="⏰ Recordatorio del ticket",
                description=str(timer.get("message", "Revisa este ticket."))[:1500],
                color=discord.Color.from_str("#8B5CF6"),
                timestamp=now,
            )
            embed.add_field(name="Ticket", value=channel.mention, inline=True)
            embed.set_footer(text=f"Programado por ID {timer.get('creator_id', 'desconocido')}")
            try:
                await channel.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())
                timer["status"] = "sent"
                timer["sent_at"] = now.isoformat()
            except discord.HTTPException:
                timer["status"] = "failed"
                timer["error"] = "delivery_failed"
                log.exception("No se pudo enviar el temporizador del ticket %s", channel_id)
            changed = True
        if changed:
            set_guild_data("ticket_timers.json", guild.id, timers)

    def is_staff(
        self,
        member: discord.Member,
        channel: discord.TextChannel | None = None,
    ) -> bool:
        if _is_staff(member):
            return True
        settings = _get_settings(member.guild.id)
        ticket_type = None
        if channel is not None and _is_ticket(channel):
            ticket_type = _topic_value(channel, "DATASHOP_TYPE") or "support"
        role_ids = _staff_role_ids(
            settings,
            self.bot.settings.staff_role_id,
            ticket_type,
        )
        return any(role.id in role_ids for role in member.roles)

    async def _log_ticket_event(
        self,
        guild: discord.Guild,
        action: str,
        channel: discord.TextChannel,
        actor: discord.Member | None = None,
        extra: str = "",
    ) -> None:
        settings = _get_settings(guild.id)
        channel_id = settings.get("logs_channel_id") or self.bot.settings.logs_channel_id
        try:
            log_channel = guild.get_channel(int(channel_id)) if channel_id else None
        except (TypeError, ValueError):
            log_channel = None
        if not isinstance(log_channel, discord.TextChannel):
            return
        owner_id = _ticket_owner(channel)
        description = f"Canal: {channel.mention} (ID {channel.id})"
        if owner_id:
            description += f"\nCliente: <@{owner_id}>"
        if actor:
            description += f"\nAcción de: {actor.mention}"
        if extra:
            description += f"\n{extra[:500]}"
        embed = discord.Embed(
            title=action[:250],
            description=description[:3800],
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        try:
            await log_channel.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException:
            log.exception("No se pudo publicar un log de ticket en %s", guild.id)

    async def create_ticket(
        self,
        guild: discord.Guild,
        member: discord.Member,
        *,
        ticket_type: str = "support",
        subject: str = "Consulta de soporte",
        details: str = "Sin detalles adicionales",
    ) -> discord.TextChannel | None:
        key = (guild.id, member.id)
        lock = self._creation_locks.setdefault(key, asyncio.Lock())
        async with lock:
            return await self._create_ticket_locked(
                guild, member, ticket_type=ticket_type, subject=subject, details=details
            )

    async def _create_ticket_locked(
        self,
        guild: discord.Guild,
        member: discord.Member,
        *,
        ticket_type: str,
        subject: str,
        details: str,
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

        ticket_type = ticket_type if ticket_type in TICKET_TYPES else "support"
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

        label, emoji = TICKET_TYPES[ticket_type]
        safe_name = "".join(ch.lower() if ch.isalnum() else "-" for ch in member.display_name)
        safe_name = "-".join(part for part in safe_name.split("-") if part)[:25] or "cliente"
        channel = await guild.create_text_channel(
            name=f"ticket-{ticket_type}-{safe_name}"[:90],
            category=category,
            overwrites=overwrites,
            topic=f"DATASHOP_OWNER={member.id};DATASHOP_CLOSED=0;DATASHOP_TYPE={ticket_type};DATASHOP_PRIORITY=normal",
            reason=f"Ticket de {label} abierto por {member} ({member.id})",
        )
        embed = discord.Embed(
            title=f"{emoji} DATASHOP • {label}",
            description=(
                f"Cliente: {member.mention}\nAsunto: **{subject.strip()[:100]}**\n\n"
                f"{details.strip()[:1200]}\n\n"
                "El equipo de soporte atenderá esta solicitud aquí. No publiques contraseñas, tokens ni datos de pago privados."
            ),
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        embed.set_footer(text=f"Ticket ID: {channel.id} • Prioridad: normal")
        try:
            await channel.send(
                content=support_role.mention if support_role else None,
                embed=embed,
                view=CloseTicketView(self),
                allowed_mentions=discord.AllowedMentions(roles=bool(support_role), users=False),
            )
        except discord.HTTPException:
            log.exception("No se pudo inicializar el ticket %s", channel.id)
            try:
                await channel.delete(reason="No se pudo enviar el panel inicial del ticket")
            except discord.HTTPException:
                pass
            return None
        await self._log_ticket_event(guild, "Ticket creado", channel, member, f"Tipo: {label}")
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
        await self._log_ticket_event(channel.guild, "Ticket cerrado", channel, member)
        if owner:
            try:
                await owner.send(
                    f"Tu ticket **{channel.name}** en **{channel.guild.name}** se ha cerrado. "
                    "Valora la atención del 1 al 5:",
                    view=TicketRatingView(channel.guild.id, channel.id, owner.id),
                )
            except discord.HTTPException:
                pass

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
        await self._log_ticket_event(channel.guild, "Ticket reabierto", channel, member)

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
                "Selecciona una categoría y completa el formulario para abrir un canal privado.\n\n"
                "🛠️ Soporte · 🛒 Compras · ↩️ Reclamación · 💬 Otros"
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
        if author is None or (not self.is_staff(author, ctx.channel if isinstance(ctx.channel, discord.TextChannel) else None) and author.id != owner_id):
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
        if author is None or not self.is_staff(author, ctx.channel):
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
        if author is None or not self.is_staff(author, ctx.channel):
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
        if not self.is_staff(author, ctx.channel) and author.id != owner_id:
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
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel if isinstance(ctx.channel, discord.TextChannel) else None):
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
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede retirar miembros del ticket.")
            return
        if member.id == _ticket_owner(ctx.channel):
            await send_context(ctx, "No puedes retirar al creador. Cierra el ticket o transfiere el caso.")
            return
        await ctx.channel.set_permissions(member, overwrite=None)
        await send_context(ctx, f"✅ Se retiró el acceso de {member.mention} al ticket.")

    @ticket.command(name="route", description="Configura la categoría y el rol de un tipo de ticket.")
    async def set_route(
        self,
        ctx: commands.Context,
        ticket_type: str,
        category: discord.CategoryChannel,
        staff_role: discord.Role | None = None,
    ) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para configurar rutas.")
            return
        key = ticket_type.strip().casefold()
        if key not in TICKET_TYPES:
            await send_context(ctx, "Tipos válidos: support, purchase, refund y other.")
            return
        settings = _get_settings(ctx.guild.id)
        routes = settings.get("ticket_types", {})
        if not isinstance(routes, dict):
            routes = {}
        route = {"category_id": category.id}
        if staff_role is not None:
            route["staff_role_id"] = staff_role.id
        routes[key] = route
        settings["ticket_types"] = routes
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"Ruta de {TICKET_TYPES[key][0]} configurada en {category.mention}.")

    @ticket.command(name="max-open", description="Establece el máximo de tickets abiertos por usuario.")
    async def set_max_open(self, ctx: commands.Context, amount: int) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para cambiar el límite.")
            return
        if not 1 <= amount <= 5:
            await send_context(ctx, "El límite debe estar entre 1 y 5.")
            return
        settings = _get_settings(ctx.guild.id)
        settings["max_open_tickets"] = amount
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Máximo de tickets abiertos por usuario: {amount}.")

    @ticket.command(name="blacklist-add", description="Impide que un miembro abra tickets.")
    async def blacklist_add(self, ctx: commands.Context, member: discord.Member, *, reason: str = "Sin motivo indicado") -> None:
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede bloquear usuarios del sistema de tickets.")
            return
        blocked = get_guild_data("ticket_blacklist.json", ctx.guild.id, {})
        if not isinstance(blocked, dict):
            blocked = {}
        blocked[str(member.id)] = {
            "reason": reason[:300],
            "moderator_id": ctx.author.id,
            "created_at": discord.utils.utcnow().isoformat(),
        }
        set_guild_data("ticket_blacklist.json", ctx.guild.id, blocked)
        await send_context(ctx, f"🚫 {member.mention} no puede abrir tickets. Motivo: {reason[:250]}.")

    @ticket.command(name="blacklist-remove", description="Permite de nuevo que un miembro abra tickets.")
    async def blacklist_remove(self, ctx: commands.Context, member: discord.Member) -> None:
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede administrar la lista de bloqueo.")
            return
        blocked = get_guild_data("ticket_blacklist.json", ctx.guild.id, {})
        if not isinstance(blocked, dict) or str(member.id) not in blocked:
            await send_context(ctx, "Ese miembro no está bloqueado para tickets.")
            return
        blocked.pop(str(member.id), None)
        set_guild_data("ticket_blacklist.json", ctx.guild.id, blocked)
        await send_context(ctx, f"✅ {member.mention} puede abrir tickets de nuevo.")

    @ticket.command(name="rename", description="Cambia el nombre del ticket actual.")
    async def rename_ticket(self, ctx: commands.Context, *, name: str) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede renombrar tickets.")
            return
        safe_name = "".join(ch.lower() if ch.isalnum() else "-" for ch in name)
        safe_name = "-".join(part for part in safe_name.split("-") if part)[:90] or "ticket"
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1" and not safe_name.startswith("cerrado-"):
            safe_name = f"cerrado-{safe_name}"[:100]
        await ctx.channel.edit(name=safe_name, reason=f"Ticket renombrado por {ctx.author}")
        await send_context(ctx, f"✅ Ticket renombrado a **{safe_name}**.")

    @ticket.command(name="transfer", description="Transfiere el ticket a otro propietario.")
    async def transfer_ticket(self, ctx: commands.Context, member: discord.Member) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede transferir tickets.")
            return
        if member.bot or member.id == _ticket_owner(ctx.channel):
            await send_context(ctx, "Elige un miembro válido que no sea el propietario actual ni un bot.")
            return
        old_owner_id = _ticket_owner(ctx.channel)
        old_owner = ctx.guild.get_member(old_owner_id) if old_owner_id else None
        await ctx.channel.set_permissions(
            member, view_channel=True, send_messages=not _is_closed(ctx.channel),
            read_message_history=True, attach_files=True, embed_links=True,
        )
        if old_owner:
            await ctx.channel.set_permissions(old_owner, overwrite=None)
        await ctx.channel.edit(topic=_set_topic_value(ctx.channel, "DATASHOP_OWNER", str(member.id)))
        await send_context(ctx, f"✅ Ticket transferido a {member.mention}.")
        await self._log_ticket_event(ctx.guild, "Ticket transferido", ctx.channel, ctx.author, f"Nuevo propietario: {member.mention}")

    @ticket.command(name="priority", description="Define la prioridad del ticket.")
    async def set_priority(self, ctx: commands.Context, priority: str) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede cambiar prioridades.")
            return
        key = priority.strip().casefold()
        if key not in TICKET_PRIORITIES:
            await send_context(ctx, "Prioridades válidas: low, normal, high, urgent.")
            return
        await ctx.channel.edit(topic=_set_topic_value(ctx.channel, "DATASHOP_PRIORITY", key))
        label, emoji = TICKET_PRIORITIES[key]
        await send_context(ctx, f"{emoji} Prioridad actualizada: **{label}**.")

    @ticket.command(name="move", description="Mueve el ticket a otra categoría.")
    async def move_ticket(self, ctx: commands.Context, category: discord.CategoryChannel) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede mover tickets.")
            return
        await ctx.channel.edit(category=category, reason=f"Ticket movido por {ctx.author}")
        await send_context(ctx, f"✅ Ticket movido a {category.mention}.")

    @ticket.group(name="note", description="Administra notas privadas del ticket.", invoke_without_command=True)
    async def note(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa ticket note add o ticket note list.")

    @note.command(name="add", description="Añade una nota interna visible solo al personal.")
    async def note_add(self, ctx: commands.Context, *, note: str) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede escribir notas internas.")
            return
        data = get_guild_data("ticket_notes.json", ctx.guild.id, {})
        if not isinstance(data, dict):
            data = {}
        notes = data.get(str(ctx.channel.id), [])
        if not isinstance(notes, list):
            notes = []
        notes.append({
            "note": note.strip()[:1000],
            "author_id": ctx.author.id,
            "author": str(ctx.author),
            "created_at": discord.utils.utcnow().isoformat(),
        })
        data[str(ctx.channel.id)] = notes[-100:]
        set_guild_data("ticket_notes.json", ctx.guild.id, data)
        await send_context(ctx, "🔒 Nota interna guardada.", ephemeral=ctx.interaction is not None)

    @note.command(name="list", description="Lee las notas internas del ticket.")
    async def note_list(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede leer notas internas.")
            return
        data = get_guild_data("ticket_notes.json", ctx.guild.id, {})
        notes = data.get(str(ctx.channel.id), []) if isinstance(data, dict) else []
        lines = [
            f"**{i}.** {item.get('note', '')[:400]} — {item.get('author', 'staff')}"
            for i, item in enumerate(notes[-10:], start=max(1, len(notes) - 9))
            if isinstance(item, dict)
        ]
        embed = discord.Embed(title="🔒 Notas internas", description="\n".join(lines) or "No hay notas.", color=discord.Color.from_str("#8B5CF6"))
        if ctx.interaction is not None:
            await send_context(ctx, embed=embed, ephemeral=True)
        else:
            try:
                await ctx.author.send(embed=embed)
                await send_context(ctx, "Te envié las notas internas por mensaje privado.")
            except discord.HTTPException:
                await send_context(ctx, "No pude enviarte las notas por privado; comprueba si tienes los mensajes privados desactivados.")

    @ticket.command(name="list", description="Lista los tickets abiertos.")
    async def list_tickets(self, ctx: commands.Context, member: discord.Member | None = None) -> None:
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede consultar los tickets.")
            return
        items = [
            channel for channel in ctx.guild.text_channels
            if self._valid_ticket(channel) and _topic_value(channel, "DATASHOP_CLOSED") != "1"
            and (member is None or _ticket_owner(channel) == member.id)
        ]
        lines = []
        for channel in items[:15]:
            owner_id = _ticket_owner(channel)
            claimed = _topic_value(channel, "DATASHOP_CLAIMED_BY")
            priority = _topic_value(channel, "DATASHOP_PRIORITY") or "normal"
            label, emoji = TICKET_PRIORITIES.get(priority, TICKET_PRIORITIES["normal"])
            lines.append(f"{channel.mention} · <@{owner_id}> · {emoji} {label}" + (f" · asignado a <@{claimed}>" if claimed else ""))
        embed = discord.Embed(title="🎫 Tickets abiertos", description="\n".join(lines) or "No hay tickets abiertos.", color=discord.Color.from_str("#8B5CF6"))
        if len(items) > 15:
            embed.set_footer(text=f"Mostrando 15 de {len(items)} tickets.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @ticket.command(name="stats", description="Muestra estadísticas básicas de tickets.")
    async def ticket_stats(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede consultar estadísticas.")
            return
        all_items = [channel for channel in ctx.guild.text_channels if self._valid_ticket(channel)]
        opened = [channel for channel in all_items if _topic_value(channel, "DATASHOP_CLOSED") != "1"]
        claimed = [channel for channel in opened if _topic_value(channel, "DATASHOP_CLAIMED_BY")]
        ratings = get_guild_data("ticket_ratings.json", ctx.guild.id, [])
        valid_ratings = [item.get("rating") for item in ratings if isinstance(item, dict) and isinstance(item.get("rating"), int)] if isinstance(ratings, list) else []
        average = sum(valid_ratings) / len(valid_ratings) if valid_ratings else None
        embed = discord.Embed(title="📊 Estadísticas de tickets", color=discord.Color.from_str("#8B5CF6"))
        embed.add_field(name="Abiertos", value=str(len(opened)), inline=True)
        embed.add_field(name="Cerrados en canales archivados", value=str(len(all_items) - len(opened)), inline=True)
        embed.add_field(name="Reclamados", value=str(len(claimed)), inline=True)
        embed.add_field(name="Valoración media", value=f"{average:.2f}/5 ({len(valid_ratings)})" if average is not None else "Sin valoraciones", inline=False)
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @ticket.command(name="delete", description="Guarda la transcripción en logs y elimina un ticket cerrado.")
    async def delete_ticket(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal puede eliminar tickets.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") != "1":
            await send_context(ctx, "Cierra el ticket antes de eliminarlo.")
            return

        channel = ctx.channel
        settings = _get_settings(ctx.guild.id)
        logs_id = settings.get("logs_channel_id") or self.bot.settings.logs_channel_id
        try:
            logs_channel = ctx.guild.get_channel(int(logs_id)) if logs_id else None
        except (TypeError, ValueError):
            logs_channel = None
        if not isinstance(logs_channel, discord.TextChannel):
            await send_context(ctx, "Configura el canal de registros con /botconfig logs. No eliminé el ticket.")
            return

        lines = [
            f"Transcripción DATASHOP: {channel.name} ({channel.id})",
            f"Servidor: {ctx.guild.name} ({ctx.guild.id})",
            f"Generada: {discord.utils.utcnow().isoformat()}",
            "-" * 70,
        ]
        try:
            async for message in channel.history(limit=500, oldest_first=True):
                timestamp = message.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
                body = (message.clean_content or "[sin texto]").replace("\n", " ")[:1800]
                if message.attachments:
                    body += " | Adjuntos: " + ", ".join(a.url for a in message.attachments[:5])
                if message.embeds:
                    body += f" | Embeds: {len(message.embeds)}"
                lines.append(f"[{timestamp}] {message.author} ({message.author.id}): {body}")
        except discord.HTTPException:
            await send_context(ctx, "No pude leer el historial. El ticket no se eliminó.")
            return

        payload = "\n".join(lines).encode("utf-8")
        transcript_file = discord.File(io.BytesIO(payload), filename=f"{channel.name}-transcript.txt")
        try:
            await logs_channel.send(
                content=f"Transcripción del ticket eliminado **{channel.name}** (ID {channel.id}).",
                file=transcript_file,
                allowed_mentions=discord.AllowedMentions.none(),
            )
        except discord.HTTPException:
            await send_context(ctx, "No pude guardar la transcripción en logs. El ticket no se eliminó.")
            return

        await send_context(ctx, "Transcripción guardada; eliminando el ticket.")
        await channel.delete(reason=f"Ticket eliminado por {ctx.author} tras guardar transcript")

    @ticket.command(name="timer", description="Programa un recordatorio en el ticket actual.")
    async def set_ticket_timer(
        self,
        ctx: commands.Context,
        minutes: int,
        *,
        message: str = "Revisa este ticket y responde al cliente.",
    ) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede programar recordatorios.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1":
            await send_context(ctx, "No puedes programar un recordatorio en un ticket cerrado.")
            return
        if not 1 <= minutes <= 10080:
            await send_context(ctx, "El temporizador debe ser de 1 minuto a 7 días.")
            return
        message = message.strip()
        if not message or len(message) > 1500:
            await send_context(ctx, "El recordatorio debe tener entre 1 y 1500 caracteres.")
            return
        timers = get_guild_data("ticket_timers.json", ctx.guild.id, {})
        if not isinstance(timers, dict):
            timers = {}
        due_at = discord.utils.utcnow() + timedelta(minutes=minutes)
        timers[str(ctx.channel.id)] = {
            "guild_id": ctx.guild.id,
            "channel_id": ctx.channel.id,
            "creator_id": ctx.author.id,
            "message": message,
            "created_at": discord.utils.utcnow().isoformat(),
            "due_at": due_at.isoformat(),
            "status": "active",
        }
        set_guild_data("ticket_timers.json", ctx.guild.id, timers)
        await send_context(
            ctx,
            f"⏰ Recordatorio programado para <t:{int(due_at.timestamp())}:R>. Usa /ticket stoptimer para cancelarlo.",
        )
        await self._log_ticket_event(ctx.guild, "Temporizador de ticket programado", ctx.channel, ctx.author, f"Vence: {due_at.isoformat()}")

    @ticket.command(name="stoptimer", description="Cancela el recordatorio programado del ticket actual.")
    async def stop_ticket_timer(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede cancelar temporizadores.")
            return
        timers = get_guild_data("ticket_timers.json", ctx.guild.id, {})
        if not isinstance(timers, dict):
            timers = {}
        timer = timers.get(str(ctx.channel.id))
        if not isinstance(timer, dict) or timer.get("status") != "active":
            await send_context(ctx, "Este ticket no tiene un temporizador activo.")
            return
        timer["status"] = "cancelled"
        timer["cancelled_at"] = discord.utils.utcnow().isoformat()
        timer["cancelled_by"] = ctx.author.id
        timers[str(ctx.channel.id)] = timer
        set_guild_data("ticket_timers.json", ctx.guild.id, timers)
        await send_context(ctx, "✅ Temporizador cancelado.")
        await self._log_ticket_event(ctx.guild, "Temporizador de ticket cancelado", ctx.channel, ctx.author)

    @ticket.command(name="client", description="Muestra la ficha del cliente del ticket actual.")
    async def ticket_client(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede consultar la ficha del cliente.")
            return
        owner_id = _ticket_owner(ctx.channel)
        owner = ctx.guild.get_member(owner_id) if owner_id else None
        if owner is None and owner_id:
            try:
                owner = await ctx.guild.fetch_member(owner_id)
            except discord.HTTPException:
                owner = None
        if owner is None:
            await send_context(ctx, "No pude localizar al propietario actual del ticket.")
            return
        ticket_type = _topic_value(ctx.channel, "DATASHOP_TYPE") or "support"
        type_label = TICKET_TYPES.get(ticket_type, ("Soporte", "🛠️"))[0]
        priority = _topic_value(ctx.channel, "DATASHOP_PRIORITY") or "normal"
        priority_label, priority_emoji = TICKET_PRIORITIES.get(priority, TICKET_PRIORITIES["normal"])
        claimed_id = _topic_value(ctx.channel, "DATASHOP_CLAIMED_BY")
        embed = discord.Embed(
            title="👤 Ficha del cliente",
            description=f"Cliente: {owner.mention}\nCuenta: **{owner}**\nID: {owner.id}",
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_thumbnail(url=owner.display_avatar.url)
        embed.add_field(name="Cuenta creada", value=discord.utils.format_dt(owner.created_at, style="F"), inline=False)
        if owner.joined_at:
            embed.add_field(name="Se unió al servidor", value=discord.utils.format_dt(owner.joined_at, style="F"), inline=False)
        embed.add_field(name="Tipo de ticket", value=type_label, inline=True)
        embed.add_field(name="Prioridad", value=f"{priority_emoji} {priority_label}", inline=True)
        embed.add_field(name="Asignado a", value=f"<@{claimed_id}>" if claimed_id else "Sin reclamar", inline=True)
        embed.add_field(name="Estado", value="Cerrado" if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1" else "Abierto", inline=True)
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @ticket.command(name="remember", description="Publica y fija un recordatorio importante en el ticket.")
    async def remember_ticket(self, ctx: commands.Context, *, note: str) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede fijar recordatorios.")
            return
        note = note.strip()
        if not note or len(note) > 1500:
            await send_context(ctx, "El recordatorio debe tener entre 1 y 1500 caracteres.")
            return
        embed = discord.Embed(
            title="📌 Información importante del ticket",
            description=note,
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        embed.set_footer(text=f"Fijado por {ctx.author.display_name}")
        message = await ctx.channel.send(embed=embed, allowed_mentions=discord.AllowedMentions.none())
        try:
            await message.pin(reason=f"Recordatorio fijado por {ctx.author}")
            await send_context(ctx, "✅ Recordatorio publicado y fijado.")
        except discord.HTTPException:
            await send_context(ctx, "Publiqué el recordatorio, pero Discord no permitió fijarlo. Revisa el permiso Administrar mensajes.")

    @ticket.command(name="transcript", description="Genera un registro de texto del ticket.")
    async def transcript(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not self._valid_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
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
