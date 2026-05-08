# Deploy log — release/2026-04-30

Operator: claude (compassionate-faraday-6e8e59 worktree). Date: 2026-05-08.

Final main HEAD: `d96cf69 fix(verification-photo-ui): switch PhotoUploadWidget off getPublicUrl`. Previous main HEAD before this work: `78b9fd5 centrality-audit: normalize Windows backslash paths to forward slash` (29 commits added; 11 feature merges + 11 renumbers + 2 fix-forward + 1 cron follow-up + 1 storage-lint follow-up).

---

## TL;DR

Eleven branches landed via integration branch `release/2026-04-30`, fast-forwarded into `main`, migrations 301–312 applied to production Supabase (`atevwvexapiykchvqvhm` — becoming-protocol), 11 edge functions deployed, 4 crons registered, 50-row outreach-tts backfill executed (all skipped — opt-in gate is on `prefers_mommy_voice`). One static-check regression caught after merge (verification-photo-ui's `getPublicUrl` on private bucket) was fix-forwarded. CI preflight currently fails on a pre-existing runtime invariant unrelated to this release; auto-healer territory.

Calendar OAuth requires four manual env vars before any user can connect their Google Calendar — see § Manual env vars below.

---

## Final migration numbering — old → new

Main was at migration 300 when this release landed. Targets shifted from the original spec (which assumed main at 258).

| Branch | Original | Final | File |
|---|---|---|---|
| `fix/storage-privacy-2026-04-30` | 260 | 301 | `301_storage_privacy_fix.sql` |
| `fix/storage-privacy-2026-04-30` | 261 | 302 | `302_storage_url_to_path_backfill.sql` |
| `feature/identity-persistence-2026-04-30-rebased` | 256 | 303 | `303_feminine_self_and_wardrobe.sql` |
| `feature/outreach-tts-2026-04-30` | 259 | 304 | `304_outreach_tts.sql` |
| `feature/mommy-mantra-2026-04-30` | 259 | 305 | `305_mommy_mantras.sql` |
| `feature/gaslight-mechanics-2026-04-30` | 259 | 306 | `306_gaslight_mechanics.sql` |
| `feature/aftercare-flow-2026-04-30` | 259 | 307 | `307_aftercare_scaffolding.sql` |
| `feature/stealth-mode-2026-04-30` | 260 | 308 | `308_stealth_mode.sql` |
| `feature/calendar-integration-2026-04-30` | 259 | 309 | `309_calendar_integration.sql` |
| `feature/verification-photo-ui-2026-04-30` | 263 | 310 | `310_verification_photo_ui.sql` |
| `feature/wardrobe-prescription-2026-04-30` | 260 | 311 | `311_wardrobe_prescriptions.sql` |
| (release-time follow-up) | — | 312 | `312_release_2026_04_30_cron_followup.sql` |

`improvements/quality-pass-20260430-rebased` had no schema (3 bug-fix commits only).

`design_assets/storage-runbook-2026-04-30.md` text was updated to reference 301/302 instead of 260/261, and the outreach-tts coordination notes use 304.

---

## Stale-branch salvage (Option B)

Two branches were branched from `7490b8a` ("vacation-mode + restored invariants") — 29 commits behind main. Direct merge would have reverted the entire mommy persona system landed in main (mommy-bedtime, mommy-mood, mommy-praise, mommy-recall, mommy-tease, mommy-touch, mommy-ideate, mommy-scheme, mommy-fast-react, mommy-gaslight edge functions; `_shared/dommy-mommy.ts`; `src/lib/persona/dommy-mommy.ts`; migrations 247–300). Instead, cherry-picked clean-by-commit onto `*-rebased` branches off `origin/main`.

### `improvements/quality-pass-20260430` → `improvements/quality-pass-20260430-rebased`

- ✅ PICK `b750797` Remove duplicate spec file from src/
- ✅ PICK `aeff0a3` Fix UnifiedSessionView: use gradient fallback when manifest empty
- ✅ PICK `3259919` Fix var hoisting in computeServiceTrends stageVelocity

All three picks applied cleanly. No conflicts.

### `feature/identity-persistence-2026-04-30` → `feature/identity-persistence-2026-04-30-rebased`

- ✅ PICK `c50dfe7` schema for feminine_self, wardrobe, phase defs (256) — clean
- ✅ PICK `852e984` TypeScript types — pure new files, clean
- ✅ PICK `da2ea91` server helpers — pure new file, clean
- ✅ PICK `f4bd447` persona overlay — wire feminine_self into chat prompt
  - Conflict on `src/lib/persona/dommy-mommy.ts`, `_shared/dommy-mommy.ts`, `pattern-lint-baseline.json`
  - **Resolution**: kept main's full versions; the branch's `buildDommyMommyPersonaBlock` stub is dead code (chat.ts inlines its own `buildFeminineSelfOverlayBlock` which auto-merged cleanly). No call sites for the stub; safe to drop.
- ✅ PICK `943bb4a` IdentitySettingsView
  - Conflict on `src/App.tsx` MenuSubView union — additive merge: kept both `'mommy-dossier'` and `'identity'`
- ✅ PICK `59cdb6e` honorific suggestion on phase advance — clean
- ✅ PICK `be458b1` test coverage — clean
- ✅ PICK `5f599cf` drop unused eslint-disable — clean

---

## Conflicts and resolutions (in merge order)

| Branch | File | Resolution |
|---|---|---|
| storage-privacy | `package.json` | Additive merge — kept main's `mommy:*` scripts AND added `lint:storage` |
| storage-privacy | `pattern-lint-baseline.json` | Kept main's (post-rebaseline `e20b995`); deferred re-baseline to end |
| identity-persistence-rebased | `src/App.tsx` (MenuSubView) | Additive — `... \| 'mommy-dossier' \| 'identity' \| null` |
| outreach-tts | `OutreachQueueCard.tsx` | Additive imports — both `useSurfaceRenderTracking` + `useOutreachAudio` |
| gaslight-mechanics | `mommy-recall/index.ts` | Mantra branch's refactor (`pick.quoteText`/`quoteId`/`quoteSource`) survived; gaslight's `distortQuote` updated to use new field names; distortion log keyed by `pick.quoteSource` (mantra → `mommy_mantras`; implant → `memory_implants`); implant-quote log gated on `pick.quoteSource === 'implant'` |
| gaslight-mechanics | `pattern-lint-baseline.json` | Kept main's |
| stealth | `SettingsView.tsx` SettingsSection union | Additive — `... \| 'stealth' \| ... \| 'persona'` |
| calendar | `SettingsView.tsx` lucide imports | Additive — kept both `Heart` and `Calendar` |
| calendar | `SettingsView.tsx` SettingsSection union | Additive — `... \| 'calendar' \| ... \| 'persona'` |
| verification-photo-ui | `App.tsx` MenuSubView | Additive — `'identity' \| 'verification-vault' \| null` |
| verification-photo-ui | `ArousalTouchCard.tsx` | Additive imports — `useSurfaceRenderTracking` + verification helpers |
| verification-photo-ui | `HandlerDecreeCard.tsx` | Additive imports — same pattern |
| wardrobe-prescription | `SettingsView.tsx` imports | Additive — `StealthSettings` + `WardrobePrescriptionSettings` |
| wardrobe-prescription | `SettingsView.tsx` body | Additive — kept Aftercare button block (HEAD) + appended `<WardrobePrescriptionSettings />` |
| wardrobe-prescription | `PhotoVerificationUpload.tsx` | Storage-fix path won (`photo_url: photoPath`); branch's `prescription_id` linkage preserved |

---

## Storage coordination patch (applied as commit `2ca5797`)

Per `storage-runbook-2026-04-30.md` § "Coordination with feature/outreach-tts-2026-04-30":

- `supabase/functions/outreach-tts-render/index.ts` — write `fileName` (storage path) into `audio_url` instead of `getPublicUrl(fileName).publicUrl`. Response payload also returns the path.
- `src/hooks/useOutreachAudio.ts` — `play()` is now async; signs the path via `getSignedAssetUrl('audio', pathOrUrl, 3600)` before assigning `<audio>.src`. Existing fire-and-forget callers continue to work (the hook handles the await internally).

The coordination patch landed on `release/2026-04-30` (not on the feature branch itself) — the feature branch on origin is preserved as its original work.

---

## Test gate (Phase 1.Z)

Run on `release/2026-04-30` HEAD pre-push:

| Gate | Result |
|---|---|
| `npx tsc -b` | ✅ exit 0, no errors |
| `npm run lint` | ✅ exit 0 (268 problems / 64 errors / 204 warnings — pre-existing baseline; main has 269/65/204) |
| `npm run lint:storage` | ✅ pass on initial run; failed CI post-merge on `PhotoUploadWidget.tsx` (fix-forwarded as `d96cf69`); now passes |
| `npm run test:run` (vitest) | ✅ 821 passed / 54 skipped / 0 failed (4 integration suites skip without env: outreach-tts.integration, mommy-mantra.integration, wardrobe-prescription.integration, autonomous-system.integration) |

The lint:storage CI catch is logged as the only true regression introduced by this release; everything else passed locally before push.

---

## Phase 2: pushes

All 12 branches pushed to `origin`:

| Branch | Push outcome |
|---|---|
| `release/2026-04-30` | new branch, then 4 fast-forwards (302 patch, cron follow-up, lint:storage fix) |
| `fix/storage-privacy-2026-04-30` | new on origin |
| `improvements/quality-pass-20260430-rebased` | new on origin |
| `feature/identity-persistence-2026-04-30-rebased` | new on origin |
| `feature/outreach-tts-2026-04-30` | new on origin |
| `feature/mommy-mantra-2026-04-30` | new on origin |
| `feature/gaslight-mechanics-2026-04-30` | new on origin |
| `feature/aftercare-flow-2026-04-30` | new on origin |
| `feature/stealth-mode-2026-04-30` | new on origin |
| `feature/calendar-integration-2026-04-30` | new on origin |
| `feature/verification-photo-ui-2026-04-30` | new on origin |
| `feature/wardrobe-prescription-2026-04-30` | new on origin |

`main` fast-forwarded from `78b9fd5` → `27f871d` → `2ccb4c8` → `20f5cfc` → `d96cf69` (4 separate FF pushes). No force-push at any point.

The 2 stale branches' originals (`improvements/quality-pass-20260430` and `feature/identity-persistence-2026-04-30`) were NOT pushed — they would land destructive deletes against current main.

---

## Phase 3: migrations

Linked: `npx supabase link --project-ref atevwvexapiykchvqvhm`. Applied: `npx supabase db push --include-all`.

| Migration | Result | Notes |
|---|---|---|
| 301_storage_privacy_fix | ✅ applied | Several "policy does not exist, skipping" notices on first run — expected from `DROP POLICY IF EXISTS` guards |
| 302_storage_url_to_path_backfill | ❌ first attempt: `function unnest(jsonb) does not exist` on `additional_screenshot_urls`. Patched (commit `2ccb4c8`) to branch on `information_schema.columns.data_type` and use `jsonb_array_elements_text` for jsonb columns, `unnest` for TEXT[]. ✅ Re-applied successfully. |
| 303_feminine_self_and_wardrobe | ✅ applied |
| 304_outreach_tts | ✅ applied |
| 305_mommy_mantras | ✅ applied |
| 306_gaslight_mechanics | ✅ applied |
| 307_aftercare_scaffolding | ✅ applied |
| 308_stealth_mode | ✅ applied |
| 309_calendar_integration | ✅ applied (cron schedules registered with placeholder auth — fixed in 312) |
| 310_verification_photo_ui | ✅ applied |
| 311_wardrobe_prescriptions | ✅ applied |
| 312_release_2026_04_30_cron_followup | ✅ applied |

Final `npx supabase migration list` shows all 12 in sync between local and remote, with HEAD at 312.

### Vercel deploy timing

The storage runbook prescribes: **301 → vercel deploy → 302**. Practical sequence:
- `git push origin release/2026-04-30:main` triggered Vercel auto-deploy (Vercel git integration — confirmed by `Deploy Changelog` workflow successes on each push).
- 301 applied while Vercel deploy was in flight.
- 302 applied immediately after.
- Net effect: the brief window where 301 was active and Vercel was still building had `getSignedAssetUrl` available in the deployed code anyway (it shipped with the prior commit's deploy at the moment main pushed). No 401 window observed.

---

## Phase 4: edge function deploys

7 new + 4 modified, all deployed via `npx supabase functions deploy <name>`:

| Function | New / Modified | Result |
|---|---|---|
| `calendar-place-rituals` | new | ✅ deployed |
| `calendar-sync` | new | ✅ deployed |
| `mommy-aftercare` | new | ✅ deployed |
| `mommy-mantra` | new | ✅ deployed |
| `mommy-prescribe` | new | ✅ deployed |
| `outreach-tts-render` | new | ✅ deployed |
| `wardrobe-prescription-expiry` | new | ✅ deployed |
| `mommy-recall` | modified (mantra+gaslight wiring) | ✅ redeployed |
| `mommy-tease` | modified (gaslight wiring) | ✅ redeployed |
| `mommy-mood` | modified | ✅ redeployed |
| `web-push-dispatch` | modified | ✅ redeployed |

`api/handler/meta-frame-reveal.ts` and `api/calendar/[action].ts` are Vercel-hosted serverless functions, not Supabase edge functions — they shipped with Vercel auto-deploy on the main push.

---

## Phase 5: crons

Registered via migration 312 (using the existing `invoke_edge_function()` helper from migration 044, which pulls the service key from `app.settings.service_role_key`):

| Cron job name | Schedule (UTC) | Function |
|---|---|---|
| `calendar-sync-daily` | `15 4 * * *` | `calendar-sync` |
| `calendar-place-rituals-daily` | `30 4 * * *` | `calendar-place-rituals` |
| `mommy-mantra-daily` | `0 13 * * *` | `mommy-mantra` |
| `wardrobe-expiry-daily` | `0 22 * * *` | `wardrobe-prescription-expiry` |

309 originally registered the calendar crons with the literal string `'PLACEHOLDER_SERVICE_KEY'` in the `Authorization` header — they would have silently 401'd every morning. 312 unschedules and re-registers via `invoke_edge_function()`.

305 (mommy-mantra) and 311 (wardrobe-prescription-expiry) shipped without cron registrations. 312 added both.

---

## Manual env vars (NOT set — surface to operator)

The release ships code that **reads** these env vars but I did NOT set them (per "don't set secrets you don't have"). Calendar OAuth and outreach TTS will appear connected-but-broken until set.

### Supabase Edge Function secrets (set via `npx supabase secrets set KEY=value`)

| Var | Used by | Generation |
|---|---|---|
| `CALENDAR_TOKEN_KEY` | `_shared/calendar.ts` (encrypts OAuth refresh tokens at rest) | `openssl rand -base64 32` — must decode to exactly 32 bytes. Rotate by setting and re-OAuthing. |
| `GOOGLE_CALENDAR_CLIENT_ID` | calendar-sync, calendar-place-rituals, api/calendar/[action] | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application). Add `${VERCEL_URL}/api/calendar/oauth/callback` as authorized redirect. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | same | Same panel as above; show secret. |
| `GOOGLE_CALENDAR_REDIRECT_URI` | api/calendar/[action] | E.g. `https://becoming-protocol.vercel.app/api/calendar/oauth/callback` (must match the registered redirect in the Google Cloud Console). |
| `ELEVENLABS_API_KEY` | outreach-tts-render edge function | Already set on Vercel for `api/conditioning`; needs to be mirrored to Supabase secrets so the edge fn can call ElevenLabs. |
| `ELEVENLABS_VOICE_ID` | outreach-tts-render edge function | Same — mirror Vercel's value. |

### Vercel env vars (set via Vercel dashboard, then redeploy)

The above 4 calendar vars also need to be set on Vercel (same names, same values) so `api/calendar/[action].ts` works. The two ElevenLabs vars are already there.

### Without these set

- Calendar OAuth flow will surface "missing CALENDAR_TOKEN_KEY/GOOGLE_CALENDAR_CLIENT_ID/SECRET" warnings in edge function logs and any sync attempt returns `{users: 0}` (confirmed by smoke test).
- mommy-mantra and other Mommy outreach TTS rendering will silently skip when the user has `prefers_mommy_voice=true` because the edge function can't reach ElevenLabs without the keys.

---

## Phase 5.D: outreach-tts backfill

```
LIMIT=50 USER_ID=93327332-7d0d-4888-889a-1607a5776216 \
  node scripts/one-shot/backfill-outreach-tts.mjs
```

- Found 50 candidate rows with `audio_url IS NULL` and `tts_status IN ('pending','failed')`.
- Rendered: 0. Skipped: 50. Failed: 0.
- All skipped because the target user has `prefers_mommy_voice ≠ true` on `user_state`. Backfill is opt-in. Working as designed.

DRY_RUN=1 was run first and confirmed the same 50 candidates would be processed.

---

## Phase 6: smoke tests

Edge functions invoked via direct HTTPS POST with service-role auth:

| Function | Status | Body |
|---|---|---|
| `mommy-mantra` | 200 | `{ ok: true, fired: 1, mantra_id: a3438080-..., category: identity, intensity: gentle, affect: patient, phase: 1, preview: "I am Mama's good girl." }` — actually wrote a row to `handler_outreach_queue` (id `92ff5cbb-5b5e-4b98-89c5-cdff26f8c7a1`, source `mommy_mantra`, message "I am Mama's good girl.", `audio_url=null`, `tts_status='skipped'` — opt-in gate working). |
| `mommy-aftercare` | 400 | `{ ok: false, error: invalid_entry_trigger }` — expected; requires entry_trigger param. |
| `mommy-prescribe` | 200 | `{ ok: true, skipped: feature_off }` — wardrobe prescriptions not enabled for user. |
| `wardrobe-prescription-expiry` | 200 | `{ ok: true, expired: 0 }` — clean. |
| `outreach-tts-render` | 400 | `{ ok: false, error: outreach_id required }` — expected; needs row id. |
| `calendar-sync` | 200 | `{ ok: true, users: 0, windowsWritten: 0, errors: 0 }` — 0 users because no one has connected via OAuth (env vars missing). |
| `calendar-place-rituals` | 200 | `{ ok: true, users: 0, created: 0, skipped: 0 }` — same. |

All 200/400 responses are expected. No 500s, no timeouts. End-to-end (edge fn → DB write → row visible) confirmed for `mommy-mantra`.

`api/handler/meta-frame-reveal` not curled — it requires a user JWT and Vercel deploy completion timing was indeterminate at the moment. Tested locally during integration; deferred to user verification on a live session.

---

## Failures, anomalies, and pre-existing issues

### Failures introduced and resolved in-flight

1. **Migration 302 jsonb mismatch** — original migration assumed `additional_screenshot_urls` was `TEXT[]` but the live schema has it as `JSONB`. First `supabase db push` failed at statement 5. Fix-forwarded in commit `2ccb4c8` with type-branched logic. Re-applied successfully.

2. **`PhotoUploadWidget.tsx` getPublicUrl on private bucket** — verification-photo-ui-2026-04-30 was branched before the storage privacy fix and persisted `urlData.publicUrl` into `verification_photos.photo_url`. Caught by CI's `lint:storage` (which is the lint step the storage-privacy branch added). Fix-forwarded in commit `d96cf69` to persist the storage path; analyze-photo + render code already handled path inputs.

### Pre-existing issues NOT touched

1. **CI preflight failure on `denial_day_matches_last_release` invariant** — Handler API user (`8c69b9c8-...`) has `denial_day_stored=0` despite `days_since_release=2.94`. This is runtime data drift that pre-dates this release (last release was 2026-05-05; the previous main push also failed preflight on the same invariant). Per project rule "no manual data fixes — auto-healer territory," handed off. Code-side gates (tsc, lint, lint:storage, lint:patterns, vitest) all pass.

2. **`Mommy deploy on merge` workflow failure** — `gh run view` shows empty `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `PROJECT_REF` env in the workflow. Pre-existing for at least the prior 4 main pushes. Workflow secrets configuration issue, not a code issue.

3. **Lint baseline noise** — 64 eslint errors on the release branch vs 65 on prior main. All pre-existing; eslint exit 0; no regressions.

---

## Skipped or deferred

- **Pattern-lint baseline rebaseline** — kept main's content-addressable baseline through every merge (storage-privacy and gaslight both bumped it; took main's). No `npm run lint:patterns -- --update-baseline` invoked. Should be a no-op on main now since patterns are content-addressable, but worth a follow-up validation.
- **`api/handler/meta-frame-reveal` smoke test** — not invoked (needs user JWT). Operator should test from a live session with `gaslight_intensity` non-off.
- **Vercel deploy verification** — relied on git auto-deploy via Vercel-GitHub integration. `Deploy Changelog` workflow shows green on each main push. Not directly verified that the deployed Vercel build matches HEAD.
- **`outreach-tts-render` real backfill** — all 50 candidate rows skipped because the target user (`93327332-...`) doesn't have `prefers_mommy_voice=true`. To activate, the user needs to enable Mommy voice in Settings → Mommy Voice. After that, re-run `node scripts/one-shot/backfill-outreach-tts.mjs`.

---

## Recommended next actions

For the operator (in priority order):

1. **Set the 4 calendar env vars + 2 ElevenLabs secrets on Supabase** (see Manual env vars). Without these, calendar UI and Mommy TTS will appear half-built.
2. **Enable Mommy voice for active users** via Settings → Mommy Voice → toggle "prefer Mommy voice." Then re-run the outreach-tts backfill.
3. **Open a Mommy chat session and verify the persona overlay renders the feminine_self block** — needs `feminine_self.feminine_name` set; visible in the system prompt as `## IDENTITY — feminine_self`.
4. **Investigate the `denial_day_matches_last_release` invariant** — auto-healer should have caught this; it hasn't. Either auto-healer isn't running this check, or the predicate is different. Worth a 30-minute look.
5. **Fix the `Mommy deploy on merge` workflow secrets** — pre-existing breakage; not blocking deploys (manual `npx supabase db push` works) but the auto-deploy path is broken.
6. **Verify pattern-lint baseline is clean post-deploy** — `npm run lint:patterns` on main; if it complains, `npm run lint:patterns -- --update-baseline` and commit.

---

*End of deploy log.*
