from __future__ import annotations

import asyncio
import html
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

async def _build_html_transcript(
    channel: discord.TextChannel,
    *,
    limit: int = 1000,
) -> tuple[bytes, int]:
    """Build a safe, size-bounded HTML transcript for support staff."""
    records: list[str] = []
    estimated_size = 0
    truncated = False
    max_transcript_size = 5_500_000

    async for message in channel.history(limit=limit, oldest_first=False):
        raw_content = message.clean_content or "[sin texto]"
        was_truncated = len(raw_content) > 1200
        body = html.escape(raw_content[:1200]).replace("\n", "<br>")
        if was_truncated:
            body += "<br><em>[texto truncado para mantener un tamaño seguro]</em>"

        attachment_html: list[str] = []
        for attachment in message.attachments[:5]:
            url = str(attachment.url)
            if not url.startswith("https://"):
                continue
            safe_url = html.escape(url, quote=True)
            safe_name = html.escape(str(attachment.filename)[:200])
            attachment_html.append(
                f'<li><a href="{safe_url}" rel="noopener noreferrer">{safe_name}</a></li>'
            )
        attachments = (
            '<ul class="attachments">' + "".join(attachment_html) + "</ul>"
            if attachment_html else ""
        )

        embed_html: list[str] = []
        for embedded in message.embeds[:3]:
            title = html.escape((embedded.title or "Embed")[:200])
            description = html.escape((embedded.description or "")[:500]).replace("\n", "<br>")
            embed_html.append(
                f'<div class="embedded"><strong>{title}</strong>'
                f'<div>{description}</div></div>'
            )

        author = html.escape(str(message.author)[:120])
        author_id = html.escape(str(message.author.id))
        timestamp = html.escape(message.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"))
        record = (
            f'<article class="message"><header><strong>{author}</strong> '
            f'<span class="muted">ID {author_id} · {timestamp}</span></header>'
            f'<div class="body">{body}</div>{attachments}{"".join(embed_html)}</article>'
        )
        record_size = len(record.encode("utf-8"))
        if estimated_size + record_size > max_transcript_size:
            truncated = True
            break
        estimated_size += record_size
        records.append(record)

    records.reverse()
    note = (
        '<p class="notice">La transcripción se limitó para respetar el tamaño del archivo; '
        'puede que no incluya mensajes antiguos.</p>'
        if truncated else ""
    )
    safe_channel = html.escape(channel.name)
    safe_guild = html.escape(channel.guild.name)
    generated_at = html.escape(discord.utils.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"))
    document = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcripción · {safe_channel}</title>
<style>
:root {{ color-scheme: dark; --accent:#8b5cf6; --bg:#111018; --panel:#1b1925; --muted:#aaa5ba; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:24px; background:var(--bg); color:#f5f3ff; font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif; }}
main {{ max-width:1000px; margin:0 auto; }}
h1 {{ color:#c4b5fd; margin-bottom:6px; }}
.meta,.muted {{ color:var(--muted); font-size:12px; }}
.message {{ background:var(--panel); border:1px solid #312b40; border-radius:10px; margin:12px 0; padding:14px 16px; overflow-wrap:anywhere; }}
.message header {{ display:flex; flex-wrap:wrap; gap:8px; align-items:baseline; margin-bottom:8px; }}
.body {{ white-space:normal; }}
.attachments {{ margin:8px 0; padding-left:20px; }}
a {{ color:#c4b5fd; }}
.embedded {{ border-left:3px solid var(--accent); padding:8px 12px; margin-top:8px; background:#14121c; }}
.notice {{ background:#3a2a13; padding:10px; border-radius:8px; }}
footer {{ margin-top:24px; color:var(--muted); font-size:12px; }}
</style>
</head>
<body><main>
<h1>Transcripción del ticket</h1>
<div class="meta">Servidor: {safe_guild} · Canal: {safe_channel} · ID: {channel.id}<br>Generada: {generated_at}</div>
{note}
{''.join(records) if records else '<p>No hay mensajes disponibles en el historial.</p>'}
<footer>Generado por DATASHOP. Los enlaces a adjuntos pertenecen a Discord y pueden requerir permisos de acceso.</footer>
</main></body></html>"""
    return document.encode("utf-8"), len(records)



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
    """Persistent rating controls; custom IDs can be restored after a restart."""

    def __init__(self, guild_id: int, channel_id: int, owner_id: int) -> None:
        super().__init__(timeout=None)
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
            if any(
                isinstance(item, dict) and str(item.get("ticket_id")) == str(self.channel_id)
                for item in ratings
            ):
                await interaction.response.send_message("Ya registraste una valoración para este ticket.")
                return
            ratings.append({
                "ticket_id": self.channel_id,
                "user_id": self.owner_id,
                "rating": score,
                "created_at": discord.utils.utcnow().isoformat(),
            })
            try:
                set_guild_data("ticket_ratings.json", self.guild_id, ratings)
                pending = get_guild_data("pending_ticket_ratings.json", self.guild_id, [])
                if isinstance(pending, list):
                    pending = [
                        row for row in pending
                        if not (isinstance(row, dict) and str(row.get("ticket_id")) == str(self.channel_id))
                    ]
                    set_guild_data("pending_ticket_ratings.json", self.guild_id, pending)
            except RuntimeError:
                await interaction.response.send_message("No pude guardar la valoración. Inténtalo más tarde.")
                return
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
        self._registered_rating_keys: set[tuple[int, int]] = {}

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

    @commands.Cog.listener()
    async def on_ready(self) -> None:
        """Restore outstanding persistent rating views when guild caches are ready."""
        for guild in list(self.bot.guilds):
            try:
                pending = get_guild_data("pending_ticket_ratings.json", guild.id, [])
                if not isinstance(pending, list):
                    pending = []
                ratings = get_guild_data("ticket_ratings.json", guild.id, [])
            except RuntimeError:
                log.exception("No se pudieron recuperar valoraciones de tickets del servidor %s", guild.id)
                continue
            rated = {
                str(row.get("ticket_id"))
                for row in ratings
                if isinstance(row, dict) and row.get("ticket_id") is not None
            } if isinstance(ratings, list) else set()
            known = {
                str(row.get("ticket_id"))
                for row in pending
                if isinstance(row, dict) and row.get("ticket_id") is not None
            }
            changed = False
            # Keep rating IDs for closed tickets that existed before restart-safe views.
            for channel in guild.text_channels:
                owner_id = _ticket_owner(channel)
                if owner_id is None or _topic_value(channel, "DATASHOP_CLOSED") != "1":
                    continue
                if str(channel.id) in rated or str(channel.id) in known:
                    continue
                pending.append({
                    "ticket_id": channel.id,
                    "owner_id": owner_id,
                    "created_at": discord.utils.utcnow().isoformat(),
                })
                known.add(str(channel.id))
                changed = True
            filtered = [
                row for row in pending
                if isinstance(row, dict) and str(row.get("ticket_id")) not in rated
            ]
            if changed or len(filtered) != len(pending):
                try:
                    set_guild_data("pending_ticket_ratings.json", guild.id, filtered)
                except RuntimeError:
                    log.exception("No se pudieron guardar valoraciones pendientes del servidor %s", guild.id)
            for row in filtered:
                try:
                    channel_id = int(row.get("ticket_id", 0))
                    owner_id = int(row.get("owner_id", 0))
                except (TypeError, ValueError):
                    continue
                key = (guild.id, channel_id)
                if channel_id <= 0 or owner_id <= 0 or key in self._registered_rating_keys:
                    continue
                self.bot.add_view(TicketRatingView(guild.id, channel_id, owner_id))
                self._registered_rating_keys.add(key)

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
        if owner_id and owner is None:
            try:
                owner = await channel.guild.fetch_member(owner_id)
            except discord.HTTPException:
                owner = None
        if owner:
            await channel.set_permissions(owner, view_channel=False, send_messages=False)
        topic = _set_topic_value(channel, "DATASHOP_CLOSED", "1")
        new_name = channel.name if channel.name.startswith("cerrado-") else f"cerrado-{channel.name}"
        await channel.edit(name=new_name[:100], topic=topic)
        await channel.send(f"🔒 Ticket cerrado por {member.mention}.")
        await self._log_ticket_event(channel.guild, "Ticket cerrado", channel, member)
        if owner:
            rating_view = TicketRatingView(channel.guild.id, channel.id, owner.id)
            key = (channel.guild.id, channel.id)
            if key not in self._registered_rating_keys:
                self.bot.add_view(rating_view)
                self._registered_rating_keys.add(key)
            try:
                pending = get_guild_data("pending_ticket_ratings.json", channel.guild.id, [])
                if not isinstance(pending, list):
                    pending = []
                if not any(
                    isinstance(row, dict) and str(row.get("ticket_id")) == str(channel.id)
                    for row in pending
                ):
                    pending.append({
                        "ticket_id": channel.id,
                        "owner_id": owner.id,
                        "created_at": discord.utils.utcnow().isoformat(),
                    })
                    set_guild_data("pending_ticket_ratings.json", channel.guild.id, pending)
            except RuntimeError:
                log.exception("Se cerró el ticket %s, pero no se pudo guardar la valoración pendiente", channel.id)
            try:
                await owner.send(
                    f"Tu ticket **{channel.name}** en **{channel.guild.name}** se ha cerrado. "
                    "Valora la atención del 1 al 5:",
                    view=rating_view,
                )
            except discord.HTTPException:
                log.info("No se pudo enviar por DM la valoración del ticket %s", channel.id)

    async def reopen_channel(self, channel: discord.TextChannel, member: discord.Member) -> None:
        owner_id = _ticket_owner(channel)
        owner = channel.guild.get_member(owner_id) if owner_id else None
        if owner_id and owner is None:
            try:
                owner = await channel.guild.fetch_member(owner_id)
            except discord.HTTPException:
                owner = None
        if owner:
            await channel.set_permissions(
                owner,
                view_channel=True,
                send_messages=_topic_value(channel, "DATASHOP_LOCKED") != "1",
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

    @ticket.command(name="delete", description="Archiva la transcripción HTML en logs y elimina el ticket cerrado.")
    async def delete_ticket(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede eliminar tickets.")
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

        try:
            payload, message_count = await _build_html_transcript(channel, limit=1000)
        except discord.HTTPException:
            await send_context(ctx, "No pude leer el historial. El ticket no se eliminó.")
            return

        transcript_file = discord.File(
            io.BytesIO(payload),
            filename=f"ticket-{channel.id}-transcript.html",
        )
        try:
            await logs_channel.send(
                content=f"Transcripción HTML del ticket {channel.name} (ID {channel.id}, {message_count} mensajes).",
                file=transcript_file,
                allowed_mentions=discord.AllowedMentions.none(),
            )
        except discord.HTTPException:
            await send_context(ctx, "No pude guardar la transcripción en logs. El ticket no se eliminó.")
            return

        await send_context(ctx, "Transcripción HTML guardada en logs; eliminando el ticket.")
        try:
            await channel.delete(reason=f"Ticket eliminado por {ctx.author} tras guardar transcript")
        except discord.HTTPException:
            await send_context(ctx, "La transcripción está guardada, pero Discord no permitió eliminar el canal.")

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

    @ticket.group(name="control", description="Bloquea, desbloquea y fija mensajes del ticket.", invoke_without_command=True)
    async def ticket_control(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa ticket control lock, ticket control unlock o ticket control pin.")

    @ticket_control.command(name="lock", description="Bloquea temporalmente las respuestas del cliente.")
    async def lock_ticket(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede bloquear el ticket.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1":
            await send_context(ctx, "Este ticket ya está cerrado.")
            return
        if _topic_value(ctx.channel, "DATASHOP_LOCKED") == "1":
            await send_context(ctx, "Este ticket ya está bloqueado.")
            return
        owner_id = _ticket_owner(ctx.channel)
        owner = ctx.guild.get_member(owner_id) if owner_id else None
        if owner_id and owner is None:
            try:
                owner = await ctx.guild.fetch_member(owner_id)
            except discord.HTTPException:
                owner = None
        if owner is None:
            await send_context(ctx, "No pude localizar al cliente para bloquear sus permisos. No se cambió el ticket.")
            return
        try:
            overwrite = ctx.channel.overwrites_for(owner)
            overwrite.view_channel = True
            overwrite.send_messages = False
            overwrite.read_message_history = True
            await ctx.channel.set_permissions(
                owner, overwrite=overwrite, reason=f"Ticket bloqueado por {ctx.author}"
            )
            await ctx.channel.edit(
                topic=_set_topic_value(ctx.channel, "DATASHOP_LOCKED", "1"),
                reason=f"Ticket bloqueado por {ctx.author}",
            )
        except discord.HTTPException:
            await send_context(ctx, "No pude bloquear el ticket. Comprueba mis permisos.")
            return
        await self._log_ticket_event(ctx.guild, "Ticket bloqueado", ctx.channel, ctx.author)
        await send_context(ctx, "🔒 Ticket bloqueado; el cliente no puede escribir hasta que el personal lo desbloquee.")

    @ticket_control.command(name="unlock", description="Permite de nuevo que el cliente responda.")
    async def unlock_ticket(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede desbloquear el ticket.")
            return
        if _topic_value(ctx.channel, "DATASHOP_CLOSED") == "1":
            await send_context(ctx, "Reabre el ticket antes de permitir respuestas.")
            return
        if _topic_value(ctx.channel, "DATASHOP_LOCKED") != "1":
            await send_context(ctx, "Este ticket no está bloqueado.")
            return
        owner_id = _ticket_owner(ctx.channel)
        owner = ctx.guild.get_member(owner_id) if owner_id else None
        if owner_id and owner is None:
            try:
                owner = await ctx.guild.fetch_member(owner_id)
            except discord.HTTPException:
                owner = None
        if owner is None:
            await send_context(ctx, "No pude localizar al cliente para restaurar sus permisos. No se cambió el ticket.")
            return
        try:
            overwrite = ctx.channel.overwrites_for(owner)
            overwrite.view_channel = True
            overwrite.send_messages = True
            overwrite.read_message_history = True
            await ctx.channel.set_permissions(
                owner, overwrite=overwrite, reason=f"Ticket desbloqueado por {ctx.author}"
            )
            await ctx.channel.edit(
                topic=_set_topic_value(ctx.channel, "DATASHOP_LOCKED", None),
                reason=f"Ticket desbloqueado por {ctx.author}",
            )
        except discord.HTTPException:
            await send_context(ctx, "No pude desbloquear el ticket. Comprueba mis permisos.")
            return
        await self._log_ticket_event(ctx.guild, "Ticket desbloqueado", ctx.channel, ctx.author)
        await send_context(ctx, "🔓 El cliente ya puede responder otra vez.")

    @ticket_control.command(name="pin", description="Fija el primer mensaje del ticket.")
    async def pin_ticket(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede fijar mensajes.")
            return
        if ctx.guild.me is None or not ctx.guild.me.guild_permissions.manage_messages:
            await send_context(ctx, "Necesito el permiso Gestionar mensajes para fijar el mensaje.")
            return
        try:
            first_message = None
            async for message in ctx.channel.history(limit=20, oldest_first=True):
                first_message = message
                break
            if first_message is None:
                await send_context(ctx, "Este ticket no contiene mensajes para fijar.")
                return
            await first_message.pin(reason=f"Mensaje inicial fijado por {ctx.author}")
        except discord.HTTPException:
            await send_context(ctx, "No pude fijar el mensaje inicial. Revisa mis permisos.")
            return
        await self._log_ticket_event(ctx.guild, "Mensaje inicial fijado", ctx.channel, ctx.author)
        await send_context(ctx, "📌 Mensaje inicial del ticket fijado.")

    @ticket.command(name="transcript", description="Genera una transcripción HTML segura del ticket.")
    async def transcript(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or not _is_ticket(ctx.channel):
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not self.is_staff(ctx.author, ctx.channel):
            await send_context(ctx, "Solo el personal asignado a esta ruta puede generar transcripciones.")
            return
        try:
            payload, message_count = await _build_html_transcript(ctx.channel, limit=1000)
        except discord.HTTPException:
            await send_context(ctx, "No pude leer el historial del ticket. No se generó la transcripción.")
            return
        file = discord.File(io.BytesIO(payload), filename=f"ticket-{ctx.channel.id}-transcript.html")
        await send_context(
            ctx,
            f"Transcripción HTML generada ({message_count} mensajes).",
            file=file,
            ephemeral=ctx.interaction is not None,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Tickets(bot))
