import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
ROOT = Path(__file__).resolve().parent
DATA = Path(os.getenv('CLIPS_DATA', str(ROOT / 'data'))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
TRANSCRIPTS = Path(os.getenv('CLIPS_TRANSCRIPTS', str(DATA/'transcripts'))).resolve()
RSS = 'https://feeds.acast.com/public/shows/xavierfenaux'
PUBLIC_URL = os.getenv('CLIPS_PUBLIC_URL', 'https://ftfenaux.com/clips').rstrip('/')
# Keep old persisted links readable while publishing new media at the master domain.
if PUBLIC_URL == 'https://ftfenaux.com/clips':
    PUBLIC_URL = 'https://xavierfenaux.com/clips'
ALLOWED_ORIGINS = {'https://xavierfenaux.com', 'https://www.xavierfenaux.com', 'https://ftfenaux.com'}
OPUS_KEY = os.getenv('OPUS_API_KEY', '')
GROQ_KEY = os.getenv('GROQ_API_KEY', '')
GROQ_MODEL = os.getenv('GROQ_MODEL', 'openai/gpt-oss-120b')
MAX_UPLOAD = int(os.getenv('CLIPS_MAX_UPLOAD_MB', '1000')) * 1024**2
RESERVE = 800 * 1024**2
KEEP_DAYS = int(os.getenv('CLIPS_KEEP_DAYS', '7'))
