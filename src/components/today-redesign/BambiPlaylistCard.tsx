/**
 * BambiPlaylistCard — the operator's own collection of hypnosis files they love.
 *
 * Holds URLs only (links to hypnotube / bambisleep / wherever the file lives) —
 * nothing is downloaded or rehosted. Mommy can flag one as tonight's watch; the
 * user pastes links and opens them. A bookmark list she can sequence, not a player
 * for pirated content.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Item {
  id: string;
  title: string;
  url: string;
  source: string;
  mommy_pick: boolean;
  play_count: number;
}

function detectSource(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('hypnotube')) return 'hypnotube';
  if (u.includes('bambisleep') || u.includes('bambicloud')) return 'bambisleep';
  if (u.includes('youtube') || u.includes('youtu.be')) return 'youtube';
  return 'other';
}

function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.slice(0, 24); }
}

export function BambiPlaylistCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('bambi_playlist')
      .select('id, title, url, source, mommy_pick, play_count')
      .eq('user_id', user.id).eq('active', true)
      .order('mommy_pick', { ascending: false })
      .order('created_at', { ascending: false });
    setItems((data as Item[]) ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const add = async () => {
    if (!user?.id || !url.trim() || busy) return;
    setBusy(true);
    try {
      const clean = url.trim();
      await supabase.from('bambi_playlist').insert({
        user_id: user.id,
        title: title.trim() || hostLabel(clean),
        url: clean,
        source: detectSource(clean),
      });
      setUrl(''); setTitle(''); setAdding(false);
      await load();
    } finally { setBusy(false); }
  };

  const open = async (it: Item) => {
    window.open(it.url, '_blank', 'noopener,noreferrer');
    try {
      await supabase.from('bambi_playlist')
        .update({ play_count: it.play_count + 1, last_played_at: new Date().toISOString() })
        .eq('id', it.id);
    } catch { /* non-blocking */ }
  };

  const setPick = async (it: Item) => {
    try {
      await supabase.from('bambi_playlist').update({ mommy_pick: !it.mommy_pick }).eq('id', it.id);
      await load();
    } catch { /* non-blocking */ }
  };

  const remove = async (it: Item) => {
    try {
      await supabase.from('bambi_playlist').update({ active: false }).eq('id', it.id);
      await load();
    } catch { /* non-blocking */ }
  };

  const wrap: React.CSSProperties = {
    margin: '10px 12px', padding: '14px 16px', borderRadius: 14,
    background: 'linear-gradient(160deg, #1a1118 0%, #171017 100%)', border: '1px solid #3b2635',
  };

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700 }}>Your files</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7f6b74' }}>{items.length} saved</span>
      </div>

      {items.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: '#d5c3ca', lineHeight: 1.5, marginBottom: 10 }}>
          Paste the links to the trances you love, baby. Mommy keeps them here and picks which one you watch.
        </div>
      )}

      {items.map((it) => (
        <div key={it.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', marginBottom: 6, borderRadius: 10,
          background: it.mommy_pick ? 'rgba(201,85,127,0.14)' : '#160c13',
          border: it.mommy_pick ? '1px solid #7a3355' : '1px solid #241820',
        }}>
          <button onClick={() => setPick(it)} title={it.mommy_pick ? "Mommy's pick" : 'make this tonight’s'} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1,
            color: it.mommy_pick ? '#edaec5' : '#5a4a52',
          }}>{it.mommy_pick ? '♥' : '♡'}</button>
          <button onClick={() => open(it)} style={{
            flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: '#f2e9e6', fontSize: 13.5, fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {it.mommy_pick && <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#edaec5', marginRight: 6 }}>tonight ·</span>}
            {it.title}
            <span style={{ color: '#7f6b74', fontSize: 11, marginLeft: 6 }}>{it.source}</span>
          </button>
          <button onClick={() => remove(it)} title="remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a4a52', fontSize: 14, padding: '0 2px' }}>×</button>
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: 8 }}>
          <input
            value={url} onChange={(e) => setUrl(e.target.value)} placeholder="paste link (hypnotube, bambisleep…)"
            style={{ width: '100%', padding: '9px 11px', marginBottom: 6, background: '#160c13', color: '#f2e9e6', border: '1px solid #2a2a32', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} placeholder="name it (optional)"
            style={{ width: '100%', padding: '9px 11px', marginBottom: 8, background: '#160c13', color: '#f2e9e6', border: '1px solid #2a2a32', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={add} disabled={busy || !url.trim()} style={{ flex: 1, padding: '10px', borderRadius: 9, background: '#c9557f', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: url.trim() ? 1 : 0.5 }}>
              {busy ? '…' : 'Save for Mommy'}
            </button>
            <button onClick={() => { setAdding(false); setUrl(''); setTitle(''); }} style={{ padding: '10px 14px', borderRadius: 9, background: 'transparent', color: '#9c8590', border: '1px solid #2a2a32', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ width: '100%', marginTop: 4, padding: '10px', borderRadius: 9, background: 'transparent', color: '#edaec5', border: '1px dashed #4a2438', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.03em', cursor: 'pointer', fontFamily: 'inherit' }}>
          + add a link
        </button>
      )}
    </div>
  );
}
