import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core
from app import app


@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(core,'DATA',tmp_path)
    monkeypatch.setattr(core,'generate',lambda *_:None)
    with TestClient(app,base_url='https://testserver') as client:
        yield client


def test_no_direct_access(client):
    assert client.get('/api/state').status_code==401


def test_csrf_required(client):
    assert client.post('/api/editions',json={},headers={'x-brief-user':'xav'}).status_code==403


def test_create_and_double_click(client):
    s=client.get('/api/state',headers={'x-brief-user':'xav'})
    assert s.status_code==200 and 'HttpOnly' in s.headers['set-cookie']
    token=s.json()['csrf']
    headers={'x-brief-user':'xav','x-brief-csrf':token,'cookie':'brief_csrf='+token}
    r=client.post('/api/editions',json={'notes':'Priorité entreprises'},headers=headers)
    assert r.status_code==200
    assert client.post('/api/editions',json={},headers=headers).status_code==409
    assert client.get('/api/editions/'+r.json()['id'],headers=headers).json()['notes']=='Priorité entreprises'
    assert client.get('/api/editions/'+r.json()['id']+'/export',headers=headers).status_code==409


def test_unknown_edition(client):
    assert client.get('/api/editions/unknown',headers={'x-brief-user':'xav'}).status_code==404


def test_failed_draft_can_be_read_exported_and_reviewed_without_bypassing_audit(client):
    from test_core import draft
    eid=core.create();core.update(eid,state='failed',draft=draft(),error='Source à vérifier')
    headers={'x-brief-user':'xav','x-brief-csrf':'test','cookie':'brief_csrf=test'}
    assert client.get('/api/editions/'+eid,headers=headers).json()['brief_text']
    exported=client.get('/api/editions/'+eid+'/export',headers=headers)
    assert exported.status_code==200 and '-brouillon.txt' in exported.headers['content-disposition']
    assert client.post('/api/editions/'+eid+'/approve',json={},headers=headers).status_code==200
    assert core.get(eid)['approved']==1 and core.get(eid)['state']=='failed'


def test_inputs_bounded(client):
    headers={'x-brief-user':'xav','x-brief-csrf':'test','cookie':'brief_csrf=test'}
    assert client.post('/api/editions',json={'notes':'a'*5001},headers=headers).status_code==422
