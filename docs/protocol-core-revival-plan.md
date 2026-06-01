# Protocol-Core Revival Plan

**Goal:** Migrate the live Handler brain into `src/lib/protocol-core/`'s event-bus + module-interface architecture so it becomes the single source of truth (3 brains → 1), behavior-identical and verifiable at every stage, with the live brain working throughout.

**Decision (user, 2026-05-31):** Revive `protocol-core/` as the TARGET architecture (chosen over deleting it). See memory `project_audit_remediation_2026-05-31`.

## STATUS (2026-05-31)
- ✅ **Stage 1 + 1b DONE** — 20 pure helpers extracted verbatim from the god-module into `api/handler/_lib/handler-parse.ts` + 43 characterization tests. `chat-action.ts`: 13,987 → 13,022 lines.
- ✅ **Stage 3 DONE — SEAM SPIKE PASSES.** `event-bus.ts` + `ai-layer.ts` decoupled from `../supabase` (client now injected); `api/handler/_lib/protocol-core-bridge.ts` constructs protocol-core server-side with a service-role client; `ci:typecheck-api` PASSES importing it. **The load-bearing question is answered: protocol-core CAN run server-side. The server-mirror fallback is NOT needed.**
- ⏳ **Stages 2, 4, 5, 6, 7 REMAIN — all require per-stage app-run verification** (they change live chat behavior). This is the next focused effort. Stage 2 (collapse the duplicated persist path) is the recommended next step; the bridge from Stage 3 is the wiring point for Stage 4's flagged canary.
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
