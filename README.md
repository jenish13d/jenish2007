# StreamLounge

Viewer-triggered alerts for live streamers. Viewers send messages, voice notes,
soundboard clips, AI stickers, spin-wheel results and challenges; each appears
on the creator's stream through a single OBS browser source. Creators control
which interactions are on offer and what each costs.

Next.js 16 (App Router) · React 19 · TypeScript · Supabase · Razorpay.

---

## 1. Running it

```bash
npm install
cp .env.example .env.local      # then fill in the values
npm run dev
```

Checks:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # node --test
npm run check       # all three
npm run build       # production build
```

Node 20.9 or newer is required (Next.js 16 minimum).

---

## 2. Architecture

```
app/
  page.tsx                     landing (server component, no client JS)
  [username]/                  public creator page — the viewer's interaction UI
  obs/                         OBS browser source overlay (authorised by overlay key)
  login/ signup/               auth
  creator/                     public-page editor
  dashboard/                   overview, interactions, earnings, analytics, soundboard
  api/                         route handlers
lib/
  env.ts                       validated configuration, no fallback secrets
  db/types.ts                  typed database records
  interactions/registry.ts     the interaction catalogue — single source of truth
  validation/schemas.ts        Zod request schemas, shared with the tests
  http/responses.ts            API envelopes and error redaction
  security/rate-limit.ts       per-endpoint limits
  payments/                    Razorpay client, signatures, tokens, pricing, authorisation
  overlay/                     overlay keys, playback tokens, themes
  storage/                     bucket paths, upload limits, signed URLs
  submissions/repository.ts    submission insertion and overlay queue
  integrations/youtube.ts      OAuth and Data API
supabase/
  migrations/                  versioned SQL, in order
  audit/rls_audit.sql          read-only policy inspection
tests/                         node --test suites
proxy.ts                       session refresh and dashboard redirects
```

Authenticated pages are thin dynamic server shells over client components, so
they are never prerendered at build time.

### Which Supabase client to use

| Client | File | Used for |
| --- | --- | --- |
| Browser | `lib/supabase/browser.ts` | Client components, acting as the signed-in creator. RLS applies. |
| Server (cookie) | `lib/supabase/server.ts` | Route handlers acting as the signed-in creator. RLS applies. |
| Service role | `lib/supabase/service.ts` | Only: the Razorpay webhook, the overlay event endpoint, and viewer submission insertion. Bypasses RLS — authorisation is made in application code above it. |

---

## 3. Database

Apply the migrations in `supabase/migrations/` in numeric order, in the Supabase
SQL editor. They are idempotent and drop nothing.

| File | What it does |
| --- | --- |
| `0001_submission_payment_uniqueness.sql` | Unique index on the Razorpay payment id, plus overlay-queue indexes. |
| `0002_overlay_keys_and_queue.sql` | `overlay_key` column, `updated_at` triggers, atomic claim / recover / complete functions. |
| `0003_ai_generation_claims.sql` | Single-use ledger for paid AI generations. |
| `0004_rls_hardening.sql` | RLS and storage policies. |
| `0005_get_public_interactions.sql` | The public interaction RPC (carried forward unchanged). |
| `0006_profile_bootstrap.sql` | Creates a profile on signup; backfills; seeds pricing. |

**Before applying 0004**, run `supabase/audit/rls_audit.sql` and read the output.
Permissive RLS policies are OR-ed together, so adding a strict policy does not
close a leak while an older permissive policy survives on the same table,
command and role. 0004 contains commented `DROP POLICY` lines for the permissive
policies — their names are environment-specific, so fill them in from the audit
rather than guessing.

**Before applying 0001**, run the duplicate report at the top of that file. The
unique index creation fails if duplicate payments already exist.

Each migration ends with a commented rollback. Where a rollback would destroy
creator data (profile rows, pricing, the `overlay_theme` column) it says so and
leaves the data in place.

### Tables

`creator_profiles`, `creator_interactions`, `creator_submissions`,
`interaction_pricing`, `soundboard_sounds`, `creator_youtube_tokens`,
`ai_generation_claims` (new), the `public_creator_profiles` view, and the
`get_public_interactions` RPC.

### Storage buckets

| Bucket | Visibility | Contents |
| --- | --- | --- |
| `soundboard-audio` | private | creator sound clips |
| `soundboard-images` | private | sound artwork |
| `interaction-audio` | private | viewer voice notes |

All playback is through short-lived signed URLs. Migration 0004 fails loudly if
either audio bucket is public.

---

## 4. OBS setup

1. In StreamLounge, open **Dashboard → OBS Setup** and copy the browser source URL.
2. In OBS, add a **Browser** source and paste it.
3. Size: **720 × 304** (or 1920 × 1080). The background is transparent already.
4. Enable *Shutdown source when not visible* and *Refresh browser when scene
   becomes active*.

The URL looks like `https://your-domain.com/obs?key=…&theme=gold`.

**That key is a credential.** Anyone holding it receives your alerts instead of
your stream, because polling the event endpoint claims the next queued alert.
Do not show the URL on stream or paste it in chat. If it leaks, use **Rotate
overlay key** in the dashboard and paste the new URL into OBS; the old one stops
working immediately.

Themes: `gold` (default), `cyber-blue`, `crimson`, `violet`, `emerald`, `rose`.

---

## 5. Payments

```
POST /api/payments/create-order   username + interaction type + amount
                                  → server resolves price, creates a Razorpay
                                    order with creator and interaction bound
                                    into its notes

   Razorpay Checkout in the browser

POST /api/payments/verify         order id + payment id + checkout signature
                                  → HMAC check, then an independent query to
                                    Razorpay, then the order's notes decide
                                    which creator and interaction this is for
                                  → returns a signed 15-minute payment token

POST /api/interactions            payment token + content
                                  → token is the authority for creator,
                                    interaction and amount; one submission per
                                    payment, enforced by a unique index
```

The payment token is the only accepted proof of payment. Endpoints never accept
a creator id, an interaction type or an amount from the request body.

Webhook: `POST /api/payments/webhook`, events `payment.captured` and
`order.paid`. It recovers a payment into a submission when the viewer closed the
tab before submitting. It is idempotent through the same unique index, returns
2xx for anything a retry will not fix, and 5xx only for transient failures.

---

## 6. Rate limiting — read this before scaling out

`lib/security/rate-limit.ts` is an **in-process** fixed-window counter. On a
single long-lived server it is a correct limiter. On a horizontally scaled or
serverless deployment each instance keeps its own counter, so the effective
limit is the configured limit multiplied by the number of live instances.

It is a real mitigation against casual abuse and runaway client loops. It is not
a substitute for a shared store. Before running more than one instance, back
`consume()` with Upstash Redis or a Postgres table; the call sites do not change.

The two endpoints that cost money per call — `/api/tts` and
`/api/stickers/generate` — do not rely on rate limiting alone. Each requires a
verified payment token and consumes a single-use row in `ai_generation_claims`,
which is enforced by a primary key and therefore holds across instances.

---

## 7. Deployment checklist

- [ ] `NEXT_PUBLIC_APP_URL` set to the production HTTPS origin, no trailing slash
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (viewer submissions and webhook recovery need it)
- [ ] `OVERLAY_SIGNING_SECRET` and `PAYMENT_SIGNING_SECRET` set to two different 32+ character random values
- [ ] Live Razorpay keys, and `RAZORPAY_WEBHOOK_SECRET` matching the dashboard
- [ ] Webhook URL registered with `payment.captured` and `order.paid`
- [ ] `curl https://your-domain.com/api/payments/webhook` reports `healthy`
- [ ] Migrations 0001–0006 applied, after reading the audit output
- [ ] `soundboard-audio`, `soundboard-images`, `interaction-audio` all private
- [ ] Google OAuth redirect URI registered, if YouTube features are in use
- [ ] `npm run check && npm run build` pass

See `docs/KNOWN_ISSUES.md` for what is not finished.
