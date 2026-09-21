"""Bounded recovery of local, replay-safe work. Never replay external publishing."""
import hashlib
import json
import re
import subprocess
import time

import httpx
import db
import media
from services import ServiceError

LOCAL_STAGES = {'fetching_audio', 'sync_queued', 'render_queued',
                'manual_render_queued', 'local_queued', 'waiting_transcript'}


def category(exc):
    if isinstance(exc, ValueError) and str(exc) in (
            'Échec de la création du master synchronisé.',
            "Echec de l'assemblage du master synchronise."):
        return 'local_render'
    if isinstance(exc, (httpx.TransportError, TimeoutError, ConnectionError,
                        subprocess.TimeoutExpired)):
        return 'temporary_service'
    if not isinstance(exc, ServiceError):
        return None
    message = str(exc)
    if re.search(r'HTTP (408|429|500|502|503|504)\b', message):
        return 'temporary_service'
    if message.startswith(('Sélection Groq illisible', 'Format de sélection invalide',
                           'Classement des extraits invalide',
                           'La description générée ne respecte pas le format')):
        return 'invalid_generation'
    if message.startswith('FFmpeg n’a pas pu créer cet extrait'):
        return 'local_render'
    return None


def claim(eid, stage, kind, limit=3):
    folder = db.folder(eid)
    inputs = [(name, p.stat().st_size, p.stat().st_mtime_ns)
              for name in ('source.mp4', 'podcast.mp3', 'master.mp4')
              if (p := folder / name).is_file()]
    fingerprint = hashlib.sha256(json.dumps(inputs).encode()).hexdigest()
    key = 'auto-recovery:' + eid + ':' + stage
    previous = db.meta(key) or {}
    count = previous.get('attempts', 0) if previous.get('fingerprint') == fingerprint else 0
    record = {'fingerprint': fingerprint, 'attempts': count,
              'category': kind, 'at': time.time(), 'status': 'needs_attention'}
    if count < limit:
        record.update(attempts=count+1, status='scheduled',
                      next_poll=time.time()+min(60 * 2**count, 900))
    db.meta(key, record)
    return record if record['status'] == 'scheduled' else None


def schedule(e, exc):
    stage = e['state']
    if stage not in LOCAL_STAGES:
        return False
    kind = category(exc)
    target = 'local_queued' if stage == 'waiting_transcript' else stage
    if isinstance(exc, ServiceError) and str(exc) == 'Master synchronisé indisponible.':
        # Rebuild only from the existing sources and a plan that still validates.
        folder = db.folder(e['id'])
        if not all((folder / name).is_file() for name in ('source.mp4', 'podcast.mp3')):
            return False
        try:
            media.validate_plan(json.loads(e['plan_json']),
                                media.duration(folder / 'source.mp4'),
                                media.duration(folder / 'podcast.mp3'))
        except (ValueError, TypeError, KeyError, subprocess.SubprocessError):
            return False
        kind, target = 'rebuild_master', 'render_queued'
    if kind is None:
        return False
    record = claim(e['id'], stage, kind)
    if record is None:
        return False
    db.update(e['id'], state=target, resume_state=target,
              next_poll=record['next_poll'],
              error='Reprise automatique en cours après une erreur temporaire (tentative '+str(record['attempts'])+'/3).')
    return True


def completed(eid, stage):
    key = 'auto-recovery:' + eid + ':' + stage
    record = db.meta(key)
    if record and record.get('status') == 'scheduled':
        db.meta(key, {**record, 'status': 'recovered', 'at': time.time()})


def caption_retry(clip, exc):
    kind = category(exc)
    if kind is None:
        return None
    return claim(clip['episode_id'], 'caption:' + clip['id'], kind)
