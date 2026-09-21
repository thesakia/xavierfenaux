import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('export_transcripts', Path(__file__).resolve().parents[1] / 'deploy/export_transcripts.py')
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


def episode(guid):
    return {'guid': guid, 'transcript_id': 'transcript-' + guid,
            'updatedAt': '2026-09-16T07:00:00', 'segments': [{'start': 0, 'end': 2, 'text': guid}]}


class TranscriptExportTests(unittest.TestCase):
    def test_two_episodes_same_day_are_distinct_and_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            episodes = [episode('clarity-act'), episode('inflation')]
            self.assertEqual(export.write_cache(episodes, folder, None), 2)
            self.assertEqual(export.write_cache(episodes, folder, None), 0)
            for value in episodes:
                name = hashlib.sha256(value['guid'].encode()).hexdigest()[:24] + '.json'
                self.assertEqual(json.loads((folder / name).read_text()), value)

    def test_invalid_batch_leaves_existing_cache_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            export.write_cache([episode('clarity-act')], folder, None)
            before = {p.name: p.read_bytes() for p in folder.iterdir()}
            bad = episode('inflation')
            bad['segments'][0]['end'] = float('nan')
            with self.assertRaises(ValueError):
                export.write_cache([episode('other'), bad], folder, None)
            self.assertEqual(before, {p.name: p.read_bytes() for p in folder.iterdir()})

    def test_ssh_transport_is_pinned_and_never_transcribes(self):
        with patch.dict(export.os.environ, {'CLIPS_TRANSCRIPT_SSH_TARGET': 'root@76.13.48.6'}), patch.object(export.subprocess, 'run', return_value=Mock(returncode=0, stdout='[]')) as run:
            self.assertEqual(export.read_transcripts(), [])
            args = run.call_args.args[0]
            self.assertEqual(args[0], '/usr/bin/ssh')
            self.assertIn('StrictHostKeyChecking=yes', args)
            self.assertIn('IdentitiesOnly=yes', args)
            self.assertIsNone(run.call_args.kwargs['input'])

    def test_source_mode_always_reads_local_database(self):
        with patch.dict(export.os.environ, {'CLIPS_TRANSCRIPT_SSH_TARGET': 'unused'}), patch.object(export.subprocess, 'run', return_value=Mock(returncode=0, stdout='[]')) as run:
            export.read_transcripts(local=True)
            self.assertEqual(run.call_args.args[0][:3], ['docker', 'exec', '-i'])
            self.assertIn('readonly=True', run.call_args.kwargs['input'])

    def test_failed_source_and_duplicate_guids_are_rejected(self):
        with patch.object(export.subprocess, 'run', return_value=Mock(returncode=1, stdout='',stderr='unavailable')):
            with self.assertRaises(RuntimeError):
                export.read_transcripts()
        with self.assertRaises(ValueError):
            export.validate([episode('same'), episode('same')])

    def test_quota_error_is_sanitized_and_visible(self):
        with patch.object(export.subprocess,'run',return_value=Mock(returncode=1,stdout='',stderr='private-host: project exceeded the quota')):
            with self.assertRaisesRegex(RuntimeError,'quota exceeded') as error:
                export.read_transcripts()
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            export.write_status(folder,None,error.exception)
            value=json.loads((folder/'status.json').read_text())
            self.assertFalse(value['available'])
            self.assertEqual(value['reason'],'quota')
            self.assertNotIn('private-host',(folder/'status.json').read_text())
            export.write_status(folder,None)
            self.assertTrue(json.loads((folder/'status.json').read_text())['available'])


if __name__ == '__main__':
    unittest.main()
