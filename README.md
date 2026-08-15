# Job Search Bot

Finds SEO job openings from public boards and can ping you every morning via Slack, Discord, or email.

Default search: **SEO** + remote.

Live sources (no API key):

- Remotive
- Arbeitnow
- Jobicy
- Himalayas
- Remote OK
- The Muse

Optional API keys unlock Indeed, Glassdoor, ZipRecruiter, LinkedIn, Reed, Jooble, and Adzuna.

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Vercel

Production deploys from `main` on [Raja12111/Job-Search-Bot](https://github.com/Raja12111/Job-Search-Bot).

Required env (Production + Preview):

| Name | Purpose |
|------|---------|
| `CRON_SECRET` | Protects `/api/cron` |
| `JOB_QUERY` | Default keywords for the daily run |
| `JOB_LOCATION` | Default location |
| `JOB_REMOTE_ONLY` | `true` or `false` |

Optional:

| Name | Purpose |
|------|---------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook |
| `DISCORD_WEBHOOK_URL` | Discord webhook |
| `RESEND_API_KEY` + `NOTIFY_EMAIL` | Email alerts |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | Extra job source |
| `JSEARCH_API_KEY` | Indeed, Glassdoor, ZipRecruiter, LinkedIn, Monster |
| `REED_API_KEY` | Reed UK |
| `JOOBLE_API_KEY` | Jooble aggregator |

Cron (Hobby = once per day): `0 8 * * *` UTC → `/api/cron`.

Manual run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP.vercel.app/api/cron
```
