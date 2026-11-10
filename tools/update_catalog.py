"""Rebuild catalog.json from the unpacked HOTW character folders."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"character.json", "fullbody.xml", "fullbody.json", "feet.json",
            "materials.json", "colors.json", "thumbnail.png"}
TEXTURE = re.compile(r"(?:textures|pbr)/[a-zA-Z0-9_.-]+\.(?:png|dds)")
SLUG = re.compile(r"[a-z0-9][a-z0-9_-]{0,39}")
MIB = 1024 * 1024


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def entry_for(folder):
    identifier = folder.name
    metadata = json.loads((folder / "character.json").read_bytes())
    require(SLUG.fullmatch(identifier) and identifier != "default", f"Invalid ID: {identifier}")
    require(set(metadata) == {"id", "name", "author"} and metadata["id"] == identifier
            and all(isinstance(metadata[key], str) and 0 < len(metadata[key].strip()) <= 100
                    for key in ("name", "author")), f"Invalid character.json: {folder}")
    files, names, total = [], set(), 0
    for asset in sorted(folder.rglob("*")):
        require(not asset.is_symlink(), f"Symbolic link: {asset}")
        if not asset.is_file():
            continue
        name = asset.relative_to(folder).as_posix()
        require((name in REQUIRED or TEXTURE.fullmatch(name)) and name.lower() not in names,
                f"Invalid or duplicate asset: {asset}")
        size = asset.stat().st_size
        require(0 < size <= (1 if name == "thumbnail.png" else 80) * MIB,
                f"Invalid asset size: {asset}")
        names.add(name.lower())
        total += size
        files.append({"path": name, "size": size, "sha256": hashlib.sha256(asset.read_bytes()).hexdigest()})
    require(REQUIRED <= names and len(files) <= 160 and total <= 220 * MIB,
            f"Missing assets or size limit exceeded: {folder}")
    return {key: metadata[key] for key in ("id", "name", "author")} | {"files": files}


def main():
    output = ROOT / "catalog.json"
    previous = json.loads(output.read_bytes())["characters"] if output.exists() else []
    order = {entry["id"]: index for index, entry in enumerate(previous)}
    folders = sorted((p for p in (ROOT / "characters").iterdir() if p.is_dir()),
                     key=lambda p: (order.get(p.name, len(order)), p.name))
    namespaces = {folder.name.replace("-", "_") for folder in folders}
    require(len(folders) == len(namespaces) and len(folders) <= 250,
            "Character IDs must have unique material namespaces.")
    entries = [entry_for(folder) for folder in folders]
    output.write_bytes((json.dumps({"schema": 1, "characters": entries}, indent=2, ensure_ascii=False) + "\n").encode())
    print(f"Updated catalog.json for {len(entries)} characters.")


if __name__ == "__main__":
    main()
