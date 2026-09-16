"""Export Xavier-only Umami statistics for the authenticated master view."""
import importlib.util
import json
import os
import pwd
import tempfile
from datetime import datetime, timezone
from pathlib import Path

source = Path(__file__).parent / 'umami-overview' / 'generate.py'
spec = importlib.util.spec_from_file_location('umami_overview', source)
overview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overview)
domain = 'xavierfenaux.com'
overview.SITES = {domain: 'Xavier Fenaux'}
days, daily = overview.load_daily()
data = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'domain': domain,
        'summary': overview.load_summary().get(domain), 'days': days,
        'daily': daily.get(domain, {}), 'pages': overview.load_top_pages().get(domain, []),
        'sources': overview.load_referrers().get(domain, [])}
target = Path('/var/lib/xavier-master/analytics.json')
fd, tmp = tempfile.mkstemp(prefix='.analytics-', dir=target.parent)
try:
    with os.fdopen(fd, 'w') as output:
        json.dump(data, output, ensure_ascii=False)
    user = pwd.getpwnam('www-data')
    os.chown(tmp, user.pw_uid, user.pw_gid)
    os.chmod(tmp, 0o600)
    os.replace(tmp, target)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
