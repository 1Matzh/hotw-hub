# HOTW Hub

HOTW Hub is the portable companion to Hands on the Wheel for BeamNG.drive. It installs, updates, and removes character packs for the selected BeamNG user folder. It uses local HTML and CSS in a pywebview window. Character data comes from the [characters branch](https://github.com/1Matzh/hotw-hub/tree/characters).

## Run the Hub

- **Windows x64.** From the HOTW menu, select **Download more characters**, then **Open folder**. Double-click `HOTW-Hub.exe`. The standalone download is also available in [Releases](https://github.com/1Matzh/hotw-hub/releases). The Windows build uses the Microsoft Edge WebView2 Runtime.
- **Linux x86-64 and Steam Deck.** In Desktop Mode, get `HOTW-Hub-linux-x86_64` from Releases. In the file manager, open its properties, enable execution, and open the file. The build uses Qt WebEngine and needs a graphical desktop session. On the command line, use `chmod +x HOTW-Hub-linux-x86_64` before opening it.

If the profile is missing or you use a custom location, use **Choose folder** and select the active BeamNG user folder that contains `settings` and `mods`. The Hub puts character data under `hotw/characters`. After changing your installed characters, select **Refresh installed characters** in the HOTW menu.

The Hub checks GitHub Releases on startup. If a newer stable release is available, the update button opens the release page. Close the Hub before replacing the portable executable.

## Contribute a character

Open your character pull request against the **characters** branch. The [character submission guide](https://github.com/1Matzh/hotw-hub/blob/characters/README.md) explains the folder structure and how to generate the manifest, file sizes, and SHA-256 hashes.

## Build

Build on the operating system you are targeting with Python 3.10 or later.

```sh
python -m pip install -r hub/requirements.txt
python hub/build.py dist
```

The app code is published for inspection. See [LICENSE](LICENSE) for the code usage terms. The packaged Python and WebView dependencies keep their own licenses.
