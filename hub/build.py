# Hands on the Wheel (HOTW)
# Copyright (c) 2026 1Matzh. All rights reserved.
# Unauthorized copying, modification, redistribution, reuse or sale is prohibited.
# Written permission from 1Matzh is required. See LICENSE or hotw/code-license.txt.
"""Build the portable Hub for the host operating system."""
import argparse
from pathlib import Path
import os
import subprocess
import sys

from app import VERSION, app_icon


def build(output):
    from PIL import Image

    here = Path(__file__).resolve().parent
    icon = app_icon()
    output.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile', '--noupx',
               '--paths', str(here.parent), '--distpath', str(output),
               '--workpath', str(output / 'work'), '--specpath', str(output),
               '--exclude-module', 'PIL', '--exclude-module', 'numpy',
               '--exclude-module', 'psutil', '--exclude-module', 'cryptography']
    for asset in (icon, *(here / name for name in ('index.html', 'hub.css', 'hub.js'))):
        command.extend(['--add-data', f'{asset}:.'])
    if sys.platform == 'win32':
        name = 'HOTW-Hub'
        icon_file = output / 'HOTW-Hub.ico'
        with Image.open(icon) as image:
            image.convert('RGBA').save(icon_file, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        command.extend(['--windowed', '--icon', str(icon_file)])
        for module in ('PySide6', 'PyQt6', 'PySide2', 'PyQt5', 'gi', 'cefpython3'):
            command.extend(['--exclude-module', module])
    elif sys.platform == 'linux':
        name = 'HOTW-Hub-linux-x86_64'
        command.extend(['--hidden-import', 'webview.platforms.qt', '--hidden-import', 'PySide6.QtWebEngineWidgets'])
    else:
        raise SystemExit('Build HOTW Hub on Windows or Linux.')
    env = os.environ.copy()
    vendor = here.parent / 'vendor' / 'hub'
    if vendor.is_dir():
        env['PYTHONPATH'] = os.pathsep.join(filter(None, (str(vendor), env.get('PYTHONPATH'))))
    print(f'Building HOTW Hub {VERSION}', flush=True)
    subprocess.run(command + ['--name', name, str(here / 'app.py')], env=env, check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    build(parser.parse_args().output.resolve())
