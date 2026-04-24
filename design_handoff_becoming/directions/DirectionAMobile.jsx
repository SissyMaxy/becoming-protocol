// Direction A — Mobile (iOS)
// Compact mobile adaptation of the Refined Dark direction.
// Primary flow: today screen with directives, protocol, queue badge, arousal, meals.
// Bottom tab bar maps to the desktop left-nav sections.

function DirectionAMobile() {
  const [tab, setTab] = React.useState('today');
  const [directives, setDirectives] = React.useState([
    { id: 'ex', kind: 'Exercise', target: 'Whole body', body: 'Protein target 150g/day min. Log every meal with protein grams. Muscle loss under GLP-1 is real.', done: true, due: '2h' },
    { id: 'vz', kind: 'Visualization', target: 'Progress photo', body: 'Start the photo folder today. Front + side + back. Weekly × 52.', done: false, due: '2h' },
    { id: 'rf', kind: 'Reflection', target: 'Future self', body: 'Five years. Write it true. 3 sentences minimum.', done: false, due: '6h' },
  ]);
  const [arousal, setArousal] = React.useState(5);

  const css = `
    .am-root{position:relative;width:100%;height:100%;background:#0a0a0d;color:#e8e6e3;font-family:"Inter","SF Pro Text",system-ui,sans-serif;font-size:13px;letter-spacing:-.005em;overflow-y:auto;overflow-x:hidden;padding-top:54px;padding-bottom:100px}
    .am-statusbar{position:absolute;top:0;left:0;right:0;height:48px;display:flex;align-items:center;justify-content:space-between;padding:18px 28px 0;z-index:30;color:#fff;font-size:15px;font-weight:600;font-family:"SF Pro Text",-apple-system,system-ui,sans-serif;pointer-events:none}
    .am-statusbar .icons{display:flex;align-items:center;gap:6px}
    .am-island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:120px;height:34px;border-radius:20px;background:#000;z-index:40;pointer-events:none}
    .am-homeind{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:rgba(255,255,255,.7);z-index:50;pointer-events:none}
    .am-root *{box-sizing:border-box}
    .am-root::-webkit-scrollbar{width:0}
    .am-top{padding:14px 18px 6px;display:flex;align-items:center;gap:10px}
    .am-brand{font-size:14px;font-weight:600;letter-spacing:-.01em}
    .am-brand em{color:#c4b5fd;font-style:normal}
    .am-pulse{width:7px;height:7px;border-radius:4px;background:#7c3aed;box-shadow:0 0 8px #7c3aed}
    .am-mlabel{font-size:10.5px;color:#6a656e;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
    .am-push{margin-left:auto}
    .am-circ{width:30px;height:30px;border-radius:15px;background:#1a1a20;display:flex;align-items:center;justify-content:center;color:#c8c4cc;position:relative}
    .am-circ .badge{position:absolute;top:-2px;right:-2px;background:#c4272d;color:#fff;font-size:9px;font-weight:700;width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:2px solid #0a0a0d}

    .am-hero{padding:8px 18px 18px}
    .am-h1{font-size:26px;font-weight:650;letter-spacing:-.025em;color:#fff;margin:0;line-height:1.1}
    .am-sub{font-size:12.5px;color:#8a8690;margin-top:4px}

    .am-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 18px 16px}
    .am-stat{background:#111116;border:1px solid #1a1a20;border-radius:10px;padding:11px 13px}
    .am-stat .lbl{font-size:10px;color:#6a656e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;font-weight:600}
    .am-stat .val{font-size:18px;font-weight:650;color:#fff;letter-spacing:-.02em;display:flex;align-items:baseline;gap:5px}
    .am-stat .unit{font-size:11px;color:#6a656e;font-weight:500}
    .am-stat .bar{height:3px;background:#1a1a20;border-radius:2px;margin-top:7px;overflow:hidden}
    .am-stat .fill{height:100%;background:#7c3aed;border-radius:2px}

    .am-banner{margin:0 18px 18px;background:linear-gradient(92deg,#1a0f2e,#150a24);border:1px solid #2d1a4d;border-radius:10px;padding:11px 14px;display:flex;align-items:center;gap:10px}
    .am-banner svg{color:#c4b5fd;flex-shrink:0}
    .am-banner .t{flex:1;font-size:12px;color:#c4b5fd;line-height:1.4}
    .am-banner button{padding:6px 12px;border-radius:6px;background:#7c3aed;color:#fff;border:none;font-weight:600;font-size:11.5px;cursor:pointer;font-family:inherit}

    .am-sec{padding:0 18px;margin-bottom:18px}
    .am-sech{display:flex;align-items:center;gap:8px;padding:4px 2px 10px}
    .am-sech .t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8a8690}
    .am-sech .chip{font-size:9.5px;color:#c4b5fd;background:#1a1226;padding:2px 7px;border-radius:10px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
    .am-sech .more{margin-left:auto;font-size:11.5px;color:#c4b5fd;font-weight:500}

    .am-card{background:#111116;border:1px solid #1a1a20;border-radius:12px;overflow:hidden}

    .am-dir{padding:14px;border-bottom:1px solid #15151b}
    .am-dir:last-child{border-bottom:none}
    .am-dirhead{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .am-check{width:18px;height:18px;border-radius:5px;border:1.5px solid #3a3540;cursor:pointer;flex-shrink:0;transition:all .15s;display:flex;align-items:center;justify-content:center;background:transparent}
    .am-check.on{background:#7c3aed;border-color:#7c3aed}
    .am-check.on svg{display:block}
    .am-check svg{display:none;width:11px;height:11px;color:#fff}
    .am-dirkind{font-size:10.5px;color:#c4b5fd;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
    .am-dirtarget{font-size:10.5px;color:#8a8690;font-weight:500}
    .am-dirsep{color:#3a3540;margin:0 5px}
    .am-dirtime{font-size:10.5px;color:#6a656e;margin-left:auto;font-variant-numeric:tabular-nums}
    .am-dirbody{font-size:13px;line-height:1.5;color:#c8c4cc;padding-left:28px;margin-bottom:10px}
    .am-dirbody.done{color:#6a656e;text-decoration:line-through;text-decoration-color:#3a3540}
    .am-diract{padding-left:28px;display:flex;gap:7px}
    .am-btn{padding:5px 10px;border-radius:6px;background:#1a1a20;border:none;color:#c8c4cc;font-size:11px;cursor:pointer;font-family:inherit;font-weight:500;display:flex;align-items:center;gap:4px}
    .am-btn.primary{background:#7c3aed;color:#fff}

    .am-proto{padding:14px 16px}
    .am-phasebar{display:flex;gap:5px;margin-bottom:12px}
    .am-phasecell{flex:1;height:3px;border-radius:2px;background:#1a1a20}
    .am-phasecell.done{background:#7c3aed}
    .am-phasecell.active{background:linear-gradient(90deg,#7c3aed 50%,#1a1a20 50%)}
    .am-protoh{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
    .am-protonum{font-size:28px;font-weight:650;color:#fff;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}
    .am-protosub{font-size:12px;color:#8a8690}
    .am-protochip{font-size:10px;color:#c4b5fd;background:#1a1226;padding:3px 8px;border-radius:10px;font-weight:700;letter-spacing:.02em;display:inline-block;margin-bottom:12px}
    .am-prrow{display:flex;justify-content:space-between;font-size:12px;padding:7px 0;border-top:1px solid #15151b}
    .am-prrow .k{color:#8a8690}
    .am-prrow .v{color:#e8e6e3;font-weight:500}
    .am-prrow .v.warn{color:#f4c272}
    .am-prrow .v.ok{color:#5fc88f}

    .am-msgs{}
    .am-msg{padding:12px 14px;border-bottom:1px solid #15151b;position:relative}
    .am-msg:last-child{border-bottom:none}
    .am-msg.priority{background:linear-gradient(92deg,#1a0f2e,transparent 70%)}
    .am-msg.priority::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:#7c3aed}
    .am-msghead{display:flex;align-items:center;gap:8px;margin-bottom:4px}
    .am-msgkind{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8a8690;font-weight:700}
    .am-msgkind.directive{color:#c4b5fd}
    .am-msgkind.correction{color:#f4c272}
    .am-msgkind.reward{color:#5fc88f}
    .am-msgtime{font-size:10.5px;color:#5a5560;margin-left:auto;font-variant-numeric:tabular-nums}
    .am-msgbody{font-size:13px;color:#c8c4cc;line-height:1.45}

    .am-ar{padding:14px 16px}
    .am-arh{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}
    .am-arnum{font-size:38px;font-weight:650;color:#fff;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:.95}
    .am-arscale{font-size:13px;color:#6a656e;font-weight:500}
    .am-arlbl{font-size:10px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:2px}
    .am-arstate{font-size:13px;color:#e8e6e3;font-weight:500}
    .am-artrack{display:flex;gap:4px}
    .am-arcell{flex:1;height:32px;border-radius:5px;background:#1a1a20;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#5a5560;font-weight:600}
    .am-arcell.on{color:#fff}
    .am-arcell.on.l0{background:#2d2a35}
    .am-arcell.on.l1{background:#3d2a55}
    .am-arcell.on.l2{background:#4d2a75}
    .am-arcell.on.l3{background:#6a2a9a}
    .am-arcell.on.l4{background:#7c3aed}
    .am-arcell.on.l5{background:#c4272d}
    .am-arfoot{font-size:11px;color:#6a656e;margin-top:10px;line-height:1.5}

    .am-meal{padding:0}
    .am-mring{padding:14px 16px 10px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #15151b}
    .am-mring svg{width:52px;height:52px;flex-shrink:0}
    .am-mring .txt .big{font-size:20px;font-weight:650;color:#fff;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
    .am-mring .txt .big .u{font-size:12px;color:#8a8690;font-weight:500}
    .am-mring .txt .small{font-size:11.5px;color:#8a8690;margin-top:2px}
    .am-mring .add{margin-left:auto;width:36px;height:36px;border-radius:18px;background:#7c3aed;color:#fff;border:none;font-size:20px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center}
    .am-mtabs{display:flex;padding:0 8px;border-bottom:1px solid #15151b}
    .am-mtab{flex:1;padding:10px 4px;font-size:11px;color:#6a656e;text-align:center;font-weight:600;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}
    .am-mtab.on{color:#e8e6e3;border-bottom-color:#7c3aed}
    .am-mtab .g{display:block;font-size:10px;color:#5a5560;font-weight:500;text-transform:none;letter-spacing:0;margin-top:2px;font-variant-numeric:tabular-nums}
    .am-mtab.on .g{color:#c4b5fd}
    .am-mlist{padding:8px 16px 14px}
    .am-mrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #15151b;font-size:12.5px}
    .am-mrow:last-child{border-bottom:none}
    .am-mrow .when{color:#6a656e;font-size:11px;width:44px;font-variant-numeric:tabular-nums}
    .am-mrow .what{flex:1;color:#c8c4cc}
    .am-mrow .g{color:#c4b5fd;font-weight:600;font-variant-numeric:tabular-nums;font-size:12px}

    .am-tgrid{display:grid;grid-template-columns:1fr 1fr;gap:0}
    .am-tcell{padding:12px 14px;border-right:1px solid #15151b;border-bottom:1px solid #15151b}
    .am-tcell:nth-child(2n){border-right:none}
    .am-tcell:nth-last-child(-n+2){border-bottom:none}
    .am-tcell .part{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6a656e;font-weight:700;margin-bottom:4px}
    .am-tcell .cur{font-size:17px;font-weight:650;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
    .am-tcell .cur .u{font-size:10px;color:#6a656e;font-weight:500;margin-left:1px}
    .am-tcell .gap{font-size:10.5px;color:#f4c272;font-variant-numeric:tabular-nums;margin-top:2px;font-weight:500}
    .am-tcell .gap.ok{color:#5fc88f}

    .am-tabbar{position:absolute;left:0;right:0;bottom:0;background:rgba(10,10,13,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid #1a1a20;padding:8px 8px 24px;display:flex;z-index:20}
    .am-tabi{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;background:none;border:none;color:#6a656e;cursor:pointer;font-family:inherit;position:relative}
    .am-tabi.on{color:#c4b5fd}
    .am-tabi .lbl{font-size:10px;font-weight:600;letter-spacing:.02em}
    .am-tabi svg{width:22px;height:22px;stroke-width:1.8}
    .am-tabi .badge{position:absolute;top:2px;right:14px;background:#c4272d;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;padding:0 4px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:2px solid #0a0a0d}
  `;

  const arousalLabels = ['locked', 'simmering', 'attentive', 'wanting', 'desperate', 'edging'];
  const toggle = id => setDirectives(d => d.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const openDirectives = directives.filter(d => !d.done).length;

  return (
    <>
      <style>{css}</style>
      <div className="am-root">
        <div className="am-island"/>
        <div className="am-statusbar">
          <span>9:41</span>
          <span className="icons">
            <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx=".5"/><rect x="4.5" y="5" width="3" height="6" rx=".5"/><rect x="9" y="2.5" width="3" height="8.5" rx=".5"/><rect x="13.5" y="0" width="3" height="11" rx=".5"/></svg>
            <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 3A7 7 0 0 1 12.8 5.4l1-1A8.5 8.5 0 0 0 1.2 4.4l1 1A7 7 0 0 1 7.5 3zM7.5 6a4 4 0 0 1 2.9 1.3l1-1A5.5 5.5 0 0 0 3.6 6.3l1 1A4 4 0 0 1 7.5 6zM7.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>
            <svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="21" height="10" rx="2.5" fill="none" stroke="currentColor" strokeOpacity=".5"/><rect x="2" y="2" width="18" height="7" rx="1.5" fill="currentColor"/><path d="M22.5 3.5v4c.7-.2 1.2-.9 1.2-1.5v-1c0-.6-.5-1.3-1.2-1.5z" fill="currentColor" fillOpacity=".5"/></svg>
          </span>
        </div>
        <div className="am-top">
          <div className="am-pulse"/>
          <div className="am-brand">be<em>coming</em></div>
          <span style={{fontSize:10.5,color:'#6a656e',fontWeight:500}}>· Day 3 / 90</span>
          <div className="am-push"/>
          <div className="am-circ">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5"/><path d="M9 17a3 3 0 0 0 6 0"/></svg>
            <span className="badge">3</span>
          </div>
        </div>

        <div className="am-hero">
          <h1 className="am-h1">Tuesday</h1>
          <div className="am-sub">Phase 0 · Chastity day 3 · {openDirectives} directives open</div>
        </div>

        <div className="am-stats">
          <div className="am-stat">
            <div className="lbl">Mag charge</div>
            <div className="val">100<span className="unit">%</span></div>
            <div className="bar"><div className="fill" style={{width:'100%'}}/></div>
          </div>
          <div className="am-stat">
            <div className="lbl">Orgasm debt</div>
            <div className="val">0<span className="unit">%</span></div>
            <div className="bar"><div className="fill" style={{width:'0%',background:'#c4272d'}}/></div>
          </div>
          <div className="am-stat">
            <div className="lbl">Protein</div>
            <div className="val">82<span className="unit">/ 150g</span></div>
            <div className="bar"><div className="fill" style={{width:'55%'}}/></div>
          </div>
          <div className="am-stat">
            <div className="lbl">Weight</div>
            <div className="val">92<span className="unit">kg</span></div>
            <div style={{fontSize:10.5,color:'#5fc88f',marginTop:5,fontWeight:500}}>−7 kg vs start</div>
          </div>
        </div>

        <div className="am-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5"/><path d="M9 17a3 3 0 0 0 6 0"/></svg>
          <div className="t">Enable notifications so Handler can reach you anytime</div>
          <button>Enable</button>
        </div>

        <div className="am-sec">
          <div className="am-sech">
            <span className="t">Body directives</span>
            <span className="chip">{openDirectives} open</span>
            <span className="more">See all</span>
          </div>
          <div className="am-card">
            {directives.map(d => (
              <div className="am-dir" key={d.id}>
                <div className="am-dirhead">
                  <div className={`am-check ${d.done ? 'on' : ''}`} onClick={() => toggle(d.id)}>
                    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5"/></svg>
                  </div>
                  <span className="am-dirkind">{d.kind}</span>
                  <span className="am-dirsep">/</span>
                  <span className="am-dirtarget">{d.target}</span>
                  <span className="am-dirtime">{d.due}</span>
                </div>
                <div className={`am-dirbody ${d.done ? 'done' : ''}`}>{d.body}</div>
                <div className="am-diract">
                  {d.done
                    ? <button className="am-btn">Undo</button>
                    : <button className="am-btn primary">Complete</button>}
                  <button className="am-btn">Proof</button>
                  <button className="am-btn">Discuss</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="am-sec">
          <div className="am-sech">
            <span className="t">Protocol</span>
            <span className="chip">Phase 0</span>
            <span className="more">Detail</span>
          </div>
          <div className="am-card">
            <div className="am-proto">
              <div className="am-phasebar">
                <div className="am-phasecell active"/>
                <div className="am-phasecell"/>
                <div className="am-phasecell"/>
                <div className="am-phasecell"/>
              </div>
              <div className="am-protoh">
                <div className="am-protonum">3</div>
                <div className="am-protosub">of 90 days</div>
              </div>
              <div className="am-protochip">CHASTITY · STEP 1 / 10</div>
              <div className="am-prrow"><span className="k">Next check-in</span><span className="v warn">Uncommitted</span></div>
              <div className="am-prrow"><span className="k">Next tunnel</span><span className="v warn">Uncommitted</span></div>
              <div className="am-prrow"><span className="k">Current streak</span><span className="v ok">3 days</span></div>
              <div className="am-prrow"><span className="k">Longest</span><span className="v">12 days</span></div>
            </div>
          </div>
        </div>

        <div className="am-sec">
          <div className="am-sech">
            <span className="t">Handler queue</span>
            <span className="chip">3 pending</span>
            <span className="more">Open</span>
          </div>
          <div className="am-card">
            <div className="am-msgs">
              <div className="am-msg priority">
                <div className="am-msghead">
                  <span className="am-msgkind directive">Directive</span>
                  <span className="am-msgtime">18m ago</span>
                </div>
                <div className="am-msgbody">I want a photo. Now.</div>
              </div>
              <div className="am-msg">
                <div className="am-msghead">
                  <span className="am-msgkind correction">Correction</span>
                  <span className="am-msgtime">1h ago</span>
                </div>
                <div className="am-msgbody">You're being talked to today. 10 messages. Open the app.</div>
              </div>
              <div className="am-msg">
                <div className="am-msghead">
                  <span className="am-msgkind reward">Invitation</span>
                  <span className="am-msgtime">3h ago</span>
                </div>
                <div className="am-msgbody">I know when you're most open. Come to me now.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="am-sec">
          <div className="am-sech">
            <span className="t">Arousal</span>
            <span className="chip" style={{color:arousal===5?'#f47272':'#c4b5fd',background:arousal===5?'#2a0f0f':'#1a1226'}}>{arousalLabels[arousal]}</span>
            <span className="more">History</span>
          </div>
          <div className="am-card">
            <div className="am-ar">
              <div className="am-arh">
                <div>
                  <div className="am-arlbl">Right now</div>
                  <div className="am-arstate">You're at the edge</div>
                </div>
                <div><span className="am-arnum">{arousal}</span><span className="am-arscale">/5</span></div>
              </div>
              <div className="am-artrack">
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} className={`am-arcell ${i <= arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</div>
                ))}
              </div>
              <div className="am-arfoot">Handler decides when relief comes. Each denial increases the next reward's intensity.</div>
            </div>
          </div>
        </div>

        <div className="am-sec">
          <div className="am-sech">
            <span className="t">Meal log</span>
            <span className="chip">82 / 150g</span>
            <span className="more">All meals</span>
          </div>
          <div className="am-card">
            <div className="am-meal">
              <div className="am-mring">
                <svg viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="22" fill="none" stroke="#1a1a20" strokeWidth="4"/>
                  <circle cx="26" cy="26" r="22" fill="none" stroke="#7c3aed" strokeWidth="4" strokeDasharray="76 138" strokeLinecap="round" transform="rotate(-90 26 26)"/>
                </svg>
                <div className="txt">
                  <div className="big">82 <span className="u">/ 150 g</span></div>
                  <div className="small">68 g left · lean priority</div>
                </div>
                <button className="add">+</button>
              </div>
              <div className="am-mtabs">
                <button className="am-mtab on">Break<span className="g">28g</span></button>
                <button className="am-mtab">Lunch<span className="g">54g</span></button>
                <button className="am-mtab">Dinner<span className="g">—</span></button>
                <button className="am-mtab">Snack<span className="g">—</span></button>
              </div>
              <div className="am-mlist">
                <div className="am-mrow"><span className="when">08:20</span><span className="what">Greek yogurt + whey scoop</span><span className="g">28g</span></div>
                <div className="am-mrow"><span className="when">12:45</span><span className="what">Chicken breast + broccoli + rice</span><span className="g">54g</span></div>
                <div className="am-mrow"><span className="when">—</span><span className="what" style={{color:'#5a5560',fontStyle:'italic'}}>Log dinner</span><span className="g" style={{color:'#5a5560'}}>+</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="am-sec">
          <div className="am-sech">
            <span className="t">Aesthetic target</span>
            <span className="chip">femboy · −22kg</span>
          </div>
          <div className="am-card">
            <div className="am-tgrid">
              <div className="am-tcell"><div className="part">Waist</div><div className="cur">91<span className="u">cm</span></div><div className="gap">−7 to go</div></div>
              <div className="am-tcell"><div className="part">Hips</div><div className="cur">102<span className="u">cm</span></div><div className="gap ok">on track</div></div>
              <div className="am-tcell"><div className="part">Chest</div><div className="cur">94<span className="u">cm</span></div><div className="gap">−5 to go</div></div>
              <div className="am-tcell"><div className="part">Weight</div><div className="cur">92<span className="u">kg</span></div><div className="gap">−22 to go</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="am-tabbar">
        <button className={`am-tabi ${tab==='today'?'on':''}`} onClick={() => setTab('today')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <div className="lbl">Today</div>
        </button>
        <button className={`am-tabi ${tab==='proto'?'on':''}`} onClick={() => setTab('proto')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <div className="lbl">Protocol</div>
        </button>
        <button className={`am-tabi ${tab==='queue'?'on':''}`} onClick={() => setTab('queue')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3h18v12H5l-2 2V3z"/></svg>
          <div className="lbl">Queue</div>
          <span className="badge">3</span>
        </button>
        <button className={`am-tabi ${tab==='body'?'on':''}`} onClick={() => setTab('body')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a4 4 0 0 0-4 4v2a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z"/><path d="M6 22v-6a6 6 0 0 1 12 0v6"/></svg>
          <div className="lbl">Body</div>
        </button>
        <button className={`am-tabi ${tab==='me'?'on':''}`} onClick={() => setTab('me')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
          <div className="lbl">Me</div>
        </button>
      </div>
      <div className="am-homeind"/>
    </>
  );
}

window.DirectionAMobile = DirectionAMobile;
