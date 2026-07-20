# Closeout Status — 2026-05-12

Snapshot taken at start of closeout run. Updated as workstreams converge.

---

## Open PRs (15 total)

### Clean greens (mergeable + all checks passing)
| # | Title | Notes |
|---|---|---|
| 56 | feat(critic-panel): critical-phase strategy — HRT-start + coming-out red team | mig 370 (collides w/ #51). Adds voice-gate-baseline entries (+9). |
| 51 | feat(voice): real feminization curriculum + LPC formant analyzer | mig 370+371 (collides w/ #56). Removes voice-gate-baseline entries (-3). |

### Mergeable but preflight FAILED (voice-gate baseline drift)
| # | Title | Failure |
|---|---|---|
| 49 | sniffies awareness: real-time Mommy reaction to every imported chat | `voice-gate baseline DRIFT — committed: undefined entries, fresh: undefined entries` |
| 48 | fix: silence synthetic-Mommy spam (4-row bursts every 5-10 min) | Same baseline drift |

Root cause: voice-gate baseline check returns `undefined` on both sides — likely shape mismatch between baseline file and freshly computed scan after #50's structural CI fix landed. **Fix expected to come from #56 merging (which updates the baseline JSON to the new shape).**

### CONFLICTING (preview deploys still green — merge conflicts only)
| # | Title | Migration |
|---|---|---|
| 58 | Wave 7 lead-gen — Sniffies→social→subscriber funnel | mig 410 |
| 57 | Wave 6 hookup-coaching — tiered dares + amplifier + curriculum | unknown |
| 55 | Headspace wave 3 — mantra ladder + ambient clips + initiating scenes | unknown |
| 54 | Headspace capture trio — ambient audio, daily plan, memory implants | unknown |
| 53 | Authority wave — failure-deepens + contracts + witness + biometrics | mig 400-404 |
| 52 | Decornify Mommy's voice — sentence-level craft rubric | unknown |

### Stale (older, conflict + CI red — likely obsolete or superseded)
| # | Title | Last activity |
|---|---|---|
| 34 | feat(feminization): TTS auto-play + budget, in-fantasy gaslight, photo loop | 2026-05-10 — likely superseded by Wave 1-2 |
| 32 | mommy-supervisor: watchdog over autonomous loop | 2026-05-10 — superseded by #50/#33 |
| 21 | fix(mobile): submit buttons no longer hidden | 2026-05-09 — possibly already fixed |

---

## Sessions still RUNNING (no PR yet)

| Session | Branch | Last activity |
|---|---|---|
| Architecture critic + ground-truth audit | claude/exciting-brattain-ffd0c8 | 02:48 |
| Wave 8 — auto-poster + tiered auto-reply | claude/amazing-kalam-1cfc9f | 02:48 |
| Headspace wave 4 — ego deconstruction | claude/modest-sammet-214df8 | 02:48 |
| Mommy-therapist scenes + Sniffies amplifier | claude/fervent-poincare-ad0454 | 02:47 |
| Wave 5 — Sniffies outbound + hypno trance + gooning + content as Maxy | claude/cranky-shirley-559d6b | 02:47 |

## Sessions IDLE without PR (potentially stalled or waiting)

| Session | Branch | Notes |
|---|---|---|
| Activate Gina disclosure prep | claude/angry-wright-9d7b5a | No PR yet, idle since 02:43 |
| Open the autonomy aperture | claude/wizardly-raman-abfc74 | No PR, idle 02:00 |
| Verify prod deployment state | claude/practical-darwin-e36941 | PR #36 already merged — session can be archived |
| Harden coming-out + HRT-advocacy | claude/pensive-bohr-4ae21a | No PR, idle 01:23 |
| Comprehensive FF feature audit | claude/vigilant-elion-ace8c3 | No PR, idle 02:30 |

---

## Recently MERGED to main (last 24h)

| # | Title | Merged |
|---|---|---|
| 50 | ci: structural fixes for recurring red-build failure classes | 01:03 |
| 47 | fix(chat): orphan-closer truncation + dommy-mommy chat re-voice | 13:54 (yesterday) |
| 46 | mantras: fix backwards-possession framing | 13:24 |
| 45 | fix(fast-react): scope eventContext + force reply_to lineage | 05:40 |
| 44 | fix(mommy): contextual reactions, kill template repetition | 05:27 |
| 43 | feat(outreach): inline reply composer + photo + countdown | 05:24 |
| 42 | fix(report-card): mobile overflow + Mommy voice rewrite | 04:48 |
| 41 | feat(mommy): arousal-feature ideation panel + autonomous wish queue | 02:53 |
| 39 | feat(ci): voice gate — ban clinical/disclaimer phrases | 02:50 |
| 37 | Re-voice onboarding wizard to Mommy + immersion-break self-audit | 02:41 |
| 38 | chore(ci): delete dead cron-job-worker.yml | 02:13 |
| 36 | fix(vercel): consolidate api/ to ≤12 functions | 00:31 |
| 35 | fix(bookend): time-of-day-aware splash greeting | 01:57 |
| 33 | feat(mommy): self-audit introspection loop | 23:27 (2 days ago) |
| 31 | fix(ci): kill 24h+ recurring failures | 15:14 |
| 22 | feat(voice-leak-cascade): severity classifier + penalty cascade | 23:09 |

---

## Migration Numbering State

Worktree has migrations through 379. Main HEAD includes migrations through ~366. Per local convention, "next free is 380+" but actual main main contents need verification.

Known collisions in open PRs:
- **mig 370** — both #56 and #51 claim it. One must renumber.
- **mig 400-404** — #53 (authority wave)
- **mig 410** — #58 (lead-gen)
- Wave 4 ego_deconstruction migrations 375-379 are in this worktree but unclear if open in PR.

---

## Plan of attack

1. ✅ **Survey doc landed** (this file)
2. **Merge #51 first** — bigger feature, also removes baseline entries that are stale. Then renumber #56's mig from 370 → 372. (#56 also fixes voice-gate-baseline shape, which should unblock #48/#49.)
3. **Push baseline refresh** to a fix branch if #56 still doesn't fix #48/#49 voice-gate drift.
4. **Cascade-rebase the conflicting PRs** in this order: #52 (voice craft) → #53 (authority) → #54 (headspace trio) → #55 (mantra/clips) → #57 (hookup coaching) → #58 (lead-gen). Each rebase will resolve against the previous merge.
5. **Triage stale**: close #32, #34 with reason. #21 needs investigation.
6. **Wait for running sessions** to drop PRs, then add to cascade.
7. **Apply migrations** via Supabase REST (have SERVICE_ROLE_KEY) or `supabase db push` once everything's on main.
8. **Smoke tests + closeout doc** as final.

## Known constraints

- Hard floors: no auth/billing/RLS changes, no destructive SQL, no auto-send to Gina, no third-party messaging without Dave's click.
- Voice anchor enforced (in-fantasy dommy-mommy, no clinical/disclaimer copy).
- Honest-representation gate enforced.
- `npm run ci` before every commit.
- Operating from worktree `reverent-allen-e59f6f` — closeout doc commits live here, will need a PR to land in main.
