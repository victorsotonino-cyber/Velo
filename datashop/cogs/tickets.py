from __future__ import annotations

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


def _get_settings(guild_id: int) -> dict:
    value = get_guild_data("settings.json", guild_id, {})
    return value if isinstance(value, dict) else {}


def _ticket_owner(channel: discord.TextChannel) -> int | None:
    for part in (channel.topic or "").split(";"):
        if part.startswith("DATASHOP_OWNER="):
            try:
                return int(part.split("=", 1)[1])
            except ValueError:
                return None
    return None


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
        if _ticket_owner(interaction.channel) is None:
            await interaction.response.send_message("Este canal no parece ser un ticket de DATASHOP.", ephemeral=True)
            return
        if not _is_staff(interaction.user) and interaction.user.id != _ticket_owner(interaction.channel):
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

    async def create_ticket(
        self,
        guild: discord.Guild,
        member: discord.Member,
    ) -> discord.TextChannel | None:
        existing = [
            channel for channel in guild.text_channels
            if channel.topic
            and f"DATASHOP_OWNER={member.id}" in channel.topic
            and "DATASHOP_CLOSED=1" not in channel.topic
        ]
        if existing:
            return None

        settings = _get_settings(guild.id)
        category_id = settings.get("ticket_category_id") or self.bot.settings.ticket_category_id
        category = guild.get_channel(int(category_id)) if category_id else None
        support_role_id = settings.get("staff_role_id") or self.bot.settings.staff_role_id
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
            topic=f"DATASHOP_OWNER={member.id}",
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
        topic = channel.topic or ""
        new_topic = (topic + ";DATASHOP_CLOSED=1").strip(";") if "DATASHOP_CLOSED=1" not in topic else topic
        new_name = f"cerrado-{channel.name}"[:95] if not channel.name.startswith("cerrado-") else channel.name
        await channel.edit(name=new_name, topic=new_topic)
        await channel.send(f"🔒 Ticket cerrado por {member.mention}.")

    @commands.hybrid_group(name="ticket", description="Configura y administra los tickets.", invoke_without_command=True)
    @commands.guild_only()
    async def ticket(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa ticket setup, ticket close o ticket add.")

    @ticket.command(name="setup", description="Publica el panel de tickets en este canal.")
    async def setup_panel(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member) or not ctx.author.guild_permissions.manage_guild:
            await send_context(ctx, "Necesitas Gestionar servidor para publicar el panel.")
            return
        embed = discord.Embed(
            title="DATASHOP • Centro de soporte",
            description="Pulsa el botón para abrir un canal privado con el equipo de soporte.",
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
        if author is None or (not _is_staff(author) and author.id != owner_id):
            await send_context(ctx, "Solo el creador del ticket o el personal puede cerrarlo.")
            return
        await self.close_channel(ctx.channel, author)
        await send_context(ctx, "Ticket cerrado.", ephemeral=ctx.interaction is not None)

    @ticket.command(name="add", description="Da acceso al ticket actual a un miembro.")
    async def add_member(self, ctx: commands.Context, member: discord.Member) -> None:
        if not isinstance(ctx.channel, discord.TextChannel) or _ticket_owner(ctx.channel) is None:
            await send_context(ctx, "Usa este comando dentro de un ticket de DATASHOP.")
            return
        if not isinstance(ctx.author, discord.Member) or not _is_staff(ctx.author):
            await send_context(ctx, "Solo el personal puede añadir miembros al ticket.")
            return
        await ctx.channel.set_permissions(member, view_channel=True, send_messages=True, read_message_history=True)
        await send_context(ctx, f"✅ {member.mention} ahora tiene acceso al ticket.")


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Tickets(bot))
