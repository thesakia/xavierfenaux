"""Reuse DailyVest transcripts locally or over a restricted read-only SSH bridge."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import time

QUERY = '''import json
from db import get_conn, get_cursor
with get_conn() as conn, get_cursor(conn) as cur:
 conn.set_session(readonly=True)
 cur.execute('SELECT e.guid,e."audioUrl",t.id AS transcript_id,t."updatedAt" FROM "Episode" e JOIN "Transcript" t ON t."episodeId"=e.id WHERE e."publishedAt">now()-(%s::interval)', ('30 days',))
 episodes=cur.fetchall()
 for e in episodes:
  cur.execute('SELECT "startTime" AS start,"endTime" AS end,text FROM "TranscriptSegment" WHERE "transcriptId"=%s ORDER BY "startTime"', (e['transcript_id'],))
  e['segments']=cur.fetchall()
 print(json.dumps(episodes,default=str))
'''


def read_transcripts(local=False):
    target = os.environ.get('CLIPS_TRANSCRIPT_SSH_TARGET')
    if target and not local:
        command = ['/usr/bin/ssh', '-T', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
                   '-o', 'UserKnownHostsFile=/etc/ft-clips-transcript-known-hosts',
                   '-i', '/root/.ssh/ft-clips-transcripts', target]
        payload = None
    else:
        command = ['docker', 'exec', '-i', 'mood-worker', 'python', '-']
        payload = QUERY
    result = subprocess.run(command, input=payload, text=True, capture_output=True, timeout=90)
    if result.returncode:
        if 'quota' in result.stderr.lower():
            raise RuntimeError('Transcript source quota exceeded.')
        raise RuntimeError('Transcript source unavailable; no transcription requested.')
    return validate(json.loads(result.stdout))


def validate(episodes):
    if not isinstance(episodes, list):
        raise ValueError('Invalid transcript export.')
    seen = set()
    for episode in episodes:
        if not isinstance(episode, dict) or not isinstance(episode.get('guid'), str) or not episode['guid']:
            raise ValueError('Missing episode identity.')
        if episode['guid'] in seen:
            raise ValueError('Duplicate episode identity.')
        seen.add(episode['guid'])
        if not isinstance(episode.get('transcript_id'), str) or not episode['transcript_id']:
            raise ValueError('Missing transcript identity.')
        if not isinstance(episode.get('segments'), list):
            raise ValueError('Invalid transcript segments.')
        for segment in episode['segments']:
            start, end = float(segment['start']), float(segment['end'])
            if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start or not isinstance(segment['text'], str):
                raise ValueError('Invalid transcript timing or text.')
    return episodes


def write_cache(episodes, folder, group):
    validate(episodes)
    folder.mkdir(mode=0o750, exist_ok=True)
    if group is not None:
        os.chown(folder, 0, group)
    count = 0
    for episode in episodes:
        if not episode['segments']:
            continue
        target = folder / (hashlib.sha256(episode['guid'].encode()).hexdigest()[:24] + '.json')
        content = json.dumps(episode, ensure_ascii=False, sort_keys=True)
        if target.exists() and target.read_text() == content:
            continue
        temporary = target.with_suffix('.tmp')
        try:
            temporary.write_text(content)
            temporary.chmod(0o640)
            if group is not None:
                os.chown(temporary, 0, group)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        count += 1
    return count


def write_status(folder, group, error=None):
    folder.mkdir(mode=0o750, exist_ok=True)
    if group is not None:os.chown(folder,0,group)
    target=folder/'status.json'
    temporary=folder/'status.tmp'
    status={'checked':time.time(),'available':error is None,
            'reason':('quota' if 'quota' in str(error).lower() else 'unavailable') if error else None}
    temporary.write_text(json.dumps(status),encoding='utf-8')
    temporary.chmod(0o640)
    if group is not None:os.chown(temporary,0,group)
    temporary.replace(target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', action='store_true')
    args = parser.parse_args()
    if args.stdout:
        episodes = read_transcripts(local=True)
        print(json.dumps(episodes, ensure_ascii=False, sort_keys=True))
        return
    import grp
    folder=Path('/var/lib/ft-clips-transcripts');group=grp.getgrnam('ft-clips').gr_gid
    try:
        episodes=read_transcripts()
        count=write_cache(episodes,folder,group)
    except Exception as exc:
        write_status(folder,group,exc)
        raise
    write_status(folder,group)
    print(f'{count} transcript cache files updated; zero audio transcription calls.')


if __name__ == '__main__':
    main()
