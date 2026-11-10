# Hands on the Wheel (HOTW)
# Copyright (c) 2026 1Matzh. All rights reserved.
# Unauthorized copying, modification, redistribution, reuse or sale is prohibited.
# Written permission from 1Matzh is required. See LICENSE or hotw/code-license.txt.
"""Validate and manage character files for HOTW Hub."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from threading import Lock
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree


REMOTE = 'https://raw.githubusercontent.com/1Matzh/hotw-hub/characters/'
SLUG = re.compile(r'[a-z0-9][a-z0-9_-]{0,39}')
TEXTURE = re.compile(r'(?:pbr|textures)/[a-zA-Z0-9_.-]+\.(?:dds|png)')
REQUIRED = {'character.json', 'fullbody.xml', 'fullbody.json', 'feet.json',
            'materials.json', 'colors.json', 'thumbnail.png'}
MARKER = 'hotw-installed.json'
MAX_ASSET = 80 * 1024 * 1024
MAX_CHARACTER = 220 * 1024 * 1024
MATERIAL_FIELDS = {'Stages', 'alphaRef', 'alphaTest', 'castShadows', 'class', 'doubleSided',
                   'dynamicCubemap', 'mapTo', 'materialTag0', 'name', 'version'}
STAGE_FIELDS = {'ambientOcclusionMap', 'baseColorFactor', 'baseColorMap', 'diffuseColor',
                'diffuseMap', 'emissiveFactor', 'emissiveIntensityNits', 'emissiveMap',
                'metallicFactor', 'metallicMap', 'normalMap', 'normalMapStrength',
                'opacityFactor', 'opacityMap', 'roughnessFactor', 'roughnessMap',
                'specular', 'specularPower'}


class CatalogError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def require(condition, message):
    if not condition:
        raise CatalogError(message)


def fetch(path, limit):
    request = Request(REMOTE + path, headers={'User-Agent': 'HOTW-Character-Catalog'})
    try:
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            data = response.read(limit + 1)
    except (URLError, OSError) as error:
        raise CatalogError('Could not download the catalog asset from GitHub.') from error
    require(len(data) <= limit, 'Catalog asset exceeds its size limit.')
    return data


def valid_file(path):
    return isinstance(path, str) and (path in REQUIRED or TEXTURE.fullmatch(path) is not None)


def parse_catalog(raw):
    document = json.loads(raw)
    require(isinstance(document, dict) and document.get('schema') == 1, 'Unsupported catalog format.')
    characters = document.get('characters')
    require(isinstance(characters, list) and len(characters) <= 250, 'Invalid character list.')
    catalog, material_namespaces = {}, set()
    for entry in characters:
        require(isinstance(entry, dict), 'Invalid character entry.')
        name, author, character = (entry.get(key) for key in ('name', 'author', 'id'))
        require(isinstance(character, str) and SLUG.fullmatch(character) and character not in catalog
                and character != 'default', 'Invalid or duplicate character ID.')
        namespace = character.replace('-', '_')
        require(namespace not in material_namespaces, 'Character material namespace is already in use.')
        material_namespaces.add(namespace)
        require(all(isinstance(text, str) and 0 < len(text.strip()) <= 100 for text in (name, author)),
                'Missing character name or credit.')
        assets = entry.get('files')
        require(isinstance(assets, list) and len(assets) <= 160, 'Invalid character asset list.')
        files, total = {}, 0
        for file in assets:
            require(isinstance(file, dict), 'Invalid asset entry.')
            path, size, sha = (file.get(key) for key in ('path', 'size', 'sha256'))
            require(valid_file(path) and path.lower() not in files, 'Invalid or duplicate asset path.')
            require(type(size) is int and 0 < size <= MAX_ASSET, 'Invalid asset size.')
            require(isinstance(sha, str) and re.fullmatch(r'[0-9a-f]{64}', sha), 'Invalid asset hash.')
            files[path.lower()] = (path, size, sha)
            total += size
        require(REQUIRED <= {value[0] for value in files.values()} and total <= MAX_CHARACTER,
                'Character assets are missing or too large.')
        catalog[character] = {'id': character, 'name': name, 'author': author, 'sizeBytes': total, 'files': files}
    return catalog


def asset(character, file):
    path, size, sha = file
    content = fetch(f'characters/{character}/{path}', size)
    require(len(content) == size and hashlib.sha256(content).hexdigest() == sha,
            'An asset changed or failed verification. Refresh the catalog and try again.')
    return content


def revision(files):
    content = json.dumps(sorted(files), separators=(',', ':')).encode()
    return hashlib.sha256(content).hexdigest()


def verify_assets(directory, entry):
    character = entry['id']
    prefix = f'/hotw/characters/{character}/'
    paths = {file[0] for file in entry['files'].values()}
    metadata = json.loads((directory / 'character.json').read_bytes())
    require(metadata == {key: entry[key] for key in ('id', 'name', 'author')}, 'Character metadata differs from its catalog entry.')
    materials = json.loads((directory / 'materials.json').read_bytes())
    require(isinstance(materials, dict) and 0 < len(materials) <= 128, 'Invalid materials.')
    for name, material in materials.items():
        require(re.fullmatch(r'hotw_character_' + re.escape(character.replace('-', '_')) + r'_[a-zA-Z0-9_]+', name)
                and isinstance(material, dict) and material.keys() <= MATERIAL_FIELDS
                and material.get('class') == 'Material' and material.get('name') == name
                and material.get('mapTo') == name, 'Materials must belong to this character.')
        stages = material.get('Stages')
        require(isinstance(stages, list) and 0 < len(stages) <= 4, 'Invalid material stages.')
        for stage in stages:
            require(isinstance(stage, dict) and stage.keys() <= STAGE_FIELDS, 'Unsupported material stage.')
            for key, value in stage.items():
                if key.endswith('Map'):
                    require(isinstance(value, str) and value.startswith(prefix) and value[len(prefix):] in paths,
                            'Materials may only reference this character’s textures.')
    colors = json.loads((directory / 'colors.json').read_bytes())
    require(isinstance(colors, list) and len(colors) <= 128, 'Invalid color entries.')
    for color in colors:
        require(isinstance(color, dict) and color.get('material') in materials
                and color.get('field') in {'baseColorMap', 'diffuseMap'}
                and color.get('group') in {'skin', 'clothing'}, 'Invalid recolor binding.')
        for key in ('source', 'map'):
            value = color.get(key)
            require(isinstance(value, str) and value.startswith(prefix) and value[len(prefix):] in paths,
                    'Recolor textures must belong to this character.')
    for filename, field in (('feet.json', 'contacts'), ('fullbody.json', 'meshes')):
        require(field in json.loads((directory / filename).read_bytes()), 'Missing rig metadata.')
    model = (directory / 'fullbody.xml').read_bytes()
    require(b'<!DOCTYPE' not in model and b'<!ENTITY' not in model, 'External XML declarations are prohibited.')
    root = ElementTree.fromstring(model)
    require(root.tag.endswith('}COLLADA'), 'Invalid Collada model.')
    for element in root.iter():
        for key in ('url', 'target', 'source'):
            value = element.get(key)
            if value and (key != 'target' or element.tag.rsplit('}', 1)[-1].startswith('instance_')):
                require(value.startswith('#'), 'Model references must be internal.')
        if element.tag.endswith('}init_from') and element.text:
            value = element.text.strip()
            require(value in paths or (value.startswith(prefix) and value[len(prefix):] in paths)
                    or re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_-]*', value), 'Invalid model texture reference.')


def own_path(path):
    require(path.resolve() == path, 'The catalog cannot write through symbolic links or junctions.')
    return path


class Library:
    def __init__(self, user_folder):
        require((user_folder / 'settings').is_dir(), 'Select the active BeamNG user folder containing settings.')
        self.hotw = own_path(user_folder / 'hotw')
        self.characters = own_path(self.hotw / 'characters')
        self.characters.mkdir(parents=True, exist_ok=True)
        self.recovery = own_path(self.hotw / 'character-updates')
        self.lock = Lock()
        self.catalog = {}
        if self.recovery.is_dir():
            for previous in self.recovery.iterdir():
                if SLUG.fullmatch(previous.name) and previous.name != 'default':
                    try:
                        self.recover(own_path(self.characters / previous.name))
                    except (CatalogError, OSError, ValueError, TypeError):
                        continue

    def entry(self, character):
        entry = self.catalog.get(character)
        require(entry is not None, 'Refresh the character catalog first.')
        return entry

    def recover(self, target):
        previous = own_path(self.recovery / target.name)
        if previous.exists():
            self.owned_files(previous)
            if not target.exists():
                os.rename(previous, target)
            else:
                self.owned_files(target)
                shutil.rmtree(previous)
        return previous

    def update_available(self, entry):
        with self.lock:
            try:
                target = own_path(self.characters / entry['id'])
                self.recover(target)
                if not (target / MARKER).is_file():
                    return False
                marker = self.owned_files(target)
                files = entry['files'].values()
                if 'revision' in marker:
                    return marker['revision'] != revision(files)
                if set(marker['files']) != {file[0] for file in files}:
                    return True
                return any(not (target / path).is_file() or (target / path).stat().st_size != size
                           or hashlib.sha256((target / path).read_bytes()).hexdigest() != sha
                           for path, size, sha in files)
            except (CatalogError, OSError, ValueError, TypeError):
                return False

    def install(self, character, update=False):
        entry = self.entry(character)
        with self.lock:
            target = own_path(self.characters / character)
            previous = self.recover(target)
            if update:
                self.owned_files(target)
            else:
                require(not target.exists(), 'A character already exists at this location.')
            with tempfile.TemporaryDirectory(prefix='character-', dir=self.hotw) as temporary:
                staging = Path(temporary) / character
                staging.mkdir()

                def copy(file):
                    path = staging / file[0]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(asset(character, file))

                with ThreadPoolExecutor(max_workers=4) as workers:
                    list(workers.map(copy, entry['files'].values()))
                verify_assets(staging, entry)
                (staging / MARKER).write_text(json.dumps({'schema': 1, 'id': character,
                    'files': [file[0] for file in entry['files'].values()],
                    'revision': revision(entry['files'].values())}), encoding='utf-8')
                if update:
                    self.owned_files(target)
                    self.recovery.mkdir(exist_ok=True)
                    os.rename(target, previous)
                try:
                    os.rename(staging, target)
                except OSError:
                    if update:
                        os.rename(previous, target)
                    raise
                if update:
                    shutil.rmtree(previous, ignore_errors=True)

    def owned_files(self, target):
        marker = own_path(target / MARKER)
        require(marker.is_file(), 'Only characters installed through the catalog can be changed.')
        metadata = json.loads(marker.read_bytes())
        require(isinstance(metadata, dict), 'Invalid local character manifest.')
        files = metadata.get('files', [])
        require(metadata.get('schema') == 1 and metadata.get('id') == target.name
                and isinstance(files, list) and all(valid_file(path) for path in files)
                and REQUIRED <= set(files), 'Invalid local character manifest.')
        owned = set(files) | {MARKER}
        for path in target.iterdir():
            own_path(path)
            if path.is_dir() and path.name in {'textures', 'pbr'}:
                for texture in path.iterdir():
                    require(own_path(texture).is_file() and texture.relative_to(target).as_posix() in owned,
                            'The character folder contains files outside its manifest.')
            else:
                require(path.is_file() and path.name in owned, 'The character folder contains files outside its manifest.')
        return metadata

    def uninstall(self, character):
        with self.lock:
            target = own_path(self.characters / character)
            self.recover(target)
            self.owned_files(target)
            with tempfile.TemporaryDirectory(prefix='uninstall-', dir=self.hotw) as temporary:
                os.rename(target, Path(temporary) / character)
