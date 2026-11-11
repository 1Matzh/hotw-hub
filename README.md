# HOTW Hub

Portable character manager for Hands on the Wheel for BeamNG.drive.

## Getting started

Download the app from [Releases](https://github.com/1Matzh/hotw-hub/releases). No installation is required.

- **Windows:** open `HOTW-Hub.exe`.
- **Linux / Steam Deck:** allow `HOTW-Hub-linux-x86_64` to run as a program, then open it. On Steam Deck, use Desktop Mode.

When prompted, select your BeamNG user folder containing `settings` and `mods`. Characters are stored in `hotw/characters` inside that folder.

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

## Build

Build on the operating system you are targeting with Python 3.10 or later.

```sh
python -m pip install -r hub/requirements.txt
python hub/build.py dist
```

## License

HOTW Hub source code is licensed under [MIT](LICENSE). The HOTW name and logo, character assets, and third-party dependencies retain their respective ownership and licenses.
