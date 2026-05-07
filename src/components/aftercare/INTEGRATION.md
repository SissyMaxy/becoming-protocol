# Aftercare integration seams

This branch (`feature/aftercare-flow-2026-04-30`) is consumer-side.
It does NOT redefine the safeword and does NOT depend on any sibling
branch's code. The seams below are the contracts other branches use
to route into aftercare.

## 1. Gaslight branch — `feature/gaslight-mechanics-2026-04-30`

When the gaslight branch's safeword exit / meta-frame-break fires,
it should call the client lib:

```ts
import { useAftercare } from '../context/AftercareContext'

const aftercare = useAftercare()
await aftercare.begin({
  trigger: 'post_safeword',
  // intensity = the gaslight_intensity that was active when the
  // safeword was used, mirrored into our enum (none/soft/standard/cruel).
  intensity: currentGaslightIntensity,
})
```

The contract is `enterAftercare()` in `src/lib/aftercare.ts`. The
gaslight branch does NOT need to know our edge-fn URL, our table
schema, or how we render the overlay. If they ship before us, the
call no-ops with a structured `{ ok: false, error }` rather than
throwing.

If the gaslight branch only writes to its own DB row (rather than
calling the client fn directly), they can alternatively insert into
`aftercare_sessions` themselves with `entry_trigger='post_safeword'`
and our edge fn will pick up the open session via idempotency. The
client-fn route is preferred — it's atomic and surfaces the overlay
immediately.

## 2. Session-close hook — `post_cruel` auto-route

Whichever branch owns session lifecycle should call the helper:

```ts
import { shouldAutoRouteAftercare, enterAftercare } from '../lib/aftercare'

if (shouldAutoRouteAftercare({
  sessionIntensity: closedSession.gaslightIntensity,
  sessionDurationMs: Date.now() - closedSession.startedAt,
  minMinutes: 10,
})) {
  await enterAftercare({ userId, trigger: 'post_cruel', intensity: 'cruel' })
}
```

`minMinutes` is the configurable N from the spec — defaults to 10.
Tune per surface.

## 3. TTS branch — `feature/outreach-tts-2026-04-30`

Aftercare carries a `voice_hint` field on the edge-fn response:

```json
{
  "voice_profile": "aftercare_neutral",
  "stability": 0.95,
  "style": 0.05,
  "similarity_boost": 0.6
}
```

These are intentionally NEUTRAL ElevenLabs settings — max stability,
near-zero style — so the voice has no persona inflection. If the TTS
branch wants to voice aftercare lines, it should consume this hint
(do NOT use the persona voice ID).

This branch does NOT depend on the TTS branch. The hint is data only;
no code link.

## 4. What is NOT a seam

The exit gate (60s minimum dwell) is enforced by the overlay
component itself. No other branch can lower it. This is by design —
aftercare's exit gate is part of the wellbeing contract.

The affirmation catalog is curated. Other branches MUST NOT inject
persona-voiced lines via `aftercare_affirmations`. The runtime
`isAftercareSafe()` guard rejects any row containing kink tokens or
telemetry references; the negative test enforces this at CI time.
