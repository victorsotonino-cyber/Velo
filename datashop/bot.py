from __future__ import annotations

import logging

import discord
from discord.ext import commands

from datashop.config import Settings

log = logging.getLogger("datashop.bot")


class DataShopBot(commands.Bot):
    def __init__(self, settings: Settings) -> None:
        intents = discord.Intents.default()
        intents.guilds = True
        intents.members = True
        intents.message_content = True
        super().__init__(
            command_prefix=commands.when_mentioned_or(settings.prefix),
            intents=intents,
            case_insensitive=True,
            help_command=None,
        )
        self.settings = settings
        self.tree.on_error = self.on_app_command_error

    async def setup_hook(self) -> None:
        for extension in (
            "datashop.cogs.general",
            "datashop.cogs.moderation",
            "datashop.cogs.tickets",
            "datashop.cogs.store",
            "datashop.cogs.community",
            "datashop.cogs.engagement",
            "datashop.cogs.configuration",
        ):
            await self.load_extension(extension)
            log.info("Módulo cargado: %s", extension)

        if self.settings.guild_id:
            guild = discord.Object(id=self.settings.guild_id)
            # Replace guild-scoped commands left by older versions with this tree.
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            log.info("Comandos slash sincronizados: %s", len(synced))
        else:
            synced = await self.tree.sync()
            log.info("Comandos slash globales sincronizados: %s", len(synced))

    async def on_ready(self) -> None:
        if self.user:
            await self.change_presence(
                activity=discord.Activity(
                    type=discord.ActivityType.watching,
                    name=f"DATASHOP | {self.settings.prefix}help",
                ),
                status=discord.Status.online,
            )
            log.info("Conectado como %s (%s)", self.user, self.user.id)

    async def on_command_error(
        self,
        ctx: commands.Context,
        error: commands.CommandError,
    ) -> None:
        if isinstance(error, commands.CommandNotFound):
            return
        if isinstance(error, commands.NoPrivateMessage):
            message = "Este comando solo se puede usar dentro de un servidor."
        elif isinstance(error, commands.MissingPermissions):
            message = "No tienes los permisos necesarios para ese comando."
        elif isinstance(error, commands.BotMissingPermissions):
            message = "No tengo los permisos necesarios para completar esa acción."
        elif isinstance(error, commands.BadArgument):
            message = "No pude interpretar uno de los argumentos. Revisa el uso del comando."
        elif isinstance(error, commands.CommandOnCooldown):
            message = f"Espera {error.retry_after:.1f} segundos antes de volver a intentarlo."
        elif isinstance(error, commands.CommandInvokeError):
            log.error("Error ejecutando comando %s", ctx.command, exc_info=error.original)
            message = "El comando falló. Revisa los permisos y vuelve a intentarlo."
        else:
            log.error("Error de comando", exc_info=error)
            message = "No se pudo ejecutar el comando."
        try:
            if ctx.interaction is not None:
                await ctx.send(message, ephemeral=True)
            else:
                await ctx.send(message)
        except (discord.HTTPException, discord.InteractionResponded):
            pass

    async def on_app_command_error(
        self,
        interaction: discord.Interaction,
        error: discord.app_commands.AppCommandError,
    ) -> None:
        if isinstance(error, discord.app_commands.CheckFailure):
            message = "No tienes permiso para usar este comando."
        elif isinstance(error, discord.app_commands.CommandOnCooldown):
            message = f"Espera {error.retry_after:.1f} segundos antes de volver a intentarlo."
        else:
            log.error(
                "Error en comando slash %s",
                interaction.command.qualified_name if interaction.command else "desconocido",
                exc_info=error,
            )
            message = "No se pudo ejecutar el comando. Revisa los permisos del bot."
        try:
            if interaction.response.is_done():
                await interaction.followup.send(message, ephemeral=True)
            else:
                await interaction.response.send_message(message, ephemeral=True)
        except discord.HTTPException:
            pass
