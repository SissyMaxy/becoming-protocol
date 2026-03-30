# Whoop Integration Spec — Becoming Protocol

## Overview

Integrate Whoop biometric data (recovery, sleep, strain, HRV, workouts) into the Becoming Protocol app so the Handler's Live Prescription Engine can make objective, data-driven decisions about task intensity, mode selection, and wellness monitoring.

## Architecture

```
User clicks "Connect Whoop" in Settings
  → App redirects to Whoop OAuth authorization
  → User grants scopes
  → Whoop redirects to /api/whoop/callback
  → Server exchanges code for access_token + refresh_token
  → Tokens stored in Supabase (whoop_tokens table)
  → On app load / Handler request, server fetches latest Whoop data
  → Data written to whoop_metrics table
  → Handler reads whoop_metrics alongside self-reported state
```

## Environment Variables (Vercel)

Add to Vercel project settings:

```
WHOOP_CLIENT_ID=c3ccbd77-794e-4983-9716-d26e01639b32
WHOOP_CLIENT_SECRET=a3adbf8071a0e1ef87cc0542c5b653ddc363fb5279d44ddacac5e1ae398da544
WHOOP_REDIRECT_URI=https://becoming-protocol.vercel.app/api/whoop/callback
```

## Whoop OAuth Flow

### Authorization URL
```
https://api.prod.whoop.com/oauth/oauth2/auth
```

**Query parameters:**
- `response_type=code`
- `client_id={WHOOP_CLIENT_ID}`
- `redirect_uri={WHOOP_REDIRECT_URI}`
- `scope=read:recovery read:cycles read:sleep read:workout read:body_measurement`
- `state={random_uuid}` (CSRF protection, stored in session/cookie)

### Token Exchange URL
```
POST https://api.prod.whoop.com/oauth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
code={authorization_code}
redirect_uri={WHOOP_REDIRECT_URI}
client_id={WHOOP_CLIENT_ID}
client_secret={WHOOP_CLIENT_SECRET}
```

### Token Refresh
```
POST https://api.prod.whoop.com/oauth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
refresh_token={stored_refresh_token}
client_id={WHOOP_CLIENT_ID}
client_secret={WHOOP_CLIENT_SECRET}
scope=offline
```

Tokens expire hourly. Always attempt refresh before API calls. If refresh fails, mark connection as disconnected and prompt re-auth.

---

## Supabase Schema

### Table: `whoop_tokens`

```sql
CREATE TABLE whoop_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  whoop_user_id INTEGER,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS: only the owning user can read their tokens
ALTER TABLE whoop_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own tokens" ON whoop_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own tokens" ON whoop_tokens
  FOR UPDATE USING (auth.uid() = user_id);
-- Insert/delete via server-side service role only
```

### Table: `whoop_metrics`

```sql
CREATE TABLE whoop_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Recovery
  recovery_score INTEGER,           -- 0-100
  hrv_rmssd_milli FLOAT,            -- HRV in milliseconds
  resting_heart_rate INTEGER,       -- bpm
  spo2_percentage FLOAT,            -- blood oxygen
  skin_temp_celsius FLOAT,
  
  -- Sleep
  sleep_performance_percentage FLOAT,   -- 0-100
  sleep_consistency_percentage FLOAT,   -- 0-100
  sleep_efficiency_percentage FLOAT,    -- 0-100
  total_sleep_duration_milli BIGINT,    -- total sleep time (excluding awake)
  rem_sleep_milli BIGINT,
  deep_sleep_milli BIGINT,
  light_sleep_milli BIGINT,
  awake_milli BIGINT,
  disturbance_count INTEGER,
  respiratory_rate FLOAT,
  sleep_debt_milli BIGINT,              -- need_from_sleep_debt
  
  -- Cycle / Day Strain
  day_strain FLOAT,                     -- 0-21 scale
  day_kilojoule FLOAT,
  day_average_heart_rate INTEGER,
  day_max_heart_rate INTEGER,
  
  -- Body
  weight_kilogram FLOAT,
  
  -- Metadata
  raw_recovery JSONB,
  raw_sleep JSONB,
  raw_cycle JSONB,
  raw_workout JSONB,
  
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

-- Index for Handler queries
CREATE INDEX idx_whoop_metrics_user_date ON whoop_metrics(user_id, date DESC);

-- RLS
ALTER TABLE whoop_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own metrics" ON whoop_metrics
  FOR SELECT USING (auth.uid() = user_id);
```

### Table: `whoop_workouts`

```sql
CREATE TABLE whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_workout_id TEXT NOT NULL,
  date DATE NOT NULL,
  sport_name TEXT,
  sport_id INTEGER,
  strain FLOAT,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  kilojoule FLOAT,
  distance_meter FLOAT,
  duration_milli BIGINT,
  zone_zero_milli BIGINT,
  zone_one_milli BIGINT,
  zone_two_milli BIGINT,
  zone_three_milli BIGINT,
  zone_four_milli BIGINT,
  zone_five_milli BIGINT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, whoop_workout_id)
);

CREATE INDEX idx_whoop_workouts_user_date ON whoop_workouts(user_id, date DESC);

ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own workouts" ON whoop_workouts
  FOR SELECT USING (auth.uid() = user_id);
```

---

## API Routes

### `GET /api/whoop/auth`

Initiates the OAuth flow. Generates a random `state` parameter, stores it in an HTTP-only cookie, and redirects the user to Whoop's authorization URL.

```typescript
// app/api/whoop/auth/route.ts
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const state = uuidv4();
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.WHOOP_CLIENT_ID!,
    redirect_uri: process.env.WHOOP_REDIRECT_URI!,
    scope: 'read:recovery read:cycles read:sleep read:workout read:body_measurement',
    state,
  });

  const response = NextResponse.redirect(
    `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString()}`
  );
  
  response.cookies.set('whoop_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  return response;
}
```

### `GET /api/whoop/callback`

Handles the OAuth callback. Validates state, exchanges code for tokens, stores tokens in Supabase, redirects to settings page.

```typescript
// app/api/whoop/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const storedState = req.cookies.get('whoop_oauth_state')?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?whoop=error&reason=invalid_state`
    );
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.WHOOP_REDIRECT_URI!,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?whoop=error&reason=token_exchange_failed`
    );
  }

  const tokens = await tokenResponse.json();
  
  // Get authenticated user from Supabase session
  // (extract from cookie or auth header — depends on your auth setup)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role for insert
  );

  const userId = /* extract from Supabase auth cookie */;

  // Calculate expiry (Whoop tokens expire in 3600s typically)
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Upsert tokens
  await supabase.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt.toISOString(),
    scopes: tokens.scope?.split(' ') || [],
    disconnected_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/settings?whoop=connected`
  );
  response.cookies.delete('whoop_oauth_state');
  return response;
}
```

### `POST /api/whoop/sync`

Fetches latest Whoop data and writes to metrics table. Called on app load and before Handler prescriptions.

```typescript
// app/api/whoop/sync/route.ts

// Core logic:
// 1. Get user's tokens from whoop_tokens
// 2. If expired, refresh them (update in DB)
// 3. Fetch recovery collection (limit=1 for latest)
// 4. Fetch sleep collection (limit=1)
// 5. Fetch cycle collection (limit=1)
// 6. Fetch workout collection (limit=5, last 24h)
// 7. Fetch body measurements
// 8. Upsert into whoop_metrics (keyed on user_id + date)
// 9. Upsert workouts into whoop_workouts
// 10. Return the assembled daily snapshot

// Response shape:
interface WhoopDailySnapshot {
  date: string;
  recovery: {
    score: number;        // 0-100
    hrv: number;          // ms
    restingHR: number;    // bpm
    spo2: number;         // %
    skinTemp: number;     // °C
  } | null;
  sleep: {
    performance: number;  // 0-100%
    consistency: number;  // 0-100%
    efficiency: number;   // 0-100%
    totalSleepHours: number;
    remHours: number;
    deepSleepHours: number;
    disturbances: number;
    respiratoryRate: number;
    sleepDebtMinutes: number;
  } | null;
  strain: {
    dayStrain: number;    // 0-21
    kilojoule: number;
    avgHR: number;
    maxHR: number;
  } | null;
  workouts: Array<{
    sport: string;
    strain: number;
    durationMinutes: number;
    avgHR: number;
    maxHR: number;
    zones: Record<string, number>;
  }>;
  body: {
    weightKg: number;
  } | null;
  connected: true;
}
```

### `POST /api/whoop/disconnect`

Revokes tokens and marks connection as disconnected.

### Token Refresh Helper

```typescript
// lib/whoop.ts
async function getValidToken(userId: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('whoop_tokens')
    .select('*')
    .eq('user_id', userId)
    .is('disconnected_at', null)
    .single();

  if (!tokenRow) throw new Error('WHOOP_NOT_CONNECTED');

  // If token not expired, return it
  if (new Date(tokenRow.expires_at) > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  // Refresh
  const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      scope: 'offline',
    }),
  });

  if (!res.ok) {
    // Mark as disconnected
    await supabase.from('whoop_tokens').update({
      disconnected_at: new Date().toISOString(),
    }).eq('user_id', userId);
    throw new Error('WHOOP_TOKEN_REFRESH_FAILED');
  }

  const newTokens = await res.json();
  const expiresAt = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000);

  await supabase.from('whoop_tokens').update({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || tokenRow.refresh_token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  return newTokens.access_token;
}
```

---

## Whoop API Endpoints Used

All use base URL `https://api.prod.whoop.com/developer` with Bearer token auth.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v2/recovery` | GET | Latest recovery score, HRV, RHR, SpO2 |
| `/v2/activity/sleep` | GET | Sleep performance, stages, debt |
| `/v2/cycle` | GET | Day strain, calories, HR |
| `/v2/activity/workout` | GET | Individual workout details |
| `/v2/user/measurement/body` | GET | Weight, height, max HR |

All collection endpoints accept `limit`, `start`, `end`, and `nextToken` query params. Use `limit=1` for latest data and `limit=5` + date range for recent workouts.

---

## Handler Integration

### How Whoop Data Feeds the Prescription Engine

The Handler's system prompt context block gets a new section injected when Whoop data is available:

```typescript
// In the Handler context builder:
function buildWhoopContext(snapshot: WhoopDailySnapshot): string {
  if (!snapshot.connected) return '';
  
  const lines: string[] = ['## Biometric State (Whoop)'];
  
  if (snapshot.recovery) {
    const r = snapshot.recovery;
    const tier = r.score >= 67 ? 'GREEN' : r.score >= 34 ? 'YELLOW' : 'RED';
    lines.push(`Recovery: ${r.score}% (${tier})`);
    lines.push(`HRV: ${r.hrv.toFixed(1)}ms | RHR: ${r.restingHR}bpm | SpO2: ${r.spo2.toFixed(1)}%`);
  }
  
  if (snapshot.sleep) {
    const s = snapshot.sleep;
    lines.push(`Sleep: ${s.performance.toFixed(0)}% performance, ${s.totalSleepHours.toFixed(1)}h total`);
    lines.push(`Deep: ${s.deepSleepHours.toFixed(1)}h | REM: ${s.remHours.toFixed(1)}h | Disturbances: ${s.disturbances}`);
    if (s.sleepDebtMinutes > 30) {
      lines.push(`Sleep debt: ${s.sleepDebtMinutes}min — adjust intensity accordingly`);
    }
  }
  
  if (snapshot.strain) {
    lines.push(`Day strain: ${snapshot.strain.dayStrain.toFixed(1)} / 21`);
  }
  
  if (snapshot.workouts.length > 0) {
    lines.push(`Workouts today: ${snapshot.workouts.map(w => 
      `${w.sport} (${w.durationMinutes}min, strain ${w.strain.toFixed(1)})`
    ).join(', ')}`);
  }
  
  if (snapshot.body?.weightKg) {
    lines.push(`Weight: ${snapshot.body.weightKg.toFixed(1)}kg / ${(snapshot.body.weightKg * 2.205).toFixed(1)}lbs`);
  }
  
  return lines.join('\n');
}
```

### Handler Decision Rules (add to Handler system prompt)

```markdown
## Whoop Biometric Override Rules

When Whoop data is available, it takes precedence over self-reported energy/sleep:

### Recovery Score Mapping
- **GREEN (67-100%)**: Full intensity. All domains active. Resistance is resistance, not fatigue.
- **YELLOW (34-66%)**: Moderate intensity. Reduce physical demands by ~30%. Favor skill-based and passive tasks over exertion tasks. Voice practice is fine. Heavy workouts are not.
- **RED (0-33%)**: Light day. Passive anchors, journaling, gentle skincare. No high-effort tasks. No guilt about it. The body is recovering and that IS the protocol today.

### Override Logic
- If user reports "high energy" but recovery is RED → treat as YELLOW. They're running on cortisol. Don't let them crash.
- If user reports "depleted" but recovery is GREEN → gently challenge. Resistance may be masking as fatigue. "Your body says you're ready. What's the real resistance?"
- Sleep performance < 70% → reduce morning task load, push important tasks to afternoon.
- Sleep debt > 60min accumulated → prescribe a nap if schedule allows.
- HRV trending down over 3+ days → flag wellness concern. May correlate with Zepbound side effects, stress, or overtraining.

### Weight Tracking (Zepbound Integration)
- Track weight_kilogram over time alongside Zepbound injection schedule (Tuesdays).
- Weight data provides objective GLP-1 response monitoring.
- Do not comment on individual daily fluctuations — only week-over-week trends.
- If weight trending down: reinforce protein targets and resistance training.
- If weight stalled > 3 weeks: flag for dose titration discussion.

### Workout Verification
- Cross-reference self-reported exercise completion against Whoop workout data.
- If user marks workout complete but no Whoop workout logged → don't call them out aggressively, but note the discrepancy. "I don't see strain from that workout. Was it lighter than planned, or did you forget to log?"
```

---

## UI Components

### Settings Page — Whoop Connection Card

```
┌─────────────────────────────────────────┐
│ 📊 Whoop Integration                    │
│                                         │
│ [Not Connected]                         │
│                                         │
│ Connect your Whoop to let the Handler   │
│ see your recovery, sleep, and strain    │
│ data for smarter prescriptions.         │
│                                         │
│         [ Connect Whoop ]               │
└─────────────────────────────────────────┘

// When connected:
┌─────────────────────────────────────────┐
│ 📊 Whoop Integration                    │
│                                         │
│ ● Connected                             │
│ Last synced: 2 hours ago                │
│                                         │
│ Today's Recovery: 72% 🟢               │
│ Sleep Performance: 85%                  │
│ Day Strain: 4.2                         │
│                                         │
│   [ Sync Now ]     [ Disconnect ]       │
└─────────────────────────────────────────┘
```

### Dashboard — Biometric Pill (optional, if dashboard exists)

A small summary pill on the main dashboard showing today's recovery color and score. Tapping expands to show sleep/strain/HRV. Not critical for v1 — the Handler reads the data silently.

---

## Privacy Page

Create a minimal privacy policy page at `/privacy` (or `/api/whoop/privacy`):

```
Becoming Protocol — Privacy Policy

This application accesses your WHOOP data (recovery scores, sleep metrics, 
workout data, and body measurements) solely to personalize your experience 
within the Becoming Protocol app. 

Your data is:
- Stored securely in our database
- Never shared with third parties
- Never sold
- Deletable by disconnecting your WHOOP account in Settings

Contact: [your email]
Last updated: March 2026
```

---

## Implementation Order

1. **Vercel env vars** — Add WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI
2. **Supabase migration** — Create whoop_tokens, whoop_metrics, whoop_workouts tables with RLS
3. **Privacy page** — Simple static page at /privacy
4. **OAuth flow** — `/api/whoop/auth` and `/api/whoop/callback` routes
5. **Token refresh helper** — `lib/whoop.ts` with getValidToken
6. **Sync endpoint** — `/api/whoop/sync` that fetches all data and writes to DB
7. **Settings UI** — Connect/disconnect card showing connection status and latest metrics
8. **Handler context injection** — buildWhoopContext function, wired into prescription engine
9. **Handler system prompt update** — Add biometric override rules

---

## Acceptance Criteria

- [ ] User can click "Connect Whoop" and complete OAuth flow
- [ ] Tokens are stored securely with RLS; only service role can insert
- [ ] Token refresh works transparently; expired tokens auto-refresh
- [ ] Failed refresh marks connection as disconnected
- [ ] `/api/whoop/sync` returns complete daily snapshot
- [ ] whoop_metrics table populates with today's recovery, sleep, strain
- [ ] whoop_workouts table populates with recent workouts
- [ ] Handler system prompt includes biometric context when Whoop is connected
- [ ] Handler adjusts intensity based on recovery zone (GREEN/YELLOW/RED)
- [ ] Handler challenges false fatigue reports when recovery is GREEN
- [ ] Handler protects genuine fatigue when recovery is RED regardless of user report
- [ ] Weight tracked over time; week-over-week trends available
- [ ] Settings page shows connection status and latest metrics
- [ ] Disconnect button revokes access and clears tokens
- [ ] Privacy page exists and is accessible
- [ ] No Whoop credentials appear in client-side code
- [ ] App functions normally when Whoop is not connected (graceful degradation)
