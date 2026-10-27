from __future__ import annotations

import discord
from discord.ext import commands

from datashop.respond import send_context


class Community(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

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
