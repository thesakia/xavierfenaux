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


def test_scheduled_company_is_moved_to_agenda_without_changing_facts(monkeypatch):
    eid=core.create();r=research()
    n={**r['news'][0],'id':'upcoming','topic_key':'upcoming','status':'scheduled',
       'event_date':(core.now().date()+dt.timedelta(days=2)).isoformat()}
    r['news'].append(n)
    monkeypatch.setattr(core,'model',Mock(side_effect=AssertionError('No research call for classification')))
    fixed=core.complete_research(eid,r)
    assert fixed['news'][-1]=={**n,'section':'agenda'}
    assert r['news'][-1]['section']=='entreprises'
    assert core.get(eid)['research']==fixed


def test_invalid_news_are_researched_again_and_progress_saved(monkeypatch):
    eid=core.create();r=research();bad=json.loads(json.dumps(r))
    bad['news'][0]['event_date']='2000-01-01'
    model=Mock(side_effect=[bad,r]);monkeypatch.setattr(core,'model',model)
    assert core.complete_research(eid,bad)==r
    assert model.call_count==2
    assert core.get(eid)['research']==r


def test_daily_retries_same_edition_and_stops_after_success(monkeypatch):
    eid=core.create();core.update(eid,state='failed')
    calls=[]
    def generate(current):
        calls.append(current)
        if len(calls)==1:
            core.update(current,state='failed');raise ValueError('retry')
        core.update(current,state='ready')
    monkeypatch.setattr(core,'generate',generate)
    monkeypatch.setattr(core.time,'sleep',lambda _:None)
    core.daily();core.daily()
    assert calls==[eid,eid]
    with core.connect() as c:
        assert [r['outcome'] for r in c.execute('SELECT outcome FROM recovery_log ORDER BY id')]==['retry_scheduled','completed']


def test_cockpit_retry_exhaustion_is_recorded(monkeypatch):
    eid=core.create()
    engine=Mock(side_effect=ValueError('temporary'))
    monkeypatch.setattr(core,'generate',engine)
    monkeypatch.setattr(core.time,'sleep',lambda _:None)
    with pytest.raises(ValueError):core.generate_with_retries(eid)
    assert engine.call_count==3
    with core.connect() as c:
        assert c.execute('SELECT outcome FROM recovery_log ORDER BY id DESC LIMIT 1').fetchone()['outcome']=='exhausted'


def test_cockpit_recovery_never_retries_an_old_edition(monkeypatch):
    eid=core.create()
    with core.connect() as c:c.execute("UPDATE editions SET day='2000-01-01' WHERE id=?",(eid,))
    engine=Mock();monkeypatch.setattr(core,'generate',engine)
    with pytest.raises(ValueError):core.generate_with_retries(eid)
    engine.assert_not_called()


def test_daily_does_not_reuse_yesterday(monkeypatch):
    eid=core.create();core.update(eid,state='ready')
    with core.connect() as c:c.execute('UPDATE editions SET day=? WHERE id=?',('2000-01-01',eid))
    calls=[]
    monkeypatch.setattr(core,'generate',lambda current:calls.append(current))
    core.daily()
    assert len(calls)==1 and calls[0]!=eid


def previous_closing():
    eid=core.create();r=research();d=draft()
    core.update(eid,state='ready',research=r,draft=d)
    with core.connect() as c:
        c.execute('UPDATE editions SET day=? WHERE id=?',((core.now().date()-dt.timedelta(days=1)).isoformat(),eid))
    return r,d


def test_reused_closing_source_is_blocked_even_with_tracking():
    previous_closing();r=research()
    r['closing']['story']='Une autre formulation de la même anecdote.'
    r['closing']['source']['url']+='?utm_source=other'
    with pytest.raises(ValueError,match='Mot de la fin déjà'):
        core.validate_research(r,core.now().date().isoformat())


def test_reused_story_with_new_url_is_blocked():
    previous_closing();r=research();r['closing']['source']['url']='https://example.com/other'
    with pytest.raises(ValueError,match='Mot de la fin déjà'):
        core.validate_research(r,core.now().date().isoformat())


def test_new_closing_is_allowed_and_history_is_supplied():
    previous_closing();r=research()
    r['closing']['source']['url']='https://example.com/other'
    r['closing']['story']='Une histoire différente, documentée ailleurs.'
    core.validate_research(r,core.now().date().isoformat())
    assert len(core.history()['closing_archive'])==1
    assert any('Mot de la fin déjà' in p for p in core.draft_issues(draft(),r))


def test_original_reflection_without_external_claims_needs_no_fake_source():
    r=research();r['closing']={'story':'Accepter de ne pas savoir.', 'lesson':'Quelle information ferait changer notre avis ?', 'source':None}
    core.validate_research(r,core.now().date().isoformat())
    assert core.research_urls(r)=={r['session_source']['url']}
    eid=core.create();d=draft();d['closing']='Accepter de ne pas savoir.'
    core.update(eid,state='ready',research=r,draft=d)
    with core.connect() as c:
        c.execute('UPDATE editions SET day=? WHERE id=?',((core.now().date()-dt.timedelta(days=1)).isoformat(),eid))
    assert core.prior_closings()[0]['source'] is None
    r['closing']['story']='Changer de perspective avant de choisir.'
    core.validate_research(r,core.now().date().isoformat())
    r['closing']['story']='Accepter de ne pas savoir.'
    with pytest.raises(ValueError,match='Mot de la fin déjà'):
        core.validate_research(r,core.now().date().isoformat())


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


def test_draft_allows_numerical_variation_for_editorial_audit():
    d=draft();d['intro']='Action +12 % ce matin.'
    assert not any('Variation' in x for x in core.draft_issues(d,research()))


@pytest.mark.parametrize('value',['3,75 %-4,00 %','3.75% - 4.00%','3,75 %–4,00 %'])
def test_rate_range_is_not_a_signed_market_move(value):
    d=draft();d['intro']='La fourchette de taux est de '+value+'.'
    d['podcast_script']=d['intro']
    assert not any('Variation' in x for x in core.draft_issues(d,research()))


@pytest.mark.parametrize('value',['-4 %','−4 %','+4 %','- 4,00 %'])
def test_signed_market_moves_are_not_automatically_blocked(value):
    d=draft();d['intro']='Le titre affiche '+value+'.'
    assert not any('Variation' in x for x in core.draft_issues(d,research()))


def test_generated_signature_is_not_duplicated():
    d=draft();d['closing']+='\n\nXavier';d['podcast_script']+='\n\nXavier'
    e={'draft':d,'polarities':''}
    assert core.text(e).count('Xavier')==1
    assert core.text(e,True).count('Xavier')==1


@pytest.mark.parametrize('heading',['📝 Mot de la fin','💡 Le mot de la fin','Mot de la fin :'])
def test_generated_closing_heading_is_not_duplicated(heading):
    d=draft();d['closing']=heading+'\n\n'+d['closing']
    result=core.text({'draft':d,'polarities':''})
    assert result.casefold().count('mot de la fin')==1
    assert 'Une discipline constante' in result


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


def test_failure_notice_does_not_block_recovered_brief(monkeypatch):
    for key,value in {'SMTP_PASSWORD':'test-only','SMTP_HOST':'smtp.example.com','SMTP_USER':'test','MAIL_FROM':'test@example.com'}.items():monkeypatch.setenv(key,value)
    from unittest.mock import MagicMock
    smtp=Mock();smtp.send_message.return_value={}
    connection=MagicMock();connection.__enter__.return_value=smtp
    monkeypatch.setattr(core.smtplib,'SMTP_SSL',Mock(return_value=connection))
    core.send_day()
    eid=core.create();core.update(eid,state='ready',draft=draft())
    core.send_day();core.send_day()
    assert smtp.send_message.call_count==4
    messages=[call.args[0] for call in smtp.send_message.call_args_list]
    assert len({str(m['Message-ID']) for m in messages})==4
    assert 'indisponible' not in str(messages[-1]['Subject'])


def test_audit_correction_is_bounded(monkeypatch):
    eid=core.create();r=research();d=draft()
    bad={'passed':False,'issues':['Fait non confirmé'],'checked_ids':[], 'source_checks':[]}
    monkeypatch.setattr(core,'draft_issues',lambda *_:[])
    engine=Mock(side_effect=[d,bad,d,bad,r,d,bad])
    monkeypatch.setattr(core,'model',engine)
    with pytest.raises(ValueError):core.write_and_audit(eid,r)
    assert engine.call_count==7
    assert core.get(eid)['state']!='ready'


def test_word_limit_includes_headings():
    d=draft()
    d['sections'][0]['heading']='🏢 '+('titre '*400)
    assert any('Longueur' in x for x in core.length_notes(d))
    assert not any('Longueur' in x for x in core.draft_issues(d,research()))


def test_verified_alternative_replaces_every_reference_without_changing_facts(monkeypatch):
    eid=core.create();r=research();d=draft()
    old=r['session_source']['url'];replacement={**r['session_source'],'url':'https://www.example.com/canonical'}
    a={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],
       'source_checks':[{'url':old,'verified':False,'detail':'URL inaccessible'}]}
    monkeypatch.setattr(core,'model',Mock(return_value={'replacements':[{'original_url':old,'source':replacement,'verified':True,'supports_all_claims':True,'detail':'Tous les faits confirmés sur la page canonique.'}]}))
    fixed,audit=core.repair_source_links(eid,r,d,a)
    assert core.research_urls(fixed)=={replacement['url']}
    assert [n['facts'] for n in fixed['news']]==[n['facts'] for n in r['news']]
    assert r['session_source']['url']==old
    assert audit['source_checks'][0]['verified'] is False
    assert len(audit['source_recovery'])==1


def test_incomplete_alternative_cannot_satisfy_coverage(monkeypatch):
    eid=core.create();r=research();d=draft();old=r['session_source']['url']
    a={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],'source_checks':[]}
    engine=Mock(return_value={'replacements':[{'original_url':old,'source':r['session_source'],'verified':True,'supports_all_claims':False,'detail':'Une seule affirmation confirmée.'}]})
    monkeypatch.setattr(core,'model',engine)
    fixed,audit=core.repair_source_links(eid,r,d,a)
    assert audit['source_checks']==[]
    assert core.research_urls(fixed)=={old}
    assert engine.call_count==2


def test_source_recovery_does_not_override_a_failed_fact_audit(monkeypatch):
    eid=core.create();r=research();d=draft()
    a={'passed':False,'issues':['Fait erroné'],'checked_ids':[],'source_checks':[]}
    engine=Mock();monkeypatch.setattr(core,'model',engine)
    assert core.repair_source_links(eid,r,d,a)==(r,a)
    engine.assert_not_called()


def test_length_alone_never_delays_factual_audit(monkeypatch):
    eid=core.create();r=research();d=draft()
    audit={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],
           'source_checks':[{'url':r['session_source']['url'],'verified':True}]}
    monkeypatch.setattr(core,'length_notes',lambda _:['Longueur 901 mots'])
    engine=Mock(side_effect=[d,audit])
    monkeypatch.setattr(core,'model',engine)
    core.write_and_audit(eid,r)
    assert engine.call_count==2
    assert core.get(eid)['state']=='ready'
    assert core.get(eid)['audit']['editorial_notes']==['Longueur 901 mots']


def test_editorial_repairs_never_bypass_missing_sources(monkeypatch):
    eid=core.create();r=research();d=draft()
    d['sections'][0]['news_ids']=['unknown']
    monkeypatch.setattr(core,'model',Mock(return_value=d))
    with pytest.raises(ValueError,match='actualité absente'):
        core.write_and_audit(eid,r)
    assert core.get(eid)['state']!='ready'
    assert core.get(eid)['draft'] is not None


def test_session_reference_uses_existing_dossier():
    r=research();d=draft()
    d['sections'].append({'heading':'📊 Cloture US','body':'Les faits verifies. '*30,
                          'news_ids':['previous_us_session']})
    assert core.draft_issues(d,r)==[]
    r['session_source']['url']=''
    assert any('previous_us_session' in x for x in core.draft_issues(d,r))


def test_unknown_reference_reports_id_and_allowed_ids():
    d=draft();d['sections'][0]['news_ids'].append('wrong-id')
    errors=core.draft_issues(d,research())
    assert any('wrong-id' in x and 'Identifiants autorisés' in x for x in errors)


def test_saved_draft_is_reaudited_without_rewriting(monkeypatch):
    eid=core.create();r=research();d=draft()
    core.update(eid,state='failed',research=r,draft=d)
    audit={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],
           'source_checks':[{'url':r['session_source']['url'],'verified':True}]}
    engine=Mock(return_value=audit);monkeypatch.setattr(core,'model',engine)
    core.write_and_audit(eid,r,resume=True)
    assert engine.call_count==1
    assert engine.call_args.args[3]=='audit'
    assert core.get(eid)['state']=='ready'


def test_factual_wording_is_repaired_without_regenerating_research(monkeypatch):
    eid=core.create();r=research();d=draft()
    bad={'passed':False,'issues':['Remplacer hausse par seance mixte.'],
         'checked_ids':[n['id'] for n in r['news']],
         'source_checks':[{'url':r['session_source']['url'],'verified':True}]}
    good={**bad,'passed':True,'issues':[]}
    fixed={**d,'intro':'Une seance mixte.'}
    engine=Mock(side_effect=[d,bad,fixed,good]);monkeypatch.setattr(core,'model',engine)
    core.write_and_audit(eid,r)
    assert [c.args[3] for c in engine.call_args_list]==['draft','audit','repair-audit','audit']
    assert core.get(eid)['draft']==fixed
    assert core.get(eid)['state']=='ready'


def test_resuming_failed_audit_repairs_before_checking_again(monkeypatch):
    eid=core.create();r=research();d=draft()
    bad={'passed':False,'issues':['Corriger accroche.'],'checked_ids':[],'source_checks':[]}
    core.update(eid,state='failed',research=r,draft=d,audit=bad)
    good={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],
          'source_checks':[{'url':r['session_source']['url'],'verified':True}]}
    engine=Mock(side_effect=[d,good]);monkeypatch.setattr(core,'model',engine)
    core.write_and_audit(eid,r,resume=True)
    assert [c.args[3] for c in engine.call_args_list]==['repair-audit','audit']
    assert core.get(eid)['state']=='ready'


def test_changed_research_does_not_reuse_saved_draft(monkeypatch):
    eid=core.create();r=research();d=draft()
    core.update(eid,state='failed',research=r,draft=d)
    r['news'][0]['facts']+=' Nouvelle precision.'
    audit={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],
           'source_checks':[{'url':r['session_source']['url'],'verified':True}]}
    engine=Mock(side_effect=[d,audit]);monkeypatch.setattr(core,'model',engine)
    core.write_and_audit(eid,r,resume=True)
    assert engine.call_count==2
    assert engine.call_args_list[0].args[3]=='draft'


def test_resumed_draft_still_requires_verified_session_source(monkeypatch):
    eid=core.create();r=research();d=draft()
    r['session_source']={**r['session_source'],'url':'https://example.com/session'}
    core.update(eid,state='failed',research=r,draft=d)
    audit={'passed':True,'issues':[],'checked_ids':[n['id'] for n in r['news']],
           'source_checks':[{'url':r['news'][0]['sources'][0]['url'],'verified':True}]}
    monkeypatch.setattr(core,'model',Mock(return_value=audit))
    monkeypatch.setattr(core,'repair_source_links',lambda eid,r,d,a:(r,a))
    with pytest.raises(ValueError,match='Vérification non validée'):
        core.write_and_audit(eid,r,attempt=1,resume=True)
    assert core.get(eid)['state']!='ready'


def test_uncertain_smtp_is_not_retried(monkeypatch):
    for key,value in {'SMTP_PASSWORD':'test-only','SMTP_HOST':'smtp.example.com','SMTP_USER':'test','MAIL_FROM':'test@example.com'}.items():monkeypatch.setenv(key,value)
    smtp=Mock();smtp.send_message.side_effect=core.smtplib.SMTPServerDisconnected('Connection lost')
    from unittest.mock import MagicMock
    connection=MagicMock();connection.__enter__.return_value=smtp
    monkeypatch.setattr(core.smtplib,'SMTP_SSL',Mock(return_value=connection))
    with pytest.raises(RuntimeError):core.send_day()
    with pytest.raises(RuntimeError):core.send_day()
    assert smtp.send_message.call_count==1
