import contextlib
import fcntl
import json
import secrets
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import core


def worker(stop):
    while not stop.wait(2):
        with core.connect() as c:
            row=c.execute("SELECT id,research FROM editions WHERE state='queued' ORDER BY created LIMIT 1").fetchone()
        if row:
            try:
                selected=[n['id'] for n in json.loads(row['research'])['news']] if row['research'] else None
                core.generate_with_retries(row['id'],selected,stop)
                if core.get(row['id'])['state'] in core.AVAILABLE:core.send_day()
            except Exception:
                pass  # Failure detail is persisted by generate; do not crash the worker.


@contextlib.asynccontextmanager
async def lifespan(app):
    core.init()
    # A separate daily service may currently own the same generation lock.
    with (core.DATA/'generation.lock').open('a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with core.connect() as c:
                c.execute("UPDATE editions SET state='failed',stage='Interrompu',error='Préparation interrompue. Relancer une nouvelle édition.' WHERE state='working'")
        except BlockingIOError:pass
    stop=threading.Event()
    thread=threading.Thread(target=worker,args=(stop,),daemon=True)
    thread.start()
    yield
    stop.set()


app=FastAPI(title='Brief Mood',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)


@app.middleware('http')
async def security(request:Request,call_next):
    if request.headers.get('x-brief-user')!='xav':return JSONResponse({'detail':'Connexion au cockpit requise.'},status_code=401)
    if request.method not in ('GET','HEAD'):
        token=request.cookies.get('brief_csrf','')
        if not token or not secrets.compare_digest(token,request.headers.get('x-brief-csrf','')):
            return JSONResponse({'detail':'Session expirée. Actualiser la page.'},status_code=403)
    response=await call_next(request)
    response.headers['Cache-Control']='no-store'
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['X-Frame-Options']='SAMEORIGIN'
    response.headers['Referrer-Policy']='same-origin'
    return response


@app.get('/')
def index():return FileResponse(core.ROOT/'static/index.html')


@app.get('/api/state')
def state(request:Request):
    with core.connect() as c:
        editions=[dict(r) for r in c.execute('SELECT id,day,created,updated,state,stage,error,approved FROM editions ORDER BY created DESC LIMIT 60')]
        deliveries=[dict(r) for r in c.execute('SELECT * FROM deliveries ORDER BY day DESC LIMIT 14')]
    token=request.cookies.get('brief_csrf') or secrets.token_urlsafe(32)
    response=JSONResponse({'editions':editions,'deliveries':deliveries,'csrf':token,'today':core.now().date().isoformat()})
    response.set_cookie('brief_csrf',token,secure=True,httponly=True,samesite='strict',path='/brief-mood/')
    return response


def edition(eid):
    try:return core.get(eid)
    except KeyError:raise HTTPException(404,'Édition introuvable.')


@app.get('/api/editions/{eid}')
def read(eid:str):
    e=edition(eid)
    return {**e,'brief_text':core.text(e),'podcast_text':core.text(e,True)}


class Create(BaseModel):
    notes:str=Field(default='',max_length=5000)
    polarities:str=Field(default='',max_length=8000)


@app.post('/api/editions')
def create(body:Create):
    try:eid=core.create(body.notes,body.polarities)
    except ValueError as exc:raise HTTPException(409,str(exc))
    return {'id':eid}


class Revise(Create):
    selected:list[str]=Field(min_length=8,max_length=18)


@app.post('/api/editions/{eid}/revise')
def revise(eid:str,body:Revise):
    old=edition(eid)
    if old['state'] not in (*core.AVAILABLE,'failed') or not old['research']:raise HTTPException(409,'Recherche indisponible.')
    if old['day']!=core.now().date().isoformat():raise HTTPException(409,'Relancer la recherche du jour pour actualiser les faits.')
    research=old['research']
    if not set(body.selected)<={n['id'] for n in research['news']}:raise HTTPException(400,'Sélection inconnue.')
    research['news']=[n for n in research['news'] if n['id'] in body.selected]
    try:
        core.validate_research(research,old['day'])
        new=core.create(body.notes,body.polarities,research)
    except ValueError as exc:raise HTTPException(409,str(exc))
    return {'id':new}


class Polarities(BaseModel):
    polarities:str=Field(max_length=8000)


@app.put('/api/editions/{eid}/polarities')
def polarities(eid:str,body:Polarities):
    e=edition(eid)
    if not e['draft'] or e['state'] in ('queued','working'):raise HTTPException(409,'Attendre la fin de la préparation.')
    core.update(eid,polarities=body.polarities)
    return {'saved':True}


@app.post('/api/editions/{eid}/approve')
def approve(eid:str):
    e=edition(eid)
    if not e['draft'] or e['state'] in ('queued','working'):raise HTTPException(409,'Brouillon indisponible ou en cours de rédaction.')
    core.update(eid,approved=1)
    return {'approved':True}


@app.get('/api/editions/{eid}/export')
def export(eid:str,podcast:bool=False):
    e=edition(eid)
    if not e['draft']:raise HTTPException(409,'Le brouillon n’est pas encore rédigé.')
    suffix='-brouillon' if e['state'] not in core.AVAILABLE else ''
    return PlainTextResponse(core.warning_notice(e)+core.text(e,podcast),headers={'Content-Disposition':f'attachment; filename="brief-mood-{e["day"]}{"-podcast" if podcast else ""}{suffix}.txt"'})


app.mount('/static',StaticFiles(directory=core.ROOT/'static'),name='static')
