"""Root-only installation; import existing SMTP settings without printing secrets."""
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess

from dotenv import dotenv_values

root=Path('/opt/brief-mood')
assert Path(__file__).resolve().parent==root and os.geteuid()==0
account=pwd.getpwnam('ivt')
data=Path('/var/lib/brief-mood')
data.mkdir(exist_ok=True,mode=0o700)
os.chown(data,account.pw_uid,account.pw_gid)
env=Path('/etc/brief-mood.env')
if not env.exists():
    original=dotenv_values('/opt/recall/app/deploy/.env')
    keys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','MAIL_FROM']
    assert all(original.get(k) for k in keys),'Existing SMTP configuration incomplete'
    assert original['SMTP_HOST']=='smtp.gmail.com' and original['MAIL_FROM']=='fenauxft@gmail.com'
    with env.open('x',encoding='utf-8') as out:
        for key in keys:
            value=original[key]
            assert '\n' not in value and '\r' not in value
            out.write(key+'='+json.dumps(value)+'\n')
    env.chmod(0o600)
for path in root.glob('*.service'):
    shutil.copy2(path,Path('/etc/systemd/system')/path.name)
for path in root.glob('*.timer'):
    shutil.copy2(path,Path('/etc/systemd/system')/path.name)
subprocess.run(['systemctl','disable','--now','brief-mood-send.timer'],check=False)
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Brief Mood runtime installed; SMTP configuration imported privately.')
