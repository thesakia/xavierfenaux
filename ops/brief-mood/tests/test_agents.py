import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import agents
import core


def test_routing_keeps_fact_work_on_strong_model():
    for name in ('research','audit','research-repair-1','evidence-repair','source-recovery-2'):
        assert agents.PROFILES[agents.role_for(name)][:2]==('gpt-5.6-sol','high')
    assert agents.role_for('repair-2')=='editor'
    with pytest.raises(ValueError):agents.role_for('unknown')


def test_exact_duplicate_closing_is_removed_not_unsourced_news():
    draft={'closing':'Question originale.', 'sections':[
        {'body':'Question originale.','news_ids':[]},
        {'body':'Une actualite a verifier.','news_ids':[]}]}
    result=core.without_duplicate_closing(draft)
    assert result['sections']==draft['sections'][1:]
    assert result['closing']==draft['closing']
    assert len(draft['sections'])==2


def test_light_agent_falls_back_and_never_receives_mail_secrets(tmp_path,monkeypatch):
    monkeypatch.setenv('SMTP_PASSWORD','private')
    calls=[]
    def run(cmd,**kwargs):
        calls.append(cmd)
        assert 'SMTP_PASSWORD' not in kwargs['env']
        assert '--search' not in cmd
        if len(calls)==1:return SimpleNamespace(returncode=1)
        Path(cmd[cmd.index('-o')+1]).write_text('{"ok":true}')
        kwargs['stdout'].write('{"type":"turn.completed","usage":{"input_tokens":20,"output_tokens":4}}\n')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(agents.subprocess,'run',run)
    schema=core.obj({'ok':{'type':'boolean'}})
    assert agents.run('test',{},schema,'podcast',False,tmp_path,'contract')=={'ok':True}
    assert [c[c.index('-m')+1] for c in calls]==['gpt-5.6-luna','gpt-5.6-sol']
    records=[json.loads(x) for x in (tmp_path/'agent-runs.jsonl').read_text().splitlines()]
    assert [r['status'] for r in records]==['failed','completed']
    assert records[-1]['usage']['input_tokens']==20


def test_draft_and_podcast_have_separate_schemas_and_no_web(monkeypatch):
    calls=[]
    def run(task,evidence,schema,name,web,*args):
        calls.append((name,web,schema,evidence))
        return {k:[] if k=='sections' else 'content' for k in schema['properties']}
    monkeypatch.setattr(agents,'run',run)
    result=core.model('write',{'research':{}},core.DRAFT,'draft',False)
    assert set(result)==set(core.DRAFT['properties'])
    assert [c[:2] for c in calls]==[('draft',False),('podcast',False)]
    assert 'podcast_script' not in calls[0][2]['properties']
    assert 'brief' in calls[1][3]


def test_closing_does_not_receive_entire_research_context(monkeypatch):
    calls=[]
    monkeypatch.setattr(core,'prior_closings',lambda day:[{'story':'old'}])
    def run(task,evidence,schema,name,*args):
        calls.append((name,evidence))
        return {'closing':{}} if name=='closing' else {'news':[]}
    monkeypatch.setattr(agents,'run',run)
    core.model('research',{'day':'2026-09-19','rss_leads':['large'],'history':['large']},core.RESEARCH,'research')
    assert [c[0] for c in calls]==['research','closing']
    assert set(calls[1][1])=={'day','closing_archive'}


def test_audit_repair_escalates_writer(tmp_path,monkeypatch):
    calls=[]
    def run(cmd,**kwargs):
        calls.append(cmd)
        Path(cmd[cmd.index('-o')+1]).write_text('{"ok":true}')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(agents.subprocess,'run',run)
    agents.run('fix',{'previous_audit':{'passed':False}},core.obj({'ok':{'type':'boolean'}}),'draft',False,tmp_path,'')
    assert calls[0][calls[0].index('-m')+1]=='gpt-5.6-sol'
