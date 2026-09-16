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


def test_inputs_bounded(client):
    headers={'x-brief-user':'xav','x-brief-csrf':'test','cookie':'brief_csrf=test'}
    assert client.post('/api/editions',json={'notes':'a'*5001},headers=headers).status_code==422
