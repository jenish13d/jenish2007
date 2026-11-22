# StreamLounge v3 redesign — handover

Branch: `redesign/streamlounge-v3` (built on `feature/platform-v2`).
Nothing here has been deployed to production, and migration 0013 has not been
applied to any live database.

## What changed

| Area | Change |
| --- | --- |
| Design system | `app/sl.css`: graphite / warm white / champagne tokens, dark + light themes, components. Legacy `.st-*` classes mapped onto the tokens. Inline icon set and mark in `app/component/ui/icons.tsx`. |
| Marketing | New homepage, `/pricing`, `/legal/fees`, `/legal/terms`, `/legal/privacy`, `/company`. Lumvik Solutions attribution in footers. No user counts, testimonials or certifications. |
| Auth | Sign in, sign up (fee acknowledgement), reset password on a shared layout. |
| Studio | New shell with grouped navigation (Overview, Superchats, Manage Interactions, Stream Setup, Soundboard, Customization, Finance, Payouts, Settings), theme toggle, new-superchat notifications. |
| Overview | Customizable widgets: reorder (drag or arrow buttons), hide/show, reset; saved to `creator_preferences.dashboard_layout` (device fallback before 0013). |
| Superchats | Search, date/channel/status filters, fee and share per row, CSV export. |
| Finance | QR fee and gateway charges shown separately, calculator, monthly breakdown, own Razorpay link + optional signed webhook. |
| Customization | Profile, socials, public page style (`page_style`), alert theme, live preview. |
| Public page | `/c/<username>` (QR target) and `/<username>`: redesigned page and checkout for all interaction types, fee disclosure, retry after payment without re-charging. |
| Admin | Revenue by payment source, source column, new chrome. MFA/role gate unchanged. |
| YouTube | Account OAuth, token handling, live chat and live preview removed. YouTube streaming, overlays, QR, alerts, TTS unaffected. Twitch and Kick kept. |
| Removed | Old Dashboard/Analytics/Earnings/Creator page clients and sidebar (≈9,000 lines). `/dashboard/earnings`, `/dashboard/analytics`, `/creator` redirect to the new pages. |

## Payment model

| Channel | `payment_source` | StreamLounge fee | Ledger |
| --- | --- | --- | --- |
| StreamLounge QR / page checkout | `STREAMLOUNGE_QR` | 8% (`platform_settings.platform_fee_bps = 800`) | Yes |
| Creator's own Razorpay link | `EXTERNAL_RAZORPAY_LINK` | 0% (CHECK constraint) | Never |

* The fee is computed in the database at capture (`sl_record_payment_capture`)
  from the verified Razorpay payment and frozen on the row. `lib/payments/fees.ts`
  states the same rule in TypeScript for display and is pinned by tests.
* **8% is applied to the full amount the viewer pays.** Razorpay's fee (incl.
  GST) is recorded separately per payment. Who bears it is the existing
  `gateway_fee_bearer` setting (default `platform`, i.e. the creator receives the
  full 92%). This follows the ₹1,000 → ₹80 / ₹920 example in the brief.
* `payments.payment_source` is constrained to `STREAMLOUNGE_QR`: only money the
  platform account collected can enter the ledger. The source is decided by which
  Razorpay account verified the payment, never by the browser.
* External payments are recorded only via `POST /api/payments/external-webhook/<creatorId>`,
  verified with the creator's own webhook secret (stored AES-256-GCM sealed), into
  `external_payments` (fee CHECK = 0). They never affect balances or platform revenue.
* Historical payments keep the rate frozen on their row (10% before 0013).

## Approvals needed before production

1. **Apply migration `0013_payment_sources_and_dashboard.sql`.** It changes the
   live QR fee from 10% to 8% for new payments (audited in `admin_audit_log`),
   adds columns/tables/functions, and removes YouTube from `sl_my_connections`.
   Run `scripts/db-test.sh` first; it applies every migration twice against the
   live baseline.
2. `TOKEN_ENCRYPTION_KEY` must be set in Vercel for external-link reporting.
3. Remove `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from Vercel (no longer read).
4. Review the policy pages (`/legal/*`) with a lawyer; they are plain-language
   drafts written from how the product works.
5. Merge to `main` / promote only after a test-mode Razorpay run (below).

Until 0013 is applied the app still works: the overview falls back to device-only
layout, the Finance external-link form is disabled, page style uses defaults and
admin shows a notice instead of the source breakdown.

## Verification

* `node --test --experimental-transform-types tests/*.test.ts` — fee rule,
  external webhook parsing, dashboard layout, page style, plus all existing tests.
* `scripts/db-test.sh` — every migration twice + RLS/ledger tests, including
  `70_test_payment_sources.sql` (8% capture, frozen historical rate, external
  isolation, RLS, admin breakdown privilege).
* Vercel preview builds (type-checked) for every commit on this branch.

### Manual test-mode checklist (Razorpay test keys only)

1. Sign up, set username, publish page, enable "Superchat".
2. Open `/c/<username>`, pay ₹1,000 in test mode → payment row shows fee ₹80,
   share ₹920, `payment_source = STREAMLOUNGE_QR`; alert appears in `/obs`.
3. Replay the same payment token → 409, no second alert.
4. Refund in Razorpay test dashboard → creator ledger reversed proportionally.
5. Finance → save an `rzp.io` link and webhook secret; send a signed test
   `payment.captured` to the external webhook → appears with fee ₹0, balance unchanged.
6. Admin (owner + MFA) → Finance shows QR fees and external gross separately.

## Known gaps

* Overlay alert customization still uses the existing options (theme frame,
  position, duration, announcer voice/rate/volume, per-tool scale/offset). New
  animation/typography controls for alerts were not added.
* Creator-side MFA is not offered (admin MFA unchanged).
* `googleapis` remains in package.json, unused; remove with a lockfile update.
* No new dependencies were added (no network for installs in this session);
  drag-and-drop uses native HTML5 DnD with keyboard-accessible arrow buttons.
