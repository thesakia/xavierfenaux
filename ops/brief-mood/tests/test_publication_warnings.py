from unittest.mock import Mock, MagicMock

import pytest
import core
from test_core import database, research, draft


@pytest.fixture
def smtp(monkeypatch):
    for key,value in {'SMTP_PASSWORD':'test-only','SMTP_HOST':'smtp.example.com','SMTP_USER':'test','MAIL_FROM':'test@example.com'}.items():
        monkeypatch.setenv(key,value)
    server=Mock();server.send_message.return_value={}
    connection=MagicMock();connection.__enter__.return_value=server
    monkeypatch.setattr(core.smtplib,'SMTP_SSL',Mock(return_value=connection))
    return server


def unverified_edition():
    eid=core.create()
    core.update(eid,state='failed',research=research(),draft=draft(),
                audit={'passed':False,'issues':['Horaire de publication à vérifier.'],'checked_ids':[],'source_checks':[]})
    return eid


def test_failed_checks_send_full_brief_and_specific_warnings(smtp):
    eid=unverified_edition()
    core.send_day();core.send_day()
    e=core.get(eid)
    assert e['state']=='ready_with_warnings'
    assert e['audit']['passed'] is False
    assert smtp.send_message.call_count==2
    for call in smtp.send_message.call_args_list:
        mail=call.args[0]
        assert 'Points à vérifier' in mail['Subject']
        assert 'indisponible' not in mail['Subject']
        body=mail.get_content()
        assert 'POINTS À VÉRIFIER' in body
        assert 'Horaire de publication à vérifier.' in body
        assert draft()['intro'] in body and draft()['sections'][0]['body'] in body
    with core.connect() as c:
        rows=c.execute('SELECT state,detail,edition FROM deliveries').fetchall()
    assert all(r['state']=='accepted' and r['detail']=='brief' and r['edition']==eid for r in rows)


def test_generation_exception_publishes_saved_content_without_faking_audit(monkeypatch):
    eid=core.create(research=research())
    def fail(current,*args,**kwargs):
        core.update(current,draft=draft(),audit={'passed':False,'issues':['Source non confirmée.'],'checked_ids':[],'source_checks':[]})
        raise ValueError('Contrôle éditorial à vérifier.')
    monkeypatch.setattr(core,'write_and_audit',fail)
    core.generate(eid)
    assert core.get(eid)['state']=='ready_with_warnings'
    assert core.get(eid)['audit']['passed'] is False


def test_old_or_empty_content_is_not_publishable():
    eid=core.create()
    assert not core.publish_with_warnings(eid)
    core.update(eid,draft=draft())
    with core.connect() as c:c.execute("UPDATE editions SET day='2000-01-01' WHERE id=?",(eid,))
    assert not core.publish_with_warnings(eid)


def test_daily_does_not_regenerate_warning_edition(monkeypatch):
    eid=unverified_edition();core.publish_with_warnings(eid)
    engine=Mock();monkeypatch.setattr(core,'generate_with_retries',engine)
    core.daily()
    engine.assert_not_called()


def test_uncertain_smtp_still_blocks_duplicate(smtp):
    eid=unverified_edition();core.publish_with_warnings(eid)
    with core.connect() as c:
        c.execute('INSERT INTO deliveries VALUES(?,?,?,?,?,?)',(core.now().date().isoformat(),core.RECIPIENTS[0],eid,'uncertain','brief',core.now().isoformat()))
    with pytest.raises(RuntimeError,match='incertain'):core.send_day()
    smtp.send_message.assert_not_called()


def test_in_progress_generation_is_not_sent_as_partial_content(smtp):
    eid=unverified_edition();core.update(eid,state='working')
    with (core.DATA/'generation.lock').open('a') as lock:
        core.fcntl.flock(lock,core.fcntl.LOCK_EX|core.fcntl.LOCK_NB)
        core.send_day()
    smtp.send_message.assert_not_called()
    assert core.get(eid)['state']=='working'


def test_written_brief_survives_podcast_agent_failure(monkeypatch):
    eid=core.create();written={k:v for k,v in draft().items() if not k.startswith('podcast_')}
    monkeypatch.setattr(core.agents,'run',Mock(side_effect=[written,RuntimeError('Podcast indisponible')]))
    with pytest.raises(RuntimeError):core.model('Write',{'_edition_id':eid},core.DRAFT,'draft',False)
    assert core.get(eid)['draft']['intro']==written['intro']
    assert core.publish_with_warnings(eid,'Podcast indisponible')
    assert any('podcast non générée' in w for w in core.get(eid)['warnings'])


def test_research_parameter_becomes_warning_when_repair_unavailable(monkeypatch):
    eid=core.create();r=research();r['news'][0]['event_date']='2000-01-01'
    monkeypatch.setattr(core,'model',Mock(side_effect=RuntimeError('offline')))
    assert core.complete_research(eid,r)==r
    assert any('Actualité ancienne' in w for w in core.get(eid)['warnings'])
