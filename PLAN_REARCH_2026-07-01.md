# Master Plan — Audit Remediation + Feature Elaboration (2026-07-01)

Source: full-code audit (3 domains, ~50 verified findings) + three design docs:
- `DESIGN_ENFORCEMENT_SPINE_2026-07-01.md` — obligation ledger, escalation calculus, safeword latching, outward rail
- `DESIGN_TURNING_OUT_2026-07-01.md` — meet safety, machine envelope, identity funnel, honest revenue, conditioning gate
- `DESIGN_FEMINIZATION_LOOP_2026-07-01.md` — prescriptions loop, voice progression, mantra ladder, measurement spine, tracking, wardrobe

Standing policy applied throughout: **NEVER disclose to Gina** (2026-07-01 directive) — all disclosure machinery deleted (implementation in flight, migration 624); `is_gina_home_today` privacy gating retained.

## Physical migration numbering (design docs use logical numbers)

Verify actual next-free with `ls supabase/migrations` at execution time. Reserved sequence:

| # | Migration | Design ref |
|---|---|---|
| 624 | remove_gina_disclosure (IN FLIGHT — removal agent) | policy |
| 625 | machine_safety_envelope — real DDL (supersedes 622 SELECT 1), machine_session_guard, deadman sweep cron | TURNING-OUT §2 |
| 626 | meet_safety_system — trusted_contacts, meet_safety_plans, meet_checkins, watcher cron, arming preview hook | TURNING-OUT §1 |
| 627 | obligations ledger — obligations, obligation_transition, enforcement_gate, safeword_latches, chokepoint triggers (WARN mode), push_unlock_date, auto-file triggers, compat view, pause-shift accruer | SPINE §1,§3 |
| 628 | escalation + compliance — escalation calculus fns, hard-mode transitions, mandated_texts, is_mandated_text, capture_context, detector rewires | SPINE §2,§5 |
| 629 | amnesty_recompute — 610 grandfather void, synthetic slip purge, dodge clamp + commutation backfill, unlock recompute, hard-mode recompute, cancel_reason backfill | SPINE §7 L3 |
| 630 | outward_rail — witness_registry (+Gina-exclusion trigger), dispatcher tables/token, enforcement_audit | SPINE §4,§6 |
| 631 | funnel_identity_heat — identity columns, thread_key unique, hookup_funnel_live view, quarantine + chimera backfill | TURNING-OUT §3 |
| 632 | revenue_obligations — financial_obligations (+Folx seed at real next due), platform_accounts, earned_this_week_cents | TURNING-OUT §4 |
| 633 | conditioning_gate + safety_exempt registry | TURNING-OUT §5 |
| 634 | body_metrics spine + compat views + transition_tracking_log + fulfillment triggers | FEM §4,§5 |
| 635 | fem_prescription delivery columns + canonical domain + expiry sweep | FEM §1 |
| 636 | voice_progress_samples + backfill + watcher repoint | FEM §2 |
| 637 | mantra_apply_drill RPC + reps reconciliation | FEM §3 |
| 638 | wardrobe attrs + legacy category UPDATE + acquisition bridge | FEM §6 |
| 639 | arousal_scale_10 — 0–10 CHECK + ×2 backfill (ATOMIC with reader updates) | TURNING-OUT §2.3 |
| 640 | cron wiring + chokepoint ENFORCE flip + prune whitelist | all |
| 641 | favorites_intelligence (renumbered root 083) | hygiene |

Also: **commit untracked `supabase/migrations/586_wishlist_revenue_engine.sql`** (fills committed numbering gap; committed code depends on it); delete stale root `083_favorites_intelligence.sql` after renumber.

## Phase order

1. **P0 Gina removal** — in flight (mig 624 + code strip + defensive trigger).
2. **P1 Machine safety** (mig 625 + machine-overseer rewrite) — acutest physical risk. Latching guard, fail-closed everything, phase timeouts, biometric validation, single-site params, deadman sweep.
3. **P2 Meet safety** (mig 626 + meet-safety-watcher + date-safety-kit v2 + funnel meet-gate) — no net, no meet. Watcher live BEFORE the gate flips on.
4. **P3 Merge to main** — GH Actions schedules run from main; none of the new engines has ever fired on schedule. Push branch, merge, verify critical-loop fires.
5. **P4 Enforcement spine** (migs 627–630 + force-processor/handler-enforcement/anti-circumvention/hard-mode/punishment-queue/surface-guarantor changes + outward dispatcher) — shadow week in WARN before ENFORCE.
6. **P5 Feminization loop** (migs 634–638 + FocusMode task kinds + prescriber/watcher/drill/tracker rewrites + hrt-pipeline rewrite + wardrobe canonical).
7. **P6 Identity funnel + revenue** (migs 631–633 + ctx builder dual-id + revenue generator v2 + conditioning gate adoption).
8. **P7 Arousal scale + cutover** (migs 639–640) — atomic with reader updates; ENFORCE flip after clean shadow week; health-check + blind-spot registrations verified.

## Progress log

- 2026-07-01: P0 merged (d141c11, mig 624), P1 merged (mig 625), P2 merged (efa7a89, mig 626). P4/P5 in flight.
- 2026-07-02: P4 merged (migs 627-630), P5 merged (migs 634-638), P6 merged (migs 631-633). P7 partial: mig 639 = cron wiring (pgcron-setup generalized to the JOBS list — the live install path since app.settings GUCs are NULL) + prune whitelist (cron job names into safety_exempt_systems) + `enforcement_chokepoints_enforce()` flip helper (run manually after a clean shadow week; refuses while penalty_without_obligation alarms exist).
- **DEFERRED: arousal 0→10 cutover** — 60+ current_arousal readers with mixed scale assumptions (Math.min(5,...) writers in handler-runtime.ts:1252 + useSessionHandler.ts:263/311, 4+ thresholds in predictive-engine, /5 renders); must ship atomically with ALL readers as its own migration train. Machine bridge writes validated 0-5 (toArousal5) until then; toArousal10 is implemented+tested ready for the cutover.
- **DEFERRED: P4 L5 cutover** (revoke direct scheduled_unlock_at grants, drop penalty_previews compat view) — after one clean ENFORCE week.
- **NOT DONE: P3 push/merge to main** — nothing fires on GH Actions schedule until the branch lands on main. 17 new migrations (624-639) also need applying to the live DB (SUPABASE_ACCESS_TOKEN in .env; pgcron-setup handles the http-post cron jobs).
- **P7/640 must fix:** mig 626's dispatch-drain cron uses `current_setting('app.settings...')` GUCs which are NULL in this project (mig-619 finding) — rewire through pgcron-setup like blind-spot-monitor. Same audit finding applies to mig 616's dispatch.
- **Deferred from P2:** stage-1 "SMS to her own phone" needs a user phone-number source that doesn't exist yet; ladder currently push-only until stage 3. Add `user_state`-adjacent phone column + Twilio self-SMS when a number lands.

## Cross-domain contracts (interfaces the phases share)

- **`conditioning_gate(uid, system)`** — pure-read SQL, fail-closed TS shim, callers: goon-trajectory, paid-monetization, machine-overseer start, temptation-engine, all mommy-* generators as touched. Enforcement spine owns the state it reads (safeword_latches, pause, aftercare). Exempt: meet-safety-watcher, machine-deadman-sweep, safeword-heal, surface-guarantor.
- **`enforcement_gate(user)`** — penalty processors' gate ('active'|'paused'|'safeword_latched'), backstopped inside obligation_transition.
- **Obligation ledger** — anything with deadline+consequence files here; chokepoint triggers on penalty sinks; meet-plan arming registers its outward ladder here too.
- **Canonical arousal 0–10** — `_shared/biometrics.ts` owns conversion; machine bridge, funnel ctx, pavlovian readers all move in mig 639's train.
- **Canonical enums** — fem_domain (task_bank set + mantra), wardrobe categories (mig 623 18-value), enum-constraint-guard CI pins TS ≡ DB.
- **Health-check** — every new generator/watcher registered in GENERATORS same PR; watchers whitelisted in prune helper.
- **Voice** — all Mommy-visible copy through mommyVoiceCleanup + craft filter; trusted-contact stage-3 message and acquisition/gate internal copy are plain-English stranger-readable exemptions.

## Systemic guards (close the "dead but reports healthy" class)

- **Schema-fiction CI:** script diffing every `.from('...')` + insert-column literal in `supabase/functions/**` + `src/lib/**` against migration-declared schema (would have caught voice_corpus, mantras, mig-127 hrt, mig-227 body, mig-160 wardrobe, mig-476 pitch at generation time).
- **Pattern-lint additions:** fail-open `catch` around `is_safeword_active`/gate RPCs; single-id `.eq('user_id'` on funnel/contact tables; `fixed inset-0` outside the meet-safety alarm exemption.
- **Regression tests, each verified failing on current code first:** safeword latch, HR-null dropout, force-phase timeout, dodge-loop cap, unsurfaced-void, mandated-text exemption, gate fail-closed, current-week-earned honesty, Anonymous-Cruiser sexting cap, completed-prescription survives re-run, positive-pitch-trend never punished.
