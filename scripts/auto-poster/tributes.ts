/**
 * Tribute / keyholding payment scaffold.
 *
 * CLI + module for issuing unique tribute codes, tracking them, and closing
 * them when a matching payment arrives via money-ingest.
 *
 *   npm run tributes offers                       # list active offers
 *   npm run tributes offer-create <slug> <amt> <kind> <title>
 *   npm run tributes issue <handle> <slug> [url]  # issue a code for a contact
 *   npm run tributes list [open|paid|expired]     # list issued links
 *   npm run tributes close <code> <event_id>      # manually close as paid
 *   npm run tributes cancel <code>                # cancel an open link
 *
 * The Handler is meant to *mention* tribute URLs inside replies when context
 * warrants. Current engines do not yet automatically inject tribute offers —
 * that's the next wire-in pass. For now, issue manually and paste the URL
 * yourself, or use `getOpenTributeFor(contactId)` when writing a reply.
 */

import 'dotenv/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './config';
import { queueAttention } from './handler-attention';
import { recordEvent } from './contact-graph';

const USER_ID = process.env.USER_ID || '';

function generateCode(): string {
  // Short, uppercase, 6-char alphanumeric (no easily-confused glyphs).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// ── Library API (for use by engines) ─────────────────────────────────

export interface OpenTribute {
  code: string;
  amountCents: number;
  paymentUrl: string | null;
  offerTitle: string;
  issuedAt: string;
}

/**
 * Get the most recent open tribute for a contact, for Handler context injection.
 * Returns null if they don't have an open tribute outstanding.
 */
export async function getOpenTributeFor(
  sb: SupabaseClient,
  userId: string,
  contactId: string,
): Promise<OpenTribute | null> {
  const { data } = await sb
    .from('tribute_links')
    .select('code, amount_cents, payment_url, issued_at, tribute_offers(title)')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .eq('status', 'open')
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    code: data.code,
    amountCents: data.amount_cents,
    paymentUrl: data.payment_url,
    offerTitle: (data as any).tribute_offers?.title || '(untitled)',
    issuedAt: data.issued_at,
  };
}

/**
 * Issue a new tribute link for a contact based on an existing offer.
 */
export async function issueTribute(
  sb: SupabaseClient,
  userId: string,
  contactId: string,
  offerSlug: string,
  paymentUrl?: string,
): Promise<{ code: string; amountCents: number } | null> {
  const { data: offer } = await sb
    .from('tribute_offers')
    .select('id, amount_cents, is_active')
    .eq('user_id', userId)
    .eq('slug', offerSlug)
    .maybeSingle();
  if (!offer || !offer.is_active) return null;

  // Generate a unique code, retry on collision.
  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await sb.from('tribute_links').insert({
      user_id: userId,
      offer_id: offer.id,
      contact_id: contactId,
      code,
      amount_cents: offer.amount_cents,
      payment_url: paymentUrl || null,
    });
    if (!error) return { code, amountCents: offer.amount_cents };
    if (error.code !== '23505') throw error;
    code = generateCode();
  }
  return null;
}

/**
 * Close a tribute as paid. Called by money-ingest when a tip/sub/PPV note
 * contains a matching code.
 */
export async function closeTributePaid(
  sb: SupabaseClient,
  userId: string,
  code: string,
  paidEventId: string,
): Promise<boolean> {
  const { data: link } = await sb
    .from('tribute_links')
    .select('id, contact_id, amount_cents, offer_id')
    .eq('user_id', userId)
    .eq('code', code.toUpperCase())
    .eq('status', 'open')
    .maybeSingle();
  if (!link) return false;

  await sb.from('tribute_links').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    paid_event_id: paidEventId,
  }).eq('id', link.id);

  await queueAttention(sb, userId, {
    kind: 'tribute_paid',
    severity: 'medium',
    contactId: link.contact_id,
    summary: `Tribute ${code} paid — $${(link.amount_cents / 100).toFixed(2)}`,
    payload: { link_id: link.id, event_id: paidEventId, offer_id: link.offer_id },
  });
  return true;
}

// ── CLI ──────────────────────────────────────────────────────────────

if (require.main === module) {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }

  const [cmd, ...args] = process.argv.slice(2);

  (async () => {
    switch (cmd) {
      case 'offers': {
        const { data } = await supabase.from('tribute_offers')
          .select('*').eq('user_id', USER_ID).eq('is_active', true).order('created_at', { ascending: false });
        if (!data?.length) { console.log('(no offers)'); break; }
        for (const o of data) {
          console.log(`  ${o.slug.padEnd(25)} $${(o.amount_cents/100).toFixed(2).padStart(8)}  ${o.kind.padEnd(20)}  ${o.title}`);
        }
        break;
      }

      case 'offer-create': {
        const [slug, amt, kind, ...titleParts] = args;
        if (!slug || !amt || !kind || titleParts.length === 0) {
          console.log('Usage: tributes offer-create <slug> <amount-usd> <kind> <title>');
          break;
        }
        const cents = Math.round(parseFloat(amt) * 100);
        const { error } = await supabase.from('tribute_offers').insert({
          user_id: USER_ID,
          slug, kind,
          amount_cents: cents,
          title: titleParts.join(' '),
        });
        if (error) console.log(`Failed: ${error.message}`);
        else console.log(`Created offer ${slug} ($${(cents/100).toFixed(2)})`);
        break;
      }

      case 'issue': {
        const [handle, slug, paymentUrl] = args;
        if (!handle || !slug) {
          console.log('Usage: tributes issue <handle> <offer-slug> [payment-url]');
          break;
        }
        const needle = handle.replace(/^@/, '').toLowerCase();
        const { data: h } = await supabase.from('contact_handles')
          .select('contact_id').eq('user_id', USER_ID).ilike('handle', needle).maybeSingle();
        if (!h) { console.log('Contact not found'); break; }
        const result = await issueTribute(supabase as any, USER_ID, h.contact_id, slug, paymentUrl);
        if (!result) { console.log('Offer not found or inactive'); break; }
        console.log(`Issued tribute:  code=${result.code}  amount=$${(result.amountCents/100).toFixed(2)}`);
        if (paymentUrl) console.log(`Payment URL:  ${paymentUrl}`);
        console.log(`Tell them to include code "${result.code}" in the payment note.`);
        break;
      }

      case 'list': {
        const filter = args[0] || 'open';
        const { data } = await supabase.from('tribute_links')
          .select('code, amount_cents, status, issued_at, paid_at, contact_id, tribute_offers(slug, title), contacts(display_name)')
          .eq('user_id', USER_ID)
          .eq('status', filter)
          .order('issued_at', { ascending: false })
          .limit(50);
        if (!data?.length) { console.log('(none)'); break; }
        for (const row of data) {
          const name = (row as any).contacts?.display_name || '(unknown)';
          const title = (row as any).tribute_offers?.title || '(untitled)';
          const amt = `$${(row.amount_cents/100).toFixed(2)}`;
          const when = new Date(row.issued_at).toLocaleDateString();
          console.log(`  ${row.code}  ${amt.padStart(8)}  ${row.status.padEnd(10)}  ${name.padEnd(24)}  ${title}  (issued ${when})`);
        }
        break;
      }

      case 'close': {
        const [code, eventId] = args;
        if (!code || !eventId) { console.log('Usage: tributes close <code> <event-id>'); break; }
        const ok = await closeTributePaid(supabase as any, USER_ID, code, eventId);
        console.log(ok ? `Closed ${code}` : 'No open tribute with that code');
        break;
      }

      case 'cancel': {
        const [code] = args;
        if (!code) { console.log('Usage: tributes cancel <code>'); break; }
        const { error } = await supabase.from('tribute_links')
          .update({ status: 'cancelled' })
          .eq('user_id', USER_ID).eq('code', code.toUpperCase()).eq('status', 'open');
        console.log(error ? `Failed: ${error.message}` : `Cancelled ${code}`);
        break;
      }

      default:
        console.log('Usage:');
        console.log('  tributes offers');
        console.log('  tributes offer-create <slug> <amount-usd> <kind> <title>');
        console.log('  tributes issue <handle> <offer-slug> [payment-url]');
        console.log('  tributes list [open|paid|expired|cancelled]');
        console.log('  tributes close <code> <event-id>');
        console.log('  tributes cancel <code>');
    }
    process.exit(0);
  })();
}
