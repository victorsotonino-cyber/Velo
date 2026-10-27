from __future__ import annotations

import copy
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def data_directory() -> Path:
    path = Path(os.getenv("DATASHOP_DATA_DIR", "./data")).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _file_path(filename: str) -> Path:
    if Path(filename).name != filename or not filename.endswith(".json"):
        raise ValueError("El nombre de archivo debe ser un nombre JSON simple.")
    return data_directory() / filename


def read_json(filename: str, default: Any) -> Any:
    path = _file_path(filename)
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except FileNotFoundError:
        return copy.deepcopy(default)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"No se pudo leer {filename}: {exc}") from exc


def write_json(filename: str, value: Any) -> None:
    path = _file_path(filename)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as stream:
            temporary_name = stream.name
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary_name, path)
    except OSError as exc:
        if temporary_name:
            try:
                Path(temporary_name).unlink(missing_ok=True)
            except OSError:
                pass
        raise RuntimeError(f"No se pudo guardar {filename}: {exc}") from exc


def get_guild_data(filename: str, guild_id: int, default: Any) -> Any:
    if guild_id <= 0:
        raise ValueError("guild_id no es válido.")
    all_data = read_json(filename, {})
    if not isinstance(all_data, dict):
        raise RuntimeError(f"El contenido de {filename} debe ser un objeto JSON.")
    return copy.deepcopy(all_data.get(str(guild_id), default))


def set_guild_data(filename: str, guild_id: int, value: Any) -> None:
    if guild_id <= 0:
        raise ValueError("guild_id no es válido.")
    all_data = read_json(filename, {})
    if not isinstance(all_data, dict):
        all_data = {}
    all_data[str(guild_id)] = value
    write_json(filename, all_data)
