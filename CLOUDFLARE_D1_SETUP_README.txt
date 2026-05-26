Cloudflare D1 version.

Features:
- Cloudflare Cron every 1 minute.
- Browser-open fast collect every 30 seconds via /api/collect.
- D1 dedupes repeated WU obs / forecast / METAR.
- No Netlify, no Supabase, no external cron.

Setup:
1. Install Node.js.
2. In this folder run:
   npm install
   npx wrangler login
   npx wrangler d1 create vilk_weather
3. Copy the database_id from output into wrangler.toml.
4. Run:
   npx wrangler d1 execute vilk_weather --file=./schema.sql --remote
5. Deploy:
   npx wrangler deploy

Optional secrets:
npx wrangler secret put WU_KEY

Test URLs after deploy:
https://YOUR-WORKER.workers.dev/api/collect
https://YOUR-WORKER.workers.dev/api/history

Note:
Cloudflare cron minimum is 1 minute. For 30 sec, browser-open collector calls /api/collect every 30 sec.
