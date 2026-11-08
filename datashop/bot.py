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
            "datashop.cogs.templane",
            "datashop.cogs.welcome",
        ):
            await self.load_extension(extension)
            log.info("Módulo cargado: %s", extension)

        log.info("Registro slash desactivado: DATASHOP utiliza únicamente comandos con prefijo %s.", self.settings.prefix)

    async def sync_application_commands(self) -> None:
        """
        Synchronize one command scope at a time.

        Guild mode removes stale global registrations before serving the guild
        copy. This prevents old global commands from appearing beside the
        current guild commands after a previous deployment.
        """
        scope = self.settings.command_sync_scope
        if scope == "auto":
            scope = "guild" if self.settings.guild_id is not None else "global"

        if scope == "guild":
            if not self.settings.guild_id:
                log.error("COMMAND_SYNC_SCOPE=guild requiere GUILD_ID; no se publicarán comandos globales como fallback.")
                return

            guild = discord.Object(id=self.settings.guild_id)
            try:
                self.tree.copy_global_to(guild=guild)
                synced = await self.tree.sync(guild=guild)

                # Remove stale global commands left by earlier global deployments.
                self.tree.clear_commands(guild=None)
                removed_global = await self.tree.sync()
                log.info(
                    "Comandos sincronizados: %s en servidor %s; comandos globales retirados: %s.",
                    len(synced),
                    guild.id,
                    len(removed_global),
                )
            except discord.HTTPException:
                log.exception(
                    "No se pudieron sincronizar comandos en GUILD_ID=%s. "
                    "Comprueba el ID, la invitación y el scope applications.commands. "
                    "No haré fallback global para evitar duplicar comandos.",
                    guild.id,
                )
            return

        # If a server ID is supplied while global mode is selected, clear
        # that server's old scoped registrations before publishing globally.
        if self.settings.guild_id:
            guild = discord.Object(id=self.settings.guild_id)
            try:
                self.tree.clear_commands(guild=guild)
                removed_guild = await self.tree.sync(guild=guild)
                log.info(
                    "Comandos específicos antiguos retirados del servidor %s: %s.",
                    guild.id,
                    len(removed_guild),
                )
            except discord.HTTPException:
                log.exception(
                    "No se pudieron retirar los comandos antiguos del servidor %s.",
                    guild.id,
                )

        try:
            synced = await self.tree.sync()
            log.info("Comandos slash globales sincronizados: %s", len(synced))
        except discord.HTTPException:
            log.exception(
                "No se pudieron sincronizar los comandos slash globales. "
                "DATASHOP seguirá arrancando; los comandos por prefijo permanecen disponibles."
            )

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
            if ctx.guild is not None and ctx.message.content.startswith(self.settings.prefix):
                try:
                    await ctx.send("❌ Este comando no está registrado en DATASHOP. Usa `!help` para ver los comandos disponibles.")
                except discord.HTTPException:
                    pass
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
