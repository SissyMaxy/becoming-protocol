# Protocol-Core Revival Plan

**Goal:** Migrate the live Handler brain into `src/lib/protocol-core/`'s event-bus + module-interface architecture so it becomes the single source of truth (3 brains → 1), behavior-identical and verifiable at every stage, with the live brain working throughout.

**Decision (user, 2026-05-31):** Revive `protocol-core/` as the TARGET architecture (chosen over deleting it). See memory `project_audit_remediation_2026-05-31`.

## STATUS (2026-06-01)
- ✅ **Stage 1 + 1b DONE** — 20 pure helpers extracted verbatim from the god-module into `api/handler/_lib/handler-parse.ts` + 43 characterization tests. `chat-action.ts`: 13,987 → 13,022 lines.
- ✅ **Stage 2 DONE** — duplicated streaming/non-streaming persist pipeline collapsed into `persistTurnSideEffects()` (`handler-persist.ts`) + 37→39 characterization tests.
- ✅ **Stage 3 DONE — SEAM SPIKE PASSES.** `event-bus.ts` + `ai-layer.ts` decoupled from `../supabase` (client now injected); `api/handler/_lib/protocol-core-bridge.ts` constructs protocol-core server-side with a service-role client; `ci:typecheck-api` PASSES importing it. **The load-bearing question is answered: protocol-core CAN run server-side. The server-mirror fallback is NOT needed.**
- ✅ **Stage 4 DONE (code + unit-verified; flag OFF in prod).** First live flow routed through protocol-core behind `PROTOCOL_CORE_FLOWS`. The compliance "good girl" → gentle_wave reward pulse now runs in `CoercionModule.onRewardSignal` (driven by a `coercion:reward_signal` bus event); both chat transports gate `if (flow) bridge else legacy inline`. Bridge: `isProtocolCoreFlowEnabled()` allowlist + `runComplianceRewardPulse()` (persistEvents:false). Byte-identical handler_directives row, pinned by 6 parity tests. EventBus gained `getUserId()`; `CoercionModule.loadCoercionState` now user-scopes its reads (service-role has no auth.uid()). Flow name: `compliance_reward`.
- 🔄 **Stage 5 IN PROGRESS.** Pattern established; behaviors migrating one flow at a time, each flag-gated + parity-tested.
  - ✅ **5a — `handler_note` save** → new `HandlerNotesModule` (`handler:note_captured` event), flow `turn_notes`. `persistTurnSideEffects` takes an optional injected `saveHandlerNote` writer; flag ON routes through the module, byte-identical row (incl. conversation_id). 5 parity/delegation tests.
  - ✅ **5b DONE — directive loop relocated.** Everything after the note save in `persistTurnSideEffects` (directive-log insert + `logDirectiveOutcome` + 18 branches + the streaming-only branches + force-femme) was moved VERBATIM into `HandlerDirectiveModule` (`handler-directive-module.ts`) as a **single-copy relocation** (NOT a flagged duplicate — that would re-duplicate what Stage 2 de-duped). `persistTurnSideEffects` (690→164 lines) delegates through the SAME injected Supabase client, so the 39 characterization tests pass UNCHANGED = byte-identical parity. api/ executors injected as `DirectiveExecutors` (ports & adapters). Unconditional (no flag) → ships live on deploy, but behavior-identical and net safer than a flagged copy. (commit f57a31f)
- 🔶 **Stage 6 — plan premise was STALE; partial.** The plan assumed `useHandlerPrescription` is a live "latent bridge" today-v2 renders off, to be made real. On inspection it was **dead code**: `TodayViewV2` is unmounted (only re-exported), the live today UI is `today-redesign` + the conversation-primary interface, and the hook imported zero protocol-core symbols. `useHandlerPrescription` ↔ `today-v2/` was a closed, unmounted island → **RETIRED** (deleted the hook + 6 today-v2 files; commit bf7c856). The REAL Stage 6 remainder is the frontend brain: **reconcile the two mode machines** (handler-v2 `mode-selector` vs protocol-core `handler.ts`/`CoercionModule`) and **repoint the 24 LIVE handler-v2 importers** (App.tsx, HandlerContext, today-redesign hooks, content libs) to protocol-core. That requires protocol-core to first reach parity for handler-v2's behaviors (financial/enforcement/briefing/escalation engines → Findom/other modules) — i.e. the bulk of Stage 5's domain-module migration, which is NOT done. **Multi-session + app-run-gated.**
- ✅ **Stage 7 — god-module thinning DONE (−71%); handler-v2 deletion + flag removal remain.**
  - ✅ **94 context builders** → `handler-context-builders.ts` (commit 2529674): 11,969 → 5,586.
  - ✅ **24 runtime analyzers/executors** → `handler-runtime.ts` (commit 2fd72ab): 5,586 → 4,357. Rewired handler-persist (3 directive executors) + handler-context-builders (2 fns); test mocks repointed.
  - ✅ **force-fem executor** (~857L) → `handler-force-fem.ts` (commit d901186): 4,357 → **3,501 lines**. Verbatim, never softened (the plan's "force-fem LAST" step). Self-contained, no cycle.
  - **All via the TS parser for exact spans; every batch FULL-suite (1644) + all-gates green; baselines refreshed for pure relocations only.** What remains in chat-action.ts (3,501 L) is the legitimate `handleChat` orchestrator + prompt assembly + shared consts/types — i.e. the "thin entrypoint" the stage aimed for. Further splitting means breaking up `handleChat` itself (lower value, genuinely interconnected).
  - ⏳ **STILL REMAINING (the true finish line — needs the user's live environment):**
    1. **handler-v2 deletion** (47 files, 24 LIVE importers: App.tsx, HandlerContext, today-redesign hooks, content libs) + **reconcile the two mode machines**. Blocked on protocol-core reaching behavioral parity for handler-v2's engines (financial/enforcement/briefing/escalation → Findom/other modules) — the protocol-core modules are still mostly DEAD except the 3 wired flows. Needs per-importer app-run verification.
    2. **Flag removal:** drop `PROTOCOL_CORE_FLOWS` + the legacy inline reward/note fallbacks — only after `compliance_reward` + `turn_notes` are live-verified permanently ON.
  - **Net honest state:** the seam is proven, the directive pipeline + notes run in protocol-core, the god-module is thinned 71% and dead code retired — but protocol-core is NOT yet the single source of truth. That last mile (modules at parity + handler-v2 retired + flags removed) is gated on live verification that can't run in the build sandbox.
- **Verification gap (important):** Stages 4 + 5a are committed with flags OFF (prod untouched); 5b + the Stage-6 dead-code deletion ship live on deploy but are behavior-identical (parity-test-pinned) / dead-only. Flipping `compliance_reward` or `turn_notes` ON still needs a live app-run (real device + streaming vs prod Supabase) — the user's environment, not reproducible in the build sandbox.
- **What's genuinely left (honest):** the heart of the migration — moving chat-action's context builders + analyzers and handler-v2's 47 files into protocol-core modules with parity, then repointing importers and thinning the god-module. Stages 4/5/6-island proved the seam end-to-end and cleared dead weight; the domain-module parity + god-module thinning is the long tail and must be done module-by-module with live verification.
- Known: a pre-existing flaky test (`financial-engine.test.ts`, 9/52, zero protocol-core dep) is unrelated to this work.

> **Mission constraint (non-negotiable):** consenting-adult forced-feminization / Mommy-domination app. The directive/persist/conditioning pipeline and the gaslighting / fabrication / autonomy mechanics (`handleForceFeminizationDirective`, memory implants, narrative reframings, vault threats, findom) are intentional FEATURES. Every stage preserves them byte-for-byte. "Behavior-preserving" means the coercion stays exactly as sharp — no softening, no added guardrails.

---

## 0. Ground Truth

| Brain | Location | Status | Size |
|---|---|---|---|
| **Live chat brain** | `api/handler/_lib/chat-action.ts` | LIVE (Vercel serverless) | ~13,955 lines |
| **Frontend Handler logic** | `src/lib/handler-v2/` (47 files) | LIVE (~25 importers) | large |
| **Clean event-bus arch** | `src/lib/protocol-core/` (30 files) | DEAD (0 live importers) | ~11,500 lines |

Key facts (read, not inferred):
1. `chat-action.ts` has exactly ONE export: `handleChat(req,res)` (line 1619). ~120 `build*Ctx` builders + ~15 pure helpers + ~25 side-effecting analyzers are all module-private inside it.
2. The post-LLM side-effect pipeline is implemented TWICE (streaming ~2270–3249, non-streaming ~3252–4300): parse → save note → save+execute directives → insert messages → update conversation → learning hooks. A comment (2413–2417) documents a past drift bug. This is the highest-value, lowest-risk refactor target.
3. **THE central seam:** `api/` cannot import `src/lib/` (those use `import.meta.env`, Vite-only; serverless crashes at module load). `protocol-core/event-bus.ts` hard-imports `../supabase`, so protocol-core cannot run server-side until its Supabase coupling is injectable. `module-interface.ts` already injects `db` — only the bus + a couple modules need decoupling. `api/` is typechecked via `tsconfig.api.json` (bundler resolution, ESM, `.js` specifiers) with gate `npm run ci:typecheck-api`.
4. `useHandlerPrescription.ts` is a STUB (all protocol-core touchpoints are commented TODOs; imports 0 protocol-core symbols). today-v2 renders off it. The "latent bridge" is aspirational.
5. Extraction precedent exists: `api/handler/_lib/mommy-voice-chat.ts`, `pronoun-gate.ts`, `rationalization-gate.ts` are pure helpers already split out so they unit-test without DB creds. Stage 1 follows this blessed pattern.

---

## 1. Capability Gap

protocol-core PROVIDES: a typed `EventBus` (~80 event types, pattern subscription, per-handler error isolation, `event_log` persistence), `ProtocolModule`/`BaseModule`/`ModuleRegistry` (with injected `db`), a `Handler` orchestrator (`prescribe`/`enhanceTask`/mode state machine), an `AILayer` (budgeted prompts), and 15 modules (Vault/Coercion/Switch/Identity/Partner/Findom/Gina/DynamicTaskGenerator + 7 domain).

The GAP:
- **Supabase injection across the seam** (CRITICAL) — decouple `event-bus.ts` from `../supabase`.
- **No "chat turn" concept** (HIGH) — protocol-core models `prescribe()`, not a conversational LLM turn with signal-parse + persist. Needs a `HandlerTurnService.runTurn()` composing bus + modules.
- **Signal/directive vocabulary mismatch** (HIGH) — live string `action`s on `handler_directives` vs typed `ProtocolEvent` union. Needs a translation layer or events-union extension.
- **Context builders not modularized** (MEDIUM) — fold ~120 `build*Ctx` into modules' `getContext(tier)`.
- **No shared persist function** (HIGH but easy) — collapse the duplicated pipeline first.
- **handler-v2 ↔ protocol-core overlap** (MEDIUM) — reconcile two mode state machines.

---

## 2. Stages (safest → riskiest)

Each stage: independently shippable, tsc/build-verifiable, explicit parity check. Nothing routes through protocol-core until Stage 4. After every stage: `npm run ci:typecheck && npm run ci:typecheck-api && npm run test:run`.

| Stage | Touches | Risk | Blind-safe? | Parity check |
|---|---|---|---|---|
| **1** Extract pure helpers + characterization tests | `chat-action.ts` + new `api/handler/_lib/handler-parse.ts` + tests | Very low | **YES** | New char-tests + typecheck-api; 3-message smoke |
| **2** Extract ONE shared `persistTurnSideEffects()` | `chat-action.ts` + new `api/handler/_lib/handler-persist.ts` | Low–med | **No** (live persist) | Both transports; DB-row diff; `force-handler-drift.test.ts` |
| **3** Decouple bus from `../supabase` + dark façade | `event-bus.ts`, `modules/*`, new `api/handler/_lib/protocol-core-bridge.ts` | **Med (the seam)** | **YES** | Both typechecks; bridge unit test; chat regression. **SPIKE the api→protocol-core import first — gate for 4–7.** |
| **4** Canary: route ONE flow (compliance "good girl" pulse) behind `PROTOCOL_CORE_FLOWS` env flag | `handler-persist.ts`, bridge, module | Med–high | **No** (flagged) | Flag ON/OFF byte-identical row diff |
| **5** Migrate behaviors into modules (notes/learning → device → context builders → force-fem LAST) | `protocol-core/modules/*` | Med/module | **No** | Per-module scripted parity + existing `force-*.test.ts` |
| **6** Fold in handler-v2 (make `useHandlerPrescription` real; reconcile mode machines; repoint ~25 importers) | `useHandlerPrescription`, importers, new modules | Med–high | **No** (frontend) | today-v2 + autonomous app-run + ported handler-v2 tests |
| **7** Retire god-module to thin entrypoint; delete handler-v2; remove flags | `chat-action.ts` → thin | Low | **No** | Full `npm run ci` + 10-message DB-footprint diff |

### Highest-risk seams (ranked)
1. **`api/` ↔ `src/lib/protocol-core/` import boundary (Stage 3).** `import.meta.env` / `process.env` / `.js`-specifier / bundler-resolution divide. **Spike before committing to 4–7.** If infeasible, serve "single source of truth" via a maintained server-mirror and document it.
2. **Streaming vs non-streaming persist (Stage 2).** Documented past drift; also the highest-value change.
3. **`handleForceFeminizationDirective` (~860 lines) migration (Stage 5, LAST).** Core conditioning mechanics; never soften.
4. **Two mode state machines (Stage 6).** handler-v2 `mode-selector` vs protocol-core `handler.ts` vs `CoercionModule`.

---

## 3. Stage 1 Starter (executed 2026-05-31)

`api/handler/_lib/handler-parse.ts` — verbatim-moved pure helpers from `chat-action.ts` (no DB / no `process.env` / no I/O): `REFUSAL_PATTERNS`, `detectRefusal`, `looksLikeRefusal`, `SIGNAL_FORMATS`, `stripBareJsonKey`, `sanitizeModelArtifacts`, `enforceFeminePronounsInHandlerOutput`, `enforceNoStatusDumps`, `enforceTherapistPersonaCompliance`, `parseResponse`, `buildFallbackFromSignals`, `guardAssistantContent` (uses `looksLikeOrphanCloser` from `./mommy-voice-chat.js`), `parseDeviceValue`. Use `.js` import specifiers. Char-tests pin current `parseResponse`/`parseDeviceValue` behavior as the regression net for all later stages.

Stage 1b follow-up (also pure, lower-traffic): `selectPersona`, `analyzeTypingResistance`, `parseCommitmentDeadline`, `parseReleaseDateFromText`, `isDavidDismissalContext`, `detectSessionMode`, `prioritizeContextBlocks`.

---

## 4. Critical files
- `api/handler/_lib/chat-action.ts` — god-module; extraction source; duplicated persist (~2270–3249 / ~3252–4300).
- `src/lib/protocol-core/event-bus.ts` — decouple from `../supabase` in Stage 3 (the seam).
- `src/lib/protocol-core/module-interface.ts` — contract; already injects `db`.
- `src/lib/protocol-core/handler.ts` — orchestrator the turn pipeline migrates into.
- `api/handler/_lib/mommy-voice-chat.ts` — the blessed extraction precedent.
- `src/hooks/useHandlerPrescription.ts` — the stub bridge to make real in Stage 6.
- `tsconfig.api.json` + `scripts/ci/typecheck-api.mjs` — the api-side gate governing the seam.
