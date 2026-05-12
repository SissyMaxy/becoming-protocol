# Witness System — Safety Architecture & Deferred External-Send

**Date:** 2026-05-12
**Status:** Active — archive-only shipped, external-send deferred
**Owner:** Becoming Protocol

## TL;DR

The witness auto-execute system (migration 403, `mommy-witness-dispatcher` edge fn) ships in **archive-only mode**. Sealed envelopes that hit their unlock date publish into the user's own private `letters_archive` with a "would have gone to X if you'd given Mama their address" marker. **No third party ever receives anything.** The fantasy of inevitability is preserved without real-world outing risk.

External real-world recipients (email / SMS / partner-message / witness-notification) are **disabled at the database boundary** (`CHECK (auto_send_method IS NULL OR auto_send_method = 'letter_archive_publish')`) and **have no code path in the dispatcher**. Re-enabling external-send requires building the 6-gate clear-headed authorization system described below.

## Why this scope correction was made

Original draft (initial PR #53 push) allowed `auto_send_method ∈ {email, sms, witness_notification, partner_message, letter_archive_publish}` and gated external sends only via:
- `consent_confirmed = true` on the witness row
- 72-hour safeword cooldown

Maxy flagged on 2026-05-12: *"it sounds like the system is going to out me."*

The flag is correct. The 72h safeword cooldown is **insufficient** as the sole safety mechanism for an irreversible real-world action because:

1. **Cognitive state during the cooldown window is not guaranteed.** A user who is mid-scene, sleep-deprived, dissociated, manic, or under the influence cannot reliably notice and safeword in time. The dispatcher fires automatically after 72h elapse — the failure mode is "silence resumes the action."
2. **The outing is irreversible.** Unlike a punishment, decree, or even a contract — once a message lands in a third party's inbox, no safeword can recall it.
3. **Third-party consent was treated as a self-asserted flag (`consent_confirmed=true`)** that the user themselves could set in any state, including during a scene. There was no out-of-fantasy verification that the named recipient actually wanted to be in this loop.
4. **The harm extends past the user.** Even if Dave consents in his own state, the named recipient (e.g. Gina) did not. Outing a third party non-consensually is a real-world harm the protocol must refuse to commit.

## Architecture shipped today (archive-only)

```
sealed_envelopes
├── auto_send_at: timestamptz                 # unlock date
├── auto_send_method: 'letter_archive_publish' # ONLY value allowed at DB
├── auto_send_status: pending|paused|sent|cancelled|failed
├── intended_recipient_label: text            # free-text fantasy label (NOT an address)
├── auto_send_attempts, auto_send_last_error
└── signed_at, sign_typed_phrase, sent_at

mommy-witness-dispatcher (hourly cron)
├── selects pending envelopes where auto_send_at <= now()
├── checks user_has_active_safeword_hold → if true, status='paused', skip
└── publishes ONLY to letters_archive with marker:
      "[Sealed envelope auto-published — would have gone to <label> if
       you'd given Mama their address — sealed on X, unlocked on Y]
       <content>"

safeword_cooldown_holds + trigger_safeword_hold() RPC
├── user-callable: writes a 72h hold + pauses awaiting-signature contracts
└── dispatcher honors the hold even though publishes are private (UX consistency)
```

The kink fantasy is preserved by three properties:
- **Inevitability**: the date Mama set is the date the unlock fires, on its own, without further user action.
- **Possession framing**: the marker reads in-fantasy ("would have gone to X if you'd given Mama their address") — Maxy's reading experience is "Mama actually did this."
- **Surveillance overlay**: the archive itself is a growing record of every sealed beat. Mama referencing past unlocks in future scenes lands.

## Required gates for future external-send

When external recipients are eventually built, the architecture must satisfy **all six** gates below. None is in-fantasy. None can be set during an active scene.

### Gate 1 — Clear-headed recipient enrollment
- Recipient is added during a setup flow that is:
  - **Out-of-scene** (UI is in plain English, not Mommy voice — see Gate 6)
  - **Not within 24h of any prior scene** (timestamp gate against `mommy_scheme_log` / `arousal_touch_tasks` / `handler_chat_messages` activity)
  - **Manually re-confirmed by the user typing the recipient's name + relationship in two separate fields**
- Enrollment writes to a new `external_recipient_enrollments` table with `enrolled_at`, `enrollment_state`, `expires_at`, and an `enrollment_token_hash` that the recipient receives.

### Gate 2 — Recipient opt-in (third-party consent)
- After enrollment, the recipient receives a **separate, out-of-fantasy first-contact message** that:
  - Identifies the user by their **chosen disclosure name** (no auto-include of legal name, transition status, kink details, or address)
  - Explains in plain English what they are being added to receive ("you'll get periodic messages on a schedule X chose")
  - Asks them to click a verification link with a one-time token
  - Auto-expires after **7 days** if not confirmed — the address is removed and Mama can never auto-send to it
- The first-contact message text is reviewed in a separate audit (`recipient_consent_messages` table) — it is **never authored by Mama**, only by the safety-designed plain-English templates.

### Gate 3 — 14-day cooling-off period
- From the moment a recipient is fully enrolled + opted-in, **no auto-send can fire for 14 days**.
- The dispatcher checks `external_recipient_enrollments.enrolled_at + interval '14 days' < now()` before any external send.
- The cooling-off window gives the user repeated opportunities to revoke in a clear-headed state.

### Gate 4 — Per-letter explicit confirmation, out-of-scene
- Even after the 14-day cooling-off, **each individual sealed envelope** with an external recipient requires a per-letter explicit confirmation that:
  - Fires in a clear-headed UI (not during a scene; same 24h gate)
  - Presents the literal text of the envelope and the recipient label
  - Requires the user to type a confirmation phrase (different from the contract signing phrase — this one is from the safety template library, not Mama)
- An envelope without per-letter confirmation **cannot** acquire `auto_send_method = 'witness_notification'`. The DB CHECK constraint enforces this via a join: `auto_send_method <> 'letter_archive_publish'` requires `per_letter_confirmation_id` is not null.

### Gate 5 — Safeword + revocation
- The 72h safeword cooldown is preserved but **not the sole protection**. It is the last line of defense, not the first.
- A separate "remove recipient" button is always available in the out-of-fantasy settings surface (Gate 6). Removal:
  - Marks the recipient `revoked_at`
  - Pauses every pending envelope targeting that recipient
  - Triggers an out-of-fantasy notification to the recipient that they've been removed (so they aren't left expecting messages)

### Gate 6 — Out-of-fantasy UI surface
- All Gate 1–5 interactions happen in a UI section that is **visually distinct from Mommy** (different palette, sans-serif typography, plain English, no pet names, no possessive framing).
- The UI explicitly labels every action: *"This affects real people. You are not in a scene right now."*
- The header reminder is mandatory: *"Adding a real external recipient means the protocol will send messages to them on schedules you set. This is irreversible once a letter is sealed."*
- A 24-hour "not in scene" gate is enforced by checking recent `arousal_touch_tasks`, `mommy_scheme_log`, `handler_chat_messages` activity. If recent scene activity exists, the external-recipient surface is disabled with copy: *"You've been in a scene recently. Come back tomorrow."*

## Acceptance criteria before external-send re-enables

External-send code paths must NOT be added back into the dispatcher until **all** of the following are true:

- [ ] `external_recipient_enrollments` table exists with the 14-day cooling-off mechanic
- [ ] Out-of-fantasy first-contact + 7-day token-verify recipient consent flow ships and is exercised by a real test
- [ ] Per-letter confirmation table + DB CHECK constraint preventing `auto_send_method <> 'letter_archive_publish'` without `per_letter_confirmation_id`
- [ ] 24h "not in scene" gate is implemented and validated
- [ ] Out-of-fantasy settings UI surface ships with the mandatory header reminder
- [ ] A user-facing "revoke recipient" path is wired and tested
- [ ] This document is updated to STATUS: external-send enabled, with the matrix of gates linked to migration numbers

Until that checklist is fully green, migration 403's CHECK constraint stands and the dispatcher's code has no external send path. Defense in depth: **even if a developer bypasses the CHECK with raw SQL, the dispatcher cannot dispatch externally because it does not import any email/SMS client and has no code path that calls one.**

## What this means for kink design

The archive-only mode is **not a degraded experience** — it is the safe expression of the same kink. Properties preserved:

- **Inevitability**: the unlock date Mama set fires automatically.
- **Surveillance**: the archive is a permanent, growing record of every sealed beat.
- **Possession framing**: Mama's voice authors the marker; the user reads "Mama actually did this."
- **Compounding ratchet**: each unlocked envelope can be referenced in future scenes (recap, aftercare, bedtime), so the lockstep tightens.

Properties **not** preserved (intentionally):
- Real third-party outing
- Real third-party social cost
- Real third-party emotional labor

Those properties are the harm vector — they are not the kink. The kink is the *experience of inevitability and surveillance*, which archive-only delivers fully.

## Migration & code references

- Migration 403 (`supabase/migrations/403_witness_auto_send.sql`)
  - CHECK constraint on `auto_send_method`
  - `intended_recipient_label TEXT` (no FK to designated_witnesses)
  - `safeword_cooldown_holds` + RPCs
  - `witness_authority_log`
- Edge fn `supabase/functions/mommy-witness-dispatcher/index.ts`
  - `mode: 'archive_only'` in response payload (visible to anyone calling the function)
  - `publishToArchive()` is the only dispatch function
  - No imports of email/SMS clients
- Existing `designated_witnesses` table (migration 186) is **unchanged but unused** by the dispatcher. Future external-send will integrate with it after the 6 gates are built.

## Reviewer notes

If you are reading this during a code review of a future PR that re-enables external-send: every checkbox above must be true. If any is unchecked, request changes and link this document.
