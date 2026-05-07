# Storage privacy fix — deployment runbook

Branch: `fix/storage-privacy-2026-04-30`. Pairs with the audit at `design_assets/storage-audit-2026-04-30.md`.

This runbook covers (a) how to deploy, (b) what manual dashboard work remains, and (c) how to coordinate with the unmerged `feature/outreach-tts-2026-04-30` branch.

---

## What changed

Three Supabase Storage buckets flipped from public to private:
- `verification-photos` — kink verification photos (mirror selfies, posture, wardrobe), defined in migration 175.
- `evidence` — voice journal recordings, daily mirror selfies (verification_photos.task_type='daily_mirror_selfie'), conversation screenshots. Was dashboard-only; this branch adds a definition migration so `supabase db reset` reproduces it.
- `audio` — Mommy/Serafina conditioning TTS, micro-pulse cached audio, outreach-TTS (when that branch lands). Was dashboard-only; same as above.

Storage URL columns now hold the **object path**, not a long-lived URL. Read sites sign on render with a default 1h TTL.

---

## Deploy order

The migrations are written so the app can run in any of these states without breaking — run them in order.

### Step 1 — apply migration 301

```bash
supabase db push  # or whatever the project's apply path is
```

Migration `301_storage_privacy_fix.sql`:
- Sets `public=false` for `verification-photos`.
- Upserts the `evidence` bucket definition with `public=false`, MIME types, 50 MB size limit.
- Upserts the `audio` bucket definition with `public=false`, MIME types, 50 MB size limit.
- (Re-)creates folder-prefix RLS for SELECT/INSERT/DELETE on each.

After step 1: existing rows still hold full public URLs. Those URLs **start returning 401** because the bucket is private. The frontend will show broken images / silent audio for any page that hasn't been redeployed yet.

### Step 2 — deploy the app

`vercel deploy` (or equivalent). The app code on this branch:
- Persists object paths going forward.
- Calls `getSignedAssetUrl(bucket, pathOrUrl, ttl)` at render — **the helper handles legacy URL rows by stripping the prefix before signing**, so step 2 unblocks display even before step 3 runs.

### Step 3 — apply migration 302

```bash
supabase db push
```

Migration `302_storage_url_to_path_backfill.sql` regex-strips the `…/storage/v1/object/public/<bucket>/` prefix from existing rows in 9 columns across 8 tables. Each block is guarded on column existence — safe to run on a fresh `supabase db reset` and idempotent on re-runs.

Tables touched:
- `verification_photos.photo_url`
- `daily_outfit_mandates.photo_proof_url`
- `body_feminization_directives.proof_photo_url`
- `evidence.file_url`
- `journal_entries.audio_url`
- `conversation_screenshots.screenshot_url` + `additional_screenshot_urls` (TEXT[])
- `generated_scripts.audio_url`
- `content_curriculum.audio_storage_url`
- `handler_outreach_queue.audio_url` (only present after the outreach-tts branch lands; otherwise the block is a no-op)

### Optional — rebaseline pattern-lint

If the merge into main produces new line-shift hits in `david-identity-leak` or other patterns, refresh the baseline once and commit:

```bash
npm run lint:patterns -- --update-baseline
```

---

## Coordination with `feature/outreach-tts-2026-04-30`

That branch (4 commits, currently unmerged) adds:
- Migration 304 (`audio_url` + `tts_status` etc. on `handler_outreach_queue`)
- An edge function `outreach-tts-render` that uploads MP3 to `audio/mommy-outreach/<user>/<id>.mp3` and **writes the public URL** into `audio_url`
- A `useOutreachAudio` hook that does `new Audio(); a.src = url` directly

After both branches land, the privacy contract is broken for new outreach rows because the edge function still emits a public URL (which now 401s). Two small patches are required when merging:

### Patch 1 — outreach-tts-render edge function

In `supabase/functions/outreach-tts-render/index.ts`, replace the post-upload block:

```diff
-    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName);
-    const audioUrl = urlData.publicUrl;
-
-    await supabase.from('handler_outreach_queue').update({
-      audio_url: audioUrl,
+    // Persist the path; client signs at playback (audio bucket is private
+    // post-migration 301). useOutreachAudio handles signing.
+    await supabase.from('handler_outreach_queue').update({
+      audio_url: fileName,
```

…and update the response payload similarly (the `audio_url` field returned to caller).

### Patch 2 — useOutreachAudio hook

In `src/hooks/useOutreachAudio.ts`, the hook receives a URL from the card and assigns it directly to `a.src`. After the contract change, cards pass a path instead. Either:

**Option A (recommended) — sign in the hook.** Change `play(id, url)` to `play(id, path)`, then:

```ts
import { getSignedAssetUrl } from '../lib/storage/signed-url';
// inside play():
const url = await getSignedAssetUrl('audio', path, 3600);
if (!url) { setPlayingId(null); return; }
a.src = url;
```

**Option B** — sign in each card's `onClick` and pass the signed URL through. More boilerplate, but keeps the hook ignorant of buckets.

Option A is consistent with how `ConditioningLibrary` does it on this branch.

### Migration ordering

Migration 304 (outreach-tts) and 260 (this branch) both branched from main. When the merge happens:
- If outreach-tts merges first, this branch's 260 was renumbered to 301 — no renumber needed.
- If this branch merges first, outreach-tts will need to renumber 304 (renumbered post-merge) (or rebase past 261). The renumber is mechanical; the trigger body and edge function don't change.

Migration 261's `handler_outreach_queue.audio_url` block is no-op until 259 lands, so order doesn't break either branch.

---

## Manual dashboard remediation

The audit identified **five buckets used in code but never defined in any migration** — created via the Supabase Dashboard. Two of those (`evidence`, `audio`) are now backfilled by migration 260. The remaining three need someone with dashboard access to confirm or remediate:

| Bucket | Code references | Suspected config | Action |
|---|---|---|---|
| `hypno` | `api/hypno/[action].ts` (`.download`) | private | Confirm in dashboard. If private, no action. If public, flip private (no read sites use `getPublicUrl` so signed URLs aren't required). |
| `hypno-generated` | `api/hypno/[action].ts` (`createSignedUrl`, 7-day TTL) | private | Confirm. The 7-day TTL is generous — consider shortening to 24h with refresh-on-play. Out of scope for this branch. |
| `voice-recordings` | only `.remove([path])` in `useTimeline.ts:395` | unknown | Investigate: live, or dead code? If live, repeat the 260/261 pattern. If dead, delete the orphan `.remove` call. |
| `progress-photos` | only `.remove([path])` in `useTimeline.ts:423` | unknown | Same as above. Note `verification-photos` already covers a `progress_photo` task type — `progress-photos` may be a deprecated bucket. |
| `photos` | `MeasurementForm.tsx:124` (`getPublicUrl`) | unknown | Used for measurement photos. If public + RLS-only-protected, same exposure pattern as `verification-photos`. Out of scope but worth a follow-up audit. |

Recommended follow-up: a separate `fix/storage-privacy-followup` branch that handles `voice-recordings`, `progress-photos`, and `photos` once their config is confirmed.

---

## TTL choices (and why)

- **getSignedAssetUrl default — 1 h** (`src/lib/storage/signed-url.ts:SIGNED_URL_DEFAULT_TTL`). Long enough for normal card render + interaction, short enough that a leaked URL has a small blast radius. Cards refresh on remount.
- **ConditioningLibrary play tap — 6 h** (`src/components/conditioning/ConditioningLibrary.tsx`). Survives a long sleep playlist; signed once per Play tap, not pre-signed for every list item.
- **Sleep prescription playlist — 6 h** (`api/conditioning/index.ts:AUDIO_SIGN_TTL_SECONDS`). Same reasoning.
- **Handler chat existing-audio lookup — 6 h** (`api/handler/chat.ts:AUDIO_SIGN_TTL_SECONDS`). Returned mid-conversation; the user may take a while to play.
- **Micro-pulse cached audio — 10 min** (`src/lib/conditioning/micro-pulse.ts`). Plays immediately on delivery; long TTL would be wasted.

---

## Verification checklist

After deploy, smoke-test each surface end-to-end:

- [ ] **Mirror selfie**: take a new selfie via DailyMirrorSelfieCard, confirm it appears in the gallery (signed URL).
- [ ] **Voice journal**: record a 30s entry, confirm playback works in the expanded card.
- [ ] **Conversation screenshot**: upload a screenshot, confirm classify-conversation-screenshot still extracts text (it consumes the screenshot path; if it errors, the edge function needs a similar download-via-service-role patch).
- [ ] **Outfit-mandate proof**: submit a photo from FocusMode, confirm it lands and the next render shows it.
- [ ] **Handler photo verification**: upload from PhotoVerificationUpload, confirm the analyze-photo endpoint returns analysis.
- [ ] **Today: latest-progress photo**: confirm the small thumbnail in TodayMobile/TodayDesktop shows.
- [ ] **Conditioning library**: tap Play on a script with audio, confirm playback.
- [ ] **Sleep prescription**: trigger a sleep session, confirm the playlist plays.
- [ ] **Manual SQL probe**: as the live user, confirm `select createSignedUrl(…)` works for an own-bucket path and 401s for a path outside `auth.uid()`'s folder prefix. (You can also paste the public URL of an old row into an incognito browser — it should now 401.)

---

## Rollback

If something breaks unexpectedly:

1. **Re-flip the buckets to public** (fastest unblock):
   ```sql
   UPDATE storage.buckets SET public = true WHERE id IN ('verification-photos', 'evidence', 'audio');
   ```
   Existing path-only rows will then 404 (no public URL prefix to construct), but legacy URL rows resume working. This is a **temporary** rollback — re-flip and fix forward.

2. **Revert the app deploy** to the pre-fix commit. Existing rows will still resolve (legacy URLs in DB, public bucket).

3. **The migration 261 backfill is one-way** — to undo, you'd need to prepend `<base>/storage/v1/object/public/<bucket>/` to every stripped row. The forward path is preferred over rollback.

---

*Branch: `fix/storage-privacy-2026-04-30`. Audit: `storage-audit-2026-04-30.md`. Date: 2026-04-30.*
