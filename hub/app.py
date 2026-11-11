# Hands on the Wheel (HOTW)
# Copyright (c) 2026 1Matzh
# SPDX-License-Identifier: MIT
"""Portable character manager for Hands on the Wheel."""
import base64
import json
import os
from pathlib import Path
import re
import sys
from threading import Lock
from urllib.request import Request, build_opener
import webbrowser

if not getattr(sys, 'frozen', False):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hotw_character_catalog import (CatalogError, Library, NoRedirect, SLUG, asset, fetch,
                                    own_path, parse_catalog, require)


VERSION = '0.1.0'
REPOSITORY = 'https://github.com/1Matzh/hotw-hub'
RELEASE_API = 'https://api.github.com/repos/1Matzh/hotw-hub/releases/latest'
RESOURCES = Path(__file__).resolve().parent
THUMBNAIL_LIMIT = 1024 * 1024


def app_icon():
    return RESOURCES / 'app_icon.png'


def detect_profile():
    executable = Path(sys.executable) if getattr(sys, 'frozen', False) else None
    if executable and executable.parent.name.lower() == 'characters' and executable.parents[1].name.lower() == 'hotw':
        return executable.parents[2].resolve()
    if sys.platform == 'win32':
        base = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local'))
        candidates = [base / 'BeamNG/BeamNG.drive/current']
    else:
        data = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
        candidates = [data / 'BeamNG/BeamNG.drive/current', data / 'BeamNG.drive/current',
                      data / 'Steam/steamapps/compatdata/284160/pfx/drive_c/users/steamuser/AppData/Local/BeamNG/BeamNG.drive/current']
    profiles = {path.resolve() for path in candidates if (path / 'settings').is_dir()}
    return next(iter(profiles)) if len(profiles) == 1 else None


def image_url(data):
    return 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')


def latest_version():
    request = Request(RELEASE_API, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'HOTW-Hub'})
    try:
        with build_opener(NoRedirect()).open(request, timeout=6) as response:
            release = json.loads(response.read(256 * 1024))
        tag = release['tag_name']
        match = re.fullmatch(r'v(\d{1,4}\.\d{1,4}\.\d{1,4})', tag)
        if match and not release.get('draft') and not release.get('prerelease'):
            if tuple(map(int, match[1].split('.'))) > tuple(map(int, VERSION.split('.'))):
                return tag
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


class Hub:
    def __init__(self):
        self._library = None
        self._window = None
        self._lock = Lock()
        self._transfer_lock = Lock()
        self._transfer = None
        self._maximized = False
        self._release = None

    def initialize(self):
        path = detect_profile()
        if path is None:
            return self._snapshot()
        try:
            self._library = Library(path)
            return self._snapshot()
        except (CatalogError, OSError) as error:
            return {**self._snapshot(), 'error': str(error)}

    def choose_profile(self):
        import webview
        folder = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        if folder:
            with self._lock:
                self._library = Library(Path(folder[0]).resolve())
                return self._snapshot()
        return None

    def refresh(self):
        with self._lock:
            library = self._current_library()
            library.catalog = parse_catalog(fetch('catalog.json', 4 * 1024 * 1024))
            return self._snapshot()

    def _current_library(self):
        require(self._library is not None, 'Choose your BeamNG user folder first.')
        return self._library

    def _snapshot(self):
        library = self._library
        if library is None:
            return {'profile': None, 'catalog': [], 'installed': []}
        installed = {}
        for folder in sorted(library.characters.iterdir()):
            if not folder.is_dir() or folder.name == 'default' or not SLUG.fullmatch(folder.name):
                continue
            try:
                library.owned_files(own_path(folder))
                details = json.loads((folder / 'character.json').read_bytes())
                name, author = details['name'], details['author']
                if isinstance(name, str) and isinstance(author, str):
                    installed[folder.name] = {'id': folder.name, 'name': name, 'author': author}
            except (CatalogError, OSError, KeyError, ValueError, TypeError):
                continue
        catalog = []
        for entry in library.catalog.values():
            slug = entry['id']
            available = slug in installed and library.update_available(entry)
            catalog.append({**{key: entry[key] for key in ('id', 'name', 'author', 'sizeBytes')},
                            'installed': slug in installed, 'updateAvailable': available})
            if slug in installed:
                installed[slug]['updateAvailable'] = available
        return {'profile': str(library.hotw.parent), 'catalog': catalog, 'installed': list(installed.values())}

    def portrait(self, slug, local):
        library = self._current_library()
        require(isinstance(slug, str) and SLUG.fullmatch(slug) and slug != 'default', 'Invalid character.')
        if local:
            target = own_path(library.characters / slug)
            library.owned_files(target)
            path = target / 'thumbnail.png'
            require(path.stat().st_size <= THUMBNAIL_LIMIT, 'Character portrait exceeds the size limit.')
            return image_url(path.read_bytes())
        file = library.entry(slug)['files']['thumbnail.png']
        require(file[1] <= THUMBNAIL_LIMIT, 'Character portrait exceeds the size limit.')
        return image_url(asset(slug, file))

    def change(self, slug, action):
        require(isinstance(slug, str) and SLUG.fullmatch(slug) and slug != 'default', 'Invalid character.')
        with self._lock:
            library = self._current_library()
            if action == 'remove':
                notified = library.uninstall(slug)
            elif action in ('download', 'update'):
                with self._transfer_lock:
                    self._transfer = {'received': 0, 'total': library.entry(slug)['sizeBytes']}
                try:
                    notified = library.install(slug, update=action == 'update', progress=self._received)
                finally:
                    with self._transfer_lock:
                        self._transfer = None
            else:
                raise CatalogError('Unknown character action.')
            state = self._snapshot()
            if not notified:
                state['notice'] = 'Change saved. Reopen Characters in BeamNG to reload the list.'
            return state

    def _received(self, count):
        with self._transfer_lock:
            self._transfer['received'] += count

    def download_progress(self):
        with self._transfer_lock:
            return self._transfer.copy() if self._transfer else None

    def window_action(self, action):
        if action == 'minimize':
            self._window.minimize()
        elif action == 'maximize':
            maximized = not self._maximized
            if maximized:
                self._window.maximize()
            else:
                self._window.restore()
            self._maximized = maximized
            return maximized
        elif action == 'close':
            self._window.destroy()

    def _set_maximized(self, value):
        self._maximized = value
        self._window.run_js(f'window.dispatchEvent(new CustomEvent("hotw-window-state", {{detail: {str(value).lower()}}}))')

    def check_update(self):
        self._release = latest_version()
        return self._release

    def open_release(self):
        if self._release:
            webbrowser.open(REPOSITORY + '/releases/tag/' + self._release)

    def open_source(self):
        webbrowser.open(REPOSITORY)


def main():
    if sys.platform == 'linux':
        os.environ.setdefault('QT_API', 'pyside6')
    import webview

    hub = Hub()
    html = (RESOURCES / 'index.html').read_text(encoding='utf-8')
    html = html.replace('/* HOTW_STYLES */', (RESOURCES / 'hub.css').read_text(encoding='utf-8'))
    html = html.replace('/* HOTW_SCRIPT */', (RESOURCES / 'hub.js').read_text(encoding='utf-8'))
    icon = app_icon()
    html = html.replace('<!-- HOTW_ICONS -->', (RESOURCES / 'icons.svg').read_text(encoding='utf-8'))
    html = html.replace('HOTW_ICON', 'data:image/png;base64,' + base64.b64encode(icon.read_bytes()).decode())
    font = base64.b64encode((RESOURCES / 'InterVariable.woff2').read_bytes()).decode()
    html = html.replace('HOTW_FONT', 'data:font/woff2;base64,' + font)
    html = html.replace('HOTW_VERSION', VERSION)
    hub._window = webview.create_window('HOTW Hub', html=html, js_api=hub, width=960, height=660,
                                       min_size=(570, 480), background_color='#171c24',
                                       frameless=True, easy_drag=False)
    hub._window.events.maximized += lambda: hub._set_maximized(True)
    hub._window.events.restored += lambda: hub._set_maximized(False)
    webview.start(gui='edgechromium' if sys.platform == 'win32' else 'qt',
                  icon=str(icon), private_mode=True)


if __name__ == '__main__':
    main()
