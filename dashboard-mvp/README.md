# Xavier Fenaux - Dashboard marche

MVP prive pour suivre des setups a surveiller a partir de webhooks TradingView, notifications Xavier / IVT, contexte news et agents OpenAI cote serveur.

Ce projet n'execute aucun ordre. Il affiche du contexte, des zones, des invalidations, des objectifs theoriques et un score d'aide a la revue.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- API routes Node.js
- PostgreSQL + Prisma
- Redis + BullMQ
- OpenAI API cote serveur uniquement
- Docker Compose
- Nginx pret a reverse proxy

## Installation locale

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Dashboard local:

```text
http://localhost:3000/dashboard
```

## Variables d'environnement

Renseigner `.env` a partir de `.env.example`.

Variables principales:

```text
DATABASE_URL
REDIS_URL
DASHBOARD_USERS
SESSION_SECRET
TRADINGVIEW_WEBHOOK_SECRET
OPENAI_API_KEY
OPENAI_MODEL_LIGHT
OPENAI_MODEL_STRONG
NEWS_API_URL
NEWS_API_KEY
```

`OPENAI_API_KEY` doit rester uniquement dans `.env`. Aucune cle API ne doit etre exposee au frontend.

Comptes dashboard:

```text
DASHBOARD_USERS="xfenaux@gmail.com:mot-de-passe-1,fenauxft@gmail.com:mot-de-passe-2"
```

Le format legacy `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` reste supporte pour un seul compte.

Modeles par defaut:

```text
OPENAI_MODEL_LIGHT=gpt-5-mini
OPENAI_MODEL_STRONG=gpt-5.5
```

## Docker

```bash
docker compose up -d
docker compose logs -f
npx prisma migrate deploy
npx prisma studio
```

Services inclus:

- `app`
- `postgres`
- `redis`
- `worker-tradingview`
- `worker-news`
- `worker-score`

## TradingView webhook

Endpoint:

```text
POST /api/webhooks/tradingview
```

Secret attendu via header:

```text
x-tradingview-secret: TRADINGVIEW_WEBHOOK_SECRET
```

Payload exemple:

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "price": 68200,
  "signal": "zone_reached",
  "direction": "short",
  "indicator": "custom",
  "message": "BTC arrive sur zone"
}
```

Chaque alerte est stockee dans `TradingViewAlert`, journalisee dans `AuditLog`, puis envoyee dans BullMQ.

## Import manuel IVT

Depuis `/dashboard`, coller une notification brute dans le formulaire d'import.

Exemple:

```text
CAC 40 : zone 8200/8300, invalidation 8370, TP1 7990, TP2 7600. Attendre confirmation.
```

L'agent extrait:

- actif
- biais
- zone
- invalidation
- objectifs
- timeframe si present
- niveau de confiance
- notes de risque
- resume exploitable

Les donnees sont stockees dans `XavierNotification`. Si la notification est assez structuree, une opportunite reste au statut `a surveiller`.

## News

Le worker `scanNews` planifie un scan toutes les 45 minutes.

Si `NEWS_API_URL` et `NEWS_API_KEY` sont absents, un provider mock est utilise. Le contrat `NewsProvider` est dans `lib/news/providers.ts`.

Donnees stockees:

- titre
- source
- URL
- date
- resume
- actifs concernes
- score d'importance

## Agents

Agents dans `lib/agents`:

- `marketAgent.ts`: resume les news, identifie les actifs et classe le contexte.
- `setupAgent.ts`: croise TradingView, IVT et news, puis refuse si les donnees sont insuffisantes.
- `riskAgent.ts`: verifie l'invalidation, la clarte du scenario et le vocabulaire.
- `writerAgent.ts`: redige une fiche dashboard claire, directe et sans promesse de performance.

Sans `OPENAI_API_KEY`, le MVP garde des fallbacks simples pour importer et structurer les notifications.

## Scoring

Score sur 100:

- confluence TradingView + IVT: +30
- actualite coherente: +15
- zone claire: +15
- invalidation claire: +15
- objectifs theoriques clairs: +10
- fraicheur: +10
- risque / incertitude: malus jusqu'a -20

Aucune validation automatique. Le statut initial reste `a surveiller`.

## Securite

- `/dashboard` exige une session.
- Le login est configure via `.env`.
- Le webhook TradingView exige un secret.
- Les endpoints publics ont un rate limit simple.
- Les cles API restent cote serveur.
- Les actions utilisateur sont journalisees dans `AuditLog`.

## Nginx

Exemple de reverse proxy:

```text
docker/nginx-dashboard.conf
```

Il route `/dashboard` et `/api/` vers l'app Next.js.

## Limites conformite

Le dashboard affiche des scenarios de marche a surveiller. Il ne remplace pas un jugement humain, ne personnalise pas la decision et ne promet aucun resultat.

Le vocabulaire attendu reste: setup a surveiller, contexte, zone, invalidation, objectif theorique, risque.

## Prochaines etapes

- Ajouter une vraie API news.
- Ajouter une page d'audit et de couts.
- Ajouter des roles utilisateurs.
- Ajouter un backtest de qualite des setups sans execution.
- Ajouter des notifications email ou Slack pour les revues importantes.
