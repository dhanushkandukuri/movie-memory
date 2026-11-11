# Movie Memory

Sign in with Google, tell it your favorite movie, and get a fun fact about it from OpenAI.

I implemented **Variant A (backend: caching and correctness)**. The interesting parts are in
[`src/lib/facts/get-fact.ts`](src/lib/facts/get-fact.ts) and explained in
[Variant A: caching and correctness](#variant-a-caching-and-correctness) below.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Postgres + Prisma 7 ·
Auth.js v5 (Google) · OpenAI API · Vitest

## Running it locally

You need Node.js 20.19+, a Postgres database, a Google OAuth client and an OpenAI API key.

### 1. Install

```bash
git clone https://github.com/dhanushkandukuri/movie-memory.git
cd movie-memory
npm install
```

`npm install` also generates the Prisma client (`postinstall`).

### 2. Start Postgres

```bash
docker compose up -d
```

This starts Postgres 17 on `localhost:5432` with a `movie_memory` database (user and password
`postgres`). Any other Postgres works too, for example a free [Neon](https://neon.tech) database. Just
point `DATABASE_URL` at it.

### 3. Create a Google OAuth client

In the Google Cloud Console, create an **OAuth client ID** of type **Web application**:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

If the OAuth consent screen is in "Testing" mode, add the Google accounts you'll sign in with as test
users.

### 4. Environment variables

Create a `.env` file in the project root (it's git-ignored):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/movie_memory"

AUTH_SECRET="..."         # generate with: openssl rand -base64 32
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."

OPENAI_API_KEY="..."
```

| Variable | Required | Used for |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection, used by the app and the Prisma CLI |
| `AUTH_SECRET` | yes | Auth.js uses it to sign and encrypt its cookies |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | yes | The Google OAuth client from step 3 |
| `OPENAI_API_KEY` | yes | Generating fun facts |
| `OPENAI_MODEL` | no | Defaults to `gpt-4.1-mini` |
| `AUTH_URL` | no | Only for `npm run build && npm start` locally: set it to `http://localhost:3000`, otherwise Auth.js rejects the host in production mode. Not needed for `npm run dev`. |
| `SHADOW_DATABASE_URL` | no | Only for `prisma migrate dev` against a server that can't create a temporary database itself (e.g. `npx prisma dev`). Not needed with Docker or Neon. |

All of these are server-side only. Nothing is prefixed with `NEXT_PUBLIC_`, and the database and
OpenAI modules import `server-only`, so pulling them into client code fails the build.

### 5. Run the migrations

```bash
npm run db:deploy
```

This applies everything in `prisma/migrations` (`prisma migrate deploy`). If you change
`prisma/schema.prisma`, run `npm run db:migrate` (`prisma migrate dev`) to create and apply a new
migration, then `npx prisma generate` (Prisma 7 no longer regenerates the client during `migrate dev`).

### 6. Start the app

```bash
npm run dev
```

Open http://localhost:3000.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Backend tests (no database or API keys needed) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates Next's route types (`next typegen`), then runs `tsc --noEmit` |
| `npm run db:deploy` | Apply migrations |
| `npm run db:migrate` | Create and apply a new migration in development |

## Architecture overview

### Request flow

1. **`/`** is the landing page. It's a server component: if you already have a session it redirects
   to `/dashboard`, otherwise it shows "Sign in with Google", a form that posts to a server action
   calling Auth.js's `signIn("google")`.
2. **Google → `/api/auth/callback/google`.** Auth.js with the Prisma adapter creates the `User` and
   `Account` rows on first sign-in, then a `Session` row, and sets an httpOnly cookie holding the
   session token.
3. **`/dashboard`** loads the user. If `favoriteMovie` is still null, they're a first-time user and get
   redirected to `/onboarding`. So "first-time vs returning" is decided by the data, not by a flag set
   during sign-in. A user who closes the tab halfway through onboarding is sent back there next time.
4. **`/onboarding`** asks for the favorite movie. A server action validates it, saves it and redirects
   to the dashboard.
5. **`/dashboard`** shows the name, email and photo, the favorite movie, and a fun fact. The fact is
   rendered inside `<Suspense>`, so the page shows up right away and the fact streams in when it's
   ready. "Get another fact" calls `router.refresh()`, which re-renders the page on the server.

There's also **`GET /api/fact`**, which returns the signed-in user's current fact as JSON, using the
same logic as the dashboard. It returns 401 when signed out.

### Code layout

```
prisma/
  schema.prisma              data model
  migrations/
src/
  auth.ts                    Auth.js config: Google, database sessions
  app/
    page.tsx                 landing page
    onboarding/              form + server action
    dashboard/               profile, movie, fun fact
    api/auth/[...nextauth]/  Auth.js routes
    api/fact/                GET the current fact as JSON
  components/                sign-in/out buttons, avatar with fallback
  lib/
    session.ts               getSessionUserId() / requireUserId()
    users.ts                 profile and onboarding queries
    movie-title.ts           zod schema for the movie title
    openai.ts                the OpenAI call
    facts/
      get-fact.ts            cache, lock and fallback logic (Variant A)
      prisma-store.ts        Postgres implementation of the store it uses
      index.ts               wires the two together
```

### Data model

- **User**: the Auth.js fields plus `favoriteMovie` (`VARCHAR(100)`, null until onboarding).
- **Account**, **Session**: managed by the Auth.js Prisma adapter.
- **MovieFact**: `userId`, `movieTitle`, `content`, `createdAt`. `movieTitle` is a snapshot of the
  title at generation time. The index on `(userId, movieTitle, createdAt DESC)` matches the one query
  the cache runs: "the latest fact for this user and this movie".
- **FactGenerationLock**: `userId` (primary key), `token`, `expiresAt`. A row exists only while a
  request is generating a fact for that user. See below.

### Auth and authorization

- **Database sessions.** The cookie holds only a random token, and every request looks it up in
  `Session`. Signing out deletes the row, so a session is revoked immediately instead of living until
  a JWT expires. The cost is one indexed query per request.
- **The user id only ever comes from the session.** No page, server action or API route accepts a
  `userId` or a fact id from the client, and every fact query filters by `userId`. There's no
  endpoint where changing a parameter could return someone else's data.
- **No middleware.** Every page and route checks the session itself, through `requireUserId()` (pages:
  redirects to `/`) or `getSessionUserId()` (API: returns 401). `/dashboard` redirects to the landing
  page when you're signed out. Cache Components is turned off in `next.config.ts` so these redirects
  happen before any HTML streams, giving real 307s.
- **Session payload trimmed.** The session callback returns only `id`, `name`, `email` and `image`.
  The default would expose more of the raw session row through `/api/auth/session`.
- **No Google tokens stored.** Google is only used to sign in, so the adapter drops the access,
  refresh and ID tokens instead of saving them.

### Input validation

- The movie title is validated **on the server** in the onboarding server action with zod. The
  `required`/`maxLength` attributes on the input are only for UX. The rules: trim, collapse repeated
  whitespace (so `The   Matrix` and `The Matrix` share a cache key), 1–100 characters (there are real
  one-letter titles like "M"), no control characters. The `VARCHAR(100)` column is a second line of
  defense.
- Saving runs `UPDATE ... WHERE id = ? AND "favoriteMovie" IS NULL`, so a double submit or a second
  tab can't overwrite a movie that's already saved.
- The title is sent to OpenAI as the user message, with instructions to treat it only as a title.
  The answer is capped at 600 characters and rendered as plain text, which React escapes.

### Missing Google profile data

- No name: show the part of the email before the `@`, and if there's no email either, "Movie fan".
- No photo, or the photo fails to load: show an initials avatar. This also covers an image that
  fails before React hydrates, when `onError` wouldn't fire.

## Variant A: caching and correctness

### Why Variant A

The OpenAI call is the part of this app most likely to go wrong in production. It takes a second or
more, every call costs money, and it fails sometimes: rate limits, timeouts, or running out of
credits, which actually happened while I was building this. Variant A is about making that call
behave correctly under real conditions, meaning repeated requests, parallel requests and failures.
That's the part I wanted to get right.

### What happens on a fact request

`getFactForUser(userId)` in [`src/lib/facts/get-fact.ts`](src/lib/facts/get-fact.ts):

1. Read the user's favorite movie from **their own** row.
2. If their latest fact for that movie is less than 60 seconds old, return it (`cache`). No lock, no
   OpenAI call.
3. Otherwise, try to take the user's **generation lock**.
4. **Got the lock:** check the cache **again**. If there's still no fresh fact, call OpenAI, save the
   fact, release the lock (`generated`). If OpenAI fails, return the user's most recent older fact
   (`fallback`), or a friendly error if there isn't one.
5. **Didn't get the lock:** another request for this user is already generating. Wait for its fact
   (`cache`) instead of making a second call. If that request fails, return the older fact or the
   error right away.

The dashboard shows a small note saying which of these happened.

Three decisions here are worth explaining.

### 1. Why a database-backed lock

The 60-second cache by itself doesn't prevent duplicates. If someone double-clicks "Get another fact"
or has two tabs open, both requests check the cache at the same moment, both find nothing fresh, and
both call OpenAI. I needed a way to let exactly one request generate while the others wait for it.
The options I considered:

| Option | Why not |
| --- | --- |
| In-memory lock (a `Map` of in-flight promises) | Only works inside one Node process. With more than one instance (serverless functions, several containers, a rolling deploy), two requests can land on different processes and both generate. |
| Postgres advisory lock or `SELECT ... FOR UPDATE` | Correct across instances, but the lock lasts as long as the transaction or connection, so I'd hold a database connection open for the whole OpenAI call (up to 20 s). A burst would drain the connection pool, and session-level advisory locks don't work behind a transaction-mode pooler (PgBouncer, Neon's pooled endpoint). |
| Unique constraint on facts (one per user per minute) | Stops the duplicate *row* but not the duplicate *OpenAI call*: both requests have already paid for a call by the time the second insert fails. Fixed minute buckets also don't match a sliding 60-second window. |
| Redis `SET NX PX` | The standard tool for this, but it's a whole new piece of infrastructure for one lock. |
| **A lock row in Postgres (what I did)** | See below. |

`FactGenerationLock` has `userId` as its primary key, so taking the lock is just an `INSERT`. When
several requests race, Postgres guarantees exactly one insert succeeds; the rest get a unique-constraint
violation (Prisma `P2002`) and know someone else is generating. No transaction stays open during the
OpenAI call. It works across any number of app instances because they all share the same database,
and it needs nothing the app doesn't already have.

The cost is a few small queries on a cache miss, a path that's about to spend a second or more on
OpenAI anyway. Requests served from the cache never touch the lock table.

The lock is per user, not per (user, movie). A user has one current movie, and keying by the primary
key keeps it simple.

### 2. How lock expiration works

The lock is a **lease**: each row has an `expiresAt` 30 seconds after it was taken.

**Why it has to expire.** The lock is released in a `finally` block, but `finally` doesn't run if the
process crashes, gets killed during a deploy, or a serverless function is frozen mid-request. Without
an expiry, that leftover row would block the user from ever getting a new fact.

**Taking over an expired lease** ([`prisma-store.ts`](src/lib/facts/prisma-store.ts)). `acquireLock`
first runs a conditional update:

```sql
UPDATE "FactGenerationLock" SET token = $newToken, "expiresAt" = $newExpiry
WHERE "userId" = $userId AND "expiresAt" <= $now
```

If it updates a row, the old lease was dead and this request now holds the lock. If two requests try
to take over the same expired lease at once, Postgres's row lock makes the second `UPDATE` re-check the
`WHERE` after the first one commits. By then it sees a live lease and updates nothing. If there's no
row at all, it falls through to the `INSERT` described above.

**Why 30 seconds.** The TTL has to be longer than any request can legitimately hold the lock. If it
weren't, a second request could take over while the first is still waiting on OpenAI, and we'd be back
to duplicate calls. So the OpenAI call has a hard upper bound
([`openai.ts`](src/lib/openai.ts)): 8 s per attempt, one retry, and an overall
`AbortSignal.timeout(20_000)` that also covers the SDK's backoff between attempts. 30 s leaves room
above that 20 s for the database queries around the call. A shorter TTL would recover faster after a
crash, and a longer one would be safer for slow calls; 30 s is a reasonable middle.

**A request only releases its own lock.** Every acquisition gets a random token, and releasing is
`DELETE ... WHERE "userId" = $userId AND token = $token`. If a request somehow outlived its lease and
another request took over, the slow one's `finally` deletes nothing instead of removing someone
else's lock.

**Waiting requests check the lock before the fact.** A request that didn't get the lock polls every
300 ms for up to 20 s. Each poll first checks whether the lock is still held, then looks for a fresh
fact. The order matters: the holder always saves its fact *before* releasing, so "lock gone and still
no fresh fact" can only mean the holder failed. The waiter can then return the fallback or the error
immediately instead of waiting the full 20 s. In the opposite order, the holder could save and release
between the waiter's two reads, and the waiter would wrongly report a failure.

**One clock.** Cache age and lease expiry both use the app server's clock (`createdAt` is set by the
app, not by the database's `now()`), so they're always compared against the same clock.

### 3. Why check the cache again after taking the lock

This is double-checked locking. The first cache check runs without the lock to keep the common case
cheap, but it can be out of date by the time the request gets the lock:

```
Request A                            Request B
---------                            ---------
cache check: nothing fresh
takes the lock
calls OpenAI...                      cache check: nothing fresh (A hasn't saved yet)
saves the fact, releases the lock
                                     takes the lock (it's free now)
                                     no second check → calls OpenAI again
```

B's first check was correct when it ran, but by the time B holds the lock, A has already finished.
Without the second check, B would generate another fact inside the same 60 seconds, which is exactly
the duplicate the lock exists to prevent. The second check can be trusted because it happens *while
holding the lock*: only the lock holder ever saves a fact, so nothing new can appear between that
check and B's own OpenAI call.

The first check stays because it's what serves most requests inside the 60-second window without
touching the lock at all.

### Failure handling

- OpenAI error, timeout or empty response: return the most recent fact for this user and movie, labeled
  as an older fact (`fallback`). If there's none, show "We couldn't come up with a fun fact right now.
  Please try again in a moment." (`/api/fact` returns it with a 503.)
- A waiting request that runs out of time gets the older fact, or "Your fun fact is still being
  written. Please try again in a few seconds."
- Errors are logged on the server with just the message. The full OpenAI error object includes the
  request headers, which shouldn't end up in logs.

### Tests

`npm test` runs 22 tests in about a second, with no database or API keys.

- **[`get-fact.test.ts`](src/lib/facts/get-fact.test.ts)** runs the real logic against an in-memory
  store, a fake clock and a fake OpenAI:
  - **cache window:** a fact 59,999 ms old is reused, at 60,000 ms a new one is generated, and each
    movie has its own cache;
  - **bursts:** 5 parallel requests make 1 OpenAI call and store 1 fact, and the others get it from the
    cache;
  - **lock behavior:** the second cache check after taking the lock; a waiter picking up the holder's
    fact (the lock-then-fact ordering); taking over an expired lease; "busy" or fallback when the holder
    never finishes;
  - **OpenAI failures:** fallback, the friendly error, and waiting requests not calling OpenAI again;
  - **authorization:** Bob never gets, or falls back to, Alice's fact for the same movie, and Alice's
    lock doesn't block Bob.
- **[`route.test.ts`](src/app/api/fact/route.test.ts)**: `/api/fact` returns 401 when signed out and
  only ever uses the session's user id, even when the URL contains `?userId=someone-else`.
- **[`prisma-store.test.ts`](src/lib/facts/prisma-store.test.ts)**: the real queries filter by
  `userId`, and releasing the lock matches the token.

To make sure the tests catch real bugs, the code was broken on purpose one way at a time:
- an off-by-one in the 60 s check;
- removing the second cache check;
- swapping the waiter's lock and fact checks;
- removing the fallback;
- ignoring the lock;
- dropping the 401;
- trusting `?userId=`;
- dropping `userId` from the query.

Each one made at least one test fail.

Separately, against the local database (`npx prisma dev`) and the real OpenAI API:
- 6 parallel requests produced 1 `generated` and 5 `cache` responses, one stored fact, and no
  leftover lock;
- 10 parallel `acquireLock` calls had exactly one winner, both with no lock row and with an expired
  one.

## Key tradeoffs

- **Postgres lock instead of Redis or in-memory.** It's correct across instances with no new
  infrastructure, at the cost of a few extra queries on a cache miss and the polling described above.
- **Polling instead of `LISTEN/NOTIFY`.** Waiters poll every 300 ms. That's simple and works through
  any connection pooler. The worst case is about 130 small queries for a request that waits the full
  20 s, which only happens if the holder hangs. `LISTEN/NOTIFY` would need a dedicated connection per
  waiter.
- **The same fact for 60 seconds.** Clicking "Get another fact" inside the window returns the same
  fact. That's the point of the cache, but the button looks like it did nothing, so the UI says "New
  facts are available once a minute".
- **GET with a side effect.** Rendering the dashboard or calling `GET /api/fact` can create a fact.
  Strictly, creating something should be a POST. I kept it a read because it behaves like one from
  the client's side: within the window you always get the same fact, and the cache plus the lock limit
  it to one successful generation per user per minute however many requests arrive.
- **App clock, not database clock.** With several app servers whose clocks disagree, cache age and
  lease expiry would be off by that difference. With NTP that's milliseconds. Using the database's
  `now()` everywhere would remove it, at the cost of raw SQL or extra round trips.
- **Database sessions instead of JWT.** One extra query per request, in exchange for real sign-out and
  no user data in the cookie.
- **No middleware.** Each page and route checks auth itself. That's explicit and easy to test, but a new
  page has to remember to call `requireUserId()`.
- **Dependency injection for the fact logic.** `getFactForUser` takes the store, the OpenAI function
  and the clock as parameters. It's a bit more code than calling Prisma directly, but it's what makes
  the concurrency tests fast and deterministic. The catch is that the in-memory store has to match the
  Prisma one. The real lock's atomicity rests on Postgres guarantees plus the manual race checks above,
  not on an automated test (see below).
- **The favorite movie is set once.** There's no edit screen. Facts store the movie title they were
  generated for, so adding one later wouldn't need any cache changes.
- **Facts aren't fact-checked.** The prompt asks for accurate trivia and to say so if the title isn't
  recognized, but the output is whatever the model returns.

## What I'd improve with 2 more hours

- **Integration tests for `prismaFactStore` against a real multi-connection Postgres** (a CI service
  container): many parallel `acquireLock` calls with exactly one winner, and the expired-lease takeover
  race. So far those have only been checked by hand against the local `prisma dev` database, which may
  serialize queries.
- **Back off after OpenAI failures.** If OpenAI is down, each new request, one at a time thanks to the
  lock, tries again. A short "failed recently" marker would stop hammering it.
- **A daily per-user generation cap** to put a hard ceiling on OpenAI cost.
- **Let users change their favorite movie**, reusing the same validation.
- **Show past facts** on the dashboard. They're already stored.
- **CI** (GitHub Actions) running lint, typecheck, tests and build on every push.
- **An end-to-end test** (Playwright) for sign-in → onboarding → dashboard, using a test-only auth
  provider.
- **Metrics:** cache hit rate, OpenAI latency and failure rate.

## AI usage

- I used Claude Code, and Codex as a pair programmer throughout: project setup
  (Next.js 16, Prisma 7, Auth.js v5), drafting the features when I told the ais on how I want the feture to be written, writing the tests and drafting this README.
- I worked in small chunks. The AI wrote a piece, I reviewed, reinvented, changed and ran it, then committed it myself, so
  the commit history follows those chunks.
- I talked through the Variant A design with it (lock options, TTL vs. OpenAI deadline, the second
  cache check, the order of the waiter's checks) and picked the database lease lock for the reasons
  above.
- It also helped verify the work: running the burst and fallback scenarios against the real database
  and OpenAI, and breaking the code on purpose to confirm the tests fail.
- Its output wasn't always right the first time. Made manual changes, and asked agent whether I have the correct approach or if there is a better approach. Examples were a migration setup that clashed with the
  local Prisma dev database, an avatar fallback that didn't fire before hydration, and error logging
  that dumped OpenAI request headers. Each one was caught by running the app or the tests, then fixed.
- I used a second agent to review the README; it suggested expanding the lock and second-check sections.
