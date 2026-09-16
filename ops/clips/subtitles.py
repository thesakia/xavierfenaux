"""Audio-anchored animated captions. Existing transcript text stays authoritative."""
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata
import subprocess
from config import ROOT

STYLE_VERSION=2
ALIGNMENT_VERSION=2
MODEL=ROOT/'models'/'vosk-model-small-fr-0.22'
_model=None

def normalize(text):
    text=unicodedata.normalize('NFKD',text.casefold().replace('’',"'"))
    return ''.join(c for c in text if c.isalnum())

def anchor_words(text,start,end,recognized):
    tokens=text.split()
    result=[None]*len(tokens)
    pairs=difflib.SequenceMatcher(None,[normalize(t) for t in tokens],
                                 [normalize(w['word']) for w in recognized],autojunk=False)
    for block in pairs.get_matching_blocks():
        for k in range(block.size):
            w=recognized[block.b+k]
            a=max(start,min(end,start+float(w['start'])))
            b=max(a,min(end,start+float(w['end'])))
            if b>a:result[block.a+k]={'text':tokens[block.a+k],'start':a,'end':b,'anchored':True}
    # Unknown/proper-name words use only the gap between neighbouring audio anchors.
    i=0
    while i<len(tokens):
        if result[i] is not None:i+=1;continue
        j=i+1
        while j<len(tokens) and result[j] is None:j+=1
        a=result[i-1]['end'] if i else start
        b=result[j]['start'] if j<len(tokens) else end
        b=max(a,b);total=sum(max(1,len(normalize(t))) for t in tokens[i:j])
        for k in range(i,j):
            duration=(b-a)*max(1,len(normalize(tokens[k])))/total
            result[k]={'text':tokens[k],'start':a,'end':a+duration,'anchored':False}
            a+=duration;total-=max(1,len(normalize(tokens[k])))
        i=j
    # Acoustic anchors can leave no gap for a contraction or a short word.
    # Keep its text on the adjacent cue instead of silently deleting it.
    visible=[];pending=[]
    for word in result:
        if word['end']-word['start']<=.015:
            pending.append(word['text'])
            continue
        if pending:
            word={**word,'text':' '.join([*pending,word['text']]),'anchored':False}
            pending=[]
        visible.append(word)
    if pending and visible:
        visible[-1]={**visible[-1],'text':' '.join([visible[-1]['text'],*pending]),'anchored':False}
    elif pending and end>start:
        visible=[{'text':' '.join(pending),'start':start,'end':end,'anchored':False}]
    return visible

def align(source,segments,clip_start,clip_end):
    global _model
    from vosk import Model,KaldiRecognizer,SetLogLevel
    SetLogLevel(-1)
    if _model is None:_model=Model(str(MODEL))
    result=[]
    for s in segments:
        a,b=max(clip_start,s['start']),min(clip_end,s['end'])
        if b<=a:continue
        text=s['text'];relative=a-clip_start
        pcm=subprocess.run(['ffmpeg','-v','error','-nostdin','-ss',str(relative),'-i',str(source),
                            '-t',str(b-a),'-ac','1','-ar','16000','-f','s16le','-'],
                           capture_output=True,check=True,timeout=90).stdout
        # Constrain the acoustic decoder to the known transcript vocabulary.
        vocabulary=re.findall(r"[\w]+(?:['’][\w]+)*",text.lower())
        grammar=json.dumps([' '.join(vocabulary),'[unk]'],ensure_ascii=False)
        rec=KaldiRecognizer(_model,16000,grammar);rec.SetWords(True)
        words=[]
        for offset in range(0,len(pcm),8000):
            if rec.AcceptWaveform(pcm[offset:offset+8000]):words+=json.loads(rec.Result()).get('result',[])
        words+=json.loads(rec.FinalResult()).get('result',[])
        result+=anchor_words(text,relative,b-clip_start,words)
    return result

def groups(words):
    result=[];group=[]
    for word in words:
        if group and (len(group)>=5 or len(' '.join(w['text'] for w in group))+len(word['text'])>34
                      or word['start']-group[-1]['end']>.5):
            result.append(group);group=[]
        group.append(word)
        if re.search(r'[.!?;]$',word['text']):result.append(group);group=[]
    if group:result.append(group)
    return result

def ass_time(seconds):
    cs=round(max(0,seconds)*100)
    return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'

def srt_time(seconds):
    ms=round(max(0,seconds)*1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'

def safe_text(text):
    return text.replace('\\','／').replace('{','(').replace('}',')').replace('\n',' ')

def write_captions(words,ass_path,srt_path):
    header='''[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Top,DejaVu Sans,52,&H00FFFFFF,&H0000D8FF,&H00141414,&H80000000,-1,0,0,0,100,100,0,0,1,3.5,1.5,8,54,54,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    events=[];srt=[]
    from PIL import ImageFont
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',52)
    chunks_by_group=groups(words)
    for number,group in enumerate(chunks_by_group,1):
        texts=[safe_text(w['text']).upper() for w in group]
        split=None
        if font.getlength(' '.join(texts))>600 and len(texts)>1:
            split=min(range(1,len(texts)),key=lambda i:max(font.getlength(' '.join(texts[:i])),font.getlength(' '.join(texts[i:]))))
        widest=max([font.getlength(' '.join(texts))] if split is None else [font.getlength(' '.join(texts[:split])),font.getlength(' '.join(texts[split:]))])
        size=min(52,52*590/max(590,widest))
        for active,word in enumerate(group):
            end=group[active+1]['start'] if active+1<len(group) else word['end']+.07
            if number<len(chunks_by_group):end=min(end,chunks_by_group[number][0]['start'])
            if end<=word['start']:continue
            tags=f'{{\\an8\\fs{size:.1f}\\move(360,154,360,140,0,100)\\fad(55,0)}}' if active==0 else f'{{\\an8\\fs{size:.1f}\\pos(360,140)}}'
            chunks=[]
            for i,text in enumerate(texts):
                if i==split:chunks.append('\\N')
                elif i:chunks.append(' ')
                if i==active:
                    chunks.append('{\\c&H00D8FF&\\fscx108\\fscy108\\t(0,110,\\fscx100\\fscy100)}'+text+'{\\c&HFFFFFF&\\fscx100\\fscy100}')
                else:chunks.append(text)
            events.append(f'Dialogue: 0,{ass_time(word["start"])},{ass_time(end)},Top,,0,0,0,,{tags}{"".join(chunks)}')
        srt.append(f'{number}\n{srt_time(group[0]["start"])} --> {srt_time(group[-1]["end"])}\n'+ ' '.join(w['text'] for w in group)+'\n')
    ass_path.write_text(header+'\n'.join(events)+'\n',encoding='utf-8')
    srt_path.write_text('\n'.join(srt),encoding='utf-8')

def prepare(source,segments,clip_start,clip_end):
    fingerprint=hashlib.sha256(json.dumps([ALIGNMENT_VERSION,segments,clip_start,clip_end],sort_keys=True).encode()).hexdigest()
    cache=source.with_suffix('.words.json')
    saved=json.loads(cache.read_text()) if cache.exists() else None
    if not saved or saved.get('fingerprint')!=fingerprint:
        words=align(source,segments,clip_start,clip_end)
        if not words:raise ValueError('Aucun sous-titre ne correspond à cet extrait.')
        saved={'fingerprint':fingerprint,'words':words,'anchored_ratio':sum(w['anchored'] for w in words)/len(words)}
        temp=cache.with_suffix('.tmp');temp.write_text(json.dumps(saved,ensure_ascii=False),encoding='utf-8');temp.replace(cache)
    ass=source.with_suffix('.ass');srt=source.with_suffix('.srt')
    write_captions(saved['words'],ass,srt)
    return ass,saved
