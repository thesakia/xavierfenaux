import hashlib
import hmac
import json
import re
import shutil
import threading
import time
import zipfile
from contextlib import asynccontextmanager
from urllib.parse import urlparse, unquote
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
import db
import media
import worker
import highlights
from config import ROOT, DATA, TRANSCRIPTS, OPUS_KEY, GROQ_KEY, MAX_UPLOAD, RESERVE, PUBLIC_URL, ALLOWED_ORIGINS
from services import download

@asynccontextmanager
async def lifespan(app):
    db.init()
    stop = threading.Event()
    thread = threading.Thread(target=worker.run,args=(stop,),daemon=True)
    thread.start()
    yield
    stop.set()
    thread.join(timeout=5)

app = FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

@app.middleware('http')
async def protect(request, call_next):
    path=request.url.path
    if not path.startswith('/hooks/'):
        # Nginx authenticates using the existing dashboard password file, strips incoming
        # identity headers, and sets this header itself. Uvicorn listens on loopback only.
        if not request.headers.get('x-clips-user'):
            return JSONResponse({'detail':'Authentification requise.'},status_code=401)
        if request.method not in ('GET','HEAD','OPTIONS'):
            if request.headers.get('x-clips-request')!='1':
                return JSONResponse({'detail':'Requête non autorisée.'},status_code=403)
            origin=request.headers.get('origin')
            if origin and origin not in ALLOWED_ORIGINS:
                return JSONResponse({'detail':'Origine non autorisée.'},status_code=403)
    response=await call_next(request)
    response.headers['X-Robots-Tag']='noindex, nofollow'
    response.headers['Cache-Control']='no-store'
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['Content-Security-Policy']="default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response

def get_episode(eid):
    try:
        return db.episode(eid)
    except KeyError:
        raise HTTPException(404,'Épisode introuvable.')

def get_clip(cid):
    found=db.rows('SELECT * FROM clips WHERE id=?',(cid,))
    if not found:
        raise HTTPException(404,'Clip introuvable.')
    return found[0]

def require_state(eid, allowed, target=None):
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        e=c.execute('SELECT * FROM episodes WHERE id=?',(eid,)).fetchone()
        if not e:
            raise HTTPException(404,'Épisode introuvable.')
        if e['state'] not in allowed:
            raise HTTPException(409,'Cette étape est déjà en cours ou ne peut pas être relancée ici.')
        if target:
            c.execute('UPDATE episodes SET state=?,error=NULL,next_poll=0,updated=? WHERE id=?',(target,time.time(),eid))
        return dict(e)

@app.get('/')
def index():
    return FileResponse(ROOT/'static'/'index.html')

app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')

@app.get('/api/dashboard')
def dashboard():
    episodes=db.rows('SELECT * FROM episodes ORDER BY published DESC LIMIT 60')
    for e in episodes:
        for secret in ('webhook_token','upload_id','guid'):
            e.pop(secret,None)
        e['sync']=json.loads(e.pop('sync_json') or 'null')
        e['plan']=json.loads(e.pop('plan_json') or 'null')
        e['clips']=db.rows('SELECT * FROM clips WHERE episode_id=? ORDER BY COALESCE(rank,99),id',(e['id'],))
        for clip in e['clips']:
            clip['captions']=json.loads(clip['captions'] or 'null')
            clip['subtitled']=bool(db.meta('subtitles:'+clip['id']))
        e['master_available']=(DATA/e['id']/'master.mp4').exists()
        e['opus_stage']=(db.meta('opus-stage:'+e['id']) or {}).get('stage')
        e['transcript_reused']=(TRANSCRIPTS/(e['id']+'.json')).exists()
    free=shutil.disk_usage(DATA).free
    return {'episodes':episodes,'rss':db.meta('rss'),'worker':db.meta('worker'),
            'settings':db.meta('settings') or {'min_duration':30,'max_duration':90,'keywords':'','brand_template':''},
            'services':{'opus':False,'local':True,'descriptions':bool(GROQ_KEY)},
            'disk':{'free_bytes':free,'max_upload_bytes':max(0,min(MAX_UPLOAD,int((free-RESERVE)/3)))}}

@app.post('/api/refresh')
def refresh():
    db.meta('refresh_requested',True)
    return {'ok':True}

class Settings(BaseModel):
    min_duration:int=Field(30,ge=15,le=180)
    max_duration:int=Field(90,ge=15,le=180)
    keywords:str=Field('',max_length=500)
    brand_template:str=Field('',max_length=120)

@app.put('/api/settings')
def settings(body:Settings):
    if body.min_duration>body.max_duration:
        raise HTTPException(400,'La durée minimale dépasse la durée maximale.')
    db.meta('settings',body.model_dump())
    return {'ok':True}

@app.post('/api/episodes/{eid}/video')
async def upload(eid:str,request:Request):
    try:
        length=request.headers.get('content-length')
        file_size=request.headers.get('x-file-size')
        size=int(file_size or length) if (file_size or length) else None
        if length and file_size and int(length)!=int(file_size):
            raise HTTPException(400,'La taille annoncée du fichier est incohérente.')
    except ValueError:
        raise HTTPException(400,'Taille invalide.')
    if size is not None and (size<=0 or size>MAX_UPLOAD):
        raise HTTPException(413,'Fichier vide ou trop volumineux.')
    if size is not None and size*3+RESERVE>shutil.disk_usage(DATA).free:
        raise HTTPException(507,'Pas assez de place pour la vidéo et son master synchronisé.')
    name=unquote(request.headers.get('x-file-name','video.mp4'))[:200]
    if not name.lower().endswith(('.mp4','.mov','.m4v','.mkv','.webm')):
        raise HTTPException(400,'Formats acceptés : MP4, MOV, M4V, MKV, WebM.')
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        e=c.execute('SELECT state FROM episodes WHERE id=?',(eid,)).fetchone()
        if not e:
            raise HTTPException(404,'Épisode introuvable.')
        if e['state'] not in ('waiting_video','archived'):
            raise HTTPException(409,'Cet épisode attend déjà un traitement.')
        if c.execute("SELECT 1 FROM episodes WHERE state IN ('uploading','sync_queued','syncing','rendering','render_queued','manual_render_queued')").fetchone():
            raise HTTPException(409,'Une autre vidéo est déjà en cours de traitement. Réessayer ensuite.')
        if c.execute('SELECT 1 FROM episodes WHERE id=? AND project_id IS NOT NULL',(eid,)).fetchone():
            raise HTTPException(409,'Cet épisode dispose déjà d’un projet Opus.')
        c.execute("UPDATE episodes SET state='uploading',updated=? WHERE id=?",(time.time(),eid))
    folder=db.folder(eid)
    tmp=folder/'source.part'
    written=0
    try:
        with tmp.open('wb') as f:
            async for chunk in request.stream():
                written+=len(chunk)
                if written>MAX_UPLOAD or (size is not None and written>size):
                    raise HTTPException(413,'La vidéo dépasse la taille autorisée.')
                if shutil.disk_usage(DATA).free<RESERVE+len(chunk)+written*2:
                    raise HTTPException(507,'Limite de stockage atteinte pendant le transfert.')
                f.write(chunk)
        if written==0 or (size is not None and written!=size):
            raise HTTPException(400,'Upload incomplet. Réessayer.')
        if written*2+RESERVE>shutil.disk_usage(DATA).free:
            raise HTTPException(507,'Pas assez de place pour traiter cette vidéo.')
        info=await run_in_threadpool(media.probe,tmp)
        if not any(s['codec_type']=='video' for s in info['streams']):
            raise HTTPException(400,'Ce fichier ne contient pas de vidéo.')
        if not any(s['codec_type']=='audio' for s in info['streams']):
            raise HTTPException(400,'Conserver le son témoin de la caméra pour permettre la synchronisation.')
        if not 35<=float(info['format']['duration'])<=5400:
            raise HTTPException(400,'La vidéo doit durer entre 35 secondes et 90 minutes.')
        tmp.replace(folder/'source.mp4')
        db.update(eid,state='sync_queued',video_name=name,video_bytes=written,error=None,attempts=0,next_poll=0)
        return {'ok':True}
    except BaseException as exc:
        tmp.unlink(missing_ok=True)
        db.update(eid,state='waiting_video',error='Upload incomplet ou invalide. Vous pouvez réessayer.')
        if isinstance(exc,ValueError):
            raise HTTPException(400,str(exc))
        raise

class Plan(BaseModel):
    segments:list[dict[str,float]]

@app.post('/api/episodes/{eid}/plan')
def plan(eid:str,body:Plan):
    e=get_episode(eid)
    sync=json.loads(e['sync_json'] or '{}')
    try:
        segments=media.validate_plan(body.segments,sync['video_duration'],sync['audio_duration'])
    except (ValueError,KeyError) as exc:
        raise HTTPException(400,str(exc))
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        current=c.execute('SELECT state FROM episodes WHERE id=?',(eid,)).fetchone()
        if current['state'] not in ('needs_sync','preview'):
            raise HTTPException(409,'Le plan ne peut pas être modifié pendant le traitement.')
        c.execute("UPDATE episodes SET plan_json=?,state='manual_render_queued',next_poll=0,error=NULL,updated=? WHERE id=?",
                  (json.dumps(segments),time.time(),eid))
    return {'ok':True}

@app.post('/api/episodes/{eid}/approve')
def approve(eid:str):
    require_state(eid,('preview',),'local_queued')
    return {'ok':True}

@app.post('/api/episodes/{eid}/retry')
def retry(eid:str):
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        e=c.execute('SELECT * FROM episodes WHERE id=?',(eid,)).fetchone()
        if not e or e['state']!='error' or e['resume_state'] not in ('fetching_audio','sync_queued','render_queued','manual_render_queued','opus_upload_queued','local_queued'):
            raise HTTPException(409,'Cette étape ne peut pas être relancée automatiquement.')
        c.execute('UPDATE episodes SET state=resume_state,error=NULL,next_poll=0,attempts=0,updated=? WHERE id=?',(time.time(),eid))
    return {'ok':True}

@app.post('/api/episodes/{eid}/retry-opus')
def retry_opus(eid:str):
    raise HTTPException(409,'Opus est remplacé par le découpage local. Utiliser la création des temps forts.')
class Project(BaseModel):
    project_id:str=Field(min_length=2,max_length=100,pattern=r'^[A-Za-z0-9_-]+$')

@app.post('/api/episodes/{eid}/project')
def attach(eid:str,body:Project):
    require_state(eid,('submission_unknown',),'opus_processing')
    db.update(eid,project_id=body.project_id,next_poll=0)
    return {'ok':True}

@app.post('/api/episodes/{eid}/poll')
def poll(eid:str):
    e=get_episode(eid)
    if not e['project_id']:
        raise HTTPException(409,'Aucun projet Opus à interroger.')
    db.update(eid,next_poll=0)
    return {'ok':True}

@app.get('/api/episodes/{eid}/media/{kind}')
def episode_media(eid:str,kind:str):
    get_episode(eid)
    names={'master':'master.mp4','source':'source.mp4','audio':'podcast.mp3','subtitles-preview':'subtitles-preview.mp4'}
    if kind not in names:
        raise HTTPException(404)
    path=DATA/eid/names[kind]
    if not path.is_file():
        raise HTTPException(404,'Fichier indisponible ou archivé.')
    return FileResponse(path,media_type='audio/mpeg' if kind=='audio' else 'video/mp4')

class Selection(BaseModel):
    selected:bool

@app.put('/api/clips/{cid}/selection')
def select(cid:str,body:Selection):
    get_clip(cid)
    with db.connect() as c:
        c.execute('UPDATE clips SET selected=? WHERE id=?',(body.selected,cid))
    return {'ok':True}

@app.post('/api/clips/{cid}/captions')
def regenerate(cid:str):
    get_clip(cid)
    with db.connect() as c:
        c.execute("UPDATE clips SET caption_state='pending',error=NULL WHERE id=? AND caption_state!='generating'",(cid,))
    return {'ok':True}

class Copy(BaseModel):
    instagram:str=Field(max_length=2200)
    youtube_title:str=Field(max_length=100)
    youtube:str=Field(max_length=5000)
    tiktok:str=Field(max_length=2200)

@app.put('/api/clips/{cid}/captions')
def save_copy(cid:str,body:Copy):
    get_clip(cid)
    with db.connect() as c:
        if c.execute("SELECT 1 FROM clips WHERE id=? AND caption_state='generating'",(cid,)).fetchone():
            raise HTTPException(409,'Une génération est en cours. Attendre avant de modifier.')
        c.execute("UPDATE clips SET captions=?,caption_state='ready',error=NULL WHERE id=?",(body.model_dump_json(),cid))
    return {'ok':True}

@app.post('/api/episodes/{eid}/highlights')
def create_highlights(eid:str):
    e=get_episode(eid)
    if not (DATA/eid/'master.mp4').is_file():raise HTTPException(409,'Master synchronisé indisponible.')
    require_state(eid,('opus_failed','opus_rejected','no_clips','opus_delayed','submission_unknown'),'local_queued')
    db.update(eid,project_id=None,error=None,attempts=0,next_poll=0)
    return {'ok':True}

@app.get('/api/clips/{cid}/preview')
def clip_preview(cid:str):
    return FileResponse(clip_file(get_clip(cid)),media_type='video/mp4')

@app.get('/api/clips/{cid}/subtitles')
def subtitle_download(cid:str):
    clip=get_clip(cid)
    path=highlights.local_path(cid,clip['episode_id']).with_suffix('.clean.srt')
    if clip.get('provider')!='local' or not path.is_file():raise HTTPException(404,'Sous-titres indisponibles.')
    return FileResponse(path,filename='morning-mood-'+str(clip['rank'])+'.srt',media_type='application/x-subrip')

@app.get('/api/clips/{cid}/clean')
def clean_download(cid:str):
    clip=get_clip(cid)
    path=highlights.local_path(cid,clip['episode_id']).with_suffix('.clean.mp4')
    if clip.get('provider')!='local' or not path.is_file():raise HTTPException(404,'Version sans sous-titres indisponible.')
    return FileResponse(path,filename='morning-mood-'+str(clip['rank'])+'-sans-sous-titres.mp4',media_type='video/mp4')

def clip_file(clip):
    if clip.get('provider')=='local':
        target=highlights.local_path(clip['id'],clip['episode_id'])
        if not target.is_file():raise HTTPException(404,'Extrait archivé ou indisponible.')
        return target
    if not clip['export_url']:
        raise HTTPException(409,'Export Opus pas encore disponible.')
    folder=db.folder(clip['episode_id'])
    target=folder/(hashlib.sha256(clip['id'].encode()).hexdigest()[:20]+'.mp4')
    if not target.exists():
        try:
            download(clip['export_url'],target,400*1024**2)
        except Exception:
            raise HTTPException(502,'Téléchargement Opus indisponible. Actualiser les clips puis réessayer.')
    return target

download_lock=threading.Lock()

@app.get('/api/clips/{cid}/download')
def single_download(cid:str):
    clip=get_clip(cid)
    with download_lock:
        target=clip_file(clip)
    return FileResponse(target,filename='morning-mood-'+hashlib.sha256(cid.encode()).hexdigest()[:8]+'.mp4')

@app.get('/api/episodes/{eid}/export')
def export(eid:str):
    e=get_episode(eid)
    if e['state'] in ('cutting','selecting','local_queued','rendering'):
        raise HTTPException(409,'Le rendu est en cours. Attendre sa fin avant de télécharger la sélection.')
    clips=db.rows('SELECT * FROM clips WHERE episode_id=? AND selected=1 ORDER BY COALESCE(rank,99),id',(eid,))
    if not clips:
        raise HTTPException(400,'Sélectionner au moins un clip.')
    if any(c['caption_state']!='ready' for c in clips):
        raise HTTPException(409,'Attendre les descriptions de tous les clips sélectionnés avant l’export.')
    # Stream a ZIP without storing a second copy of all selected videos.
    import queue
    q=queue.Queue(maxsize=8)
    cancelled=threading.Event()
    paths=[]
    with download_lock:
        for clip in clips:
            paths.append(clip_file(clip))
    def push(item):
        while not cancelled.is_set():
            try:
                q.put(item,timeout=.5)
                return
            except queue.Full:
                pass
        raise BrokenPipeError()
    class Sink:
        pos=0
        def write(self,b):
            if b:
                push(b)
                self.pos+=len(b)
            return len(b)
        def tell(self): return self.pos
        def flush(self): pass
    def produce():
        try:
            with zipfile.ZipFile(Sink(),'w',compression=zipfile.ZIP_STORED) as z:
                manifest=[]
                for i,(clip,path) in enumerate(zip(clips,paths),1):
                    base=f'{i:02d}-extrait'
                    z.write(path,base+'.mp4')
                    subtitle=path.with_suffix('.clean.srt')
                    if subtitle.is_file():z.write(subtitle,base+'.srt')
                    copies=json.loads(clip['captions'])
                    for platform,text in copies.items():
                        z.writestr(base+'-'+platform+'.txt',text)
                    z.writestr(base+'-passage.txt',clip['title']+'\n\n'+(clip.get('description') or '')+'\n\nIntérêt : '+(clip.get('interest') or ''))
                    manifest.append({'file':base+'.mp4','title':clip['title'],'captions':copies,
                                     'description':clip.get('description'),'interest':clip.get('interest'),
                                     'rank':clip.get('rank'),'start':clip.get('start_time'),'end':clip.get('end_time')})
                z.writestr('descriptions.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        except BrokenPipeError:
            pass
        finally:
            if not cancelled.is_set():
                push(None)
    threading.Thread(target=produce,daemon=True).start()
    def stream():
        try:
            while True:
                item=q.get()
                if item is None: break
                yield item
        finally:
            cancelled.set()
    return StreamingResponse(stream(),media_type='application/zip',headers={
        'Content-Disposition':f'attachment; filename="morning-mood-{e["published"][:10]}.zip"'})

@app.post('/hooks/{eid}/{token}')
async def webhook(eid:str,token:str,request:Request):
    e=get_episode(eid)
    if not e['webhook_token'] or not hmac.compare_digest(token,e['webhook_token']):
        raise HTTPException(403)
    body=await request.body()
    if len(body)>100000:
        raise HTTPException(413)
    salt=request.headers.get('x-opus-salt','')
    signature=request.headers.get('x-opus-signature','')
    expected=hmac.new(OPUS_KEY.encode(),body+salt.encode(),hashlib.sha256).hexdigest()
    try:
        fresh=abs(time.time()-float(request.headers.get('x-opus-timestamp','0')))<300
    except ValueError:
        fresh=False
    if not OPUS_KEY or not re.fullmatch('[0-9a-fA-F]{16}',salt) or not fresh or not hmac.compare_digest(expected,signature):
        raise HTTPException(403)
    with db.connect() as c:
        if c.execute('SELECT 1 FROM webhook_salts WHERE salt=?',(salt,)).fetchone():
            return {'ok':True,'duplicate':True}
        c.execute('INSERT INTO webhook_salts VALUES (?,?)',(salt,time.time()))
        # The callback is a signal only. Clip data is fetched via authenticated Opus API.
        c.execute('UPDATE episodes SET callback_received=1,next_poll=0 WHERE id=?',(eid,))
    return {'ok':True}
