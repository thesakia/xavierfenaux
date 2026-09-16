import sys
import time
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import db
import media


@pytest.fixture
def studio(tmp_path, monkeypatch):
    monkeypatch.setattr(app, 'DATA', tmp_path)
    monkeypatch.setattr(db, 'DATA', tmp_path)
    db.init()
    eid = 'mobile-upload-test'
    with db.connect() as connection:
        connection.execute('INSERT INTO episodes(id,guid,title,published,audio_url,description,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',
                           (eid, 'mobile-guid', 'Mobile test', '2026-09-16', 'https://example.com/audio.mp3', '', 'waiting_video', time.time(), time.time()))
    client = TestClient(app.app)
    client.headers.update({'X-Clips-User': 'test', 'X-Clips-Request': '1', 'Origin': 'https://xavierfenaux.com'})
    return client, eid, tmp_path


def valid_probe(monkeypatch):
    monkeypatch.setattr(media, 'probe', lambda path: {'streams': [{'codec_type': 'video'}, {'codec_type': 'audio'}], 'format': {'duration': '40'}})


def test_canonical_origin_and_untrusted_origin(studio):
    client, _, _ = studio
    assert client.post('/api/refresh').status_code == 200
    assert client.post('/api/refresh', headers={'Origin': 'https://www.xavierfenaux.com'}).status_code == 200
    assert client.post('/api/refresh', headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.post('/api/refresh', headers={'Origin': 'http://xavierfenaux.com'}).status_code == 403
    assert TestClient(app.app).get('/api/dashboard').status_code == 401


def test_chunked_mov_without_content_length(studio, monkeypatch):
    client, eid, tmp = studio
    valid_probe(monkeypatch)
    response = client.post(f'/api/episodes/{eid}/video', content=iter([b'abc', b'def']), headers={'X-File-Name': 'IMG_0240.MOV', 'X-File-Size': '6'})
    assert response.status_code == 200, response.text
    assert (tmp / eid / 'source.mp4').read_bytes() == b'abcdef'
    assert db.episode(eid)['state'] == 'sync_queued'


def test_unknown_size_is_bounded_and_incomplete_upload_can_retry(studio, monkeypatch):
    client, eid, tmp = studio
    valid_probe(monkeypatch)
    monkeypatch.setattr(app, 'MAX_UPLOAD', 5)
    response = client.post(f'/api/episodes/{eid}/video', content=iter([b'abc', b'def']), headers={'X-File-Name': 'IMG.MOV'})
    assert response.status_code == 413
    assert db.episode(eid)['state'] == 'waiting_video'
    assert not (tmp / eid / 'source.part').exists()
    response = client.post(f'/api/episodes/{eid}/video', content=iter([b'abc']), headers={'X-File-Name': 'IMG.MOV', 'X-File-Size': '5'})
    assert response.status_code == 400
    response = client.post(f'/api/episodes/{eid}/video', content=b'abc', headers={'X-File-Name': 'IMG.MOV'})
    assert response.status_code == 200


def test_real_iphone_style_hevc_mov(studio):
    client, eid, tmp = studio
    movie = tmp / 'IMG_9000.MOV'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=64x96:r=2',
                    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '36', '-c:v', 'libx265',
                    '-preset', 'ultrafast', '-x265-params', 'pools=1:frame-threads=1:log-level=error',
                    '-tag:v', 'hvc1', '-c:a', 'aac', '-movflags', '+faststart', str(movie)], check=True, timeout=60)
    assert media.probe(movie)['streams'][0]['codec_name'] == 'hevc'
    response = client.post(f'/api/episodes/{eid}/video', content=movie.read_bytes(), headers={'X-File-Name': movie.name})
    assert response.status_code == 200, response.text
    assert db.episode(eid)['video_name'] == 'IMG_9000.MOV'
