# Academy PWA V1

## Architecture and scope

`/academy-admin` uses the existing session cookie/login, a separate visual shell and
an explicit list of allowed user IDs. No tenant ownership or separate login is added.
The new mobile API returns only the fields displayed by the feed. The home refreshes
every 20 seconds. No authenticated HTML, API response, phone or email is cached by
the service worker. Offline shows only a connection message.

The commercial request path is unchanged. A background client calls the authenticated
Next.js dispatch endpoint. The dispatcher reads existing Academy facts and stores
only new push records in the shared Prisma/PostgreSQL database. No new Pool/backend.

- Checkout: persisted lead plus a real `CHECKOUT_CLICK` received after that lead.
  Use server `receivedAt` to avoid depending on the visitor's clock. One notification
  per session; opening the form alone never qualifies.
- Sale: an APPROVED/COMPLETED AcademySale with a processed PURCHASE_APPROVED or
  PURCHASE_COMPLETE webhook. One key per sale, including APPROVED → COMPLETED.
- Only facts after `ACADEMY_PUSH_START_AT` are discovered. A device receives facts
  occurring after its subscription start. Existing history is not broadcast on install.
- Event unique key + delivery unique key (event, subscription) + atomic claims prevent
  concurrent duplicate sending. Worker retries transient failures up to five attempts,
  with backoff. 404/410 deactivate subscriptions. Browser IndexedDB stores only event
  IDs to suppress duplicate display after a lost server acknowledgement. Push services
  and OS can delay/drop messages; absolute exactly-once delivery is not guaranteed.
- Delivery failures never execute in precheckout/Hotmart requests. No hook was added
  to either handler or service. A worker outage cannot change those HTTP responses.
- Notifications show name/value on the device lock screen as requested. No phone,
  email, credentials or raw webhook payload is included. Keys/endpoints never logged.

## Migration (not applied)

`20260916000000_academy_admin_push` creates only:

- AcademyPushSubscription: user ID, hashed unique endpoint, endpoint/keys, active flag.
- AcademyPushNotification: unique logical event key and source ID, no PII snapshot.
- AcademyPushDelivery: event/subscription unique pair, claim/retry/sent state.

Generated with `prisma migrate diff` between two local schema files. Existing models,
enums and applied migrations remain unchanged. Before deployment review migration
status and authorize applying this migration with `prisma migrate deploy`. No db push.

## Environment (local and Railway web service)

| Variable | Value / purpose |
| --- | --- |
| `NEXT_PUBLIC_ACADEMY_VAPID_PUBLIC_KEY` | Public VAPID key; required at build time |
| `ACADEMY_VAPID_PRIVATE_KEY` | Matching private key; server secret only |
| `ACADEMY_VAPID_SUBJECT` | A real contact, e.g. `mailto:admin@flyimob.com` |
| `ACADEMY_ADMIN_USER_IDS` | Comma-separated IDs of existing authorized Flyimob users |
| `ACADEMY_ADMIN_ORIGIN` | `https://flyimob.com`; locally `http://localhost:3000` (no trailing slash) |
| `ACADEMY_PUSH_START_AT` | UTC ISO instant from which to notify, set at activation |
| `ACADEMY_PUSH_WORKER_SECRET` | Random server secret of at least 32 characters |

No environment file has been changed. Missing configuration fails closed. Without
the allowlist, the Academy admin is inaccessible; configure it before deployment.

Generate keys ONCE in your own terminal, store directly in your secret manager/env,
and do not paste the private key into chat, Git or logs:

```sh
npx web-push generate-vapid-keys --json
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The second command generates the worker secret. Keep the VAPID pair stable; key
rotation requires devices to unsubscribe/re-subscribe and rebuild the public key.

## Background dispatch on Railway

Create a background service from the SAME repository (no public domain required),
using the command below. Set `ACADEMY_ADMIN_ORIGIN` and `ACADEMY_PUSH_WORKER_SECRET`
to the same values as the web service. It calls the Next endpoint every 20 seconds
after the previous cycle finishes, including when all phones are closed.

```sh
node scripts/academy-push-dispatch.mjs --loop
```

Without `--loop` it runs once and can be scheduled. Railway native cron has a minimum
five-minute interval, so use the continuous worker for near-real-time alerts.
One cycle discovers up to 100 checkout leads + 100 sales and sends up to 30 deliveries.
Monitor worker HTTP failures and FAILED deliveries. Do not enable serverless sleeping
for the continuously running worker. Delivery latency includes worker interval and
push provider/device availability.

## Install and verify

1. Apply the approved migration; configure variables; build/deploy web and worker.
2. Open `https://flyimob.com/academy-admin` and log in with an allowed user.
3. Android/Chrome: install via the browser menu or the app's install button when the
   browser emits `beforeinstallprompt`. iPhone/iPad iOS 16.4+: Safari → Share → Add to
   Home Screen; then open the installed app.
4. Tap **Ativar notificações**, approve the system prompt. Existing subscriptions sync
   when opening the app. **Desativar notificações** disables only this device.
5. **Testar checkout / Testar venda** sends a clearly synthetic push only to this device,
   without creating any AcademyLead/Sale or permanent synthetic commercial records.
6. Verify notification click opens `/academy-admin`, also while the app is closed.

Manifest has stable ID/scope/start URL, standalone display, 192/512 PNG icons, a maskable
icon and Apple touch icon derived from the existing Flyimob asset. Worker source is at
`/academy-admin-sw.js` (root source allows registering scope `/academy-admin` including
the no-trailing-slash home). It never controls `/corretor-academy`.

## Validation limits

Automated tests use synthetic records and mocked Prisma/provider transport; actual
Web Push encryption/signing runs through web-push. They do not write to production.
Physical device delivery and subscription persistence need the unapplied migration,
VAPID configuration and authorized login. These checks must be completed before enabling
notifications in production. No Hotmart purchase is needed for the test buttons.

Sources: https://github.com/web-push-libs/web-push,
https://docs.railway.com/cron-jobs,
https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## File inventory

Modified:

- `package.json`, `package-lock.json`, `pnpm-lock.yaml`: web-push and its TypeScript declarations.
- `prisma/schema.prisma`: only the three new push models.
- `src/app/academy-admin/layout.tsx`: PWA metadata and authorized-user guard.
- `src/app/academy-admin/page.tsx`: mobile home.
- `src/app/api/admin/academy/{summary,leads,breakdown}/route.ts`: shared Academy access guard.

Created:

- `prisma/migrations/20260916000000_academy_admin_push/migration.sql`
- `src/lib/academy/{admin-access.server,mobile.server,push-policy,push.server}.ts`
- `src/components/academy/{MobileHome,PwaControls}.tsx`
- `src/app/api/admin/academy/mobile/route.ts`
- `src/app/api/admin/academy/push/{subscription,dispatch,test}/route.ts`
- `public/academy-admin-sw.js`
- `public/academy-admin/manifest.webmanifest`
- `public/academy-admin/{icon-192,icon-512,icon-maskable,apple-touch-icon}.png`
- `scripts/academy-push-dispatch.mjs`
- `tests/academy/push.test.ts`
- This document.

Local validation: 39 tests passed (28 existing + 11 push), TypeScript, ESLint,
Prisma validate, git diff --check and complete Next build (142/142 pages).
Production-mode HTTP smoke on localhost: manifest/SW/four icons returned 200 with
correct MIME types; admin home redirected to existing login; mobile/leads/subscription/test
APIs returned 401 without login. No real browser installation/device push was claimed
or tested. No migration was applied and no synthetic production data was created.
