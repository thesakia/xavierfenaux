"""Manual staging rehearsal: read production facts, never send email."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core

with core.connect() as c:
    row=c.execute("SELECT id FROM editions WHERE day=? AND state='ready' ORDER BY created DESC LIMIT 1",
                  (core.now().date().isoformat(),)).fetchone()
if not row:raise RuntimeError('A ready same-day reference is required')
reference=core.get(row['id']);history=core.history()
core.DATA=core.DATA/'agent-rehearsal'
core.DATA.mkdir(exist_ok=True)
core.init();core.history=lambda:history
eid=core.create(research=reference['research'],polarities=reference['polarities'])
print('rehearsal',eid,flush=True)
core.write_and_audit(eid,reference['research'])
edition=core.get(eid)
assert edition['state']=='ready'
print('READY; no email sent; words',len(core.text(edition).split()),flush=True)
for line in (core.DATA/'agent-runs.jsonl').read_text().splitlines():
    record=json.loads(line)
    print(json.dumps(record),flush=True)
