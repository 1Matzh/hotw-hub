# Hands on the Wheel (HOTW)
# Copyright (c) 2026 1Matzh
# SPDX-License-Identifier: MIT
"""Download verified portable releases and replace the Hub after it exits."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import mkdtemp
from threading import Thread
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from hotw_character_catalog import CatalogError, NoRedirect, own_path, require

REPOSITORY = 'https://github.com/1Matzh/hotw-hub'
RELEASE_API = 'https://api.github.com/repos/1Matzh/hotw-hub/releases/latest'
TAG = re.compile(r'v(\d{1,4}\.\d{1,4}\.\d{1,4})')
MAX_BINARY = 512 * 1024 * 1024
UPDATE_PREFIX = '.hotw-update-'


class ReleaseRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        address = urlsplit(url)
        require(address.scheme == 'https' and address.hostname in {
            'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'
        } and not address.username and address.port in (None, 443), 'Unexpected update download location.')
        return super().redirect_request(request, fp, code, message, headers, url)


def latest_release(version):
    request = Request(RELEASE_API, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'HOTW-Hub'})
    try:
        with build_opener(NoRedirect()).open(request, timeout=6) as response:
            release = json.loads(response.read(256 * 1024))
        match = TAG.fullmatch(release['tag_name'])
        if not match or release.get('draft') or release.get('prerelease'):
            return None
        if tuple(map(int, match[1].split('.'))) <= tuple(map(int, version.split('.'))):
            return None
        name = 'HOTW-Hub.exe' if sys.platform == 'win32' else 'HOTW-Hub-linux-x86_64'
        assets = {item['name']: item for item in release['assets'] if item.get('state') == 'uploaded'}
        binary, checksums = assets[name], assets['SHA256SUMS.txt']
        base = REPOSITORY + '/releases/download/' + match[0] + '/'
        require(binary['browser_download_url'] == base + name and
                checksums['browser_download_url'] == base + 'SHA256SUMS.txt', 'Unexpected release assets.')
        require(isinstance(binary['size'], int) and 0 < binary['size'] <= MAX_BINARY, 'Invalid update size.')
        return {'tag': match[0], 'name': name, 'url': base + name, 'size': binary['size'],
                'digest': binary.get('digest'), 'checksums': base + 'SHA256SUMS.txt'}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_update(release, target, progress):
    target = own_path(target)
    opener = build_opener(ReleaseRedirects())
    with opener.open(Request(release['checksums'], headers={'User-Agent': 'HOTW-Hub'}), timeout=20) as response:
        data = response.read(16385)
    require(len(data) <= 16384, 'The release checksum file is too large.')
    checksums = dict((name, digest) for digest, name in re.findall(r'^([a-f0-9]{64})  ([\w.\-]+)$', data.decode('utf-8'), re.M))
    digest = checksums.get(release['name'])
    require(digest is not None, 'The release does not contain a checksum for this platform.')
    require(release['digest'] in (None, 'sha256:' + digest), 'The release files changed. Try the update again.')
    folder = Path(mkdtemp(prefix=UPDATE_PREFIX, dir=target.parent))
    incoming = folder / 'incoming'
    try:
        received = 0
        with opener.open(Request(release['url'], headers={'User-Agent': 'HOTW-Hub'}), timeout=30) as response, incoming.open('wb') as output:
            while chunk := response.read(65536):
                received += len(chunk)
                require(received <= release['size'], 'The update exceeds its declared size.')
                output.write(chunk)
                progress(len(chunk))
        require(received == release['size'] and file_hash(incoming) == digest, 'Update verification failed. Please try again.')
        incoming.chmod(target.stat().st_mode)
        worker = folder / ('worker.exe' if sys.platform == 'win32' else 'worker')
        shutil.copy2(target, worker)
        job = folder / 'job.json'
        job.write_text(json.dumps({'schema': 1, 'target': str(target), 'pid': os.getpid(),
                                  'digest': digest, 'previousDigest': file_hash(target), 'version': release['tag']}), encoding='utf-8')
        return job
    except Exception:
        shutil.rmtree(folder)
        raise


def read_job(path):
    path = own_path(path)
    job = json.loads(path.read_text(encoding='utf-8'))
    target = own_path(Path(job['target']))
    require(path.name == 'job.json' and path.parent.name.startswith(UPDATE_PREFIX) and
            path.parent.parent == target.parent and job['schema'] == 1 and
            isinstance(job['pid'], int) and job['pid'] > 0 and TAG.fullmatch(job['version']) and
            re.fullmatch(r'[a-f0-9]{64}', job['digest']) and
            re.fullmatch(r'[a-f0-9]{64}', job['previousDigest']), 'Invalid update handoff.')
    return job, target


def launch(arguments):
    options = {'env': {**os.environ, 'PYINSTALLER_RESET_ENVIRONMENT': '1'},
               'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    if sys.platform == 'win32':
        options['creationflags'] = subprocess.CREATE_NO_WINDOW
    else:
        options['start_new_session'] = True
    return subprocess.Popen([str(value) for value in arguments], **options)


def start_update(job_path):
    read_job(job_path)
    worker = job_path.parent / ('worker.exe' if sys.platform == 'win32' else 'worker')
    try:
        return launch([worker, '--apply-update', job_path])
    except OSError:
        shutil.rmtree(job_path.parent)
        raise


def wait_for_exit(pid, timeout=45):
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x100000, False, pid)
        if not handle:
            require(ctypes.get_last_error() == 87, 'Could not wait for the previous Hub process.')
            return
        try:
            require(kernel.WaitForSingleObject(handle, int(timeout * 1000)) == 0, 'The previous Hub did not close in time.')
        finally:
            kernel.CloseHandle(handle)
        return
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(.1)
    raise CatalogError('The previous Hub did not close in time.')


def replace_when_unlocked(source, target):
    deadline = time.monotonic() + 30
    while True:
        try:
            os.replace(source, target)
            return
        except PermissionError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.2)


def apply_update(job_path):
    job, target = read_job(job_path)
    folder = job_path.parent
    incoming, previous = folder / 'incoming', folder / 'previous'
    try:
        wait_for_exit(job['pid'])
        require(file_hash(incoming) == job['digest'], 'The downloaded update changed before installation.')
        require(file_hash(target) == job['previousDigest'], 'The Hub executable changed before installation.')
        shutil.copy2(target, previous)
        replace_when_unlocked(incoming, target)
        process = launch([target, '--finish-update', job_path, str(os.getpid())])
        time.sleep(1)
        require(process.poll() in (None, 0), 'The new Hub could not start.')
        return 0
    except (OSError, ValueError) as error:
        if previous.is_file():
            replace_when_unlocked(previous, target)
        (folder / 'error.txt').write_text(str(error), encoding='utf-8')
        launch([target, '--finish-update', job_path, str(os.getpid()), '--update-error', str(error)])
        return 1


def cleanup_update(job_path, worker_pid):
    read_job(job_path)
    wait_for_exit(worker_pid)
    folder = job_path.parent
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            shutil.rmtree(folder)
            return
        except FileNotFoundError:
            return
        except PermissionError:
            time.sleep(.2)


def finish_update(job_path, worker_pid):
    Thread(target=cleanup_update, args=(job_path, worker_pid), daemon=True).start()
