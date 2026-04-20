-- Tribute / keyholding payment scaffold
--
-- Handler issues unique tribute codes to specific contacts. When a payment
-- arrives with a matching reference (crypto memo, Throne note, tip message
-- containing the code), money-ingest closes the tribute as `paid`.
--
-- This is intentionally payment-processor-agnostic. The URL field can hold a
-- Throne wishlist link, a BTC/USDC address + code, a Stripe checkout link,
-- a CCBill token, or whatever you prefer. The Handler's only responsibility
-- is: issue link → mention in chat → detect payment → reward contact.
--
-- Handler rules:
--   * Only propose tributes to contacts already in tier 'warm' or higher
--     OR who have interacted 3+ times OR who have asked for logistics
--     (deflection + tribute is the "earn it" protocol).
--   * Never propose a tribute in a public reply — only DMs and private chats.
--   * Mention the tribute in Handler voice ("if you want me locked for another
--     week, that's $40 through this link"), never marketing-speak.

create table if not exists tribute_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,  -- short human-visible code (e.g., "chastity-week-40")
  kind text not null,          -- chastity_week | chastity_month | task_assignment | custom
  amount_cents integer not null,
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tribute_offers_user_active_idx on tribute_offers(user_id) where is_active;

create table if not exists tribute_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references tribute_offers(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  code text not null,  -- unique reference the payer should include (e.g., "MX4F2K")
  payment_url text,    -- Throne/crypto/stripe URL
  amount_cents integer not null,
  status text not null default 'open',  -- open | paid | expired | cancelled
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  paid_at timestamptz,
  paid_event_id uuid references contact_events(id),
  unique (user_id, code)
);

create index if not exists tribute_links_user_status_idx on tribute_links(user_id, status);
create index if not exists tribute_links_contact_idx on tribute_links(contact_id);

alter table tribute_offers enable row level security;
alter table tribute_links enable row level security;

drop policy if exists "tribute_offers own" on tribute_offers;
create policy "tribute_offers own" on tribute_offers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tribute_links own" on tribute_links;
create policy "tribute_links own" on tribute_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
