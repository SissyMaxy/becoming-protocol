// sponsor-page — public-facing tribute capture for feminization milestones.
//
// GET  ?token=<uuid> → HTML page with target details + tribute form
// POST { token, tribute_amount, sub_handle, message, payment_method }
//      → records target_tributes row (status='pending')
//
// Public, unauthenticated. Each target has its own shareable URL based
// on public_share_token. Ratelimit by IP hash to make spam costly.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const buf = new TextEncoder().encode(ip + Deno.env.get('SUPABASE_URL'))
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) {
      return new Response('missing token', { status: 400, headers: corsHeaders })
    }

    const supaUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supaUrl, supaKey)

    const { data: target } = await supabase.from('feminization_budget_targets')
      .select('id, user_id, label, monthly_cents, one_time_cents, funded_cents, public_blurb, active')
      .eq('public_share_token', token)
      .maybeSingle()
    if (!target || !(target as { active: boolean }).active) {
      return new Response('target not found', { status: 404, headers: corsHeaders })
    }
    const t = target as { id: string; user_id: string; label: string; monthly_cents: number; one_time_cents: number; funded_cents: number; public_blurb: string | null }
    const need = (t.monthly_cents || 0) + (t.one_time_cents || 0)
    const fundedPct = need > 0 ? Math.min(100, Math.round((t.funded_cents / need) * 100)) : 0
    const cadence = t.monthly_cents > 0 ? '/month recurring' : 'one-time'

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const tributeCents = Math.round(parseFloat(body.tribute_amount || '0') * 100)
      if (tributeCents <= 0) {
        return new Response(JSON.stringify({ error: 'tribute amount required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ipH = await ipHash(req)
      // Cheap rate limit: max 5 pending per IP hash per hour
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
      const { count: rate } = await supabase.from('target_tributes')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipH).gte('created_at', oneHourAgo)
      if ((rate || 0) >= 5) {
        return new Response(JSON.stringify({ error: 'rate limit — try later' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: row } = await supabase.from('target_tributes').insert({
        target_id: t.id,
        user_id: t.user_id,
        tribute_cents: tributeCents,
        sub_handle: (body.sub_handle as string)?.slice(0, 100) || null,
        sub_message: (body.message as string)?.slice(0, 1000) || null,
        payment_method: (body.payment_method as string)?.slice(0, 50) || null,
        ip_hash: ipH,
      }).select('id').single()

      // Notify Maxy via outreach
      await supabase.from('handler_outreach_queue').insert({
        user_id: t.user_id,
        message: `New sponsor tribute pledged: $${(tributeCents / 100).toFixed(2)} toward ${t.label}${body.sub_handle ? ` from "${(body.sub_handle as string).slice(0, 50)}"` : ''}. Mark paid in your sponsor card when payment lands.`,
        urgency: 'high',
        trigger_reason: 'sponsor_tribute_pledged',
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        source: 'sponsor_page',
      })

      return new Response(JSON.stringify({ ok: true, tribute_id: (row as { id: string } | null)?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GET → serve HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>sponsor: ${escapeHtml(t.label)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0d; color: #e8e6e3; font-family: -apple-system, system-ui, sans-serif; min-height: 100vh; padding: 20px; line-height: 1.5; }
  .wrap { max-width: 480px; margin: 40px auto; }
  .card { background: linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%); border: 1px solid #5a3a8a; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #c4b5fd; font-weight: 700; margin-bottom: 8px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; letter-spacing: -0.01em; color: #fff; }
  .cadence { font-size: 12px; color: #8a8690; margin-bottom: 16px; }
  .progress { height: 8px; background: #1a1a20; border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
  .bar { height: 100%; background: linear-gradient(90deg, #7c3aed, #c4b5fd); width: ${fundedPct}%; transition: width 0.4s; }
  .stats { font-size: 12px; color: #c8c4cc; margin-bottom: 16px; font-variant-numeric: tabular-nums; }
  .blurb { font-size: 14px; color: #e8e6e3; font-style: italic; padding: 12px; background: #0a0a0d; border-left: 3px solid #c4b5fd; border-radius: 4px; margin-top: 12px; line-height: 1.5; }
  form { display: flex; flex-direction: column; gap: 10px; }
  input, textarea, select { background: #050507; border: 1px solid #2d1a4d; border-radius: 6px; padding: 10px 12px; font-size: 14px; color: #e8e6e3; font-family: inherit; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: #c4b5fd; }
  textarea { min-height: 70px; resize: vertical; }
  button { background: #7c3aed; color: #fff; border: none; border-radius: 6px; padding: 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; font-family: inherit; }
  button:hover { background: #8b4cf2; }
  button:disabled { background: #2d1a4d; color: #5a5560; cursor: not-allowed; }
  .h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #c4b5fd; font-weight: 700; margin-bottom: 10px; }
  .small { font-size: 11px; color: #8a8690; line-height: 1.4; }
  .success { background: linear-gradient(135deg, #0a1a14, #061008); border-color: #5fc88f; }
  .success .label { color: #5fc88f; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="label">Transition milestone</div>
    <h1>${escapeHtml(t.label)}</h1>
    <div class="cadence">${cadence} · $${(need / 100).toFixed(2)} target</div>
    <div class="progress"><div class="bar"></div></div>
    <div class="stats">$${(t.funded_cents / 100).toFixed(2)} of $${(need / 100).toFixed(2)} funded · ${fundedPct}%</div>
    ${t.public_blurb ? `<div class="blurb">${escapeHtml(t.public_blurb)}</div>` : ''}
  </div>

  <div class="card" id="form-card">
    <div class="h2">Pledge a tribute</div>
    <form id="tribute-form">
      <input name="tribute_amount" type="number" min="1" step="0.01" placeholder="$ amount" required />
      <input name="sub_handle" type="text" placeholder="your handle (optional)" maxlength="100" />
      <select name="payment_method" required>
        <option value="">how will you pay?</option>
        <option value="cashapp">Cash App</option>
        <option value="venmo">Venmo</option>
        <option value="paypal_friends">PayPal F&amp;F</option>
        <option value="fansly">Fansly tip</option>
        <option value="crypto">Crypto (BTC/ETH/USDC)</option>
        <option value="other">Other (specify in message)</option>
      </select>
      <textarea name="message" placeholder="optional note — task suggestion, payment handle, anything to identify your payment" maxlength="1000"></textarea>
      <button type="submit">Pledge tribute</button>
    </form>
    <div class="small" style="margin-top: 14px;">
      Pledging records your intent. Once payment lands, the milestone fund increases. The creator manually verifies and marks paid. Spam pledges without payment will be deleted.
    </div>
  </div>
</div>

<script>
const form = document.getElementById('tribute-form');
const card = document.getElementById('form-card');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'submitting…';
  const data = Object.fromEntries(new FormData(form));
  data.token = '${token}';
  try {
    const res = await fetch(window.location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      btn.disabled = false;
      btn.textContent = 'Try again';
      alert(err.error || 'submission failed');
      return;
    }
    card.classList.add('success');
    card.innerHTML = '<div class="label">Pledge recorded</div><h1>Thank you.</h1><div class="cadence">Your tribute is in the queue. Send the payment via your selected method — once verified, the fund increases visibly. Refresh in a few minutes to see the bar move.</div>';
  } catch {
    btn.disabled = false;
    btn.textContent = 'Try again';
    alert('network error');
  }
});
</script>
</body>
</html>`

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
