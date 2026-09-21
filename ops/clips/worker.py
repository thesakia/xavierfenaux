import json
import logging
import shutil
import time
import db
import media
import highlights
import imports
import recovery
from config import DATA, PUBLIC_URL, KEEP_DAYS, RESERVE
from services import Opus, OpusHTTPError, ServiceError, RateLimitError, download, ingest, captions

log = logging.getLogger('clips.worker')
opus = Opus()
ACTIVE = ('syncing','rendering','opus_uploading','submitting')

def recover():
    # A lost create-project response is never automatically retried: it can cost credits twice.
    with db.connect() as c:
        c.execute("UPDATE episodes SET state='local_queued' WHERE state IN ('selecting','cutting')")
        c.execute("UPDATE episodes SET state='submission_unknown',error='Réponse Opus perdue. Rattacher le projet existant avant de continuer.' WHERE state='submitting'")
        c.execute("UPDATE episodes SET state=COALESCE(resume_state,'render_queued') WHERE state='rendering'")
        for old,new in [('uploading','waiting_video'),('syncing','sync_queued'),
                        ('extracting','zip_queued'),('icloud_downloading','icloud_queued'),
                        ('opus_uploading','opus_upload_queued')]:
            c.execute('UPDATE episodes SET state=? WHERE state=?',(new,old))
        c.execute("UPDATE clips SET caption_state='pending' WHERE caption_state='generating'")
    for path in DATA.glob('*/*.part'):
        path.unlink(missing_ok=True)

def collect(e):
    clips = opus.clips(e['project_id'])
    with db.connect() as c:
        for clip in clips:
            if clip.get('projectId')!=e['project_id']:
                raise ServiceError('Un clip Opus ne correspond pas au projet demandé.')
            c.execute('''INSERT INTO clips
              (id,episode_id,title,text,duration,preview_url,export_url)
              VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
              title=excluded.title,text=excluded.text,duration=excluded.duration,
              preview_url=excluded.preview_url,export_url=excluded.export_url''',
              (clip['id'],e['id'],clip.get('title','Extrait'),clip.get('text',''),
               clip.get('durationMs',0)/1000,clip.get('uriForPreview'),clip.get('uriForExport')))
    age = time.time()-e['updated']
    if clips:
        if e['state']=='ready':
            with db.connect() as c:
                c.execute('UPDATE episodes SET error=NULL,next_poll=? WHERE id=?',(time.time()+300,e['id']))
        else:
            db.update(e['id'],state='ready',error=None,next_poll=time.time()+300)
    else:
        # A callback does not imply success. Read the actual project stage before
        # declaring a failed project complete or treating an empty page as an error.
        project=opus.project(e['project_id'])
        db.meta('opus-stage:'+e['id'],{'stage':project['stage'],'checked':time.time()})
        if project['stage']=='STALLED' and project.get('error'):
            message='Opus n’a pas pu traiter cette vidéo.'
            if 'credits have been returned' in str(project['error']).lower():
                message+=' Opus indique que les crédits ont été restitués.'
            db.update(e['id'],state='opus_failed',error=message,next_poll=time.time()+600)
            return
        if project['stage']=='COMPLETE':
            db.update(e['id'],state='no_clips',error='Opus a terminé sans clip disponible. Vérifier le projet dans Opus.',next_poll=time.time()+600)
            return
        if age>6*3600:
            db.update(e['id'],state='opus_delayed',error='Traitement Opus anormalement long. Vérifier le projet.',next_poll=time.time()+600)
            return
        # Preserve submission time until results arrive, including after a premature callback.
        with db.connect() as c:
            c.execute("UPDATE episodes SET state='opus_processing',error=NULL,next_poll=? WHERE id=?",(time.time()+90,e['id']))

def process(e):
    eid,state = e['id'],e['state']
    folder = db.folder(eid)
    audio,video,master = folder/'podcast.mp3',folder/'source.mp4',folder/'master.mp4'
    if state in ('zip_queued','icloud_queued'):
        imports.process(e)
        return
    if state in ('local_queued','waiting_transcript','opus_upload_queued','submit_queued'):
        highlights.process(e)
        return
    if state=='fetching_audio':
        if not audio.exists():
            download(e['audio_url'],audio,300*1024**2)
            media.probe(audio)
        db.update(eid,state='waiting_video',error=None,attempts=0)
    elif state=='sync_queued':
        db.update(eid,state='syncing',error=None)
        if not audio.exists():
            download(e['audio_url'],audio,300*1024**2)
        result = media.analyse(video,audio)
        db.update(eid,sync_json=json.dumps(result),plan_json=json.dumps(result['segments']),
                  state='render_queued' if result['reliable'] else 'needs_sync',error=result['reason'])
    elif state in ('render_queued','manual_render_queued'):
        manual = state=='manual_render_queued'
        # Manual work always requires listening to the preview before submitting.
        db.meta('manual:'+eid,manual)
        db.update(eid,state='rendering',resume_state=state,error=None)
        segments = media.validate_plan(json.loads(e['plan_json']),media.duration(video),media.duration(audio))
        if shutil.disk_usage(DATA).free < max(e['video_bytes']*1.5,300*1024**2)+RESERVE:
            raise ServiceError('Espace insuffisant pour créer le master. Libérer de la place puis réessayer.')
        media.render(video,audio,master,segments)
        db.update(eid,state='preview' if manual else 'local_queued')
    elif state in ('opus_processing','ready','opus_delayed','no_clips','opus_failed'):
        collect(e)

def cleanup():
    cutoff = time.time()-KEEP_DAYS*86400
    for e in db.rows("SELECT * FROM episodes WHERE state IN ('ready','waiting_video','archived') AND updated<?",(cutoff,)):
        if db.rows("SELECT 1 FROM clips WHERE episode_id=? AND selected=1 AND caption_state IN ('pending','generating')",(e['id'],)):
            continue
        # Purge only our own generated media, preserving metadata, choices and descriptions.
        directory = DATA/e['id']
        if directory.is_dir() and directory.resolve().parent==DATA.resolve():
            shutil.rmtree(directory)
        db.update(e['id'],state='archived',error=None)

def run(stop):
    recover()
    last_rss = last_cleanup = 0
    while not stop.is_set():
        try:
            now = time.time()
            if now-last_rss>300 or db.meta('refresh_requested'):
                last_rss=now
                db.meta('refresh_requested',False)
                try:
                    ingest()
                except Exception:
                    db.meta('rss',{'checked':now,'error':'Le flux Acast est temporairement indisponible.'})
            if now-last_cleanup>3600:
                cleanup()
                last_cleanup=now
            jobs = db.rows("""SELECT * FROM episodes WHERE
              (state IN ('zip_queued','icloud_queued','fetching_audio','sync_queued','render_queued','manual_render_queued','local_queued','waiting_transcript','opus_upload_queued','submit_queued') AND next_poll<=?)
              OR (project_id IS NOT NULL AND state IN ('opus_processing','ready','opus_delayed','no_clips','opus_failed') AND next_poll<=?)
              ORDER BY CASE WHEN state='ready' THEN 2 ELSE 0 END, published DESC LIMIT 1""",(now,now))
            if jobs:
                e=jobs[0]
                try:
                    process(e)
                    after=db.episode(e['id'])['state']
                    if after not in ('error','waiting_transcript','icloud_queued') and (after!='local_queued' or e['state'] in ('render_queued','manual_render_queued')):
                        recovery.completed(e['id'],e['state'])
                except Exception as exc:
                    message = str(exc) if isinstance(exc,(ServiceError,ValueError)) else 'Une étape a échoué. Réessayer ou vérifier les fichiers.'
                    if e['state'] in ('opus_processing','ready','opus_delayed','no_clips','opus_failed'):
                        with db.connect() as c:
                            c.execute('UPDATE episodes SET error=?,next_poll=? WHERE id=?',(message,time.time()+300,e['id']))
                    else:
                        if recovery.schedule(e,exc):
                            log.warning('Automatic recovery scheduled for episode %s at %s',e['id'],e['state'])
                            continue
                        attempts=e['attempts']+1
                        retry=e['state']=='opus_upload_queued' and attempts<4
                        db.update(e['id'],state=e['state'] if retry else 'error',error=message,
                                  resume_state='local_queued' if e['state'] in ('local_queued','waiting_transcript','opus_upload_queued','submit_queued') else e['state'],attempts=attempts,next_poll=time.time()+60*2**min(attempts,5))
                    log.warning('Episode %s failed at %s: %s',e['id'],e['state'],type(exc).__name__)
            pending=db.rows("SELECT * FROM clips WHERE selected=1 AND caption_state='pending' LIMIT 1")
            if pending and (db.meta('caption_retry_after') or 0)<=time.time():
                clip=pending[0]
                with db.connect() as c:
                    c.execute("UPDATE clips SET caption_state='generating',error=NULL WHERE id=?",(clip['id'],))
                try:
                    result=captions(clip,db.episode(clip['episode_id']))
                    with db.connect() as c:
                        c.execute("UPDATE clips SET captions=?,caption_state='ready',error=NULL WHERE id=?",(json.dumps(result,ensure_ascii=False),clip['id']))
                    recovery.completed(clip['episode_id'],'caption:'+clip['id'])
                except Exception as exc:
                    message=str(exc) if isinstance(exc,ServiceError) else 'Échec de génération. Réessayer.'
                    if isinstance(exc,RateLimitError):db.meta('caption_retry_after',time.time()+65)
                    retry=recovery.caption_retry(clip,exc)
                    if retry:db.meta('caption_retry_after',retry['next_poll'])
                    with db.connect() as c:
                        c.execute("UPDATE clips SET caption_state=?,error=? WHERE id=?",('pending' if retry or isinstance(exc,RateLimitError) else 'error',message,clip['id']))
            db.meta('worker',{'heartbeat':time.time()})
        except Exception:
            log.exception('Worker cycle failed')
        stop.wait(3)
