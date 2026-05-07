// web-push-dispatch — VAPID web push for scheduled_notifications + direct push.
//
// Pulls pending rows from scheduled_notifications, looks up push_subscriptions
// per user, and posts VAPID-authenticated push to each subscription endpoint
// using Web Push Protocol (RFC 8030) + aes128gcm content encoding (RFC 8291).
//
// Env required in Supabase secrets:
//   VAPID_PUBLIC_KEY   — base64url, 65 bytes (uncompressed P-256)
//   VAPID_PRIVATE_KEY  — base64url, 32 bytes
//   VAPID_SUBJECT      — "mailto:you@example.com" or https URL
//
// Invoked by pg_cron every minute.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { neutralizePayload } from '../_shared/stealth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Base64url helpers ─────────────────────────────────────────────────────
function b64uToBuf(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}
function bufToB64u(buf: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) { out.set(a, off); off += a.length }
  return out
}

// ─── HKDF (SHA-256) ────────────────────────────────────────────────────────
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data)
  return new Uint8Array(sig)
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm)
  let t = new Uint8Array(0)
  const okm: Uint8Array[] = []
  let total = 0
  for (let i = 1; total < length; i++) {
    t = await hmacSha256(prk, concat(t, info, new Uint8Array([i])))
    okm.push(t)
    total += t.length
  }
  return concat(...okm).slice(0, length)
}

// ─── VAPID JWT (ES256) ─────────────────────────────────────────────────────
async function importVapidPrivate(d_b64u: string): Promise<CryptoKey> {
  const d = b64uToBuf(d_b64u)
  // Build a dummy JWK; importKey requires x,y but we can compute them from d.
  // Simpler: export public key from VAPID_PUBLIC_KEY instead.
  // Here: reconstruct via raw P-256 point multiplication is too much —
  // use pkcs8 import with a minimal wrapper. We build PKCS8 manually.
  // Instead we use JWK with a throw-away x,y; web crypto rejects that.
  // Workaround: derive the public key at runtime using subtle.importKey 'raw'
  // requires the public coordinates. Easier: use the uncompressed public key
  // from env to construct JWK.
  const pub = b64uToBuf(Deno.env.get('VAPID_PUBLIC_KEY') || '')
  if (pub.length !== 65) throw new Error('VAPID_PUBLIC_KEY must be 65 bytes uncompressed')
  const x = pub.slice(1, 33)
  const y = pub.slice(33, 65)
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    x: bufToB64u(x), y: bufToB64u(y), d: bufToB64u(d),
    ext: true, key_ops: ['sign'],
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

async function makeVapidJwt(audience: string, subject: string, privKey: CryptoKey): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600
  const payload = { aud: audience, exp, sub: subject }
  const encode = (o: unknown) => bufToB64u(new TextEncoder().encode(JSON.stringify(o)))
  const signingInput = `${encode(header)}.${encode(payload)}`
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privKey, new TextEncoder().encode(signingInput)
  ))
  return `${signingInput}.${bufToB64u(sig)}`
}

// ─── Payload encryption (aes128gcm) ────────────────────────────────────────
async function encryptPayload(
  payload: string,
  subscriptionP256dh: string,
  subscriptionAuth: string,
): Promise<{ body: Uint8Array; asPublic: Uint8Array }> {
  // Generate ephemeral ES256 keypair
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))  // 65 bytes uncompressed

  // Import client key
  const clientPub = b64uToBuf(subscriptionP256dh)
  const clientKey = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, as.privateKey, 256))

  const auth = b64uToBuf(subscriptionAuth)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // keyInfo = "WebPush: info" || 0x00 || client_pub || as_pub
  const keyInfo = concat(new TextEncoder().encode('WebPush: info\0'), clientPub, asPubRaw)
  const ikm = await hkdf(auth, sharedSecret, keyInfo, 32)

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const cek = await hkdf(salt, ikm, cekInfo, 16)

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0')
  const nonce = await hkdf(salt, ikm, nonceInfo, 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const plaintextBody = new TextEncoder().encode(payload)
  // Padding delimiter: 0x02 at end per RFC 8188
  const toEncrypt = concat(plaintextBody, new Uint8Array([0x02]))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, toEncrypt))

  // Header: salt(16) || rs(4, big-endian = 4096) || idlen(1) || keyid(idlen bytes: asPub)
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false)
  const idlen = new Uint8Array([asPubRaw.length])
  const header = concat(salt, rs, idlen, asPubRaw)
  const body = concat(header, ct)

  return { body, asPublic: asPubRaw }
}

// ─── Push send ─────────────────────────────────────────────────────────────
async function sendPush(
  endpoint: string, p256dh: string, auth: string,
  payload: string, vapidJwt: string, vapidPubB64u: string,
): Promise<Response> {
  const { body } = await encryptPayload(payload, p256dh, auth)
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
      'TTL': '86400',
      'Urgency': 'high',
      'Authorization': `vapid t=${vapidJwt}, k=${vapidPubB64u}`,
    },
    body,
  })
}

// ─── Orchestrator ──────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const vapidPub = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@becoming-protocol.local'
    if (!vapidPub || !vapidPriv) {
      return new Response(JSON.stringify({ ok: false, error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured' }), { status: 500 })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    // Pull pending scheduled_notifications
    const now = new Date().toISOString()
    const { data: pending } = await supabase
      .from('scheduled_notifications')
      .select('id, user_id, notification_type, payload, expires_at')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .is('sent_at', null)
      .limit(50)

    const list = (pending || []) as Array<{ id: string; user_id: string; notification_type: string; payload: Record<string, unknown>; expires_at: string | null }>
    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'no pending' }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const privKey = await importVapidPrivate(vapidPriv)

    // Group user ids so we can look up subscriptions in one query
    const userIds = Array.from(new Set(list.map(r => r.user_id)))
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
    const subsByUser = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>()
    for (const s of (subs || []) as Array<{ user_id: string; endpoint: string; p256dh: string; auth: string }>) {
      const arr = subsByUser.get(s.user_id) || []
      arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })
      subsByUser.set(s.user_id, arr)
    }

    // Pull stealth settings for affected users in one query so we know
    // which payloads to neutralize before encryption.
    const { data: stealthRows } = await supabase
      .from('user_state')
      .select('user_id, stealth_settings')
      .in('user_id', userIds)
    const stealthByUser = new Map<string, boolean>()
    for (const r of (stealthRows || []) as Array<{ user_id: string; stealth_settings: { neutral_notifications?: boolean } | null }>) {
      stealthByUser.set(r.user_id, Boolean(r.stealth_settings?.neutral_notifications))
    }

    let sent = 0
    let failed = 0
    let expired = 0
    const errors: string[] = []

    for (const row of list) {
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        await supabase.from('scheduled_notifications').update({ status: 'expired' }).eq('id', row.id)
        expired++; continue
      }
      const userSubs = subsByUser.get(row.user_id) || []
      if (userSubs.length === 0) {
        // No subscription yet — don't fail the row, just skip for now
        continue
      }
      const stealthOn = stealthByUser.get(row.user_id) === true
      const neutralized = neutralizePayload(
        {
          title: row.payload?.title as string | undefined,
          body: row.payload?.body as string | undefined,
          data: { notification_id: row.id, ...(row.payload?.data as Record<string, unknown> || {}) },
        },
        stealthOn,
      )
      // Under stealth: data is allowlist-filtered to {stealth, notification_id}.
      // Plain mode: include the full type so client routing still works.
      const data = stealthOn
        ? neutralized.data
        : { notification_id: row.id, type: row.notification_type, ...neutralized.data }
      const payload = JSON.stringify({
        title: neutralized.title,
        body: neutralized.body,
        data,
      })

      let anySuccess = false
      for (const sub of userSubs) {
        try {
          const url = new URL(sub.endpoint)
          const audience = `${url.protocol}//${url.host}`
          const jwt = await makeVapidJwt(audience, vapidSubject, privKey)
          const res = await sendPush(sub.endpoint, sub.p256dh, sub.auth, payload, jwt, vapidPub)
          if (res.ok || res.status === 201 || res.status === 202) {
            anySuccess = true
          } else if (res.status === 410 || res.status === 404) {
            // Subscription gone — delete it
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          } else {
            const txt = await res.text().catch(() => '')
            errors.push(`${res.status} ${txt.slice(0, 120)}`)
          }
        } catch (err) {
          errors.push(String(err).slice(0, 200))
        }
      }

      if (anySuccess) {
        await supabase.from('scheduled_notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id)
        sent++
      } else {
        failed++
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, expired, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
