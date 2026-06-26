// push-vapid-check — diagnostic. Returns the server's VAPID PUBLIC key (safe to
// expose — it's shipped to every client and sent to push services) plus its
// decoded byte length, so we can confirm the client's VITE_VAPID_PUBLIC_KEY
// (Vercel) matches the private key the dispatcher signs with.
//
// Context (2026-06-24): push_subscriptions = 0; the MamaPhoneOverlay tap fails
// with push_service_error ("hiccuped, tap once more"), which is what
// pushManager.subscribe() throws when applicationServerKey isn't a valid 65-byte
// uncompressed P-256 key. The client decoder (urlBase64ToUint8Array) only
// validates 40–100 chars, so a wrong VITE_VAPID_PUBLIC_KEY slips through and
// loops. This endpoint surfaces the correct public key + length to fix Vercel.
//
// Service-role gated. No private material is returned (only a boolean present).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function b64uLen(b64u: string): number {
  const cleaned = b64u.trim().replace(/^['"`]|['"`]$/g, '').trim()
  if (!cleaned) return 0
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4)
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/')
  try { return atob(base64).length } catch { return -1 }
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const priv = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT') ?? ''

  const pubLen = b64uLen(pub)
  const privLen = b64uLen(priv)

  return new Response(JSON.stringify({
    ok: true,
    vapid_public_key: pub,                 // safe: public by design
    vapid_public_key_bytes: pubLen,        // must be 65 (uncompressed P-256)
    vapid_public_key_valid: pubLen === 65,
    vapid_private_key_present: priv.length > 0,
    vapid_private_key_bytes: privLen,      // should be 32
    vapid_subject: subject,
    note: 'Set Vercel VITE_VAPID_PUBLIC_KEY to vapid_public_key EXACTLY, then redeploy the frontend.',
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
