import datetime as dt
import json
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core


@pytest.fixture(autouse=True)
def database(tmp_path,monkeypatch):
    monkeypatch.setattr(core,'DATA',tmp_path)
    core.init()


def research():
    day=core.now().date()
    source={'url':'https://www.example.com/news','title':'Publication officielle','published_at':core.now().isoformat(),'evidence':'Un fait concret documenté par la publication officielle de ce matin.'}
    return {'previous_us_session':(day-dt.timedelta(days=1)).isoformat(),'session_source':source,
        'news':[{'id':str(i),'topic_key':f'event-{i}','section':'entreprises' if i<4 else 'autres',
                 'title':f'Annonce {i}','facts':'Un fait précis et sourcé dans une annonce publiée ce matin. '*3,
                 'why':'Conséquence concrète.','event_date':day.isoformat(),'status':'published','novelty':'Nouvelle publication.',
                 'sources':[source]} for i in range(8)],'gaps':[], 'coverage':[],
        'closing':{'story':'Une histoire vérifiée.','lesson':'Une leçon concrète.','source':source}}


def draft():
    return {'intro':'Bonjour à tous.', 'sections':[{'heading':'🏢 Entreprise '+str(i),'body':('Les commandes soutiennent les revenus tandis que la direction précise ses perspectives. '*12),'news_ids':[str(i)]} for i in range(4)],
            'closing':'Une discipline constante guide les décisions. '*5,'podcast_title':'Les annonces entreprises à comprendre ce matin',
            'podcast_description':'Voici les nouvelles du jour, leur contexte et les conséquences à comprendre pour préparer sa lecture des marchés.',
            'podcast_script':'Le podcast explique les faits sans en inventer.'}


def test_parallel_creation_refused():
    core.create()
    with pytest.raises(ValueError):core.create()


def test_old_interrupted_job_does_not_block_next_day():
    eid=core.create()
    with core.connect() as c:c.execute('UPDATE editions SET updated=? WHERE id=?',((core.now()-dt.timedelta(hours=3)).isoformat(),eid))
    assert core.create()!=eid
    assert core.get(eid)['state']=='failed'


def test_future_result_is_not_published():
    r=research();r['news'][0]['event_date']=(core.now().date()+dt.timedelta(days=1)).isoformat()
    with pytest.raises(ValueError):core.validate_research(r,core.now().date().isoformat())


def test_scheduled_news_requires_agenda():
    r=research();r['news'][0]['status']='scheduled'
    with pytest.raises(ValueError):core.validate_research(r,core.now().date().isoformat())


def test_duplicates_rejected():
    r=research();r['news'][1]['topic_key']=r['news'][0]['topic_key']
    with pytest.raises(ValueError):core.validate_research(r,core.now().date().isoformat())


@pytest.mark.parametrize('url',['javascript:alert(1)','http://example.com','https://127.0.0.1','https://metadata.internal/','https://user:pass@example.com'])
def test_source_urls(url):assert not core.public_url(url)


def test_plain_export_never_invents_polarities():
    e={'draft':draft(),'polarities':''}
    assert 'Polarités' not in core.text(e)
    assert core.text(e).endswith('Xavier')
    e['polarities']='Mon scénario fourni par Xavier.'
    assert core.text(e).count(e['polarities'])==1


def test_draft_forbidden_variation():
    d=draft();d['intro']='Action +12 % ce matin.'
    assert any('Variation' in x for x in core.draft_issues(d,research()))


def test_generated_signature_is_not_duplicated():
    d=draft();d['closing']+='\n\nXavier';d['podcast_script']+='\n\nXavier'
    e={'draft':d,'polarities':''}
    assert core.text(e).count('Xavier')==1
    assert core.text(e,True).count('Xavier')==1


def test_revisions_do_not_treat_today_as_recycled_news():
    today=core.now().date()
    with core.connect() as c:
        c.execute('INSERT INTO archive VALUES(?,?,?)',('today',today.isoformat(),'Current edition'))
        c.execute('INSERT INTO archive VALUES(?,?,?)',('previous',(today-dt.timedelta(days=1)).isoformat(),'Previous edition'))
    assert [r['text'] for r in core.history()['published_examples']]==['Previous edition']


def test_no_historical_delivery():
    with pytest.raises(ValueError):core.send_day('2020-01-01')


def test_mail_retry_is_idempotent(monkeypatch):
    for key,value in {'SMTP_PASSWORD':'test-only','SMTP_HOST':'smtp.example.com','SMTP_USER':'test','MAIL_FROM':'test@example.com'}.items():monkeypatch.setenv(key,value)
    smtp=Mock();smtp.send_message.return_value={}
    from unittest.mock import MagicMock
    connection=MagicMock();connection.__enter__.return_value=smtp
    monkeypatch.setattr(core.smtplib,'SMTP_SSL',Mock(return_value=connection))
    core.send_day();core.send_day()
    assert smtp.send_message.call_count==2
    for call in smtp.send_message.call_args_list:
        assert call.kwargs['to_addrs'][0] in core.RECIPIENTS
        assert 'indisponible' in str(call.args[0]['Subject'])


def test_incomplete_audit_blocks_ready(monkeypatch):
    eid=core.create();r=research();d=draft()
    monkeypatch.setattr(core,'draft_issues',lambda *_:[])
    monkeypatch.setattr(core,'model',Mock(side_effect=[d,{'passed':True,'issues':[],'checked_ids':[], 'source_checks':[]}]))
    with pytest.raises(ValueError):core.write_and_audit(eid,r,attempt=1)
    assert core.get(eid)['state']!='ready'


def test_audit_correction_is_bounded(monkeypatch):
    eid=core.create();r=research();d=draft()
    bad={'passed':False,'issues':['Fait non confirmé'],'checked_ids':[], 'source_checks':[]}
    monkeypatch.setattr(core,'draft_issues',lambda *_:[])
    engine=Mock(side_effect=[d,bad,r,d,bad])
    monkeypatch.setattr(core,'model',engine)
    with pytest.raises(ValueError):core.write_and_audit(eid,r)
    assert engine.call_count==5
    assert core.get(eid)['state']!='ready'


def test_word_limit_includes_headings():
    d=draft()
    d['sections'][0]['heading']='🏢 '+('titre '*400)
    assert any('Longueur' in x for x in core.draft_issues(d,research()))


def test_uncertain_smtp_is_not_retried(monkeypatch):
    for key,value in {'SMTP_PASSWORD':'test-only','SMTP_HOST':'smtp.example.com','SMTP_USER':'test','MAIL_FROM':'test@example.com'}.items():monkeypatch.setenv(key,value)
    smtp=Mock();smtp.send_message.side_effect=core.smtplib.SMTPServerDisconnected('Connection lost')
    from unittest.mock import MagicMock
    connection=MagicMock();connection.__enter__.return_value=smtp
    monkeypatch.setattr(core.smtplib,'SMTP_SSL',Mock(return_value=connection))
    with pytest.raises(RuntimeError):core.send_day()
    with pytest.raises(RuntimeError):core.send_day()
    assert smtp.send_message.call_count==1
