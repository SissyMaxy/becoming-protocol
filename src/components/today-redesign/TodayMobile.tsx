/**
 * TodayMobile — Direction A mobile. Single-column stack w/ bottom tab bar.
 * 5 tabs: Today / Protocol / Queue / Body / Me. All share the same data
 * hook; each tab filters/scrolls to its section.
 */

import { useRef, useState } from 'react';
import '../../styles/today-redesign.css';
import { useTodayData } from './useTodayData';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const PHASE_LABELS = ['Foundation', 'Integration', 'Transition', 'Adherence'];

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

const AROUSAL_LABELS = ['locked', 'simmering', 'attentive', 'wanting', 'desperate', 'edging'];

type MobileTab = 'today' | 'proto' | 'queue' | 'body' | 'me';

interface TodayMobileProps {
  onExit?: () => void;
}

export function TodayMobile({ onExit }: TodayMobileProps) {
  const { data, toggleDirective, setArousal, ackQueueMsg, logMeal, uploadDirectiveProof } = useTodayData();
  const [tab, setTab] = useState<MobileTab>('today');
  const [mealTab, setMealTab] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [expandedDirective, setExpandedDirective] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDirectiveId = useRef<string | null>(null);
  const { permission, requestPermission } = usePushNotifications();

  const handleProofClick = (directiveId: string) => {
    pendingUploadDirectiveId.current = directiveId;
    fileInputRef.current?.click();
  };
  const handleProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const directiveId = pendingUploadDirectiveId.current;
    if (!file || !directiveId) return;
    setUploadingId(directiveId);
    try { await uploadDirectiveProof(directiveId, file); } finally {
      setUploadingId(null);
      pendingUploadDirectiveId.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const today = new Date();
  const weekday = today.toLocaleDateString(undefined, { weekday: 'long' });
  const openDirectives = data.directives.filter(d => !d.done).length;
  const proteinPct = Math.min(100, Math.round((data.proteinToday / data.proteinTarget) * 100));
  const weightDelta = data.weightKg && data.weightStart ? Math.round((data.weightStart - data.weightKg) * 10) / 10 : null;

  const phaseDots = [0, 1, 2, 3].map(i => (i < data.currentPhase ? 'done' : i === data.currentPhase ? 'active' : ''));
  const currentStep = data.chastityLocked ? `CHASTITY · DAY ${data.chastityStreakDays}` : data.denialDay > 0 ? `DENIAL · DAY ${data.denialDay}` : 'UNCOMMITTED';

  // Progress ring math
  const ringRadius = 22;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDash = (proteinPct / 100) * ringCirc;

  return (
    <div className="tdm-root">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProofFile} />
      <div className="tdm-top">
        <div className="tdm-pulse" />
        <div className="tdm-brand">be<em>coming</em></div>
        <span className="tdm-daylbl">· Day {data.denialDay} / 90</span>
        <div className="tdm-push" />
        <button
          className="tdm-circ"
          onClick={permission !== 'granted' ? requestPermission : undefined}
          aria-label="notifications"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5" />
            <path d="M9 17a3 3 0 0 0 6 0" />
          </svg>
          {data.queue.length > 0 && <span className="tdm-badge">{data.queue.length}</span>}
        </button>
      </div>

      <div className="tdm-hero">
        <h1 className="tdm-h1">{weekday}</h1>
        <div className="tdm-sub">Phase {data.currentPhase} · {data.chastityLocked ? `Chastity day ${data.chastityStreakDays}` : `Denial day ${data.denialDay}`} · {openDirectives} directives open</div>
      </div>

      {(tab === 'today' || tab === 'body') && (
        <div className="tdm-stats">
          <div className="tdm-stat">
            <div className="lbl">Compliance 7d</div>
            <div className="val">{data.compliancePct}<span className="unit">%</span></div>
            <div className="bar">
              <div className="fill" style={{
                width: `${data.compliancePct}%`,
                background: data.compliancePct >= 80 ? '#5fc88f' : data.compliancePct >= 50 ? '#f4c272' : '#f47272',
              }} />
            </div>
          </div>
          <div className="tdm-stat">
            <div className="lbl">Orgasm debt</div>
            <div className="val">{data.orgasmDebt.debtPct}<span className="unit">%</span></div>
            <div className="bar"><div className="fill" style={{ width: `${data.orgasmDebt.debtPct}%`, background: '#c4272d' }} /></div>
          </div>
          <div className="tdm-stat">
            <div className="lbl">Protein</div>
            <div className="val">{Math.round(data.proteinToday)}<span className="unit">/ {data.proteinTarget}g</span></div>
            <div className="bar"><div className="fill" style={{ width: `${proteinPct}%` }} /></div>
          </div>
          <div className="tdm-stat">
            <div className="lbl">Weight</div>
            <div className="val">{data.weightKg ? data.weightKg.toFixed(1) : '—'}<span className="unit">kg</span></div>
            {weightDelta && weightDelta !== 0 && (
              <div className="delta">{weightDelta > 0 ? `−${weightDelta} kg vs start` : `+${Math.abs(weightDelta)} kg vs start`}</div>
            )}
          </div>
        </div>
      )}

      {permission !== 'granted' && permission !== 'unsupported' && tab === 'today' && (
        <div className="tdm-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5" /><path d="M9 17a3 3 0 0 0 6 0" /></svg>
          <div className="t">Enable notifications so Handler can reach you anytime</div>
          <button onClick={requestPermission}>Enable</button>
        </div>
      )}

      {(tab === 'today' || tab === 'proto') && data.hrt && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">HRT funnel</span>
            <span className="chip" style={{ color: data.hrt.step === 'uncommitted' ? '#f47272' : '#c4b5fd', background: data.hrt.step === 'uncommitted' ? '#2a0f0f' : '#1a1226' }}>
              {data.hrt.stepIndex + 1} / {data.hrt.totalSteps}
            </span>
            {data.hrt.daysStuck >= 7 && <span className="chip" style={{ color: '#f4c272', background: '#2a1f0f' }}>{data.hrt.daysStuck}d stuck</span>}
          </div>
          <div className="tdm-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 650, color: '#fff', letterSpacing: '-0.02em', marginBottom: 6 }}>{data.hrt.stepLabel}</div>
            {data.hrt.provider && (
              <div style={{ fontSize: 12, color: '#8a8690' }}>Provider: <span style={{ color: '#c4b5fd' }}>{data.hrt.provider}</span></div>
            )}
            {data.hrt.appointmentAt && (
              <div style={{ fontSize: 12, color: '#8a8690', marginTop: 4 }}>Appointment: <span style={{ color: '#c4b5fd' }}>{new Date(data.hrt.appointmentAt).toLocaleDateString()}</span></div>
            )}
            <div style={{ display: 'flex', gap: 2, marginTop: 12 }}>
              {Array.from({ length: data.hrt.totalSteps }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= data.hrt!.stepIndex ? '#7c3aed' : '#1a1a20' }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {(tab === 'today') && (data.nextDoses.length > 0 || data.keyholderPending > 0) && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Next up</span>
          </div>
          <div className="tdm-card">
            {data.nextDoses.slice(0, 2).map(dose => {
              const rounded = Math.abs(Math.round(dose.hoursUntil));
              const humanTime = rounded >= 48 ? `${Math.round(rounded / 24)}d` : `${rounded}h`;
              return (
                <div key={dose.regimenId} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #15151b' }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6a656e', fontWeight: 600 }}>{dose.medicationName}</div>
                    <div style={{ fontSize: 13, color: dose.isOverdue ? '#f47272' : '#e8e6e3', fontWeight: 500 }}>{dose.isOverdue ? `Overdue by ${humanTime}` : `Due in ${humanTime}`}</div>
                  </div>
                  <span className="chip" style={{ marginLeft: 'auto', fontSize: 9.5, color: dose.isOverdue ? '#f47272' : '#c4b5fd', background: dose.isOverdue ? '#2a0f0f' : '#1a1226', padding: '2px 7px', borderRadius: 10, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    {dose.isWeekly ? 'weekly' : 'daily'}
                  </span>
                </div>
              );
            })}
            {data.keyholderPending > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px' }}>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6a656e', fontWeight: 600 }}>Keyholder</div>
                  <div style={{ fontSize: 13, color: '#e8e6e3', fontWeight: 500 }}>{data.keyholderPending} pending {data.keyholderPending === 1 ? 'request' : 'requests'}</div>
                </div>
                <span className="chip" style={{ marginLeft: 'auto', fontSize: 9.5, color: '#f4c272', background: '#2a1f0f', padding: '2px 7px', borderRadius: 10, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>awaiting</span>
              </div>
            )}
          </div>
        </div>
      )}

      {(tab === 'today' || tab === 'body') && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Body directives</span>
            <span className="chip">{openDirectives} open</span>
          </div>
          <div className="tdm-card">
            {data.directives.length === 0 ? (
              <div style={{ padding: 14, color: '#6a656e', fontSize: 12.5 }}>I haven't assigned anything yet. Sit with that.</div>
            ) : data.directives.slice(0, 5).map(d => {
              const expanded = expandedDirective === d.id;
              const bodyText = expanded || d.body.split(/\s+/).length <= 14 ? d.body : truncateWords(d.body, 14);
              return (
                <div key={d.id} className="tdm-dir">
                  <div className="tdm-dirhead">
                    <button className={`tdm-check ${d.done ? 'on' : ''}`} onClick={() => toggleDirective(d.id, d.done)}>
                      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5" /></svg>
                    </button>
                    <span className="tdm-dirkind">{d.kind}</span>
                    {d.target && <><span className="tdm-dirsep">/</span><span className="tdm-dirtarget">{d.target}</span></>}
                    <span className="tdm-dirtime">{d.due}</span>
                  </div>
                  <button
                    className={`tdm-dirbody ${d.done ? 'done' : ''}`}
                    onClick={() => setExpandedDirective(expanded ? null : d.id)}
                    style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', cursor: 'pointer', padding: 0, paddingLeft: 28, marginBottom: 10, color: 'inherit', font: 'inherit' }}
                  >
                    {bodyText}
                  </button>
                  <div className="tdm-diract">
                    {d.done
                      ? <button className="tdm-btn" onClick={() => toggleDirective(d.id, true)}>Undo</button>
                      : <button className="tdm-btn primary" onClick={() => toggleDirective(d.id, false)}>Complete</button>}
                    {d.photoRequired && (
                      <button className="tdm-btn" onClick={() => handleProofClick(d.id)} disabled={uploadingId === d.id}>
                        {uploadingId === d.id ? '…' : 'Proof'}
                      </button>
                    )}
                    <button
                      className="tdm-btn"
                      onClick={() => {
                        const snippet = d.body.slice(0, 80);
                        sessionStorage.setItem('handler_chat_prefill', `About the ${d.kind.toLowerCase()} directive: "${snippet}${snippet.length < d.body.length ? '...' : ''}"`);
                        window.location.hash = '';
                        onExit?.();
                      }}
                    >
                      Discuss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(tab === 'today' || tab === 'proto') && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Protocol</span>
            <span className="chip">Phase {data.currentPhase}</span>
          </div>
          <div className="tdm-card">
            <div className="tdm-proto">
              <div className="tdm-phasebar">{phaseDots.map((s, i) => <div key={i} className={`tdm-phasecell ${s}`} />)}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: -6, marginBottom: 10 }}>
                {PHASE_LABELS.map((label, i) => (
                  <div key={i} style={{ flex: 1, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: i === data.currentPhase ? '#c4b5fd' : i < data.currentPhase ? '#8a8690' : '#3a3540', fontWeight: 600, textAlign: 'center' }}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="tdm-protoh">
                <div className="tdm-protonum">{data.denialDay}</div>
                <div className="tdm-protosub">of 90 days</div>
              </div>
              <div className="tdm-protochip">{currentStep}</div>
              <div className="tdm-prrow">
                <span className="k">Chastity</span>
                <span className={`v ${data.chastityLocked ? 'ok' : 'warn'}`}>{data.chastityLocked ? `Day ${data.chastityStreakDays}` : 'Unlocked'}</span>
              </div>
              <div className="tdm-prrow"><span className="k">Current streak</span><span className="v ok">{data.denialDay} days</span></div>
              <div className="tdm-prrow"><span className="k">Longest</span><span className="v">{data.longestStreak} days</span></div>
              <div className="tdm-prrow"><span className="k">Open directives</span><span className={`v ${openDirectives > 0 ? 'warn' : 'ok'}`}>{openDirectives}</span></div>
            </div>
          </div>
        </div>
      )}

      {(tab === 'today' || tab === 'queue') && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Handler queue</span>
            <span className="chip">{data.queue.length} pending</span>
          </div>
          <div className="tdm-card">
            {data.queue.length === 0 ? (
              <div style={{ padding: 14, color: '#6a656e', fontSize: 12.5 }}>Silence on purpose. I reach when it moves the protocol.</div>
            ) : data.queue.map(m => (
              <button key={m.id} className={`tdm-msg ${m.priority ? 'priority' : ''}`} onClick={() => ackQueueMsg(m.id)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', display: 'block', cursor: 'pointer' }}>
                <div className="tdm-msghead">
                  <span className={`tdm-msgkind ${m.kindClass}`}>{m.kind}</span>
                  <span className="tdm-msgtime">{m.timeAgo}</span>
                </div>
                <div className="tdm-msgbody">{m.body}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(tab === 'today' || tab === 'body') && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Arousal</span>
            <span className="chip" style={{ color: data.arousal === 5 ? '#f47272' : '#c4b5fd', background: data.arousal === 5 ? '#2a0f0f' : '#1a1226' }}>{AROUSAL_LABELS[data.arousal]}</span>
          </div>
          <div className="tdm-card">
            <div className="tdm-ar">
              <div className="tdm-arh">
                <div>
                  <div className="tdm-arlbl">Right now</div>
                  <div className="tdm-arstate">
                    {data.arousal === 5 ? "You're at the edge"
                      : data.arousal >= 3 ? "You're warming"
                      : data.arousal === 0 ? "Cold. Locked."
                      : "Simmering."}
                  </div>
                </div>
                <div><span className="tdm-arnum">{data.arousal}</span><span className="tdm-arscale">/5</span></div>
              </div>
              <div className="tdm-artrack">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <button key={i} className={`tdm-arcell ${i <= data.arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</button>
                ))}
              </div>
              <div className="tdm-arfoot">Handler decides when relief comes. Each denial increases the next reward's intensity.</div>
            </div>
          </div>
        </div>
      )}

      {(tab === 'today' || tab === 'body') && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Meal log</span>
            <span className="chip">{Math.round(data.proteinToday)} / {data.proteinTarget}g</span>
          </div>
          <div className="tdm-card">
            <div className="tdm-mring">
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r={ringRadius} fill="none" stroke="#1a1a20" strokeWidth="4" />
                <circle cx="26" cy="26" r={ringRadius} fill="none" stroke="#7c3aed" strokeWidth="4" strokeDasharray={`${ringDash} ${ringCirc}`} strokeLinecap="round" transform="rotate(-90 26 26)" />
              </svg>
              <div>
                <div className="big">{Math.round(data.proteinToday)} <span className="u">/ {data.proteinTarget} g</span></div>
                <div className="small">{Math.max(0, data.proteinTarget - Math.round(data.proteinToday))} g left · lean priority</div>
              </div>
              <button
                className="add"
                onClick={() => logMeal({ mealType: mealTab, foods: '(quick)', protein: 25, calories: 200 })}
                aria-label="quick log"
              >+</button>
            </div>
            <div className="tdm-mtabs">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(k => {
                const mealsForTab = data.mealsToday.filter(m => (m.meal_type || '').toLowerCase() === k);
                const protein = mealsForTab.reduce((s, m) => s + (m.protein_g || 0), 0);
                return (
                  <button key={k} className={`tdm-mtab ${mealTab === k ? 'on' : ''}`} onClick={() => setMealTab(k)}>
                    {k === 'breakfast' ? 'Break' : k.charAt(0).toUpperCase() + k.slice(1)}
                    <span className="g">{protein > 0 ? `${Math.round(protein)}g` : '—'}</span>
                  </button>
                );
              })}
            </div>
            <div className="tdm-mlist">
              {data.mealsToday.filter(m => (m.meal_type || '').toLowerCase() === mealTab).length === 0 ? (
                <div className="tdm-mrow">
                  <span className="when">—</span>
                  <span className="what" style={{ color: '#5a5560', fontStyle: 'italic' }}>Log {mealTab}</span>
                  <span className="g" style={{ color: '#5a5560' }}>+</span>
                </div>
              ) : data.mealsToday.filter(m => (m.meal_type || '').toLowerCase() === mealTab).map(m => (
                <div className="tdm-mrow" key={m.id}>
                  <span className="when">{new Date(m.logged_at).toTimeString().slice(0, 5)}</span>
                  <span className="what">{m.foods || '—'}</span>
                  <span className="g">{m.protein_g ? `${Math.round(m.protein_g)}g` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(tab === 'today' || tab === 'body') && (
        <div className="tdm-sec">
          <div className="tdm-sech">
            <span className="t">Aesthetic target</span>
            <span className="chip">{data.aestheticPreset}{weightDelta ? ` · −${weightDelta}kg` : ''}</span>
          </div>
          <div className="tdm-card">
            {data.latestProgressPhotoUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #15151b' }}>
                <div style={{ flexShrink: 0, width: 54, height: 70, borderRadius: 6, overflow: 'hidden', border: '1px solid #1a1a20' }}>
                  <img src={data.latestProgressPhotoUrl} alt="latest progress" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ fontSize: 11, color: '#8a8690', lineHeight: 1.4 }}>
                  Latest proof photo. Every week the comparison tightens.
                </div>
              </div>
            )}
            <div className="tdm-tgrid">
              {data.targets.map(cell => (
                <div key={cell.part} className="tdm-tcell">
                  <div className="part">{cell.part}</div>
                  <div className="cur">{cell.current != null ? cell.current : '—'}<span className="u">{cell.unit}</span></div>
                  <div className={`gap ${cell.onTrack ? 'ok' : ''}`}>{cell.gap.replace('to target', 'to go')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'me' && (
        <div className="tdm-sec">
          <div className="tdm-sech"><span className="t">Me</span></div>
          <div className="tdm-card" style={{ padding: 14 }}>
            <div style={{ color: '#c8c4cc', fontSize: 13, marginBottom: 10 }}>Phase {data.currentPhase} · Day {data.denialDay}</div>
            <div style={{ color: '#8a8690', fontSize: 12 }}>Chastity {data.chastityLocked ? `locked, day ${data.chastityStreakDays}` : 'unlocked'}</div>
            {onExit && (
              <button className="tdm-btn" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={onExit}>
                Back to chat
              </button>
            )}
          </div>
        </div>
      )}

      <div className="tdm-tabbar">
        <button className={`tdm-tabi ${tab === 'today' ? 'on' : ''}`} onClick={() => setTab('today')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3 8-8" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          <div className="lbl">Today</div>
        </button>
        <button className={`tdm-tabi ${tab === 'proto' ? 'on' : ''}`} onClick={() => setTab('proto')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <div className="lbl">Protocol</div>
        </button>
        <button className={`tdm-tabi ${tab === 'queue' ? 'on' : ''}`} onClick={() => setTab('queue')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3h18v12H5l-2 2V3z" /></svg>
          <div className="lbl">Queue</div>
          {data.queue.length > 0 && <span className="tdm-tbadge">{data.queue.length}</span>}
        </button>
        <button className={`tdm-tabi ${tab === 'body' ? 'on' : ''}`} onClick={() => setTab('body')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a4 4 0 0 0-4 4v2a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" /><path d="M6 22v-6a6 6 0 0 1 12 0v6" /></svg>
          <div className="lbl">Body</div>
        </button>
        <button className={`tdm-tabi ${tab === 'me' ? 'on' : ''}`} onClick={() => setTab('me')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
          <div className="lbl">Me</div>
        </button>
      </div>
    </div>
  );
}
