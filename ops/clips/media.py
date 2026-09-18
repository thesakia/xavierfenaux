"""Measure alignment across the recording, then render with Acast audio only."""
import json
import math
import subprocess
import shutil
import time
import tempfile
from pathlib import Path
import numpy as np
from config import RESERVE

SR = 8000

def probe(path):
    p = subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)],
                       capture_output=True, timeout=60)
    if p.returncode:
        raise ValueError('Fichier audio/vidéo illisible par FFmpeg.')
    return json.loads(p.stdout)

def duration(path):
    return float(probe(path)['format']['duration'])

def samples(path, start=0, length=None, rate=SR):
    cmd = ['ffmpeg','-v','error','-nostdin','-ss',str(start),'-i',str(path)]
    if length is not None:
        cmd += ['-t',str(length)]
    cmd += ['-map','0:a:0','-ac','1','-ar',str(rate),'-f','f32le','-']
    p = subprocess.run(cmd, capture_output=True, timeout=600)
    if p.returncode:
        raise ValueError('Une piste audio témoin est nécessaire dans la vidéo pour mesurer la synchronisation.')
    return np.frombuffer(p.stdout, dtype=np.float32)

def envelope(path):
    # Downsample audio in chunks to bound RAM, including for long podcasts.
    cmd = ['ffmpeg','-v','error','-nostdin','-i',str(path),'-map','0:a:0',
           '-ac','1','-ar',str(SR),'-f','f32le','-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    chunks = []
    try:
        while True:
            raw = p.stdout.read(80 * 4 * 1000)
            if not raw:
                break
            a = np.frombuffer(raw, dtype=np.float32)
            a = a[:len(a)//80*80].reshape(-1,80)
            chunks.append(np.sqrt(np.mean(a*a, axis=1)))
        if p.wait(timeout=30):
            raise ValueError('Impossible de lire la piste audio témoin.')
    finally:
        if p.poll() is None:
            p.kill()
        p.stdout.close()
    return np.concatenate(chunks).astype(float) if chunks else np.array([])

def correlate_valid(template, search):
    a = np.asarray(template, dtype=float)
    b = np.asarray(search, dtype=float)
    if len(a)<2 or len(b)<len(a) or np.std(a)<1e-8:
        return 0, 0.0
    a = a-a.mean()
    size = 1 << (len(a)+len(b)-2).bit_length()
    corr = np.fft.irfft(np.fft.rfft(b,size)*np.fft.rfft(a[::-1],size),size)[len(a)-1:len(b)]
    sq = np.r_[0.,np.cumsum(b*b)]
    sums = np.r_[0.,np.cumsum(b)]
    var = sq[len(a):]-sq[:-len(a)]-(sums[len(a):]-sums[:-len(a)])**2/len(a)
    score = corr / np.sqrt(np.maximum(var,1e-15)*np.sum(a*a))
    i = int(np.argmax(np.abs(score)))
    return i, float(abs(score[i]))

def assess(points, vd, ad):
    good = [p for p in points if p['score'] >= .22]
    offset = float(np.median([p['offset'] for p in good])) if good else 0.
    spread = max([abs(p['offset']-offset) for p in good], default=999.)
    # Coverage and consistency matter more than a single strong match.
    reliable = (len(good)>=3 and len(good)>=.85*len(points) and spread<=.055
                and good[0]['video_time']<=max(35,vd*.1)
                and good[-1]['video_time']+16>=vd*.85)
    vs, aus = max(0.,-offset), max(0.,offset)
    length = min(vd-vs,ad-aus)
    if length <= 1:
        reliable = False
    return {'reliable':bool(reliable),'offset':round(offset,4),'spread':round(spread,4),
            'video_duration':vd,'audio_duration':ad,'points':points,
            'segments':[{'video_start':round(vs,4),'audio_start':round(aus,4),
                         'duration':round(max(0,length),4)}],
            'reason':None if reliable else 'Décalage variable, coupure ou correspondance insuffisante. Vérifier le plan de synchronisation avant envoi.'}

def analyse(video, audio):
    vd, ad = duration(video), duration(audio)
    if not 35<=vd<=5400 or not 35<=ad<=5400:
        raise ValueError('Durée prise en charge : de 35 secondes à 90 minutes.')
    ve, ae = envelope(video), envelope(audio)
    points = []
    for t in np.linspace(8, max(9,vd-22), max(5,math.ceil(vd/30))):
        start = max(0,int((t-180)*100))
        end = min(len(ae),int((t+200)*100))
        template = ve[int(t*100):int((t+16)*100)]
        k, coarse_score = correlate_valid(template,ae[start:end])
        coarse = (start+k)/100-t
        # Refine to sub-frame accuracy on the waveform around the coarse result.
        ss = max(0,t+coarse-.2)
        va = samples(video,t,12)
        aa = samples(audio,ss,12.5)
        k, score = correlate_valid(va,aa)
        points.append({'video_time':round(float(t),3),'offset':round(ss+k/SR-t,4),
                       'score':round(score,4),'envelope_score':round(coarse_score,4)})
    return assess(points,vd,ad)

def validate_plan(segments, vd, ad):
    if not isinstance(segments,list) or not 1<=len(segments)<=20:
        raise ValueError('Fournir entre 1 et 20 segments.')
    result = []
    pv = pa = 0.
    for s in segments:
        v,a,d = (float(s[k]) for k in ('video_start','audio_start','duration'))
        if not all(math.isfinite(x) for x in (v,a,d)) or min(v,a)<0 or d<=0:
            raise ValueError('Les temps doivent être finis, positifs et la durée non nulle.')
        if v<pv-.001 or a<pa-.001 or v+d>vd+.05 or a+d>ad+.05:
            raise ValueError('Segments hors durée, non ordonnés ou qui se chevauchent.')
        pv,pa = v+d,a+d
        result.append({'video_start':v,'audio_start':a,'duration':d})
    return result

def render(video, audio, output, segments):
    if len(segments) > 1:
        # A concat filter on a long shared input queues decoded frames for later
        # segments. Encode each part separately to keep memory usage bounded.
        tmp = output.with_suffix('.partial.mp4')
        try:
            with tempfile.TemporaryDirectory(prefix='sync-', dir=output.parent) as directory:
                folder = Path(directory)
                for i, segment in enumerate(segments):
                    render(video, audio, folder / f'{i}.mp4', [segment])
                manifest = folder / 'parts.txt'
                manifest.write_text(''.join(f"file '{i}.mp4'\n" for i in range(len(segments))))
                p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y',
                                    '-f', 'concat', '-safe', '1', '-i', str(manifest),
                                    '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
                                    '-movflags', '+faststart', str(tmp)],
                                   capture_output=True, timeout=600)
                if p.returncode:
                    raise ValueError('Echec de l\'assemblage du master synchronise.')
                actual = probe(tmp)
                expected = sum(s['duration'] for s in segments)
                if (abs(float(actual['format']['duration']) - expected) > .15
                        or len([s for s in actual['streams'] if s['codec_type'] == 'audio']) != 1):
                    raise ValueError('Le controle du montage synchronise a echoue.')
                tmp.replace(output)
            return
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
    filters, labels = [], []
    for i,s in enumerate(segments):
        filters += [f"[0:v:0]trim=start={s['video_start']}:duration={s['duration']},setpts=PTS-STARTPTS[v{i}]",
                    f"[1:a:0]atrim=start={s['audio_start']}:duration={s['duration']},asetpts=PTS-STARTPTS[a{i}]"]
        labels.append(f'[v{i}][a{i}]')
    filters.append(''.join(labels)+f'concat=n={len(segments)}:v=1:a=1[v][a]')
    tmp = output.with_suffix('.partial.mp4')
    cmd = ['ffmpeg','-v','error','-nostdin','-y','-i',str(video),'-i',str(audio),
           '-filter_complex',';'.join(filters),'-map','[v]','-map','[a]',
           '-c:v','libx264','-preset','veryfast','-crf','20','-threads','2',
           '-vf','scale=w=min(1920\\,iw):h=-2','-pix_fmt','yuv420p',
           '-c:a','aac','-b:a','192k','-movflags','+faststart',str(tmp)]
    # Scale is part of the complex graph; avoid a second filter on the same output.
    scale = cmd.index('-vf')
    del cmd[scale:scale+2]
    filters[-1] = filters[-1].replace('[v][a]','[vc][a]')
    filters.append('[vc]scale=w=min(1920\\,iw):h=min(1920\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[v]')
    cmd[cmd.index('-filter_complex')+1] = ';'.join(filters)
    p = subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    deadline=time.monotonic()+14400
    try:
        while True:
            try:
                p.communicate(timeout=2)
                break
            except subprocess.TimeoutExpired:
                if shutil.disk_usage(output.parent).free<RESERVE:
                    raise ValueError('Le rendu a été interrompu avant saturation du disque. Libérer de la place puis réessayer.')
                if time.monotonic()>deadline:
                    raise ValueError('Le rendu a dépassé le délai maximal de quatre heures.')
        if p.returncode:
            raise ValueError('Échec de la création du master synchronisé.')
    except BaseException:
        if p.poll() is None:
            p.kill()
        p.communicate()
        tmp.unlink(missing_ok=True)
        raise
    actual = probe(tmp)
    expected = sum(s['duration'] for s in segments)
    if abs(float(actual['format']['duration'])-expected)>1 or len([s for s in actual['streams'] if s['codec_type']=='audio'])!=1:
        tmp.unlink(missing_ok=True)
        raise ValueError('Le contrôle du master synchronisé a échoué.')
    tmp.replace(output)
