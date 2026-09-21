"""Daily research, editorial validation and delivery, independent of the Radar DB."""
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
from email.message import EmailMessage
import sqlite3
import time
import uuid
import unicodedata
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import httpx
import agents

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('BRIEF_DATA', '/var/lib/brief-mood'))
PARIS = ZoneInfo('Europe/Paris')
RECIPIENTS = ('xfenaux@gmail.com', 'fenauxft@gmail.com')
PROMPT = (ROOT / 'prompts.md').read_text(encoding='utf-8')


def now():
    return dt.datetime.now(PARIS)


@contextlib.contextmanager
def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DATA / 'brief.sqlite3', timeout=30)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()


def init():
    with connect() as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS editions (
          id TEXT PRIMARY KEY, day TEXT NOT NULL, created TEXT NOT NULL,
          updated TEXT NOT NULL, state TEXT NOT NULL, stage TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '', polarities TEXT NOT NULL DEFAULT '',
          research TEXT, draft TEXT, audit TEXT, error TEXT, approved INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS deliveries (
          day TEXT NOT NULL, recipient TEXT NOT NULL, edition TEXT,
          state TEXT NOT NULL, detail TEXT, updated TEXT NOT NULL,
          PRIMARY KEY(day,recipient));
        CREATE TABLE IF NOT EXISTS archive (id TEXT PRIMARY KEY, day TEXT, text TEXT);
        ''')


def get(eid):
    with connect() as c:
        row = c.execute('SELECT * FROM editions WHERE id=?', (eid,)).fetchone()
    if not row:
        raise KeyError('Édition introuvable')
    row = dict(row)
    for key in ('research', 'draft', 'audit'):
        row[key] = json.loads(row[key]) if row[key] else None
    return row


def update(eid, **fields):
    assert set(fields) <= {'state','stage','research','draft','audit','error','approved','polarities'}
    for key in ('research','draft','audit'):
        if key in fields:
            fields[key] = json.dumps(fields[key], ensure_ascii=False)
    fields['updated'] = now().isoformat()
    with connect() as c:
        c.execute('UPDATE editions SET '+','.join(k+'=?' for k in fields)+' WHERE id=?', (*fields.values(),eid))


def create(notes='', polarities='', research=None):
    eid = uuid.uuid4().hex
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        stale=(now()-dt.timedelta(hours=2)).isoformat()
        c.execute("UPDATE editions SET state='failed',stage='Interrompu',error='Le délai de préparation a été dépassé.' WHERE state IN ('queued','working') AND updated<?",(stale,))
        # A queued job survives until the worker claims it; block double-clicks.
        if c.execute("SELECT 1 FROM editions WHERE state IN ('queued','working')").fetchone():
            raise ValueError('Une préparation est déjà en cours.')
        c.execute('INSERT INTO editions(id,day,created,updated,state,stage,notes,polarities,research) VALUES(?,?,?,?,?,?,?,?,?)',
                  (eid,now().date().isoformat(),now().isoformat(),now().isoformat(),'queued','En attente',notes,polarities,
                   json.dumps(research,ensure_ascii=False) if research else None))
    return eid


def obj(properties):
    return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}


S = {'type':'string'}
DATE = {'type':'string','pattern':r'^\d{4}-\d{2}-\d{2}$','description':'Date seule au format YYYY-MM-DD, sans commentaire.'}
def arr(item): return {'type':'array','items':item}

SOURCE = obj({'url':S,'title':S,'published_at':{'type':'string','description':'Date de publication YYYY-MM-DD, ou horodatage ISO8601 avec fuseau si connu. Ne pas inventer une heure.'},'evidence':S})
FACT = obj({'id':S,'topic_key':S,'section':{'type':'string','enum':['macro','entreprises','autres','agenda']},
            'title':S,'facts':S,'why':S,'event_date':DATE,
            'status':{'type':'string','enum':['published','scheduled']},'novelty':S,'sources':arr(SOURCE)})
RESEARCH = obj({'previous_us_session':DATE,'session_source':SOURCE,'news':arr(FACT),
                'coverage':arr(obj({'market':S,'finding':S})), 'gaps':arr(S),
                'closing':obj({'story':S,'lesson':S,'source':{'anyOf':[SOURCE,{'type':'null'}]}})})
DRAFT = obj({'intro':S,'sections':arr(obj({'heading':S,'body':S,'news_ids':arr(S)})),
             'closing':S,'podcast_title':S,'podcast_description':S,'podcast_script':S})
AUDIT = obj({'passed':{'type':'boolean'},'issues':arr(S),
             'checked_ids':arr(S),'source_checks':arr(obj({'url':S,'verified':{'type':'boolean'},'detail':S}))})
SOURCE_RECOVERY = obj({'replacements':arr(obj({'original_url':S,'source':SOURCE,
                       'verified':{'type':'boolean'},'supports_all_claims':{'type':'boolean'},'detail':S}))})


def without_duplicate_closing(draft):
    return {**draft,'sections':[s for s in draft['sections']
            if s['news_ids'] or normalized_closing(s['body'])!=normalized_closing(draft['closing'])]}


def model(task, evidence, schema, name, web=True):
    if name=='research':
        fields={k:v for k,v in RESEARCH['properties'].items() if k!='closing'}
        research=agents.run(task+' Ne redige pas le mot de la fin : un autre agent en est charge.',evidence,obj(fields),name,web,DATA,PROMPT)
        closing=agents.run('Prepare uniquement le mot de la fin. Varie angle et forme selon les precedents. Si tu choisis une anecdote ou citation, verifie sa source. Une reflexion originale sans attribution est autorisee.',
                           {'day':evidence['day'],'closing_archive':prior_closings(evidence['day'])},
                           obj({'closing':RESEARCH['properties']['closing']}),'closing',True,DATA,PROMPT)
        return {**research,**closing}
    if name=='draft':
        fields={k:v for k,v in DRAFT['properties'].items() if not k.startswith('podcast_')}
        brief=agents.run(task+' Produis uniquement le brief ecrit ; un autre agent adapte le podcast. sections contient seulement les actualites : le mot final doit etre uniquement dans closing, jamais dans sections. Chaque bloc doit avoir au moins 25 mots et des news_ids valides. Developpe au moins quatre sujets entreprises. Ne cree pas un bloc minuscule pour un chiffre isole : regroupe les faits proches.',evidence,obj(fields),name,False,DATA,PROMPT)
        podcast=agents.run('Adapte ce brief et son dossier en podcast pedagogique avec titre et description SEO. Explique pourquoi les informations comptent sans ajouter de fait, citation, chiffre ou position personnelle. Ne reinsere ni signature ni polarites.',
                           {**evidence,'brief':brief},obj({k:v for k,v in DRAFT['properties'].items() if k.startswith('podcast_')}),
                           'podcast',False,DATA,PROMPT)
        return without_duplicate_closing({**brief,**podcast})
    result=agents.run(task,evidence,schema,name,web,DATA,PROMPT)
    return without_duplicate_closing(result) if schema==DRAFT else result


def public_url(url):
    import ipaddress
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None,443):return False
    host = p.hostname.lower()
    if '.' not in host or host.endswith(('.local','.internal','.localhost')):return False
    try: return ipaddress.ip_address(host).is_global
    except ValueError: return True


def validate_research(r, day):
    target = dt.date.fromisoformat(day)
    previous = dt.date.fromisoformat(r['previous_us_session'])
    if not target-dt.timedelta(days=7) <= previous < target:
        raise ValueError('Dernière séance US non vérifiée.')
    if not public_url(r['session_source']['url']): raise ValueError('Source de clôture absente.')
    facts = r['news']
    if not 8 <= len(facts) <= 18 or sum(n['section']=='entreprises' for n in facts)<4:
        raise ValueError('Recherche trop peu approfondie, notamment sur les entreprises.')
    if len({n['id'] for n in facts})!=len(facts) or len({n['topic_key'] for n in facts})!=len(facts):
        raise ValueError('Actualités en doublon.')
    for n in facts:
        event = dt.date.fromisoformat(n['event_date'])
        if n['status']=='published' and not previous <= event <= target:
            raise ValueError('Actualité ancienne ou future présentée comme publiée : '+n['title'])
        if n['status']=='scheduled' and (n['section']!='agenda' or not target<=event<=target+dt.timedelta(days=7)):
            raise ValueError('Un rendez-vous futur doit rester dans l’agenda.')
        if len(n['facts'])<80 or not n['sources'] or not n['novelty'].strip():
            raise ValueError('Fait insuffisamment documenté : '+n['title'])
        for s in n['sources']:
            if not public_url(s['url']) or len(s['evidence'])<30:
                raise ValueError('Source sans preuve exploitable.')
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}',s['published_at']):
                if dt.date.fromisoformat(s['published_at'])>target:raise ValueError('Source future.')
            else:
                published = dt.datetime.fromisoformat(s['published_at'].replace('Z','+00:00'))
                if published.tzinfo is None or published>now()+dt.timedelta(minutes=5):
                    raise ValueError('Date de source invérifiable.')
    closing_reference=r['closing']['source']
    if closing_reference is not None and not public_url(closing_reference['url']):raise ValueError('Source du mot de la fin invalide.')
    for old in prior_closings(day):
        if ((closing_reference is not None and old['source'] and closing_source(closing_reference['url'])==closing_source(old['source']))
                or normalized_closing(r['closing']['story'])==normalized_closing(old['story'])):
            raise ValueError('Mot de la fin déjà utilisé le '+old['day']+' : choisir une autre histoire et une autre source.')


def normalized_closing(value):
    return re.sub(r'[^\w]+',' ',unicodedata.normalize('NFKC',value).casefold()).strip()


def closing_source(url):
    p=urlsplit(url)
    return (p.hostname or '').lower()+p.path.rstrip('/')


def prior_closings(day=None):
    with connect() as c:
        rows=c.execute("SELECT day,research,draft FROM editions WHERE state='ready' AND day<? AND research IS NOT NULL ORDER BY day DESC",(day or now().date().isoformat(),)).fetchall()
    return [{'day':r['day'],'story':json.loads(r['research'])['closing']['story'],
             'source':(json.loads(r['research'])['closing']['source'] or {}).get('url'),
             'text':json.loads(r['draft'])['closing']} for r in rows if r['draft']]


def history():
    today=now().date().isoformat()
    with connect() as c:
        rows = c.execute("SELECT day,research,draft FROM editions WHERE state='ready' AND day<? ORDER BY created DESC LIMIT 20",(today,)).fetchall()
        archived = [dict(r) for r in c.execute('SELECT day,text FROM archive WHERE day<? ORDER BY day DESC LIMIT 15',(today,))]
    return {'editions':[{'day':r['day'],'topics':[{k:n[k] for k in ('topic_key','title','facts','event_date')} for n in json.loads(r['research'])['news']],
                         'closing':json.loads(r['draft'])['closing']} for r in rows], 'published_examples':archived,'closing_archive':prior_closings()}


def text(e, podcast=False):
    d=e['draft']
    if not d:return ''
    polarities = '\n\n🧭 Polarités\n'+e['polarities'].strip() if e['polarities'].strip() else ''
    def unsigned(value):return re.sub(r'(?:\n\s*[Xx]avier\s*)+$','',value).rstrip()
    if podcast:return unsigned(d['podcast_script'])+polarities+'\n\nXavier'
    closing=re.sub(r'^\s*(?:[^\w\s]+\s*)?(?:Le\s+)?mot de la fin\s*:?\s*\n+', '', unsigned(d['closing']), flags=re.IGNORECASE)
    return '\n\n'.join([d['intro'],*[s['heading']+'\n'+s['body'] for s in d['sections']]])+polarities+'\n\n💡 Le mot de la fin\n'+closing+'\n\nXavier'


def length_notes(d):
    count=len(text({'draft':d,'polarities':''}).split())
    return [] if 600<=count<=900 else [f'Longueur {count} mots ; viser 700 à 800 mots, titres compris, hors polarités.']


def draft_issues(d, r):
    problems=[]
    body=' '.join([d['intro'],*[s['body'] for s in d['sections']],d['closing']])
    ids={n['id'] for n in r['news']}
    # The session dossier is evidence too, but is not a company news item.
    if r.get('previous_us_session') and public_url(r.get('session_source',{}).get('url','')):
        ids.add('previous_us_session')
    cited={i for s in d['sections'] for i in s['news_ids']}
    if not cited<=ids:
        problems.append('Référence à une actualité absente : '+', '.join(sorted(cited-ids))+'. Identifiants autorisés : '+', '.join(sorted(ids))+'.')
    companies={n['id'] for n in r['news'] if n['section']=='entreprises'}
    if len(cited&companies)<4:problems.append('Moins de quatre sujets entreprises développés.')
    for s in d['sections']:
        if not s['news_ids']:problems.append('Bloc '+s['heading']+' sans news_ids : rattacher aux preuves ; le mot final appartient uniquement au champ closing.')
        if len(s['body'].split())<25:problems.append('Bloc '+s['heading']+' trop superficiel : regrouper ou developper les faits verifies (25 mots minimum).')
        if not s['heading'] or ord(s['heading'][0])<0x2000:problems.append('Titre sans emoji initial.')
    all_text=' '.join([body,*[s['heading'] for s in d['sections']],d['podcast_title'],d['podcast_description'],d['podcast_script']])
    for bad in ['*','_','—','---','plombé par','la faute à','[source','http://','https://']:
        if bad.casefold() in all_text.casefold():problems.append('Forme interdite : '+bad)
    if not 10<=len(d['podcast_title'])<=120 or len(d['podcast_description'])<80:problems.append('Métadonnées podcast incomplètes.')
    if any(normalized_closing(d['closing'])==normalized_closing(old['text']) for old in prior_closings()):
        problems.append('Mot de la fin déjà publié : choisir une autre histoire.')
    return problems


def research_urls(research):
    urls={s['url'] for n in research['news'] for s in n['sources']} | {research['session_source']['url']}
    if research['closing']['source'] is not None:urls.add(research['closing']['source']['url'])
    return urls


def repair_source_links(eid, research, draft, audit):
    # Repair evidence references only after the independent factual audit passed.
    if not audit['passed'] or audit['issues'] or not {n['id'] for n in research['news']}<=set(audit['checked_ids']):
        return research,audit
    research=json.loads(json.dumps(research));audit=json.loads(json.dumps(audit))
    for attempt in range(2):
        verified={s['url'] for s in audit['source_checks'] if s['verified']}
        missing=research_urls(research)-verified
        if not missing:break
        update(eid,stage='Recherche de sources de remplacement',draft=draft)
        result=model('Les faits et les deux textes ont passé un audit indépendant, mais certaines URLs du dossier restent non confirmées. Ouvre les URLs alternatives déjà trouvées par cet audit et recherche si nécessaire des sources primaires ou des reprises intégrales fiables. Pour CHAQUE original_url manquante, vérifie TOUS les faits qui lui sont associés dans le dossier ET les textes (y compris clôture, dates, chiffres, nuances). Retourne une source directement lue avec titre, date réelle et preuve précise en français. verified et supports_all_claims ne valent true que si cette lecture confirme tous ces faits sans modifier les textes. Une même source peut être utilisée dans plusieurs sujets : contrôle chaque occurrence. Ne change aucun fait et ne coche jamais vrai pour satisfaire le programme. Si rien ne corrobore, retourne false et explique le manque. Les liens de remplacement doivent être publics et exacts, sans inventer de métadonnées.',
                     {'day':get(eid)['day'],'research':research,'draft':draft,'audit':audit,'missing_urls':sorted(missing)},SOURCE_RECOVERY,'source-recovery-'+str(attempt+1))
        sources=[research['session_source'],*[s for n in research['news'] for s in n['sources']]]
        if research['closing']['source'] is not None:sources.append(research['closing']['source'])
        for item in result['replacements']:
            if item['original_url'] not in missing or not item['verified'] or not item['supports_all_claims']:continue
            replacement=item['source']
            if not public_url(replacement['url']) or len(replacement['evidence'])<30:continue
            for source in sources:
                if source['url']==item['original_url']:
                    source.clear();source.update(replacement)
            audit['source_checks'].append({'url':replacement['url'],'verified':True,'detail':item['detail']})
            audit.setdefault('source_recovery',[]).append(item)
        validate_research(research,get(eid)['day'])
        update(eid,research=research,audit=audit)
    return research,audit


def recover_today():
    with (DATA/'generation.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('Une préparation est déjà en cours.')
        with connect() as c:
            row=c.execute('SELECT id FROM editions WHERE day=? ORDER BY created DESC LIMIT 1',(now().date().isoformat(),)).fetchone()
        if not row:raise ValueError('Aucune édition du jour à reprendre.')
        e=get(row['id']);a=e['audit'];r=e['research'];d=e['draft']
        if e['state']!='failed' or not d or not a or not a['passed'] or a['issues']:
            raise ValueError('Reprise ciblée impossible sans brouillon et audit factuel positif.')
        update(e['id'],state='working',error=None)
        try:
            r,a=repair_source_links(e['id'],r,d,a)
            verified={s['url'] for s in a['source_checks'] if s['verified']}
            if not research_urls(r)<=verified or not {n['id'] for n in r['news']}<=set(a['checked_ids']):
                raise ValueError('Sources de remplacement encore insuffisantes : '+', '.join(sorted(research_urls(r)-verified)))
            validate_research(r,e['day'])
            errors=draft_issues(d,r)
            if errors:raise ValueError(' '.join(errors))
            a['editorial_notes']=length_notes(d)
            update(e['id'],research=r,audit=a,state='ready',stage='Prêt',error=None)
        except Exception as exc:
            update(e['id'],state='failed',stage='À vérifier',error=str(exc)[:1800])
            raise
    send_day()


def write_and_audit(eid, research, attempt=0, resume=False, draft_override=None, editorial_retry=True):
    e=get(eid)
    update(eid,stage='Rédaction du brief et du podcast')
    evidence={'day':e['day'],'research':research,'notes':e['notes'],'polarities':e['polarities'],
              'previous_audit':e['audit'], 'previous_error':e['error']}
    saved=resume and e['draft'] and e['research']==research
    draft=draft_override or (e['draft'] if saved else model('Rédige les deux livrables à partir EXCLUSIVEMENT de ces faits vérifiés. Ne réinsère pas les polarités ni la signature : le programme les ajoute. Les news_ids relient chaque bloc à ses preuves : utilise les ids de news ; previous_us_session est réservé au dossier de clôture US et à session_source. Le podcast peut être plus long que le brief. Vise 700 à 800 mots pour le brief, titres compris, pour rester dans la cible 600-900.',evidence,DRAFT,'draft',False))
    if saved and draft_override is None and e['audit'] and e['audit']['issues']:
        draft=repair_audited_draft(evidence,draft,e['audit'])
    for repair in range(3):
        update(eid,draft=draft,stage='Ajustement éditorial')
        errors=draft_issues(draft,research)
        notes=length_notes(draft)
        if not errors:break
        draft=model('Corrige ce brouillon, sans ajouter de faits. Conserve les sources, les nuances et au moins quatre sujets entreprises. Si le texte est trop long, supprime les répétitions et resserre les formulations, sans tronquer les phrases. Si trop court, développe uniquement les faits déjà vérifiés. Vise 700-800 mots pour le brief, titres compris ; pas pour le podcast. Corrections : '+json.dumps(errors+notes,ensure_ascii=False),{**evidence,'draft':draft},DRAFT,'repair-'+str(repair+1),False)
    errors=draft_issues(draft,research)
    update(eid,draft=draft)
    if errors:raise ValueError('Contrôle éditorial : '+' '.join(errors))
    update(eid,draft=draft,stage='Contre-vérification des sources')
    audit=model('Vérification indépendante et stricte. Ouvre les sources, contrôle chaque affirmation des DEUX livrables contre les preuves et dates, clôture versus hors-séance, résultats publiés versus attendus, absence de recyclage sans fait nouveau, pertinence et exactitude des variations chiffrées, attribution de l’histoire finale, français et interdits. Les variations chiffrées sont AUTORISÉES si utiles, sourcées et contextualisées ; ne bloque jamais un texte pour la seule présence de points, pourcentages ou signes. Evite seulement les listes décoratives de performances. passed=false si un fait est douteux, inaccessible sans corroboration, inventé ou non soutenu. checked_ids contient tous les ids réellement vérifiés. source_checks liste les URLs réellement lues et leur résultat, y compris le mot de la fin ET la source de clôture. La signature et les polarités sont ajoutées par le programme : vérifie les textes finaux fournis. issues contient seulement les défauts bloquants, pas les contrôles réussis. Ne valide pas par complaisance.',{**evidence,'draft':draft,'final_brief':text({'draft':draft,'polarities':e['polarities']}),'final_podcast':text({'draft':draft,'polarities':e['polarities']},True),'history':history()},AUDIT,'audit')
    research,audit=repair_source_links(eid,research,draft,audit)
    expected={n['id'] for n in research['news']}
    urls=research_urls(research)
    verified={s['url'] for s in audit['source_checks'] if s['verified']}
    if not audit['passed'] or audit['issues'] or not expected<=set(audit['checked_ids']) or not urls<=verified:
        update(eid,audit=audit)
        if editorial_retry and audit['issues']:
            update(eid,stage='Correction ciblée du texte')
            corrected=repair_audited_draft(evidence,draft,audit)
            return write_and_audit(eid,research,attempt=attempt,draft_override=corrected,editorial_retry=False)
        if attempt == 0:
            update(eid,stage='Correction après vérification')
            repaired=model('Corrige le dossier à partir de cet audit indépendant. Remplace les URLs inaccessibles par des preuves directement lisibles, retire les sources redondantes inutilisables. Corrige les affirmations non étayées. Si le mot final est invérifiable, recherche une autre histoire documentée et vérifiable. Conserve au moins huit faits dont quatre entreprises. Ne change pas les faits exacts. Les textes seront ensuite rédigés et audités de nouveau.',
                           {'day':e['day'],'research':research,'audit':audit,'unverified_urls':sorted(urls-verified)},RESEARCH,'evidence-repair')
            repaired=complete_research(eid,repaired)
            update(eid,research=repaired)
            return write_and_audit(eid,repaired,attempt=1,editorial_retry=False)
        raise ValueError('Vérification non validée : '+' '.join(audit['issues'][:5] or ['Toutes les sources n’ont pas été confirmées.']))
    audit['editorial_notes']=length_notes(draft)
    update(eid,research=research,draft=draft,audit=audit,state='ready',stage='Prêt',error=None)


def repair_audited_draft(evidence, draft, audit):
    return model('Corrige UNIQUEMENT les passages signales par cet audit, dans les deux livrables si necessaire. Applique les formulations de remplacement proposees lorsqu elles sont soutenues par le dossier. Conserve mot pour mot tous les passages non concernes, les news_ids, les metadonnees et le mot final. Ne reecris pas le brief entier. Ne transforme jamais une hausse de revenus en hausse de volumes, ni une seance mixte en hausse generale. N ajoute aucun fait. Si le dossier ne permet pas de corriger une affirmation, retire cette affirmation plutot que l inventer. Le resultat sera audite de nouveau.',
                 {**evidence,'draft':draft,'previous_audit':audit},DRAFT,'repair-audit',False)


def complete_research(eid, research):
    day=get(eid)['day']
    for attempt in range(4):
        research=json.loads(json.dumps(research))
        # Classification is not a factual defect: move an explicitly scheduled
        # event to the agenda without changing its date, status or evidence.
        for news in research.get('news',[]):
            if news.get('status')=='scheduled':news['section']='agenda'
        update(eid,research=research,stage='Vérification et complément des actualités')
        try:
            validate_research(research,day)
            return research
        except (ValueError,KeyError,TypeError) as exc:
            if attempt==3:raise
            research=model('Corrige ce dossier par une nouvelle recherche ciblée. Une news ancienne, future présentée comme publiée ou non vérifiable doit être retirée et remplacée par une actualité fraîche et corroborée. Ne maquille jamais sa date pour la conserver. Classe les événements attendus dans agenda, avec status scheduled. Complète les entreprises si nécessaire. Conserve les faits exacts et vérifie toutes les contraintes, pas seulement la première erreur. Erreur : '+str(exc),
                           {'day':day,'research':research,'history':history()},RESEARCH,'research-repair-'+str(attempt+1))


def daily():
    """Retry the same day's saved work before escalating a failed delivery."""
    for attempt in range(3):
        day=now().date().isoformat()
        with connect() as c:
            if c.execute("SELECT 1 FROM editions WHERE day=? AND state='ready'",(day,)).fetchone():return
            row=c.execute('SELECT id,state FROM editions WHERE day=? ORDER BY created DESC LIMIT 1',(day,)).fetchone()
        eid=row['id'] if row and row['state']=='failed' else create()
        try:
            generate(eid)
            return
        except Exception:
            if attempt==2:raise
            time.sleep(30)


def generate(eid, selected=None):
    with (DATA/'generation.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('Une préparation est déjà en cours.')
        try:
            update(eid,state='working',stage='Recherche US, Asie et agenda',error=None)
            e=get(eid)
            if e['day']!=now().date().isoformat():raise ValueError('Cette édition ne correspond plus à la journée en cours.')
            if selected is None and not e['research']:
                # Reuse the proven Radar RSS parser, without changing its sources or database.
                import sys
                sys.path.insert(0,'/opt/ivt-radar')
                from collector import collect_sources
                queries=['US stocks earnings company results after hours when:1d',
                         'Asia China markets overnight yen oil gold dollar when:1d',
                         'Wall Street companies guidance merger contract when:1d']
                from urllib.parse import quote
                seeds=collect_sources({'sources':[{'name':'Google News US','url':'https://news.google.com/rss/search?q='+quote(q)+'&hl=en-US&gl=US&ceid=US:en'} for q in queries]})
                research=model('Effectue maintenant une recherche approfondie et lis les sources. Les RSS ne sont que des pistes. Respecte le jour cible et la fraîcheur réelle des événements. 10-16 faits, dont 4 entreprises minimum, agenda distinct, dossier de clôture et couverture des autres marchés. Chaque source a une date ISO8601 avec fuseau et evidence est une paraphrase précise de ce qui a été vérifié, pas une citation longue. Si la recherche est insuffisante ne comble pas les trous.',
                    {'day':e['day'],'started_at':now().isoformat(),'notes':e['notes'],'history':history(),'rss_leads':seeds},RESEARCH,'research')
                research=complete_research(eid,research)
            else:
                research=e['research']
                if selected is not None:
                    research['news']=[n for n in research['news'] if n['id'] in selected]
                    validate_research(research,e['day'])
                else:research=complete_research(eid,research)
            write_and_audit(eid,research,resume=selected is None and e['research']==research)
        except Exception as exc:
            update(eid,state='failed',stage='À vérifier',error=str(exc)[:1800])
            raise


def send_day(day=None):
    day=day or now().date().isoformat()
    if day!=now().date().isoformat():raise ValueError('Envoi d’une ancienne édition refusé.')
    with (DATA/'delivery.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        with connect() as c:
            row=c.execute("SELECT id FROM editions WHERE day=? AND state='ready' ORDER BY created DESC LIMIT 1",(day,)).fetchone()
        edition=get(row['id']) if row else None
        # Never substitute yesterday's edition. A missing verified edition sends a clear alert.
        if edition:
            payload={'day':day,'edition':edition['id'],'kind':'brief',
                     'title':'Brief Mood · '+day,'text':text(edition),
                     'podcast_title':edition['draft']['podcast_title'],
                     'podcast_description':edition['draft']['podcast_description'],
                     'polarities_missing':not bool(edition['polarities'].strip())}
        else:
            payload={'day':day,'edition':'','kind':'failure','title':'Brief Mood indisponible · '+day,
                     'text':'Le brief du jour n’a pas passé toutes les vérifications. Aucun ancien contenu n’a été envoyé. Consulte le cockpit pour voir le statut et relancer la préparation.',
                     'podcast_title':'','podcast_description':'','polarities_missing':False}
        if not os.environ.get('SMTP_PASSWORD'):raise RuntimeError('Envoi SMTP non configuré.')
        for recipient in RECIPIENTS:
            with connect() as c:
                done=c.execute('SELECT state,detail FROM deliveries WHERE day=? AND recipient=?',(day,recipient)).fetchone()
            if done and done['state']=='accepted' and not (done['detail']=='failure' and edition):continue
            if done and done['state'] in ('sending','uncertain'):
                raise RuntimeError('Envoi incertain : vérifier le serveur mail avant toute relance.')
            url='https://xavierfenaux.com/brief-mood/'+('?edition='+payload['edition'] if payload['edition'] else '')
            message=EmailMessage()
            message['Subject']=payload['title']
            sender=os.environ['MAIL_FROM']
            message['From']='Brief Mood <'+sender+'>'
            message['To']=recipient
            message['Reply-To']=sender
            message['Message-ID']='<brief-'+hashlib.sha256((day+'|'+recipient+'|'+payload['kind']).encode()).hexdigest()+'@'+sender.split('@')[1]+'>'
            intro='Le Brief Mood du jour est disponible.' if edition else 'La préparation du Brief Mood demande une vérification.'
            body=intro+'\n\nOuvrir dans le cockpit : '+url+'\n'
            if edition:body+='Préparation terminée le '+dt.datetime.fromisoformat(edition['updated']).astimezone(PARIS).strftime('%d/%m/%Y à %H:%M')+' (Paris).\n'
            if payload['polarities_missing']:body+='Polarités : à compléter dans le cockpit. Elles n’ont pas été inventées.\n'
            body+='\n'+payload['text']
            if edition:body+='\n\nVersion podcast\n'+payload['podcast_title']+'\n'+payload['podcast_description']+'\nScript complet : '+url
            message.set_content(body)
            started=False
            try:
                with smtplib.SMTP_SSL(os.environ['SMTP_HOST'],int(os.environ.get('SMTP_PORT','465')),timeout=45,context=ssl.create_default_context()) as smtp:
                    smtp.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
                    with connect() as c:
                        c.execute('INSERT OR REPLACE INTO deliveries VALUES(?,?,?,?,?,?)',
                                  (day,recipient,payload['edition'],'sending',payload['kind'],now().isoformat()))
                    started=True
                    refused=smtp.send_message(message,from_addr=sender,to_addrs=[recipient])
                    if refused:raise smtplib.SMTPRecipientsRefused(refused)
                state,detail='accepted',payload['kind']
            except (smtplib.SMTPAuthenticationError,smtplib.SMTPRecipientsRefused,smtplib.SMTPDataError):
                state,detail='failed','Le relais SMTP a refusé l’envoi.'
            except Exception:
                state='uncertain' if started else 'failed'
                detail='Confirmation SMTP absente. Vérifier avant de relancer.' if started else 'Connexion SMTP indisponible.'
            with connect() as c:
                c.execute('INSERT OR REPLACE INTO deliveries VALUES(?,?,?,?,?,?)',
                          (day,recipient,payload['edition'],state,detail,now().isoformat()))
            if state!='accepted':raise RuntimeError(detail)


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['generate','send','init','recover','daily'])
    args=parser.parse_args();init()
    if args.action=='generate':generate(create())
    if args.action=='send':send_day()
    if args.action=='recover':recover_today()
    if args.action=='daily':daily()
