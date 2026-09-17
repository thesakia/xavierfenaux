"""Bounded ZIP extraction and anonymous iCloud Photos imports."""
import base64
import json
import re
import shutil
import stat
import time
import zipfile
from pathlib import PurePosixPath
from urllib.parse import quote, urlparse

import httpx
import db
import media
from config import MAX_UPLOAD, RESERVE
from services import ServiceError, safe_url

VIDEO_SUFFIXES = ('.mp4', '.mov', '.m4v', '.mkv', '.webm')
IMPORT_STATES = ('zip_queued', 'extracting', 'icloud_queued', 'icloud_downloading')
BUSY_STATES = ('uploading', 'sync_queued', 'syncing', 'rendering',
               'render_queued', 'manual_render_queued') + IMPORT_STATES
CK_PATH = '/database/1/com.apple.photos.cloud/production/'


def share_id(url):
    p = urlparse(url.strip())
    if (p.scheme != 'https' or p.hostname not in ('share.icloud.com', 'www.icloud.com', 'icloud.com')
            or p.username or p.password or p.port not in (None, 443)):
        raise ValueError('Colle un lien public https://share.icloud.com/photos/...')
    match = re.fullmatch(r'/photos/([A-Za-z0-9_-]{20,64})/?', p.path)
    if not match:
        raise ValueError('Ce lien doit provenir du partage iCloud Photos de la video.')
    return match[1]


def apple_url(url, *, api=False):
    p = urlparse(url)
    host = p.hostname or ''
    allowed = (bool(re.fullmatch(r'(?:p\d+-)?ckdatabasews\.icloud\.com', host)) if api
               else host.endswith('.icloud-content.com'))
    if not allowed:
        raise ValueError('Adresse de telechargement iCloud non reconnue.')
    return safe_url(url)


def check_space(path, size, copies=3):
    if size <= 0:
        raise ValueError('Le fichier reçu est vide. Réessaie une fois sa préparation terminée.')
    if size > MAX_UPLOAD:
        raise ValueError(f'La vidéo à importer fait {size / 1024**2:.0f} Mo (maximum {MAX_UPLOAD // 1024**2} Mo).')
    if shutil.disk_usage(path.parent).free < RESERVE + size * copies:
        raise ValueError('Pas assez de place pour importer la video et creer son master.')


def extract_video(archive, target):
    try:
        # Bound the central directory before ZipFile allocates one object per entry.
        # The stdlib reader also handles ZIP64 trailers without loading the directory.
        with archive.open('rb') as source:
            end = zipfile._EndRecData(source)
        if not end:
            raise ValueError('ZIP illisible ou incomplet.')
        if end[zipfile._ECD_ENTRIES_TOTAL] > 500 or end[zipfile._ECD_SIZE] > 2 * 1024 * 1024:
            raise ValueError('Le ZIP contient trop de fichiers. Garde uniquement la video.')
        with zipfile.ZipFile(archive) as z:
            entries = z.infolist()
            if len(entries) > 500:
                raise ValueError('Le ZIP contient trop de fichiers. Garde uniquement la video.')
            videos = []
            for item in entries:
                name = PurePosixPath(item.filename.replace('\\', '/'))
                mode = item.external_attr >> 16
                if (name.is_absolute() or '..' in name.parts or ':' in item.filename
                        or stat.S_ISLNK(mode) or '\x00' in item.orig_filename):
                    raise ValueError('Le ZIP contient un chemin ou un lien non autorise.')
                if item.is_dir() or '__MACOSX' in name.parts or name.name.startswith('._'):
                    continue
                if name.suffix.lower() in VIDEO_SUFFIXES:
                    videos.append(item)
            if len(videos) != 1:
                raise ValueError('Le ZIP doit contenir une seule video (MP4, MOV, M4V, MKV ou WebM).')
            item = videos[0]
            if item.flag_bits & 1:
                raise ValueError('Les ZIP proteges par mot de passe ne sont pas acceptes.')
            if item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError('Compression ZIP non prise en charge. Utilise un ZIP standard.')
            if item.file_size > max(item.compress_size, 1) * 200:
                raise ValueError('Archive trop fortement compressee pour une video.')
            check_space(target, item.file_size)
            written = 0
            with z.open(item) as source, target.open('wb') as out:
                while chunk := source.read(1024 * 1024):
                    written += len(chunk)
                    if written > item.file_size or written > MAX_UPLOAD:
                        raise ValueError('La video extraite depasse la taille autorisee.')
                    check_space(target, written)
                    out.write(chunk)
            if written != item.file_size:
                raise ValueError('ZIP incomplet. Recommence avec le fichier original.')
            return PurePosixPath(item.filename.replace('\\', '/')).name[:200]
    except (zipfile.BadZipFile, RuntimeError, EOFError, NotImplementedError) as exc:
        raise ValueError('ZIP illisible ou incomplet. Recommence avec un ZIP standard.') from exc


def accept_video(eid, source, name):
    size = source.stat().st_size
    check_space(source, size, copies=2)
    info = media.probe(source)
    if not any(s.get('codec_type') == 'video' for s in info['streams']):
        raise ValueError('Ce fichier ne contient pas de video.')
    if not any(s.get('codec_type') == 'audio' for s in info['streams']):
        raise ValueError('Conserver le son temoin de la camera pour permettre la synchronisation.')
    if not 35 <= float(info['format']['duration']) <= 5400:
        raise ValueError('La video doit durer entre 35 secondes et 90 minutes.')
    source.replace(source.parent / 'source.mp4')
    db.update(eid, state='sync_queued', video_name=name, video_bytes=size,
              error=None, attempts=0, next_poll=0)


def apple_json(client, url, payload, params=None):
    apple_url(url, api=True)
    with client.stream('POST', url, json=payload, params=params) as response:
        if response.status_code != 200:
            raise ValueError('Lien iCloud indisponible, expire ou prive. Cree un nouveau lien public.')
        chunks = bytearray()
        for chunk in response.iter_bytes(65536):
            chunks.extend(chunk)
            if len(chunks) > 4 * 1024 * 1024:
                raise ValueError('Le partage contient trop de donnees. Partage une seule video.')
        result = json.loads(chunks)
        if not isinstance(result, dict) or result.get('serverErrorCode'):
            raise ValueError('Partage iCloud indisponible. Cree un nouveau lien public.')
        return result


def field(record, key, default=None):
    return record.get('fields', {}).get(key, {}).get('value', default)


def resolve_video(client, short_id):
    # Same anonymous CloudKit flow as Apple's public Photos web application.
    result = apple_json(client, 'https://ckdatabasews.icloud.com' + CK_PATH + 'public/records/resolve',
                        {'shortGUIDs': [{'value': short_id}]})
    items = result.get('results', [])
    if len(items) != 1 or items[0].get('serverErrorCode'):
        raise ValueError('Lien iCloud expire ou introuvable. Cree un nouveau lien de partage.')
    resolved = items[0]
    access = resolved.get('anonymousPublicAccess') or {}
    if not access.get('token') or not resolved.get('zoneID'):
        raise ValueError('Ce partage est prive. Utilise un lien iCloud Photos accessible a tous.')
    root = resolved.get('rootRecord', {})
    if field(root, 'videosCount', 0) > 1:
        raise ValueError('Ce lien contient plusieurs videos. Partage uniquement celle de cet episode.')
    if field(root, 'assetCount', 0) > 100:
        raise ValueError('Ce partage est trop grand. Partage uniquement la video de cet episode.')
    scope = resolved.get('databaseScope', '').lower()
    if scope not in ('public', 'shared', 'private'):
        raise ValueError('Ce partage iCloud ne permet pas un acces public aux videos.')
    base = access.get('databasePartition', '').rstrip('/')
    apple_url(base, api=True)
    if urlparse(base).path not in ('', '/'):
        raise ValueError('Serveur iCloud inattendu.')
    params = {'sharing_url_key': short_id, 'publicAccessAuthToken': access['token']}
    payload = {'zoneID': resolved['zoneID'], 'resultsLimit': 200,
               'query': {'recordType': 'CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted',
                         'filterBy': [{'fieldName': 'direction', 'comparator': 'EQUALS',
                                       'fieldValue': {'value': 'ASCENDING', 'type': 'STRING'}}]}}
    records = apple_json(client, base + CK_PATH + scope + '/records/query', payload, params)
    if records.get('continuationMarker') or records.get('moreComing'):
        raise ValueError('Ce partage est trop grand. Cree un lien contenant une seule video.')
    candidates = {}
    for record in records.get('records', []):
        if record.get('recordType') != 'CPLMaster' or record.get('serverErrorCode'):
            continue
        file_type = field(record, 'resOriginalFileType', field(record, 'itemType', ''))
        if file_type not in ('com.apple.quicktime-movie', 'public.mpeg-4', 'com.apple.m4v-video',
                             'public.movie', 'public.video'):
            continue
        asset = field(record, 'resOriginalRes') or {}
        rendition = False
        if int(asset.get('size') or 0) > MAX_UPLOAD:
            # Apple can expose a much larger original than its shared MP4.
            # Prefer the compatible rendition, but never its low-res thumbnail.
            for prefix in ('resVidMed', 'resVidHDRMed'):
                candidate = field(record, prefix + 'Res') or {}
                candidate_type = field(record, prefix + 'FileType', '')
                width, height = field(record, prefix + 'Width', 0), field(record, prefix + 'Height', 0)
                if (candidate.get('downloadURL') and 0 < int(candidate.get('size') or 0) <= MAX_UPLOAD
                        and min(int(width or 0), int(height or 0)) >= 720
                        and candidate_type in ('public.mpeg-4', 'com.apple.quicktime-movie', 'com.apple.m4v-video')):
                    asset, file_type, rendition = candidate, candidate_type, True
                    break
        if not asset.get('downloadURL'):
            raise ValueError('La video est encore en cours de preparation chez Apple. Reessaie dans quelques minutes.')
        name = 'video-icloud.mov' if file_type == 'com.apple.quicktime-movie' else 'video-icloud.mp4'
        encoded = field(record, 'filenameEnc')
        if encoded:
            try:
                decoded = base64.b64decode(encoded, validate=True).decode('utf-8')
                name = PurePosixPath(decoded.replace('\\', '/')).name[:200] or name
            except (ValueError, UnicodeError):
                pass
        if rendition:
            name = str(PurePosixPath(name).with_suffix('.mov' if file_type == 'com.apple.quicktime-movie' else '.mp4'))
        url = asset['downloadURL'].replace('${f}', quote(name, safe=''))
        apple_url(url)
        candidates[record['recordName']] = (url, name, int(asset.get('size') or 0))
    if len(candidates) != 1:
        raise ValueError('Le lien doit contenir une seule video disponible, pas un album de photos.')
    return next(iter(candidates.values()))


def download_video(client, url, target, size, progress):
    if size:
        check_space(target, size)
    started = time.monotonic()
    for _ in range(6):
        apple_url(url)
        with client.stream('GET', url, headers={'Accept-Encoding': 'identity'}) as response:
            if response.is_redirect:
                url = str(response.url.join(response.headers['location']))
                continue
            if response.status_code != 200:
                raise ValueError('Telechargement iCloud indisponible. Reessaie avec un nouveau lien.')
            announced = int(response.headers.get('content-length') or 0)
            if size and announced and size != announced:
                raise ValueError('La taille du fichier iCloud est incoherente.')
            total = size or announced
            if total:
                check_space(target, total)
            written = 0
            last_progress = 0
            with target.open('wb') as out:
                for chunk in response.iter_bytes(1024 * 1024):
                    written += len(chunk)
                    check_space(target, written)
                    if (total and written > total) or time.monotonic() - started > 3600:
                        raise ValueError('Limite de taille ou de duree atteinte pendant le transfert iCloud.')
                    out.write(chunk)
                    if time.monotonic() - last_progress > 2:
                        progress(written, total)
                        last_progress = time.monotonic()
            if not written or (total and written != total):
                raise ValueError('Transfert iCloud incomplet. Reessaie avec le meme lien.')
            progress(written, total or written)
            return
    raise ValueError('Trop de redirections pour ce lien iCloud.')


def process(e):
    eid = e['id']
    folder = db.folder(eid)
    source, archive = folder / 'source.part', folder / 'import.zip'
    try:
        if e['state'] == 'zip_queued':
            db.update(eid, state='extracting', error=None)
            name = extract_video(archive, source)
        else:
            db.update(eid, state='icloud_downloading', error=None)
            info = db.meta('icloud-import:' + eid) or {}
            short_id = info.get('share_id')
            if not short_id:
                raise ValueError('Le lien iCloud est absent. Colle a nouveau le lien.')
            with httpx.Client(timeout=httpx.Timeout(60, connect=20), follow_redirects=False, trust_env=False) as client:
                url, name, size = resolve_video(client, short_id)
                download_video(client, url, source, size,
                               lambda received, total: db.meta('import-progress:' + eid,
                                                              {'received': received, 'total': total}))
        accept_video(eid, source, name)
    except Exception as exc:
        message = str(exc) if isinstance(exc, (ValueError, ServiceError)) else 'Import interrompu. Reessaie avec le ZIP ou un nouveau lien iCloud.'
        db.update(eid, state='waiting_video', error=message)
    finally:
        source.unlink(missing_ok=True)
        archive.unlink(missing_ok=True)
        with db.connect() as c:
            c.execute('DELETE FROM meta WHERE key IN (?,?)', ('icloud-import:' + eid, 'import-progress:' + eid))
