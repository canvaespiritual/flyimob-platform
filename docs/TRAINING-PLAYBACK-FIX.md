# Horizonte playback lifecycle integration

Each browser context now uses a stable UUID and increasing generation for lesson opens, reloads and recovery. Context/sequence are not authentication: tenant, BROKER identity, local TrainingAccess, assigned course, signed exchange and Horizonte enrollment checks remain authoritative. The BFF continues serializing upstream exchanges and operations per learner; bearer tokens never reach the browser.

POST playback forwards validated context/generation. DELETE playback forwards only the exact session ID after full authorization. Progress forwards bounded measured segments separately from position and strips caller identity. The player samples actual continuous playback, breaks coverage on every seek, serializes reporting, saves/ends the current session before Anterior/Próxima, isolates late responses and removes listeners/timers. Native Horizonte and Flyimob runtime files share identical content.

The server's 90-second activity lease recovers abrupt exits; active paused pages still heartbeat. On expiration, the player automatically opens the next generation and preserves its valid position. Media URLs renew every four minutes and when returning to foreground or receiving media errors; revision mismatch and access revocation stop playback. Five-minute tokens/URLs and the five-context cap are unchanged.

Progress rejection is recoverable and does not pause video. Authentication, authorization, unavailable media, session capacity, progress and transport errors have separate messages. Invalid segments are discarded safely; the next position report can continue. Current time never becomes watched coverage on its own. PlaybackProgress history is not reset, deleted or marked completed by opening/seeking.

Isolated branch/worktree prevents inclusion of pending broker finance/marketing/dashboard changes from the original Flyimob checkout. No migration or content/access change is part of this fix. Publish Horizonte first, verify health, then publish this checkout; inspect both applications' health/logs after each deploy.

Regression commands:

- `node --import tsx --test tests/training/*.test.ts tests/training/player-regression.test.mjs` (browser suite requires sibling Horizonte checkout or HORIZONTE_TEST_ROOT).
- Horizonte: `node --import tsx tests/playback-database.ts`, existing education DB tests and unit suites on guarded local database only.
- TypeScript, scoped lint, official `npm run build` in both checkouts.

Chrome covers minute-four seek, repeated Anterior/Próxima, saved position after reload, reload after rejected progress, expired session recovery, separate tabs, future lesson and access revocation. PostgreSQL tests cover capacity, abandonment, idempotence, out-of-order opens, concurrent devices, historical preservation and invalid coverage. Synthetic media clock/API identity are explicit; actual learner records are not used for these tests.
