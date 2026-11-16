# HOTW Hub

Character catalog for Hands on the Wheel for BeamNG.drive.

## Getting started

Open **Characters → Download more characters** in HOTW. The mod serves the Hub locally in your browser and installs characters into `hotw/characters` in your BeamNG user folder. Keep BeamNG.drive open while using the Hub.

Use a modern browser on Windows or Linux (Steam Deck: Desktop Mode). If the browser does not open automatically, use **Copy connection link** in the game and paste it into your browser. The connection link belongs to your current game session; keep it private.

The Hub uses the game's language by default. A language chosen in Hub settings is saved separately in `hotw/hub-preferences.json`.

## Local character

Put your game-ready character in `<BeamNG user folder>/hotw/characters/<id>/`. Use a unique ID of up to 40 lowercase letters, digits, hyphens, and underscores, starting with a letter or digit. The folder must contain `character.json`, `fullbody.xml`, `fullbody.json`, `feet.json`, `materials.json`, `colors.json`, `thumbnail.png`, and its textures. The rig and material paths must follow the [character submission guide](https://github.com/1Matzh/hotw-hub/blob/characters/README.md).

For example, `hotw/characters/my-driver/character.json` contains:

```json
{"id": "my-driver", "name": "My Driver", "author": "Your name"}
```

Open **Characters** in HOTW to reload the game list, and open **Installed** in the Hub to see the local character. No catalog entry, SHA-256 hashes, or `hotw-installed.json` file is needed. Local characters are labeled **Local**. Keep editing or removing these folders yourself; the Hub preserves your source files and does not replace them with catalog downloads. After changing a loaded model, restart the game or add/change the optional `revision` value in its local `character.json` and reopen Characters to reload it.

## Contributing

- **Application:** open pull requests against `main`.
- **Characters:** follow the [submission guide](https://github.com/1Matzh/hotw-hub/blob/characters/README.md) and open pull requests against `characters`.

## Development

The `hub/` directory contains the interface bundled with the mod and served by its local Lua connection. Interface updates ship with HOTW. Character assets and contribution instructions live on the [characters branch](https://github.com/1Matzh/hotw-hub/tree/characters); adding a character does not require a mod update.

## License

HOTW Hub source code is licensed under [MIT](LICENSE). The HOTW name and logo, character assets, and third-party dependencies retain their respective ownership and licenses.
