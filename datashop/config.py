from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _optional_id(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    if not raw.isdigit():
        raise ValueError(f"{name} debe ser un ID numérico de Discord.")
    return int(raw)


@dataclass(frozen=True, slots=True)
class Settings:
    token: str
    prefix: str
    guild_id: int | None
    port: int
    data_dir: Path
    welcome_channel_id: int | None
    logs_channel_id: int | None
    ticket_category_id: int | None
    staff_role_id: int | None
    member_role_id: int | None
    currency: str

    @classmethod
    def from_env(cls) -> "Settings":
        raw_port = os.getenv("PORT", "10000").strip()
        try:
            port = int(raw_port)
        except ValueError as exc:
            raise ValueError("PORT debe ser un número.") from exc
        if not 1 <= port <= 65535:
            raise ValueError("PORT debe estar entre 1 y 65535.")

        data_dir = Path(os.getenv("DATASHOP_DATA_DIR", "./data")).expanduser()
        if not data_dir.is_absolute():
            data_dir = Path.cwd() / data_dir

        prefix = os.getenv("BOT_PREFIX", "!").strip() or "!"
        if len(prefix) > 5 or any(ch.isspace() for ch in prefix):
            raise ValueError("BOT_PREFIX debe tener entre 1 y 5 caracteres sin espacios.")

        return cls(
            token=os.getenv("DISCORD_TOKEN", "").strip(),
            prefix=prefix,
            guild_id=_optional_id("GUILD_ID"),
            port=port,
            data_dir=data_dir,
            welcome_channel_id=_optional_id("WELCOME_CHANNEL_ID"),
            logs_channel_id=_optional_id("LOGS_CHANNEL_ID"),
            ticket_category_id=_optional_id("TICKETS_CATEGORY_ID"),
            staff_role_id=_optional_id("STAFF_ROLE_ID"),
            member_role_id=_optional_id("MEMBER_ROLE_ID"),
            currency=os.getenv("STORE_CURRENCY", "USD").strip().upper() or "USD",
        )
