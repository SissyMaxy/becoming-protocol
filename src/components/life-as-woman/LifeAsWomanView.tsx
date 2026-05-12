/**
 * LifeAsWomanView — single MenuSubView hosting all four "life as a woman"
 * systems plus the OOC settings panel.
 *
 * Sections, top-to-bottom:
 *   1. Settings (out-of-fantasy)
 *   2. Sniffies pending drafts
 *   3. Today's trance session
 *   4. Recent gooning sessions
 *   5. Today's content prompt + pending editorial notes
 *
 * Each section quietly hides itself if the related system is disabled.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { LifeAsWomanSettings } from './LifeAsWomanSettings'
import { SniffiesDraftCard } from './SniffiesDraftCard'
import { TranceSessionCard } from './TranceSessionCard'
import { GooningSessionCard } from './GooningSessionCard'
import { EditorialNoteCard } from './EditorialNoteCard'
import { ContentPromptCard } from './ContentPromptCard'
import type {
  LifeAsWomanSettings as Settings,
  SniffiesDraft, HypnoTranceSession, GooningSession,
  MommyEditorialNote, MommyContentPrompt, SniffiesContact,
} from '../../lib/life-as-woman/types'
import {
  loadSettings,
  loadPendingSniffiesDrafts, loadTodayTranceSession,
  loadRecentGooningSessions, loadPendingEditorialNotes, loadTodayContentPrompt,
} from '../../lib/life-as-woman/client'
import { supabase } from '../../lib/supabase'

interface Props {
  onBack: () => void
}

export function LifeAsWomanView({ onBack }: Props) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [settings, setSettings] = useState<Settings | null>(null)
  const [drafts, setDrafts] = useState<SniffiesDraft[]>([])
  const [contacts, setContacts] = useState<Record<string, SniffiesContact>>({})
  const [trance, setTrance] = useState<HypnoTranceSession | null>(null)
  const [gooning, setGooning] = useState<GooningSession[]>([])
  const [editorial, setEditorial] = useState<MommyEditorialNote[]>([])
  const [prompt, setPrompt] = useState<MommyContentPrompt | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) return
    const [s, d, t, g, e, p] = await Promise.all([
      loadSettings(userId),
      loadPendingSniffiesDrafts(userId),
      loadTodayTranceSession(userId),
      loadRecentGooningSessions(userId),
      loadPendingEditorialNotes(userId),
      loadTodayContentPrompt(userId),
    ])
    setSettings(s)
    setDrafts(d)
    setTrance(t)
    setGooning(g)
    setEditorial(e)
    setPrompt(p)

    // contacts for sniffies draft cards
    const contactIds = Array.from(new Set(d.map(x => x.contact_id).filter(Boolean) as string[]))
    if (contactIds.length > 0) {
      const { data } = await supabase
        .from('sniffies_contacts')
        .select('id, user_id, display_name, kinks_mentioned, outcomes, excluded_from_persona, last_seen_at')
        .in('id', contactIds)
      const map: Record<string, SniffiesContact> = {}
      for (const c of ((data || []) as SniffiesContact[])) map[c.id] = c
      setContacts(map)
    }
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  if (!userId) {
    return <div style={{ color: '#888', padding: 24 }}>Sign in.</div>
  }

  const masterOn = !!settings?.master_enabled
  const sniffiesOn = masterOn && !!settings?.sniffies_outbound_enabled
  const tranceOn   = masterOn && !!settings?.hypno_trance_enabled
  const gooningOn  = masterOn && !!settings?.gooning_enabled
  const contentOn  = masterOn && !!settings?.content_editor_enabled

  return (
    <div style={{
      maxWidth: 760, margin: '0 auto', padding: '16px 16px 80px',
      color: '#e0e0e0', minHeight: '100dvh',
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: '#a0a0a0',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        cursor: 'pointer', marginBottom: 12, fontSize: 14,
      }}>
        <ChevronLeft size={16} /> Menu
      </button>

      <h2 style={{ marginTop: 0, color: '#f0d0e8' }}>Life as a woman</h2>

      <LifeAsWomanSettings userId={userId} onSettingsChanged={s => setSettings(s)} />

      {sniffiesOn && (
        <Section title="Sniffies — pending drafts">
          {drafts.length === 0
            ? <Empty msg="Mommy hasn't drafted anything yet. Cron drafts on her schedule." />
            : drafts.map(d => (
                <SniffiesDraftCard
                  key={d.id}
                  draft={d}
                  userId={userId}
                  contactName={d.contact_id ? contacts[d.contact_id]?.display_name : undefined}
                  onChanged={refresh}
                />
              ))
          }
        </Section>
      )}

      {tranceOn && (
        <Section title="Trance — today">
          {trance
            ? <TranceSessionCard session={trance} userId={userId} onChanged={refresh} />
            : <Empty msg="No session drafted for today yet. Mommy authors the next day's session each evening." />
          }
        </Section>
      )}

      {gooningOn && (
        <Section title="Gooning — recent">
          {gooning.length === 0
            ? <Empty msg="No sessions drafted." />
            : gooning.map(g => (
                <GooningSessionCard key={g.id} session={g} userId={userId} onChanged={refresh} />
              ))
          }
        </Section>
      )}

      {contentOn && (
        <Section title="Content — today">
          {prompt
            ? <ContentPromptCard prompt={prompt} />
            : <Empty msg="Mommy hasn't issued today's content plan yet." />
          }
          <h4 style={{ color: '#c0a060', fontSize: 14, marginTop: 16, marginBottom: 8 }}>
            Pending editorial notes
          </h4>
          {editorial.length === 0
            ? <Empty msg="No pending editorial." />
            : editorial.map(n => <EditorialNoteCard key={n.id} note={n} onChanged={refresh} />)
          }
        </Section>
      )}

      {!masterOn && (
        <div style={{ color: '#888', padding: 16, fontSize: 13 }}>
          Master switch is off. Flip the toggle above to enable the four systems.
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ color: '#d0a0c0', fontSize: 16, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ color: '#666', fontSize: 13, padding: '8px 12px' }}>{msg}</div>
}
