from __future__ import annotations

import asyncio
import logging
from typing import Any

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data

log = logging.getLogger("datashop.community")


def _normalize_legit_votes(raw: object) -> dict[str, str]:
    """Keep one valid yes/no vote per numeric Discord user ID."""
    if not isinstance(raw, dict):
        return {}
    return {
        str(user_id): vote
        for user_id, vote in raw.items()
        if str(user_id).isdigit() and vote in {"yes", "no"}
    }


def _legit_yes_count(raw: object) -> int:
    return sum(vote == "yes" for vote in _normalize_legit_votes(raw).values())


def _legit_embed(guild: discord.Guild, yes_count: int) -> discord.Embed:
    embed = discord.Embed(
        title="✦ ¿ES FLUX STORE LEGIT? ✦",
        description=(
            "Si tu experiencia con la tienda fue positiva, confirma abajo. "
            "Cada persona cuenta una sola vez.\n\n"
            "Puedes actualizar tu respuesta cuando quieras."
        ),
        color=discord.Color.from_str("#7C3AED"),
        timestamp=discord.utils.utcnow(),
    )
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    embed.add_field(
        name="✅ PERSONAS QUE VERIFICARON QUE SOMOS LEGIT",
        value=f"**{yes_count}**",
        inline=False,
    )
    embed.set_footer(text="FLUX STORE • Las respuestas se pueden actualizar")
    return embed


class LegitVoteView(discord.ui.View):
    """Persistent yes/no legitimacy vote panel."""

    def __init__(self, cog: "Community", guild_id: int) -> None:
        super().__init__(timeout=None)
        self.cog = cog
        self.guild_id = guild_id

        yes_button = discord.ui.Button(
            label="Sí",
            emoji="✅",
            style=discord.ButtonStyle.success,
            custom_id=f"datashop:legit:{guild_id}:yes",
            row=0,
        )
        yes_button.callback = self._vote_callback("yes")
        self.add_item(yes_button)

        no_button = discord.ui.Button(
            label="No",
            emoji="❌",
            style=discord.ButtonStyle.danger,
            custom_id=f"datashop:legit:{guild_id}:no",
            row=0,
        )
        no_button.callback = self._vote_callback("no")
        self.add_item(no_button)

    def _vote_callback(self, vote: str):
        async def callback(interaction: discord.Interaction) -> None:
            await self.cog.record_legit_vote(interaction, self.guild_id, vote)
        return callback


class Community(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._legit_vote_lock = asyncio.Lock()
        self._registered_legit_panels: set[tuple[int, int]] = set()

    @commands.Cog.listener()
    async def on_ready(self) -> None:
        """Restore persistent legit panel views for messages saved before a restart."""
        for guild in list(self.bot.guilds):
            try:
                panels = get_guild_data("legit_panels.json", guild.id, {})
            except RuntimeError:
                log.exception("No se pudieron restaurar los paneles legit del servidor %s", guild.id)
                continue
            if not isinstance(panels, dict):
                continue
            for raw_message_id, row in list(panels.items())[-30:]:
                try:
                    message_id = int(raw_message_id)
                    channel_id = int(row.get("channel_id", 0)) if isinstance(row, dict) else 0
                except (TypeError, ValueError):
                    continue
                key = (guild.id, message_id)
                if message_id <= 0 or channel_id <= 0 or key in self._registered_legit_panels:
                    continue
                if not isinstance(guild.get_channel(channel_id), discord.TextChannel):
                    continue
                self.bot.add_view(LegitVoteView(self, guild.id), message_id=message_id)
                self._registered_legit_panels.add(key)

    async def record_legit_vote(
        self,
        interaction: discord.Interaction,
        guild_id: int,
        vote: str,
    ) -> None:
        if (
            interaction.guild is None
            or interaction.guild.id != guild_id
            or interaction.message is None
            or interaction.user.bot
        ):
            await interaction.response.send_message(
                "Este panel solo admite votos de miembros del servidor.",
                ephemeral=True,
            )
            return

        message_id = interaction.message.id
        async with self._legit_vote_lock:
            try:
                panels = get_guild_data("legit_panels.json", guild_id, {})
                if not isinstance(panels, dict):
                    panels = {}
                panel = panels.get(str(message_id))
                if not isinstance(panel, dict):
                    await interaction.response.send_message(
                        "No pude encontrar el registro de este panel. Publica uno nuevo con /legit.",
                        ephemeral=True,
                    )
                    return

                votes = _normalize_legit_votes(panel.get("votes", {}))
                previous_vote = votes.get(str(interaction.user.id))
                votes[str(interaction.user.id)] = vote
                panel["votes"] = votes
                panels[str(message_id)] = panel
                set_guild_data("legit_panels.json", guild_id, panels)
            except RuntimeError:
                log.exception("No se pudo guardar un voto legit en el servidor %s", guild_id)
                await interaction.response.send_message(
                    "No pude guardar tu respuesta. Inténtalo de nuevo más tarde.",
                    ephemeral=True,
                )
                return

        embed = _legit_embed(interaction.guild, _legit_yes_count(votes))
        try:
            await interaction.response.edit_message(embed=embed, view=self._view_for_message(guild_id))
        except discord.HTTPException:
            log.exception("No se pudo actualizar el panel legit %s", message_id)
            return

        if previous_vote == vote:
            confirmation = "Tu respuesta ya estaba registrada."
        elif previous_vote is None:
            confirmation = "Tu respuesta se ha registrado. Gracias por participar."
        else:
            confirmation = "Tu respuesta se ha actualizado correctamente."
        try:
            await interaction.followup.send(confirmation, ephemeral=True)
        except discord.HTTPException:
            log.debug("No se pudo enviar la confirmación privada del voto legit")

    def _view_for_message(self, guild_id: int) -> LegitVoteView:
        return LegitVoteView(self, guild_id)

    @commands.hybrid_command(
        name="legit",
        description="Publica el panel para confirmar la legitimidad de la tienda.",
    )
    @commands.guild_only()
    async def legit_panel(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member) or not (
            ctx.author.guild_permissions.manage_guild
            or ctx.author.guild_permissions.administrator
        ):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para publicar el panel.")
            return

        embed = _legit_embed(ctx.guild, 0)
        view = LegitVoteView(self, ctx.guild.id)
        try:
            if ctx.interaction:
                await ctx.interaction.response.send_message(embed=embed, view=view, ephemeral=False)
                message = await ctx.interaction.original_response()
            else:
                message = await ctx.send(embed=embed, view=view)
        except discord.HTTPException:
            await send_context(ctx, "No pude publicar el panel. Comprueba mis permisos para enviar mensajes y embeds.")
            return

        async with self._legit_vote_lock:
            try:
                panels = get_guild_data("legit_panels.json", ctx.guild.id, {})
                if not isinstance(panels, dict):
                    panels = {}
                panels[str(message.id)] = {
                    "channel_id": ctx.channel.id,
                    "created_at": discord.utils.utcnow().isoformat(),
                    "votes": {},
                }
                if len(panels) > 30:
                    ordered = sorted(
                        panels.items(),
                        key=lambda pair: str(pair[1].get("created_at", "")) if isinstance(pair[1], dict) else "",
                    )
                    panels = dict(ordered[-30:])
                set_guild_data("legit_panels.json", ctx.guild.id, panels)
            except RuntimeError:
                log.exception("El panel legit se publicó, pero no se pudo guardar su registro")
                warning = "⚠️ El panel se publicó, pero no pude guardar su registro persistente."
                if ctx.interaction:
                    await ctx.interaction.followup.send(warning, ephemeral=True)
                else:
                    await ctx.send(warning, delete_after=12)
                return

        self.bot.add_view(view, message_id=message.id)
        self._registered_legit_panels.add((ctx.guild.id, message.id))
        if ctx.interaction:
            await ctx.interaction.followup.send(
                "✅ Panel de reputación publicado. Los votos se guardan y cada miembro puede actualizar su respuesta.",
                ephemeral=True,
            )
        else:
            await ctx.send("✅ Panel de reputación publicado.")


    @commands.hybrid_command(name="suggestion", description="Publica una sugerencia para la comunidad.")
    @commands.guild_only()
    async def suggestion(self, ctx: commands.Context, *, text: str) -> None:
        if not text.strip():
            await send_context(ctx, "Escribe una sugerencia.")
            return
        embed = discord.Embed(
            title="💡 Nueva sugerencia",
            description=text.strip()[:3500],
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_author(name=str(ctx.author), icon_url=ctx.author.display_avatar.url)
        embed.set_footer(text=f"Enviado por {ctx.author.id}")
        message = await ctx.send(embed=embed)
        await message.add_reaction("👍")
        await message.add_reaction("👎")

    @commands.hybrid_command(name="poll", description="Crea una encuesta. Separa las opciones con |.")
    @commands.guild_only()
    async def poll(self, ctx: commands.Context, question: str, *, options: str) -> None:
        choices = [part.strip() for part in options.split("|") if part.strip()]
        if not 2 <= len(choices) <= 10:
            await send_context(ctx, "Incluye de 2 a 10 opciones separadas por |.")
            return
        if len(question) > 220 or any(len(choice) > 80 for choice in choices):
            await send_context(ctx, "La pregunta admite hasta 220 caracteres y cada opción hasta 80.")
            return
        reactions = ("1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟")
        embed = discord.Embed(
            title=f"📊 {question}",
            description="\n".join(f"{reactions[index]} **{choice}**" for index, choice in enumerate(choices)),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_footer(text=f"Encuesta creada por {ctx.author}")
        message = await ctx.send(embed=embed)
        for reaction in reactions[:len(choices)]:
            await message.add_reaction(reaction)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Community(bot))
