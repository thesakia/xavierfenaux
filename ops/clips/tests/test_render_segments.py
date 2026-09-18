import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import media


def test_segmented_render_preserves_duration_and_audio(tmp_path):
    source = tmp_path / 'source.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                    'testsrc2=size=96x128:rate=30', '-f', 'lavfi', '-i',
                    'sine=frequency=440:sample_rate=48000', '-t', '5',
                    '-c:v', 'libx264', '-c:a', 'aac', str(source)], check=True)
    output = tmp_path / 'master.mp4'
    media.render(source, source, output, [
        {'video_start': 0, 'audio_start': 0, 'duration': 2},
        {'video_start': 3, 'audio_start': 2, 'duration': 2},
    ])
    result = media.probe(output)
    assert abs(float(result['format']['duration']) - 4) < .15
    assert [s['codec_type'] for s in result['streams']] == ['video', 'audio']
    assert not list(tmp_path.glob('sync-*'))
    assert not list(tmp_path.glob('*.partial.mp4'))


def test_segmented_render_failure_cleans_parts(tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise ValueError('Test failure')
    monkeypatch.setattr(media, 'probe', fail)
    with pytest.raises(ValueError):
        media.render(tmp_path / 'absent.mp4', tmp_path / 'absent.mp3',
                     tmp_path / 'master.mp4', [
                         {'video_start': 0, 'audio_start': 0, 'duration': 2},
                         {'video_start': 3, 'audio_start': 2, 'duration': 2},
                     ])
    assert not list(tmp_path.glob('sync-*'))
    assert not (tmp_path / 'master.mp4').exists()
