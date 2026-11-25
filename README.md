# HOTW Hub

Character catalog for Hands on the Wheel for BeamNG.drive.

## Getting started

Download the addon from [GitHub Releases](https://github.com/1Matzh/hotw-hub/releases/latest). Install `hotw-hub-addon-1.0.0.zip` alongside the standard HOTW ZIP in the BeamNG mods folder and restart the game. Then open **Characters → Download more characters**. Keep BeamNG.drive open while using the Hub.

When a newer addon is available, an **Update addon** button appears in the sidebar above the support heart. Click it to download, verify and replace the addon automatically. The previous addon is kept as a recovery copy. Once the update finishes, restart BeamNG.drive to activate it. The updater only replaces its own addon ZIP; the standard HOTW mod and installed characters are preserved.

Use a modern browser on Windows or Linux (Steam Deck: Desktop Mode). If the browser does not open automatically, use **Copy connection link** in the game and paste it into your browser. The connection link belongs to your current game session; keep it private.

The Hub uses the game's language by default. A language chosen in Hub settings is saved separately in `hotw/hub-preferences.json`.

## Local character

Put your game-ready character in `<BeamNG user folder>/hotw/characters/<id>/`. Use a unique ID of up to 40 lowercase letters, digits, hyphens, and underscores, starting with a letter or digit. The folder must contain `character.json`, `fullbody.xml`, `fullbody.json`, `feet.json`, `materials.json`, `colors.json`, `thumbnail.png`, and its textures. The rig and material paths must follow the [character submission guide](https://github.com/1Matzh/hotw-hub/blob/characters/README.md).

For example, `hotw/characters/my-driver/character.json` contains:

```json
{"id": "my-driver", "name": "My Driver", "authors": ["Your name", "Another author"]}
```

Open **Characters** in HOTW to reload the game list, and open **Installed** in the Hub to see the local character. No catalog entry, SHA-256 hashes, or `hotw-installed.json` file is needed. Local characters are labeled **Local**. Keep editing or removing these folders yourself; the Hub preserves your source files and does not replace them with catalog downloads. After changing a loaded model, restart the game or add/change the optional `revision` value in its local `character.json` and reopen Characters to reload it.

## Contributing

- **Application:** open pull requests against `main`.
- **Characters:** follow the [submission guide](https://github.com/1Matzh/hotw-hub/blob/characters/README.md) and open pull requests against `characters`.

## Character removal requests

If you own a character included in the catalog and would like it removed, please contact [1Matzh on the BeamNG.drive forum](https://www.beamng.com/members/1matzh.835029/).

## Development

The `hub/` directory contains the interface bundled exclusively with the optional addon and served by its local Lua connection. Build it with `Source/tools/Build-HubAddon.ps1`. Character assets and contribution instructions live on the [characters branch](https://github.com/1Matzh/hotw-hub/tree/characters); adding a character does not require a standard mod update.

## License

HOTW Hub source code is licensed under [MIT](LICENSE). The HOTW name and logo, character assets, and third-party dependencies retain their respective ownership and licenses.
