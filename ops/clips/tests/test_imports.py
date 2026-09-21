import io
import json
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import db
import imports
import media
import worker

SHARE_ID = '0abcdefghijklmnopqrstuvwx'
SHARE = 'https://share.icloud.com/photos/' + SHARE_ID
ASSET = 'https://cvws.icloud-content.com/B/test/${f}?token=test'
REAL_PROBE = media.probe


@pytest.fixture
def studio(tmp_path, monkeypatch):
    monkeypatch.setattr(app, 'DATA', tmp_path)
    monkeypatch.setattr(db, 'DATA', tmp_path)
    monkeypatch.setattr(worker, 'DATA', tmp_path)
    monkeypatch.setattr(media, 'probe', lambda p: {'streams': [{'codec_type': 'video'}, {'codec_type': 'audio'}], 'format': {'duration': '40'}})
    db.init()
    with db.connect() as c:
        for eid in ('import-test', 'other-test'):
            c.execute('INSERT INTO episodes(id,guid,title,published,audio_url,description,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',
                      (eid, eid, 'Test', '2026-09-16', 'https://example.com/audio.mp3', '', 'waiting_video', time.time(), time.time()))
    client = TestClient(app.app)
    client.headers.update({'X-Clips-User': 'test', 'X-Clips-Request': '1', 'Origin': 'https://xavierfenaux.com'})
    return client, 'import-test', tmp_path


def zip_bytes(files):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        for name, data in files:
            z.writestr(name, data)
    return out.getvalue()


def upload_zip(studio, files):
    client, eid, tmp = studio
    response = client.post(f'/api/episodes/{eid}/video', content=zip_bytes(files), headers={'X-File-Name': 'iCloud%20Photos.ZIP'})
    assert response.status_code == 202, response.text
    assert db.episode(eid)['state'] == 'zip_queued'
    worker.process(db.episode(eid))
    return db.episode(eid), tmp / eid


def test_zip_apple_metadata_and_nested_video(studio):
    e, folder = upload_zip(studio, [('Photos/IMG_42.MOV', b'video'), ('__MACOSX/Photos/._IMG_42.MOV', b'metadata'), ('Photos/IMG_42.AAE', b'edit')])
    assert e['state'] == 'sync_queued'
    assert e['video_name'] == 'IMG_42.MOV'
    assert e['video_bytes'] == 5
    assert (folder / 'source.mp4').read_bytes() == b'video'
    assert not (folder / 'import.zip').exists()
    assert not (folder / 'source.part').exists()


@pytest.mark.parametrize('files', [
    [('one.mov', b'x'), ('two.mp4', b'x')], [('photo.jpg', b'x')],
    [('../escape.mov', b'x')], [('/absolute.mov', b'x')], [('C:\\video.mov', b'x')],
    [('folder/../../escape.mov', b'x')], [('video.zip', b'x')],
])
def test_invalid_zip_returns_to_upload(studio, files):
    e, folder = upload_zip(studio, files)
    assert e['state'] == 'waiting_video'
    assert e['error']
    assert not (folder / 'source.mp4').exists()
    assert not list(folder.glob('*.part'))
    assert not (folder / 'import.zip').exists()


def test_zip_rejects_symlink(studio):
    entry = zipfile.ZipInfo('video.mov')
    entry.create_system = 3
    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
    e, _ = upload_zip(studio, [(entry, b'/etc/passwd')])
    assert e['state'] == 'waiting_video'


def test_zip_expanded_limit_and_corruption(studio, monkeypatch):
    monkeypatch.setattr(imports, 'MAX_UPLOAD', 4)
    e, _ = upload_zip(studio, [('video.mov', b'12345')])
    assert e['state'] == 'waiting_video'
    client, eid, tmp = studio
    response = client.post(f'/api/episodes/{eid}/video', content=b'not-a-zip', headers={'X-File-Name': 'bad.zip'})
    assert response.status_code == 202
    worker.process(db.episode(eid))
    assert 'ZIP' in db.episode(eid)['error']


def test_zip_bomb_and_invalid_media(studio, monkeypatch):
    client, eid, tmp = studio
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('bomb.mov', b'0' * 2000000)
    assert client.post(f'/api/episodes/{eid}/video', content=out.getvalue(), headers={'X-File-Name': 'bomb.zip'}).status_code == 202
    worker.process(db.episode(eid))
    assert 'compressee' in db.episode(eid)['error']
    monkeypatch.setattr(media, 'probe', lambda p: {'streams': [{'codec_type': 'video'}]})
    e, _ = upload_zip(studio, [('silent.mov', b'123')])
    assert e['state'] == 'waiting_video'
    assert 'son temoin' in e['error']


@pytest.mark.parametrize('url', ['http://share.icloud.com/photos/' + SHARE_ID, 'https://evil.example/photos/' + SHARE_ID,
    'https://share.icloud.com.evil.example/photos/' + SHARE_ID, 'https://share.icloud.com@127.0.0.1/photos/' + SHARE_ID,
    'https://share.icloud.com:8094/photos/' + SHARE_ID, 'https://share.icloud.com/photos/../foo', 'https://www.icloud.com/iclouddrive/' + SHARE_ID])
def test_invalid_share_links(studio, url):
    client, eid, _ = studio
    assert client.post(f'/api/episodes/{eid}/icloud', json={'url': url}).status_code == 400
    assert db.episode(eid)['state'] == 'waiting_video'


def test_icloud_queued_and_duplicate_protection(studio):
    client, eid, _ = studio
    assert client.post(f'/api/episodes/{eid}/icloud', json={'url': SHARE}).status_code == 202
    assert client.post(f'/api/episodes/{eid}/icloud', json={'url': SHARE}).status_code == 409
    assert client.post('/api/episodes/other-test/icloud', json={'url': SHARE}).status_code == 409
    assert client.post('/api/episodes/other-test/video', content=b'123', headers={'X-File-Name': 'a.mov'}).status_code == 409
    assert SHARE_ID not in client.get('/api/dashboard').text
    assert TestClient(app.app).post(f'/api/episodes/{eid}/icloud', json={'url': SHARE}).status_code == 401


def resolved():
    return {'results': [{'zoneID': {'zoneName': 'CMM-test', 'ownerRecordName': 'owner', 'zoneType': 'REGULAR_CUSTOM_ZONE'},
                         'databaseScope': 'PRIVATE', 'anonymousPublicAccess': {'token': 'public-test', 'databasePartition': 'https://p42-ckdatabasews.icloud.com'},
                         'rootRecord': {'fields': {'videosCount': {'value': 1}, 'assetCount': {'value': 1}}}}]}


def records():
    return {'records': [{'recordName': 'video-1', 'recordType': 'CPLMaster',
                         'fields': {'resOriginalFileType': {'value': 'com.apple.quicktime-movie'},
                                    'filenameEnc': {'value': 'SU1HXzQyLk1PVg=='},
                                    'resOriginalRes': {'value': {'downloadURL': ASSET, 'size': 5}}}}]}


def mock_client(monkeypatch, *, resolve=None, media_records=None, get=None):
    # Network boundary is tested separately; fixtures never contact Apple.
    monkeypatch.setattr(imports, 'safe_url', lambda u: u)
    def respond(request):
        if request.url.path.endswith('/records/resolve'):
            assert json.loads(request.content)['shortGUIDs'][0]['value'] == SHARE_ID
            return httpx.Response(200, json=resolved() if resolve is None else resolve)
        if request.url.path.endswith('/records/query'):
            assert request.url.params['publicAccessAuthToken'] == 'public-test'
            assert json.loads(request.content)['zoneID']['zoneName'] == 'CMM-test'
            return httpx.Response(200, json=records() if media_records is None else media_records)
        return get(request) if get else httpx.Response(200, content=b'video')
    return httpx.Client(transport=httpx.MockTransport(respond))


def test_complete_icloud_import(studio, monkeypatch):
    client, eid, tmp = studio
    apple = mock_client(monkeypatch)
    monkeypatch.setattr(imports.httpx, 'Client', lambda **kw: apple)
    assert client.post(f'/api/episodes/{eid}/icloud', json={'url': SHARE}).status_code == 202
    worker.process(db.episode(eid))
    assert db.episode(eid)['state'] == 'sync_queued'
    assert db.episode(eid)['video_name'] == 'IMG_42.MOV'
    assert (tmp / eid / 'source.mp4').read_bytes() == b'video'
    assert db.meta('icloud-import:' + eid) is None
    assert db.meta('import-progress:' + eid) is None


def rendition_records(original_size=20, rendition_size=5, width=720):
    data=records();fields=data['records'][0]['fields']
    fields['resOriginalRes']['value']['size']=original_size
    fields.update({
        'resVidMedRes':{'value':{'downloadURL':ASSET.replace('/test/','/medium/'),'size':rendition_size}},
        'resVidMedFileType':{'value':'public.mpeg-4'},
        'resVidMedWidth':{'value':width},'resVidMedHeight':{'value':1280},
    })
    return data


def test_icloud_large_original_uses_shared_mp4(studio,monkeypatch):
    monkeypatch.setattr(imports,'MAX_UPLOAD',10)
    client,eid,tmp=studio
    apple=mock_client(monkeypatch,media_records=rendition_records())
    monkeypatch.setattr(imports.httpx,'Client',lambda **kw:apple)
    assert client.post(f'/api/episodes/{eid}/icloud',json={'url':SHARE}).status_code==202
    worker.process(db.episode(eid))
    assert db.episode(eid)['state']=='sync_queued'
    assert db.episode(eid)['video_name']=='IMG_42.mp4'
    assert db.episode(eid)['video_bytes']==5


@pytest.mark.parametrize('original_size,rendition_size,width,expected',[(5,4,720,5),(20,11,720,20),(20,5,360,20)])
def test_icloud_preserves_original_or_rejects_unsuitable_rendition(monkeypatch,original_size,rendition_size,width,expected):
    monkeypatch.setattr(imports,'MAX_UPLOAD',10)
    with mock_client(monkeypatch,media_records=rendition_records(original_size,rendition_size,width)) as client:
        _,name,size=imports.resolve_video(client,SHARE_ID)
    assert size==expected
    assert name=='IMG_42.MOV'


@pytest.mark.parametrize('bad', [{'results': [{'serverErrorCode': 'NOT_FOUND'}]}, {'results': [{'zoneID': {}, 'rootRecord': {}}]}])
def test_expired_private_shares(monkeypatch, bad):
    with mock_client(monkeypatch, resolve=bad) as client, pytest.raises(ValueError):
        imports.resolve_video(client, SHARE_ID)


def test_ambiguous_album_and_photo_only(monkeypatch):
    data = records()
    data['records'].append({**data['records'][0], 'recordName': 'video-2'})
    with mock_client(monkeypatch, media_records=data) as client, pytest.raises(ValueError):
        imports.resolve_video(client, SHARE_ID)
    data['records'][0]['fields']['resOriginalFileType']['value'] = 'public.jpeg'
    data['records'] = data['records'][:1]
    with mock_client(monkeypatch, media_records=data) as client, pytest.raises(ValueError):
        imports.resolve_video(client, SHARE_ID)


def test_media_redirect_and_incomplete_download(studio, monkeypatch):
    _, eid, tmp = studio
    path = db.folder(eid) / 'source.part'
    with mock_client(monkeypatch, get=lambda r: httpx.Response(302, headers={'Location': 'http://127.0.0.1/admin'})) as client, pytest.raises(ValueError):
        imports.download_video(client, ASSET, path, 0, lambda *a: None)
    with mock_client(monkeypatch, get=lambda r: httpx.Response(200, content=b'x')) as client, pytest.raises(ValueError):
        imports.download_video(client, ASSET, path, 5, lambda *a: None)


def test_icloud_announced_video_not_yet_listed(monkeypatch):
    with mock_client(monkeypatch, media_records={'records': []}) as client:
        with pytest.raises(imports.ICloudPending, match='Apple annonce une video'):
            imports.resolve_video(client, SHARE_ID)


def test_icloud_photo_only_message(monkeypatch):
    root = resolved()
    root['results'][0]['rootRecord']['fields']['videosCount']['value'] = 0
    with mock_client(monkeypatch, resolve=root, media_records={'records': []}) as client:
        with pytest.raises(ValueError, match='Aucune video reconnue') as exc:
            imports.resolve_video(client, SHARE_ID)
        assert not isinstance(exc.value, imports.ICloudPending)


@pytest.mark.parametrize('failures', [1, 3])
def test_icloud_preparation_retries_are_bounded(monkeypatch, failures):
    calls, sleeps = [], []
    def resolve(client, short_id):
        calls.append(short_id)
        if len(calls) <= failures:
            raise imports.ICloudPending('Preparation')
        return ASSET, 'video.mp4', 5
    monkeypatch.setattr(imports, 'resolve_video', resolve)
    monkeypatch.setattr(imports.time, 'sleep', sleeps.append)
    if failures == 3:
        with pytest.raises(imports.ICloudPending):
            imports.resolve_when_ready(None, SHARE_ID)
    else:
        assert imports.resolve_when_ready(None, SHARE_ID)[1] == 'video.mp4'
    assert len(calls) == min(failures + 1, 3)
    assert sleeps == [10] * (len(calls) - 1)


def test_icloud_permanent_errors_not_retried(monkeypatch):
    def resolve(*args):
        raise ValueError('Lien expire')
    monkeypatch.setattr(imports, 'resolve_video', resolve)
    monkeypatch.setattr(imports.time, 'sleep', lambda _: pytest.fail('No retry expected'))
    with pytest.raises(ValueError, match='Lien expire'):
        imports.resolve_when_ready(None, SHARE_ID)


def test_pending_icloud_keeps_link_and_schedules_retry(studio, monkeypatch):
    client,eid,tmp=studio
    def pending(*args):raise imports.ICloudPending('Preparation')
    monkeypatch.setattr(imports,'resolve_when_ready',pending)
    client.post(f'/api/episodes/{eid}/icloud',json={'url':SHARE})
    before=time.time()
    worker.process(db.episode(eid))
    e=db.episode(eid)
    assert e['state']=='icloud_queued'
    assert e['next_poll']>=before+60
    assert db.meta('icloud-import:'+eid)['share_id']==SHARE_ID
    assert db.meta('icloud-import:'+eid)['started']>=before
    assert SHARE_ID not in client.get('/api/dashboard').text


def test_pending_icloud_timeout_keeps_link_without_endless_retry(studio, monkeypatch):
    client,eid,tmp=studio
    def pending(*args):raise imports.ICloudPending('Preparation')
    monkeypatch.setattr(imports,'resolve_when_ready',pending)
    client.post(f'/api/episodes/{eid}/icloud',json={'url':SHARE})
    db.meta('icloud-import:'+eid,{'share_id':SHARE_ID,'started':time.time()-1801})
    worker.process(db.episode(eid))
    assert db.episode(eid)['state']=='waiting_video'
    assert '30 minutes' in db.episode(eid)['error']
    assert db.meta('icloud-import:'+eid)['share_id']==SHARE_ID


def test_pending_icloud_succeeds_on_next_worker_pass(studio, monkeypatch):
    client,eid,tmp=studio
    def pending(*args):raise imports.ICloudPending('Preparation')
    monkeypatch.setattr(imports,'resolve_when_ready',pending)
    client.post(f'/api/episodes/{eid}/icloud',json={'url':SHARE})
    worker.process(db.episode(eid))
    monkeypatch.setattr(imports,'resolve_when_ready',lambda *args:(ASSET,'ready.mp4',5))
    monkeypatch.setattr(imports,'download_video',lambda client,url,target,size,progress:target.write_bytes(b'video'))
    worker.process(db.episode(eid))
    assert db.episode(eid)['state']=='sync_queued'
    assert db.meta('icloud-import:'+eid) is None
    assert (tmp/eid/'source.mp4').read_bytes()==b'video'


def test_failed_import_can_be_replaced(studio, monkeypatch):
    client, eid, tmp = studio
    apple = mock_client(monkeypatch, resolve={'results': [{'serverErrorCode': 'NOT_FOUND'}]})
    monkeypatch.setattr(imports.httpx, 'Client', lambda **kw: apple)
    client.post(f'/api/episodes/{eid}/icloud', json={'url': SHARE})
    worker.process(db.episode(eid))
    assert db.episode(eid)['state'] == 'waiting_video'
    assert db.meta('icloud-import:' + eid) is None
    assert client.post(f'/api/episodes/{eid}/video', content=b'video', headers={'X-File-Name': 'a.mov'}).status_code == 200


def test_recovery_preserves_queued_imports(studio):
    _, eid, tmp = studio
    folder = db.folder(eid)
    (folder / 'import.zip').write_bytes(b'zip')
    (folder / 'source.part').write_bytes(b'partial')
    db.update(eid, state='extracting')
    db.update('other-test', state='icloud_downloading')
    db.meta('icloud-import:other-test', {'share_id': SHARE_ID})
    worker.recover()
    assert db.episode(eid)['state'] == 'zip_queued'
    assert db.episode('other-test')['state'] == 'icloud_queued'
    assert (folder / 'import.zip').exists()
    assert not (folder / 'source.part').exists()
    assert db.meta('icloud-import:other-test')['share_id'] == SHARE_ID


def test_apple_hosts_reject_private_dns(monkeypatch):
    import services
    monkeypatch.setattr(services.socket, 'getaddrinfo', lambda *a, **kw: [(2, 1, 6, '', ('127.0.0.1', 443))])
    with pytest.raises(services.ServiceError):
        imports.apple_url('https://cvws.icloud-content.com/video')
    with pytest.raises(ValueError):
        imports.apple_url('https://icloud-content.com.evil.example/video')


def test_many_zip_entries_are_bounded(studio):
    e, _ = upload_zip(studio, [('video.mov', b'123')] + [(f'metadata/{n}', b'') for n in range(501)])
    assert e['state'] == 'waiting_video'
    assert 'trop de fichiers' in e['error']


def test_root_album_count_prevents_partial_selection(monkeypatch):
    data = resolved()
    data['results'][0]['rootRecord']['fields']['assetCount']['value'] = 201
    with mock_client(monkeypatch, resolve=data) as client, pytest.raises(ValueError, match='trop grand'):
        imports.resolve_video(client, SHARE_ID)
    data['results'][0]['rootRecord']['fields']['videosCount']['value'] = 2
    with mock_client(monkeypatch, resolve=data) as client, pytest.raises(ValueError, match='plusieurs videos'):
        imports.resolve_video(client, SHARE_ID)


def test_real_mov_inside_zip(studio, monkeypatch):
    _, _, tmp = studio
    movie = tmp / 'IMG_1.MOV'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=64x96:r=2',
                    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '36', '-c:v', 'libx265',
                    '-preset', 'ultrafast', '-x265-params', 'pools=1:frame-threads=1:log-level=error',
                    '-tag:v', 'hvc1', '-c:a', 'aac', '-movflags', '+faststart', str(movie)], check=True, timeout=60)
    monkeypatch.setattr(media, 'probe', REAL_PROBE)
    e, folder = upload_zip(studio, [('iCloud Photos/IMG_1.MOV', movie.read_bytes())])
    assert e['state'] == 'sync_queued', e['error']
    assert REAL_PROBE(folder / 'source.mp4')['streams'][0]['codec_name'] == 'hevc'
