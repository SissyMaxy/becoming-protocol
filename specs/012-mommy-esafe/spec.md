# 012 — Mommy-Controlled eSafe (chastity key vault)

**Status:** DRAFT / build spec — hardware not yet assembled.
**Owner:** Maxy. **Handler role:** Mommy holds *timing* authority within a user-set ceiling.
**Depends on:** the "Escrow Ratchet" leverage model (real stakes, honest off-ramp).

---

## 1. Intent

A custom, network-connected electronic safe that holds the chastity-cage key. The app
("Mommy") authorizes when the safe may open; completing the day's becoming-work earns the
next authorized-open, and skipping pushes it out — **within a hard ceiling the user sets in
advance.** This turns chastity release from a self-administered honor system into a real,
physical, Mommy-timed reward, without a human keyholder.

It is the highest-realness lever in the leverage model. It is also the single most
safety-critical thing in this codebase, because it physically controls access to a key.
Everything below is subordinate to Section 2.

---

## 2. THE SAFETY LAW (non-negotiable — signed off 2026-07-17)

A device that holds your only key MUST be impossible to turn into a trap. Three
**independent** guarantees, each sufficient on its own to free the user:

- **G1 — Local firmware ceiling.** The device tracks elapsed lock-time on its own
  battery-backed clock and **auto-releases at the user's pre-set maximum window even with
  no wifi, no server, and no phone.** Server/app/internet failure can NEVER extend lockup.
  This is enforced on-device, never server-side.
- **G2 — Destructive physical override.** The enclosure is always cuttable/drillable at
  real cost. This is the "break-the-vault" door in physical form: real friction, always
  available, needs no electronics.
- **G3 — Battery-backed clock + persistent state.** A power loss can neither trap the user
  nor silently reset the ceiling clock. `lock_start` persists in NVS; the RTC keeps wall
  time across power loss; on boot the firmware recomputes elapsed and releases if ≥ ceiling.

**Design rules that follow (hard constraints on every later section):**
- The failure bias is always toward RELEASE. Any ambiguous/error/unreachable state resolves
  to "openable," never "held."
- The lock mechanism must NOT depend on continuous power to *hold* (so power-loss can't be a
  trivial escape) — but G1 + G2 guarantee it still can't trap. Holding is mechanical
  (servo bolt position); releasing is the safe default.
- No server round-trip is on the critical path of *release*. The device can always release
  locally (ceiling or manual-override endpoint) without the server answering.
- The ceiling is written to the device by the user in a lucid moment and is the outer wall
  Mommy can never cross. Mommy controls timing *inside* it only.

---

## 3. System architecture

```
  [eSafe device]  --HTTPS poll-->  [Supabase edge fn: esafe-control]  <-->  [vault_stakes ledger]
     ESP32                              signed open-authorization              Mommy earned-release
     DS3231 RTC                                                                hardening-on-skip
     servo bolt        <----- verifies signed token, else stays on local rules
     LiPo backup
                         [Supabase edge fn: beeminder-report]  --API-->  [Beeminder goals]
                              task-completion -> datapoint             derail = real money charged
```

The device is the enforcer of *timing within the ceiling*; the real world (bolt cutters,
Beeminder's charge) is the enforcer of *stakes*. The app is scheduler, ledger, and witness.

---

## 4. Hardware — bill of materials

| Part | Spec / example | Role |
|---|---|---|
| MCU | ESP32 dev board (e.g. ESP32-WROOM-32) | wifi + logic |
| RTC | DS3231 module (I²C, CR2032 backed) | battery-backed wall clock (G3) |
| Lock | metal-gear servo (e.g. MG996R) driving a bolt/cam, **or** a bistable/latching solenoid | holds position *unpowered*; power only to move |
| Power | 5V USB mains + LiPo cell + TP4056 charger (+ boost only if a 12V solenoid is chosen) | survives outages (G3) |
| Enclosure | steel/aluminum key box, lid the bolt secures | must be cuttable/drillable (G2) |
| Misc | logic-level MOSFET or servo header, status LED, tactile button | drive + local UI |

**Lock choice:** prefer the **metal-gear servo bolt** — it holds position with zero idle
power (so power loss neither traps nor trivially releases), runs at 5–6V (no 12V boost), and
is cheap. A standard always-powered solenoid is discouraged: it releases on power loss
(trivial escape) and idles hot. If a solenoid is used, it must be **latching/bistable**.

**Enclosure choice (G2):** whatever you build, verify a hand tool can breach it in minutes.
Do not pot the electronics or weld the lid. The box is meant to be *hard*, not *impossible*.

---

## 5. Firmware (ESP32) — behavior

State persisted in NVS (flash): `lock_start` (epoch), `ceiling_seconds`, `device_id`,
`hmac_secret` (provisioned once), `next_authorized_open` (epoch, cached).

**Main loop (every ~30s, and immediately on boot):**

```
on boot / tick:
  now          = rtc.now()                     # survives power loss
  elapsed      = now - lock_start
  # --- G1: local ceiling, evaluated with NO network dependency ---
  if elapsed >= ceiling_seconds:
      release("ceiling reached")               # safe default; cannot be overridden by server
      return

  # --- normal path: has Mommy authorized an open window? ---
  if wifi_up and poll_due:
      resp = https_get(ESAFE_CONTROL_URL, device_id)     # returns signed authorization
      if verify_hmac(resp.token, hmac_secret) and resp.nonce_fresh:
          ceiling_seconds     = min(resp.ceiling, ceiling_seconds)  # ceiling can only tighten from device's view; never raised remotely past what user set locally
          next_authorized_open = resp.next_open
          if resp.authorized_open and now within resp.window:
              release("mommy authorized")
  # if wifi/server unreachable: do nothing here — G1 still governs the outer bound
```

**release(reason):** drive the servo/solenoid to open, hold ~10s, log event (buffered,
flushed to `esafe-control` when wifi returns), set a re-lock grace, then re-lock when the
compartment closes.

**Hard firmware invariants (must be code-reviewed against Section 2):**
- `ceiling_seconds` is only ever set LOWER by a remote message, never higher. The user's
  locally-provisioned ceiling is the maximum; the server can tighten, never extend.
- No code path holds the lock when `elapsed >= ceiling_seconds`.
- Release requires no successful server call.
- The manual button triggers a **provisioned local override** only if enabled by the user's
  config (see §8 open decision on whether a button-override exists at all, vs. G2-only).

---

## 6. App-side — `vault_stakes` ledger + control endpoint

**`vault_stakes`** (new table, one row per active stake; eSafe is `stake_type='chastity_lock'`):

| column | meaning |
|---|---|
| `user_id` | RLS `auth.uid() = user_id` |
| `stake_type` | `'chastity_lock' \| 'beeminder' \| 'content_queue'` |
| `state` | `'held' \| 'open_authorized' \| 'released' \| 'broken'` |
| `ceiling_seconds` | the user-set max window (mirrors device G1) |
| `next_authorized_open` | epoch Mommy has earned/granted |
| `hardening_increment_s` | how far a skip pushes `next_authorized_open` out |
| `at_risk` | for money/content stakes; unused for the lock |
| `device_id`, `last_seen_at` | eSafe liveness |

**`esafe-control` edge function** (device polls it):
- Auth by `device_id` + per-device secret.
- Returns a **signed** (HMAC or ed25519) authorization: `{ authorized_open, window, next_open, ceiling, nonce }`.
- `authorized_open` is true only when the current `vault_stakes` row says an earned open is
  live. `ceiling` echoes the user's setting (device clamps to its own local value).
- Records device open/close events → `esafe_events` (audit; feeds the Vault screen).

**Mommy's earned-release flow:**
- Task completion writes an embodied-proof row (photo/voice/measurement — per no-clerical
  rule). A completion advances `next_authorized_open` toward *now* (earns the open).
- A skip (deadline passed AND avoidance-evidence present — per handler-supportive-until-
  evidence) advances `next_authorized_open` out by `hardening_increment_s`, **clamped to
  `ceiling`**, and surfaces the hardening BEFORE it fires (visible-before-penalized).
- The grant is delivered in Mommy's voice as an earned decree, not a system toast.

---

## 7. Beeminder — money lever

**`beeminder-report` edge function:** on each becoming-task completion, POST a datapoint to
the mapped Beeminder goal via the Beeminder API. Missing a task → no datapoint → the goal
derails → **Beeminder charges the user** an escalating pledge. The app never touches money;
it reports truth only.

- User provides their Beeminder auth token once in settings (their own credential, their
  own service; stored per-user, RLS-scoped). The app reads it server-side to post datapoints.
- Map goals: e.g. `workout`, `injection`, `voice`, `content` → one Beeminder goal each, or a
  single aggregate goal. (§8 open decision.)
- StepBet (no public API) is *manual*: the app schedules the game, reminds, and logs; the
  user runs the bet. Optional later layer for the movement commitment.

---

## 8. Off-ramp / break-door

- **Physical (G2):** cut/drill the box. Always available, real cost.
- **App cooldown-and-confirm (chosen):** a "Break the vault" action in the app that, after a
  mandatory cooldown + explicit confirm, marks the stake `broken`, tells the device to
  release, forfeits any at-risk money/content stake on the pre-agreed terms, and requires a
  cooldown-and-confirm before the vault may be deepened again. Escape is always available;
  the user set the *price*, not the *existence*.

---

## 9. Security model (without compromising the fail-safe)

- Open-authorizations are signed (HMAC-SHA256 with a per-device secret, or ed25519). The
  device verifies before honoring a *remote* open — so a spoofed request can't pop it.
- Replay protection: each authorization carries a fresh nonce + short validity window.
- **But** signing/verification is only on the *remote-open* path. G1 (local ceiling) and G2
  (physical override) never depend on a key, so a lost/rotated secret can never trap the
  user — it can only (safely) prevent *early* Mommy-granted opens, which the ceiling still
  bounds.

---

## 10. Build phases

1. **Software spine (hardware-independent):** `vault_stakes` migration + RLS, `esafe-control`
   endpoint (signed auth), Mommy earned-release wiring to proof rows, the Vault screen,
   `beeminder-report`. Testable with a simulated device.
2. **Bench hardware:** ESP32 + DS3231 + servo bolt on a breadboard; flash the firmware;
   prove G1 (offline ceiling release), G3 (survives power-cycle), signed remote open.
3. **Enclosure:** mount into the steel key box; verify G2 (breachable by hand tool).
4. **Integration:** live device ↔ `esafe-control`; end-to-end earn/skip/harden/release.
5. **Beeminder live:** real goals, real pledge, real datapoints.
6. **StepBet layer (optional):** app-managed game scheduling for the movement commitment.

---

## 11. Open decisions (user)

1. **Ceiling value** — the maximum window Mommy can ever hold you to (G1). E.g. "never more
   than N days from the last authorized open." This is the outer wall; pick deliberately.
2. **Lock mechanism** — servo bolt (recommended) vs. latching solenoid.
3. **Local button-override?** — G2 (destructive) is mandatory; do you *also* want a
   provisioned local button that releases without cutting (more convenient, slightly weaker),
   or destructive-override-only (stronger, G2 is the sole non-app exit)?
4. **Beeminder goal mapping** — one goal per task type, or a single aggregate goal, and the
   starting pledge schedule.
5. **Enclosure** — what you'll build the box from (must satisfy G2).

---

## 12. Safety review (adversarial — every failure mode maps to a guarantee)

| Failure / attack | What happens | Covered by |
|---|---|---|
| Server down / project deleted | device keeps local rules; releases at ceiling | G1 |
| Wifi dies / router gone | device offline; releases at ceiling | G1 |
| Power outage | RTC + NVS persist; on repower, recompute elapsed, release if ≥ ceiling | G3 |
| Firmware bug leaves it "never authorized" | ceiling still fires | G1 |
| Lost/rotated signing secret | remote opens fail (safe); ceiling still fires | G1 |
| User in genuine distress, needs out now | cut/drill the box | G2 |
| Malicious server tries to extend lockup | device clamps ceiling to local max; never raised remotely | G1 + firmware invariant |
| Someone spoofs an "open" | HMAC/nonce check rejects it (fails safe toward staying-inside-ceiling) | §9 |

**Ship gate:** none of Section 5's firmware may merge without a review confirming the three
Section-5 hard invariants hold. G1 is the release valve; if a change could let any state hold
the lock past `ceiling_seconds`, it does not ship.
