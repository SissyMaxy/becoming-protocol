/**
 * TodayDesktop — Direction A, refined dark cinematic. Fixed 180px left rail
 * + content stack: banner, page header, 4-col stat grid, 3 card rows, full-width
 * aesthetic target. All data real-time via useTodayData.
 */

import { useMemo, useState } from 'react';
import '../../styles/today-redesign.css';
import { useTodayData } from './useTodayData';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const AROUSAL_LABELS = ['locked', 'simmering', 'attentive', 'wanting', 'desperate', 'edging'];

interface TodayDesktopProps {
  onExit?: () => void;
}

export function TodayDesktop({ onExit }: TodayDesktopProps) {
  const { data, toggleDirective, setArousal, ackQueueMsg, saveDiaryResponse, logMeal } = useTodayData();
  const [mealTab, setMealTab] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [mealForm, setMealForm] = useState({ foods: '', protein: '', calories: '', permission: false, photo: false });
  const { permission, requestPermission } = usePushNotifications();

  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const openDirectives = data.directives.filter(d => !d.done).length;

  const proteinPct = Math.min(100, Math.round((data.proteinToday / data.proteinTarget) * 100));
  const weightDelta = data.weightKg && data.weightStart ? Math.round((data.weightStart - data.weightKg) * 10) / 10 : null;

  const mealsByType = useMemo(() => {
    const map: Record<string, { count: number; protein: number }> = { breakfast: { count: 0, protein: 0 }, lunch: { count: 0, protein: 0 }, dinner: { count: 0, protein: 0 }, snack: { count: 0, protein: 0 } };
    for (const m of data.mealsToday) {
      const key = (m.meal_type || 'snack').toLowerCase();
      if (map[key]) {
        map[key].count += 1;
        map[key].protein += m.protein_g || 0;
      }
    }
    return map;
  }, [data.mealsToday]);

  const submitMeal = async () => {
    const protein = parseInt(mealForm.protein, 10) || 0;
    const calories = parseInt(mealForm.calories, 10) || 0;
    if (!mealForm.foods.trim() && protein === 0 && calories === 0) return;
    await logMeal({ mealType: mealTab, foods: mealForm.foods, protein, calories });
    setMealForm({ foods: '', protein: '', calories: '', permission: false, photo: false });
  };

  const phaseDots = [0, 1, 2, 3].map(i => {
    if (i < data.currentPhase) return 'done';
    if (i === data.currentPhase) return 'active';
    return '';
  });

  const currentStep = data.chastityLocked ? `CHASTITY · DAY ${data.chastityStreakDays}` : data.denialDay > 0 ? `DENIAL · DAY ${data.denialDay}` : 'UNCOMMITTED';

  return (
    <div className="td-root">
      <aside className="td-side">
        <div className="td-brand">
          <div className="td-brandmark">b</div>
          <div className="td-brandname">becoming</div>
          <div className="td-brandrole">you</div>
        </div>
        <div className="td-navsec">Today</div>
        <button className="td-navitem on">Directives<span className="td-dot" /></button>
        <button className="td-navitem">Protocol</button>
        <button className="td-navitem">Meal log</button>
        <div className="td-navsec">Connection</div>
        <button className="td-navitem">
          Queue
          {data.queue.length > 0 && <span className="td-navbadge">{data.queue.length}</span>}
        </button>
        <button className="td-navitem">Requests</button>
        <button className="td-navitem">Reflections</button>
        <div className="td-navsec">Measures</div>
        <button className="td-navitem">Body</button>
        <button className="td-navitem">Arousal</button>
        <button className="td-navitem">Medication</button>
        {onExit && (
          <button onClick={onExit} className="td-navitem" style={{ marginTop: 12, color: '#f47272' }}>
            Back to chat
          </button>
        )}
        <div className="td-sidefoot">
          <div className="td-sidefoot-avatar" />
          <div>
            <div className="td-sidefoot-line1">me</div>
            <div>Phase {data.currentPhase} · Day {data.denialDay}</div>
          </div>
        </div>
      </aside>

      <main className="td-main">
        {permission !== 'granted' && permission !== 'unsupported' && (
          <div className="td-banner">
            <div className="td-bannericon">
              <svg className="td-iconsm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5" />
                <path d="M9 17a3 3 0 0 0 6 0" />
              </svg>
            </div>
            <div className="td-bannertxt">Enable notifications so Handler can reach you anytime</div>
            <button className="td-bannerbtn" onClick={requestPermission}>Enable</button>
          </div>
        )}

        <h1 className="td-h1">{dateStr}</h1>
        <div className="td-sub">Phase {data.currentPhase} · {data.chastityLocked ? `Chastity Day ${data.chastityStreakDays}` : `Denial Day ${data.denialDay}`} · {openDirectives} directives open</div>

        <div className="td-stats">
          <div className="td-stat">
            <div className="td-stat-lbl">Compliance 7d</div>
            <div className="td-stat-val">{data.compliancePct}<span className="td-stat-unit">%</span></div>
            <div className="td-stat-bar">
              <div className="td-stat-fill" style={{
                width: `${data.compliancePct}%`,
                background: data.compliancePct >= 80 ? '#5fc88f' : data.compliancePct >= 50 ? '#f4c272' : '#f47272',
              }} />
            </div>
            {data.complianceSampleSize === 0 && (
              <div className="td-stat-delta" style={{ color: '#6a656e' }}>no directives resolved 7d</div>
            )}
          </div>
          <div className="td-stat">
            <div className="td-stat-lbl">Orgasm debt</div>
            <div className="td-stat-val">{data.denialDay > 0 ? Math.min(100, data.denialDay * 10) : 0}<span className="td-stat-unit">%</span></div>
            <div className="td-stat-bar"><div className="td-stat-fill" style={{ width: `${Math.min(100, data.denialDay * 10)}%`, background: '#c4272d' }} /></div>
          </div>
          <div className="td-stat">
            <div className="td-stat-lbl">Protein today</div>
            <div className="td-stat-val">{Math.round(data.proteinToday)}<span className="td-stat-unit">/ {data.proteinTarget} g</span></div>
            <div className="td-stat-bar"><div className="td-stat-fill" style={{ width: `${proteinPct}%` }} /></div>
          </div>
          <div className="td-stat">
            <div className="td-stat-lbl">Weight</div>
            <div className="td-stat-val">{data.weightKg ? data.weightKg.toFixed(1) : '—'}<span className="td-stat-unit">kg</span></div>
            {weightDelta != null && weightDelta !== 0 && (
              <div className={`td-stat-delta ${weightDelta < 0 ? 'neg' : ''}`}>
                {weightDelta > 0 ? `−${weightDelta} kg vs start` : `+${Math.abs(weightDelta)} kg vs start`}
              </div>
            )}
          </div>
        </div>

        <div className="td-grid">
          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              <div className="td-title">Body directives</div>
              <div className="td-chip">{openDirectives} open</div>
              <div className="td-meta">{data.directives.length ? `Issued ${data.directives[0] ? '' : ''}` : ''}</div>
            </div>
            {data.directives.length === 0 ? (
              <div style={{ padding: 16, color: '#6a656e', fontSize: 12.5 }}>No active directives. The Handler assigns these as part of the protocol.</div>
            ) : data.directives.map(d => (
              <div className="td-dir" key={d.id}>
                <div className="td-dirhead">
                  <button className={`td-check ${d.done ? 'on' : ''}`} onClick={() => toggleDirective(d.id, d.done)} aria-label="toggle">
                    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5" /></svg>
                  </button>
                  <div className="td-dirtags">
                    <span className="td-dirtag kind">{d.kind}</span>
                    {d.target && <span className="td-dirtag"><span className="td-sep">/</span>{d.target}</span>}
                  </div>
                  <span className="td-dirtime">{d.due}</span>
                </div>
                <div className={`td-dirbody ${d.done ? 'done' : ''}`}>{d.body}</div>
                <div className="td-diractions">
                  {d.done
                    ? <button className="td-btn" onClick={() => toggleDirective(d.id, true)}>Undo</button>
                    : <button className="td-btn primary" onClick={() => toggleDirective(d.id, false)}>Mark complete</button>}
                  {d.photoRequired && <button className="td-btn">Upload proof</button>}
                  <button className="td-btn">Discuss</button>
                </div>
              </div>
            ))}
          </div>

          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              <div className="td-title">Protocol progress</div>
              <div className="td-chip">Phase {data.currentPhase}</div>
            </div>
            <div className="td-protocol">
              <div className="td-phase">
                {phaseDots.map((state, i) => <div key={i} className={`td-phasedot ${state}`} />)}
              </div>
              <div className="td-phaseinfo">
                <div className="td-num">{data.denialDay}</div>
                <div className="td-sub">of 90 days</div>
              </div>
              <div className="td-phasecurrent">{currentStep}</div>
              <div className="td-proto-rows">
                <div className="td-proto-row">
                  <span className="lbl">Chastity</span>
                  <span className={`val ${data.chastityLocked ? 'ok' : 'warn'}`}>{data.chastityLocked ? `Day ${data.chastityStreakDays}` : 'Unlocked'}</span>
                </div>
                <div className="td-proto-row"><span className="lbl">Consecutive days</span><span className="val ok">{data.denialDay}</span></div>
                <div className="td-proto-row"><span className="lbl">Longest streak</span><span className="val">{data.longestStreak}</span></div>
                <div className="td-proto-row"><span className="lbl">Open directives</span><span className={`val ${openDirectives > 0 ? 'warn' : 'ok'}`}>{openDirectives}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="td-grid even">
          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3h18v12H5l-2 2V3z" /></svg>
              <div className="td-title">Handler queue</div>
              <div className="td-chip">{data.queue.length} pending</div>
            </div>
            <div className="td-queue">
              {data.queue.length === 0 ? (
                <div style={{ padding: 16, color: '#6a656e', fontSize: 12.5 }}>Queue empty. Handler will reach out when the moment is right.</div>
              ) : data.queue.map(m => (
                <button key={m.id} className={`td-msg ${m.priority ? 'priority' : ''}`} onClick={() => ackQueueMsg(m.id)} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', cursor: 'pointer', display: 'block' }}>
                  <div className="td-msghead">
                    <span className={`td-msgkind ${m.kindClass}`}>{m.kind}</span>
                    <span className="td-msgtime">{m.timeAgo}</span>
                  </div>
                  <div className="td-msgbody">{m.body}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M2 12h20" /></svg>
              <div className="td-title">Arousal level</div>
              <div className="td-chip" style={{ color: data.arousal === 5 ? '#f47272' : '#c4b5fd', background: data.arousal === 5 ? '#2a0f0f' : '#1a1226' }}>{AROUSAL_LABELS[data.arousal]}</div>
            </div>
            <div className="td-arousal">
              <div className="td-arh">
                <div>
                  <div className="td-arlabel">Right now</div>
                  <div className="td-arstate">
                    {data.arousal === 5 ? "You're at the edge"
                      : data.arousal >= 3 ? "You're warming"
                      : data.arousal === 0 ? "Cold. Locked."
                      : "Simmering."}
                  </div>
                </div>
                <div>
                  <span className="td-arnum">{data.arousal}</span>
                  <span className="td-arscale">/5</span>
                </div>
              </div>
              <div className="td-artrack">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <button key={i} className={`td-arcell ${i <= data.arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</button>
                ))}
              </div>
              <div className="td-arfoot">Handler decides when relief comes — every denial increases the next reward's intensity.</div>
            </div>
          </div>
        </div>

        <div className="td-grid even">
          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" /><path d="M5 10v2a7 7 0 0 0 14 0v-2" /></svg>
              <div className="td-title">Future self</div>
              <div className="td-chip">Daily</div>
            </div>
            <div className="td-vizgrid">
              {data.diaryPrompts.slice(0, 2).map((p, idx) => (
                <div key={p.id || `empty-${idx}`}>
                  <div className="td-promptlbl">{p.label}</div>
                  <div className="td-promptq">{p.question}</div>
                  <textarea
                    className="td-input"
                    placeholder="Write it true..."
                    value={p.response}
                    onChange={e => saveDiaryResponse(p.id, e.target.value)}
                    disabled={!p.id}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></svg>
              <div className="td-title">Meal log</div>
              <div className="td-chip">{Math.round(data.proteinToday)} / {data.proteinTarget} g</div>
              <div className="td-meta">{data.mealsToday.length} meals</div>
            </div>
            <div className="td-meal">
              <div className="td-mtabs">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(k => (
                  <button key={k} className={`td-mtab ${mealTab === k ? 'on' : ''}`} onClick={() => setMealTab(k)}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                    <span className="td-grams">· {mealsByType[k].protein > 0 ? `${Math.round(mealsByType[k].protein)}g` : '—'}</span>
                  </button>
                ))}
              </div>
              <div className="td-mealbody">
                <input className="td-mealinput" placeholder="What she ate (e.g. grilled chicken + broccoli + rice)" value={mealForm.foods} onChange={e => setMealForm(f => ({ ...f, foods: e.target.value }))} />
                <div className="td-mealrow">
                  <input className="td-mealinput" placeholder="Protein (g)" value={mealForm.protein} onChange={e => setMealForm(f => ({ ...f, protein: e.target.value }))} inputMode="numeric" />
                  <input className="td-mealinput" placeholder="Cal (kcal)" value={mealForm.calories} onChange={e => setMealForm(f => ({ ...f, calories: e.target.value }))} inputMode="numeric" />
                </div>
                <div className="td-mealchk">
                  <label><input type="checkbox" checked={mealForm.permission} onChange={e => setMealForm(f => ({ ...f, permission: e.target.checked }))} />Permission asked</label>
                  <label><input type="checkbox" checked={mealForm.photo} onChange={e => setMealForm(f => ({ ...f, photo: e.target.checked }))} />Photo before / after</label>
                </div>
                <button className="td-btn primary" style={{ width: '100%', justifyContent: 'center', padding: '8px' }} onClick={submitMeal}>Log meal</button>
              </div>
            </div>
          </div>
        </div>

        <div className="td-card">
          <div className="td-cardh">
            <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7L10 17l-5-5" /></svg>
            <div className="td-title">Aesthetic target · {data.aestheticPreset}</div>
            <div className="td-meta" style={{ color: '#c4b5fd' }}>
              {data.weightKg ? `${data.weightKg.toFixed(1)}kg` : '—'}
              {weightDelta ? ` · −${weightDelta}kg` : ''}
            </div>
          </div>
          <div className="td-target">
            <div className="td-targrid">
              {data.targets.map(cell => (
                <div key={cell.part} className="td-targcell">
                  <div className="part">{cell.part}</div>
                  <div className="cur">{cell.current != null ? cell.current : '—'}<span className="u">{cell.unit}</span></div>
                  <div className={`gap ${cell.onTrack ? 'ok' : ''}`}>{cell.gap}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="td-foot">becoming · phase {data.currentPhase} · day {data.denialDay} of 90</div>
      </main>
    </div>
  );
}
