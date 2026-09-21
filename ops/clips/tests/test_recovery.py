import json
import sys
import time
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import db
import recovery
import highlights
from services import ServiceError


@pytest.fixture
def episode(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DATA',tmp_path)
    db.init()
    with db.connect() as c:
        c.execute('INSERT INTO episodes(id,guid,title,published,audio_url,description,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',
                  ('recovery-test','guid','Test','2026-09-21','https://example.com/audio','','fetching_audio',time.time(),time.time()))
    return db.episode('recovery-test')


@pytest.mark.parametrize('exc',[
    httpx.ConnectError('offline'),httpx.ReadTimeout('timeout'),
    ServiceError('Sélection Groq indisponible (HTTP 503).'),
    ServiceError('Classement des extraits invalide.'),
    ValueError('Échec de la création du master synchronisé.'),
])
def test_known_faults_are_classified(exc):
    assert recovery.category(exc)


@pytest.mark.parametrize('exc',[
    ServiceError('La transcription ne correspond pas à cet épisode Acast.'),
    ServiceError('Adresse média non publique refusée.'),
    ServiceError('Téléchargement média indisponible (HTTP 401).'),
    ValueError('Le contrôle du master synchronisé a échoué.'),
    RuntimeError('Unknown code defect'),
])
def test_ambiguous_or_permanent_faults_are_not_replayed(episode,exc):
    assert not recovery.schedule(episode,exc)
    assert db.episode(episode['id'])['state']=='fetching_audio'


def test_retries_are_bounded_and_persisted(episode):
    exc=httpx.ReadTimeout('timeout')
    for attempt in range(3):
        assert recovery.schedule(episode,exc)
        assert db.episode(episode['id'])['next_poll']>time.time()
    assert not recovery.schedule(episode,exc)
    record=db.meta('auto-recovery:'+episode['id']+':fetching_audio')
    assert record['attempts']==3 and record['status']=='needs_attention'


def test_external_creation_is_never_replayed(episode):
    for state in ('submitting','submission_unknown','submit_queued','opus_upload_queued','ready'):
        assert not recovery.schedule({**episode,'state':state},httpx.ReadTimeout('timeout'))


def test_missing_master_requires_valid_plan_and_both_sources(episode,monkeypatch):
    e={**episode,'state':'local_queued','plan_json':'[]'}
    exc=ServiceError('Master synchronisé indisponible.')
    assert not recovery.schedule(e,exc)
    folder=db.folder(e['id'])
    (folder/'source.mp4').write_bytes(b'video')
    (folder/'podcast.mp3').write_bytes(b'audio')
    monkeypatch.setattr(recovery.media,'duration',lambda _:60)
    validator=Mock(side_effect=ValueError('invalid'));monkeypatch.setattr(recovery.media,'validate_plan',validator)
    assert not recovery.schedule(e,exc)
    validator.side_effect=None;validator.return_value=[]
    assert recovery.schedule(e,exc)
    assert db.episode(e['id'])['state']=='render_queued'
    assert (folder/'source.mp4').read_bytes()==b'video'


def test_success_records_recovery(episode):
    recovery.schedule(episode,httpx.ReadTimeout('timeout'))
    recovery.completed(episode['id'],episode['state'])
    assert db.meta('auto-recovery:'+episode['id']+':fetching_audio')['status']=='recovered'


def test_selection_repairs_invalid_ids_before_cutting(episode,monkeypatch):
    segments=[{'id':0,'block':0,'start':0,'end':40,'text':'Le prix change les perspectives.'}]
    proposal={'first_segment':0,'last_segment':0,'title':'Le prix change',
              'description':'Une explication concrete.','interest':'Comprendre les consequences.',
              'hook':'Pourquoi le prix change ?'}
    bad={'clips':[{**proposal,'first_segment':99}]}
    engine=Mock(return_value={'clips':[proposal]});monkeypatch.setattr(highlights,'ask',engine)
    result=highlights.repair_window('Select',{},bad,segments,segments,{'min_duration':30,'max_duration':90},'test-selection')
    assert result[0]['start']==0
    assert engine.call_count==1
    assert engine.call_args.args[1]['validation_errors']


def test_invalid_selection_is_never_forced_through(episode,monkeypatch):
    segments=[{'id':0,'block':0,'start':0,'end':40,'text':'Un sujet complet.'}]
    engine=Mock(return_value={'clips':['invalid']});monkeypatch.setattr(highlights,'ask',engine)
    with pytest.raises(ServiceError,match='Corrections automatiques'):
        highlights.repair_window('Select',{},None,segments,segments,{'min_duration':30,'max_duration':90},'test-selection')
    assert engine.call_count==2


def test_caption_recovery_does_not_modify_episode_state(episode):
    clip={'id':'clip','episode_id':episode['id']}
    assert recovery.caption_retry(clip,ServiceError('Génération des descriptions indisponible (HTTP 503).'))
    assert db.episode(episode['id'])['state']==episode['state']


def test_upstream_quota_is_not_hidden_as_missing_transcript(episode,tmp_path,monkeypatch):
    monkeypatch.setattr(highlights,'TRANSCRIPTS',tmp_path)
    (tmp_path/'status.json').write_text(json.dumps({'available':False,'reason':'quota'}))
    highlights.process(episode)
    e=db.episode(episode['id'])
    assert e['state']=='waiting_transcript'
    assert 'quota' in e['error']
