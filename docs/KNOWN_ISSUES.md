# Known issues and unfinished work

An honest list of what is not done. Nothing here is hidden behind a passing
test or a reassuring log line.

---

## 1. Not verified against live services

No credentials for Supabase, Razorpay, OpenAI or Google were available while
this rebuild was done, so **nothing below has been exercised end to end**. What
has been verified is listed in section 5.

| Path | Status |
| --- | --- |
| Creator signup and sign-in | not run against a live Supabase project |
| Profile and interaction editing | not run |
| Razorpay order creation and checkout | not run |
| Payment verification against the Razorpay API | not run |
| Webhook delivery and signature verification | not run against live Razorpay |
| OBS overlay polling, claiming and playback | not run |
| Audio upload through a signed upload URL | not run |
| OpenAI TTS and sticker generation | not run |
| YouTube OAuth and live chat | not run |
| RLS policies as applied to the live database | **not run — see section 2** |

The logic behind several of these is unit-tested in isolation (section 5), but a
passing unit test for a signature function is not evidence that the integration
works.

### What to do first with credentials

1. Apply the migrations, reading `supabase/audit/rls_audit.sql` output first.
2. Sign up a test creator; confirm a `creator_profiles` row appears.
3. Enable one interaction; load the public page in a private window.
4. Pay with Razorpay test keys; confirm exactly one submission row, with
   `payment_status = 'paid'` and `status = 'pending'`.
5. Open the OBS URL; confirm the alert plays and the row becomes `completed`.
6. Replay the same `payment_token` against `POST /api/interactions`; expect
   `409`.
7. Send a Razorpay test webhook; confirm it returns 200 with
   `already_processed: true` for an existing payment.
8. Open the OBS URL with a wrong `key`; expect the overlay to stop polling and
   display the invalid-key panel.

---

## 2. RLS hardening needs a human pass

`supabase/migrations/0004_rls_hardening.sql` adds strict policies but **cannot
finish the job on its own**.

Permissive RLS policies are OR-ed together, so a strict policy does not close a
leak while an older permissive policy survives on the same table, command and
role. The migration contains commented `DROP POLICY` lines for those, left
commented because their names are environment-specific — guessing would either
fail or drop the wrong policy.

**Required:** run the audit script, identify every existing policy by name, and
drop the permissive ones. Until that is done, the two leaks a previous live
audit found may still be open:

- anonymous reads of `soundboard_sounds` returning rows for creators whose
  `public_page_enabled` is not true;
- anonymous `list('')` on `interaction-audio`, enumerating creator UUIDs as
  folder names.

The migration also asserts, and fails loudly, if `public_creator_profiles`
selects `email` or `overlay_key`, or if either audio bucket is public. Those
assertions have not been run.

---

## 3. Rate limiting is per instance

`lib/security/rate-limit.ts` is an in-process fixed-window counter. On more than
one instance the effective limit is the configured limit times the instance
count. Back it with Upstash Redis or Postgres before scaling out. The call sites
do not change.

The billable AI endpoints do not depend on this alone — they consume a
single-use `ai_generation_claims` row, enforced by a primary key.

---

## 4. React Compiler lint rules, downgraded in ported components

17 errors from three React 19 compiler rules remain, as warnings, in the large
client components carried over from the previous implementation:

| Rule | Count | Files |
| --- | --- | --- |
| `react-hooks/set-state-in-effect` | 9 | `LivePreview`, `AnalyticsClient` (3), `EarningsClient` (3), `SoundboardClient` (2) |
| `react-hooks/immutability` | 7 | `CreatorPageClient` (2), `DashboardClient` (3), `SoundboardClient`, `obs/page` |
| `react-hooks/purity` | 1 | `EarningsClient` (reads `Date.now()` during render) |

These are advisories about what the compiler can optimise, not runtime bugs; the
pages build and work. Fixing them means restructuring data-loading effects in
several thousand-line components, which would mix a large behavioural refactor
into a change set that needs to be reviewable.

They are warnings rather than silenced, scoped in `eslint.config.mjs` to
`app/dashboard`, `app/creator`, `app/obs` and `app/component` only. New code in
`lib/` and `app/api/` still errors on them.

38 other warnings remain, mostly `<img>` rather than `next/image` in ported
markup and unused imports in the carried-over earnings test.

---

## 5. What *is* verified

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors, 55 warnings (section 4).
- `npm run build` — production build succeeds, 27 routes.
- `npm test` — 113 tests, all passing, covering:
  - payment token signing, tampering, expiry, cross-purpose reuse, malformed input;
  - overlay key generation and constant-time comparison, including that two
    absent keys do not match;
  - overlay playback tokens: forgery, wrong submission, wrong creator, wrong
    signing key, expiry ordering;
  - overlay queue eligibility and state transitions, including replayed completion;
  - Razorpay checkout and webhook signature verification, including non-hex and
    truncated signatures, and re-serialised webhook bodies;
  - captured-payment validation, including the mandatory creator and interaction
    bindings whose absence was the main authorisation hole;
  - amount validation and the creator-price / platform-floor interaction;
  - storage path confinement: traversal, other creators' folders, nesting,
    prefix-without-boundary matches;
  - upload type and size limits;
  - speech text preparation;
  - rate limiter windows and key isolation.

All tests are pure-function tests with secrets injected, so they need no
configuration and cannot sign with a real key.

---

## 6. Dropped from the original, deliberately

| Removed | Why |
| --- | --- |
| `GET /api/overlay/soundboard` | Unauthenticated audio proxy taking an arbitrary `path`, streaming objects out of a private bucket. Its fuzzy resolver also matched sounds across creators. Replaced by signed URLs minted server-side and scoped to the requesting creator. |
| `app/overlay/[username]/page.tsx` | A 4,657-line stale duplicate of the public creator page. The public page at `app/[username]` provides the functionality. |
| `app/api/submissions/routue.ts` | Filename typo, so it was never a route; its body echoed the request back as a fake success. |
| `lib/soundboard-resolver.ts` fallback chain | Five layers of guessing — decoded paths, basenames at the bucket root, a hardcoded table of filenames matched by regex, and substring comparison against every global preset — any of which could serve audio from a row other than the one requested. |
| `app/[username]/page.tsx.before-*` (9 files), `backup-pages/`, `scratch/`, `page.backup.tsx` | Committed editor backups and scratch scripts. |
| Derived and hardcoded signing secrets | `OVERLAY_SIGNING_SECRET` and `PAYMENT_SIGNING_SECRET` are now required and independent. |
| The "signature optional, then trust the payment id" verification branch | Present in `/api/interactions` and `/api/stickers/generate`. Fetching a payment by id proves it exists and was captured, not that the caller made it. |

---

## 7. Product decisions worth a second opinion

- **Webhook-recovered submissions** are inserted with the message
  "Recovered payment — the viewer did not complete their message." The viewer
  paid but never typed anything. The alternative is not to insert at all and
  reconcile refunds manually.
- **`public_page_enabled` is not re-checked in the webhook.** A viewer paid
  while the page was live; a creator toggling it off afterwards should not mean
  the platform keeps the money with no alert recorded.
- **Spin-wheel and task submissions are validated against the creator's
  configured options.** If a creator edits their wheel between a viewer's spin
  and submission, the submission is rejected with a conflict. The alternative —
  accepting any text as the outcome — lets a viewer dictate what the creator
  must do on stream.
- **A sender-name field was added** to the viewer modal. The submission API
  always accepted one; the previous UI hardcoded "Anonymous", so viewers were
  never credited on stream.
