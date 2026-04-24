// Direction A — Refined Dark Cinematic
// Same moody dark theme, but with real hierarchy, grouping, density control,
// consistent type scale, and a proper left-nav so the 15-stacked-cards feel goes away.

function DirectionA() {
  const [tab, setTab] = React.useState('today');
  const [directives, setDirectives] = React.useState([
    { id: 'ex', kind: 'Exercise', target: 'Whole body', body: 'Protein target 150g/kg minimum. On Zepbound your appetite is suppressed — priority on lean protein without tracking. Log every meal with protein grams. Muscle loss under GLP-1 is real.', done: true, due: '2h' },
    { id: 'vz', kind: 'Visualization', target: 'Progress photo', body: 'Start a progress photo folder today. Full-body front + side + back in underwear. Good lighting. You will take these every week for the next 12 months. Month 1 vs 12 is the evidence.', done: false, due: '2h' },
  ]);
  const [arousal, setArousal] = React.useState(5);
  const [queueOpen, setQueueOpen] = React.useState(false);

  const css = `
    .a-root{position:absolute;inset:0;background:#0a0a0d;color:#e8e6e3;font-family:"Inter","SF Pro Text",system-ui,sans-serif;font-size:13px;letter-spacing:-.005em;overflow-y:auto;overflow-x:hidden}
    .a-root *{box-sizing:border-box}
    .a-root::-webkit-scrollbar{width:0}
    .a-side{position:sticky;top:0;width:180px;height:100vh;border-right:1px solid #1a1a20;padding:20px 14px;display:flex;flex-direction:column;gap:2px;float:left;background:#0a0a0d;z-index:2}
    .a-brand{display:flex;align-items:center;gap:9px;margin-bottom:22px;padding:0 6px}
    .a-brandmark{width:22px;height:22px;border-radius:5px;background:linear-gradient(135deg,#c4b5fd,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#1a0533}
    .a-brandname{font-size:13px;font-weight:600;letter-spacing:-.01em}
    .a-brandrole{font-size:10px;color:#8a8690;background:#1a1a20;padding:2px 6px;border-radius:10px;margin-left:auto;font-weight:500}
    .a-navitem{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;font-size:12.5px;color:#9a95a0;cursor:pointer;transition:all .1s;font-weight:450}
    .a-navitem:hover{background:#16161c;color:#d6d2dd}
    .a-navitem.on{background:#1a1623;color:#e8dcff}
    .a-navitem .dot{width:6px;height:6px;border-radius:3px;background:#7c3aed;margin-left:auto;box-shadow:0 0 8px #7c3aed}
    .a-navsec{font-size:10px;color:#5a5560;text-transform:uppercase;letter-spacing:.08em;padding:18px 10px 6px;font-weight:600}
    .a-main{margin-left:180px;padding:24px 32px 60px}
    .a-banner{background:linear-gradient(92deg,#1a0f2e 0%,#150a24 100%);border:1px solid #2d1a4d;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:20px}
    .a-bannericon{width:28px;height:28px;border-radius:6px;background:#2d1a4d;display:flex;align-items:center;justify-content:center;color:#c4b5fd;flex-shrink:0}
    .a-bannertxt{flex:1;font-size:12.5px;color:#c4b5fd;line-height:1.4}
    .a-bannerbtn{padding:6px 14px;border-radius:6px;background:#7c3aed;color:#fff;border:none;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit}
    .a-h1{font-size:22px;font-weight:650;letter-spacing:-.02em;margin:0 0 2px;color:#fff}
    .a-sub{font-size:12.5px;color:#8a8690;margin-bottom:20px}
    .a-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
    .a-stat{background:#111116;border:1px solid #1a1a20;border-radius:8px;padding:12px 14px}
    .a-stat .lbl{font-size:10.5px;color:#6a656e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;font-weight:600}
    .a-stat .val{font-size:20px;font-weight:650;letter-spacing:-.02em;color:#fff;display:flex;align-items:baseline;gap:6px}
    .a-stat .unit{font-size:12px;color:#6a656e;font-weight:500}
    .a-stat .bar{height:3px;background:#1a1a20;border-radius:2px;margin-top:9px;overflow:hidden}
    .a-stat .fill{height:100%;background:#7c3aed;border-radius:2px}
    .a-stat .delta{font-size:10.5px;color:#5fc88f;margin-top:5px;font-weight:500}
    .a-stat .delta.neg{color:#f47272}

    .a-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px}
    .a-card{background:#101014;border:1px solid #1a1a20;border-radius:10px;overflow:hidden}
    .a-cardh{padding:13px 16px 10px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #15151b}
    .a-cardh .ico{width:14px;height:14px;color:#8a8690}
    .a-cardh .title{font-size:12.5px;font-weight:600;letter-spacing:-.005em;color:#e8e6e3}
    .a-cardh .meta{font-size:11px;color:#6a656e;margin-left:auto}
    .a-cardh .chip{font-size:10px;color:#c4b5fd;background:#1a1226;padding:2px 7px;border-radius:10px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}

    .a-dir{padding:14px 16px;border-bottom:1px solid #15151b;transition:background .1s}
    .a-dir:last-child{border-bottom:none}
    .a-dir:hover{background:#13131a}
    .a-dirhead{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .a-check{width:16px;height:16px;border-radius:4px;border:1.5px solid #3a3540;cursor:pointer;flex-shrink:0;transition:all .15s;display:flex;align-items:center;justify-content:center;background:transparent}
    .a-check.on{background:#7c3aed;border-color:#7c3aed}
    .a-check.on svg{display:block}
    .a-check svg{display:none;width:10px;height:10px;color:#fff}
    .a-dirtags{display:flex;gap:6px;align-items:center;flex:1}
    .a-dirtag{font-size:10px;color:#8a8690;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
    .a-dirtag.kind{color:#c4b5fd}
    .a-dirtag .sep{margin:0 4px;color:#3a3540}
    .a-dirtime{font-size:11px;color:#6a656e;margin-left:auto;font-variant-numeric:tabular-nums}
    .a-dirbody{font-size:13px;line-height:1.55;color:#c8c4cc;padding-left:26px;margin-bottom:8px}
    .a-dirbody.done{color:#6a656e;text-decoration:line-through;text-decoration-color:#3a3540}
    .a-diractions{padding-left:26px;display:flex;gap:8px}
    .a-btn{padding:5px 10px;border-radius:5px;background:#1a1a20;border:none;color:#c8c4cc;font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:500;display:flex;align-items:center;gap:5px;transition:background .1s}
    .a-btn:hover{background:#22222a}
    .a-btn.primary{background:#7c3aed;color:#fff}
    .a-btn.primary:hover{background:#8b4cf0}

    .a-protocol{padding:16px}
    .a-phase{display:flex;gap:6px;margin-bottom:14px}
    .a-phasedot{flex:1;height:4px;border-radius:2px;background:#1a1a20;position:relative;overflow:hidden}
    .a-phasedot.done{background:#7c3aed}
    .a-phasedot.active{background:linear-gradient(90deg,#7c3aed 50%,#1a1a20 50%)}
    .a-phaseinfo{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
    .a-phaseinfo .num{font-size:28px;font-weight:650;letter-spacing:-.03em;color:#fff;font-variant-numeric:tabular-nums}
    .a-phaseinfo .sub{font-size:12.5px;color:#8a8690}
    .a-phasecurrent{font-size:11px;color:#c4b5fd;background:#1a1226;display:inline-block;padding:3px 9px;border-radius:10px;margin-bottom:16px;font-weight:600;letter-spacing:.02em}

    .a-proto-rows{display:flex;flex-direction:column;gap:0}
    .a-proto-row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #15151b;font-size:12.5px}
    .a-proto-row .lbl{color:#8a8690}
    .a-proto-row .val{color:#e8e6e3;font-weight:500}
    .a-proto-row .val.warn{color:#f4c272}
    .a-proto-row .val.ok{color:#5fc88f}

    .a-vizgrid{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .a-prompt{}
    .a-promptlbl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#c4b5fd;font-weight:700;margin-bottom:6px}
    .a-promptq{font-size:12.5px;color:#c8c4cc;line-height:1.45;margin-bottom:10px}
    .a-input{width:100%;background:#0a0a0d;border:1px solid #22222a;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:12.5px;color:#e8e6e3;resize:none;min-height:60px}
    .a-input:focus{outline:none;border-color:#7c3aed}

    .a-queue{padding:0}
    .a-msg{padding:12px 16px;border-bottom:1px solid #15151b;position:relative}
    .a-msg:last-child{border-bottom:none}
    .a-msg.priority{background:linear-gradient(92deg,#1a0f2e 0%,transparent 60%)}
    .a-msg.priority::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:#7c3aed}
    .a-msghead{display:flex;align-items:center;gap:8px;margin-bottom:5px}
    .a-msgkind{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8a8690;font-weight:600}
    .a-msgkind.punishment{color:#f47272}
    .a-msgkind.reward{color:#5fc88f}
    .a-msgkind.directive{color:#c4b5fd}
    .a-msgtime{font-size:10.5px;color:#5a5560;margin-left:auto;font-variant-numeric:tabular-nums}
    .a-msgbody{font-size:12.5px;color:#c8c4cc;line-height:1.5}

    .a-arousal{padding:16px}
    .a-arh{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
    .a-arnum{font-size:38px;font-weight:650;letter-spacing:-.03em;color:#fff;font-variant-numeric:tabular-nums;line-height:1}
    .a-arscale{font-size:14px;color:#6a656e;font-weight:500}
    .a-arlabel{font-size:11px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:2px}
    .a-arstate{font-size:13px;color:#e8e6e3;font-weight:500}
    .a-artrack{display:flex;gap:4px;margin-top:14px}
    .a-arcell{flex:1;height:28px;border-radius:4px;background:#1a1a20;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#5a5560;font-weight:600;transition:all .1s}
    .a-arcell:hover{background:#22222a}
    .a-arcell.on{color:#fff}
    .a-arcell.on.l0{background:#2d2a35}
    .a-arcell.on.l1{background:#3d2a55}
    .a-arcell.on.l2{background:#4d2a75}
    .a-arcell.on.l3{background:#6a2a9a}
    .a-arcell.on.l4{background:#7c3aed}
    .a-arcell.on.l5{background:#c4272d}
    .a-arfoot{font-size:11.5px;color:#6a656e;margin-top:10px;line-height:1.5}

    .a-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .a-meal{padding:0}
    .a-tabs{display:flex;border-bottom:1px solid #15151b}
    .a-tab{flex:1;padding:10px;font-size:12px;color:#6a656e;cursor:pointer;text-align:center;font-weight:500;border-bottom:2px solid transparent;transition:all .1s;font-family:inherit;background:none;border-top:none;border-left:none;border-right:none}
    .a-tab.on{color:#e8e6e3;border-bottom-color:#7c3aed}
    .a-tab .grams{font-size:10px;color:#5a5560;margin-left:4px;font-variant-numeric:tabular-nums}
    .a-tab.on .grams{color:#c4b5fd}
    .a-mealbody{padding:14px 16px}
    .a-mealinput{width:100%;background:#0a0a0d;border:1px solid #22222a;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:12.5px;color:#e8e6e3;margin-bottom:10px}
    .a-mealrow{display:flex;gap:8px;margin-bottom:10px}
    .a-mealrow > *{flex:1}
    .a-mealchk{display:flex;gap:14px;margin-bottom:12px}
    .a-mealchk label{display:flex;align-items:center;gap:6px;font-size:12px;color:#c8c4cc;cursor:pointer}
    .a-mealchk input{accent-color:#7c3aed;width:13px;height:13px}
    .a-loggedmeals{margin-top:14px;padding-top:14px;border-top:1px solid #15151b;display:flex;flex-direction:column;gap:6px}
    .a-loggedmeal{display:flex;align-items:center;gap:10px;font-size:12px;color:#c8c4cc}
    .a-loggedmeal .when{color:#6a656e;font-size:11px;width:50px;font-variant-numeric:tabular-nums}
    .a-loggedmeal .what{flex:1}
    .a-loggedmeal .g{color:#c4b5fd;font-weight:600;font-variant-numeric:tabular-nums}

    .a-target{padding:14px 16px}
    .a-targrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px}
    .a-targcell{background:#0a0a0d;border:1px solid #1a1a20;border-radius:7px;padding:9px 10px}
    .a-targcell .part{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6a656e;font-weight:600;margin-bottom:4px}
    .a-targcell .cur{font-size:15px;font-weight:650;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
    .a-targcell .cur .u{font-size:10px;color:#6a656e;font-weight:500;margin-left:1px}
    .a-targcell .gap{font-size:10.5px;color:#f4c272;font-variant-numeric:tabular-nums;margin-top:2px;font-weight:500}
    .a-targcell .gap.ok{color:#5fc88f}

    .a-cheviscon{width:11px;height:11px;color:#6a656e}
    .a-iconsm{width:14px;height:14px;stroke-width:1.8}

    .a-foot{margin-top:16px;padding:10px 16px;font-size:10.5px;color:#5a5560;text-align:center}
  `;

  const arousalLabels = ['locked', 'simmering', 'attentive', 'wanting', 'desperate', 'edging'];

  const toggle = (id) => setDirectives(d => d.map(x => x.id === id ? { ...x, done: !x.done } : x));

  return (
    <>
      <style>{css}</style>
      <div className="a-root">
        <aside className="a-side">
          <div className="a-brand">
            <div className="a-brandmark">b</div>
            <div className="a-brandname">becoming</div>
            <div className="a-brandrole">you</div>
          </div>
          <div className="a-navsec">Today</div>
          <div className="a-navitem on">Directives<span className="dot"/></div>
          <div className="a-navitem">Protocol</div>
          <div className="a-navitem">Meal log</div>
          <div className="a-navsec">Connection</div>
          <div className="a-navitem">Queue<span style={{marginLeft:'auto',fontSize:10,color:'#c4b5fd',background:'#1a1226',padding:'1px 6px',borderRadius:8,fontWeight:600}}>3</span></div>
          <div className="a-navitem">Requests</div>
          <div className="a-navitem">Reflections</div>
          <div className="a-navsec">Measures</div>
          <div className="a-navitem">Body</div>
          <div className="a-navitem">Arousal</div>
          <div className="a-navitem">Medication</div>
          <div style={{marginTop:'auto',padding:'10px',fontSize:11,color:'#5a5560',display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:22,height:22,borderRadius:11,background:'#2d1a4d'}}/>
            <div><div style={{color:'#c8c4cc',fontWeight:500}}>r/</div><div>Phase 0 · Day 3</div></div>
          </div>
        </aside>

        <main className="a-main">
          <div className="a-banner">
            <div className="a-bannericon">
              <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5"/><path d="M9 17a3 3 0 0 0 6 0"/></svg>
            </div>
            <div className="a-bannertxt">Enable notifications so Handler can reach you anytime</div>
            <button className="a-bannerbtn">Enable</button>
          </div>

          <h1 className="a-h1">Tuesday, April 21</h1>
          <div className="a-sub">Phase 0 · Chastity Day 3 · 3 directives open</div>

          <div className="a-stats">
            <div className="a-stat">
              <div className="lbl">Mag charge</div>
              <div className="val">100<span className="unit">%</span></div>
              <div className="bar"><div className="fill" style={{width:'100%'}}/></div>
            </div>
            <div className="a-stat">
              <div className="lbl">Orgasm debt</div>
              <div className="val">0<span className="unit">%</span></div>
              <div className="bar"><div className="fill" style={{width:'0%',background:'#c4272d'}}/></div>
            </div>
            <div className="a-stat">
              <div className="lbl">Protein today</div>
              <div className="val">82<span className="unit">/ 150 g</span></div>
              <div className="bar"><div className="fill" style={{width:'55%'}}/></div>
            </div>
            <div className="a-stat">
              <div className="lbl">Weight</div>
              <div className="val">92<span className="unit">kg</span></div>
              <div className="delta">−7 kg vs start</div>
            </div>
          </div>

          <div className="a-grid">
            <div className="a-card">
              <div className="a-cardh">
                <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <div className="title">Body directives</div>
                <div className="chip">3 open</div>
                <div className="meta">Issued 2h ago</div>
              </div>
              {directives.map(d => (
                <div className="a-dir" key={d.id}>
                  <div className="a-dirhead">
                    <div className={`a-check ${d.done ? 'on' : ''}`} onClick={() => toggle(d.id)}>
                      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5"/></svg>
                    </div>
                    <div className="a-dirtags">
                      <span className="a-dirtag kind">{d.kind}</span>
                      <span className="a-dirtag"><span className="sep">/</span>{d.target}</span>
                    </div>
                    <span className="a-dirtime">{d.due}</span>
                  </div>
                  <div className={`a-dirbody ${d.done ? 'done' : ''}`}>{d.body}</div>
                  <div className="a-diractions">
                    {d.done ? <button className="a-btn">Undo</button> : <button className="a-btn primary">Mark complete</button>}
                    <button className="a-btn">Upload proof</button>
                    <button className="a-btn">Discuss</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="a-card">
              <div className="a-cardh">
                <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                <div className="title">Protocol progress</div>
                <div className="chip">Phase 0</div>
              </div>
              <div className="a-protocol">
                <div className="a-phase">
                  <div className="a-phasedot active"/>
                  <div className="a-phasedot"/>
                  <div className="a-phasedot"/>
                  <div className="a-phasedot"/>
                </div>
                <div className="a-phaseinfo">
                  <div className="num">3</div>
                  <div className="sub">of 90 days</div>
                </div>
                <div className="a-phasecurrent">CHASTITY · STEP 1 / 10</div>
                <div className="a-proto-rows">
                  <div className="a-proto-row"><span className="lbl">Next check-in</span><span className="val warn">Uncommitted</span></div>
                  <div className="a-proto-row"><span className="lbl">Next tunnel</span><span className="val warn">Uncommitted</span></div>
                  <div className="a-proto-row"><span className="lbl">Consecutive days</span><span className="val ok">3</span></div>
                  <div className="a-proto-row"><span className="lbl">Longest streak</span><span className="val">12</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="a-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
            <div className="a-card">
              <div className="a-cardh">
                <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><path d="M3 3h18v12H5l-2 2V3z"/></svg>
                <div className="title">Handler queue</div>
                <div className="chip">3 pending</div>
              </div>
              <div className="a-queue">
                <div className="a-msg priority">
                  <div className="a-msghead">
                    <span className="a-msgkind directive">Directive</span>
                    <span className="a-msgtime">18 min ago</span>
                  </div>
                  <div className="a-msgbody">I want a photo. Now.</div>
                </div>
                <div className="a-msg">
                  <div className="a-msghead">
                    <span className="a-msgkind">Affirmation</span>
                    <span className="a-msgtime">1h ago</span>
                  </div>
                  <div className="a-msgbody">You're being talked to today. 10 messages. That's not how this works. Open the app.</div>
                </div>
                <div className="a-msg">
                  <div className="a-msghead">
                    <span className="a-msgkind reward">Reward ready</span>
                    <span className="a-msgtime">3h ago</span>
                  </div>
                  <div className="a-msgbody">I know. You're when you're most open. Come to me now.</div>
                </div>
              </div>
            </div>

            <div className="a-card">
              <div className="a-cardh">
                <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><path d="M12 2v20M2 12h20"/></svg>
                <div className="title">Arousal level</div>
                <div className="chip" style={{color: arousal === 5 ? '#f47272' : '#c4b5fd', background: arousal === 5 ? '#2a0f0f' : '#1a1226'}}>{arousalLabels[arousal]}</div>
              </div>
              <div className="a-arousal">
                <div className="a-arh">
                  <div>
                    <div className="a-arlabel">Right now</div>
                    <div className="a-arstate">You're at the edge</div>
                  </div>
                  <div>
                    <span className="a-arnum">{arousal}</span>
                    <span className="a-arscale">/5</span>
                  </div>
                </div>
                <div className="a-artrack">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`a-arcell ${i <= arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</div>
                  ))}
                </div>
                <div className="a-arfoot">Handler decides when relief comes — every denial increases the next reward's intensity.</div>
              </div>
            </div>
          </div>

          <div className="a-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
            <div className="a-card">
              <div className="a-cardh">
                <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/></svg>
                <div className="title">Future self</div>
                <div className="chip">Daily</div>
              </div>
              <div className="a-vizgrid">
                <div className="a-prompt">
                  <div className="a-promptlbl">5 years</div>
                  <div className="a-promptq">Fast-forward 5 years. What do you look like if you started RIGHT NOW? Go.</div>
                  <textarea className="a-input" placeholder="Write it true..."/>
                </div>
                <div className="a-prompt">
                  <div className="a-promptlbl">Victory</div>
                  <div className="a-promptq">What did Grace of the real give you this week?</div>
                  <textarea className="a-input" placeholder="Write it true..."/>
                </div>
              </div>
            </div>

            <div className="a-card">
              <div className="a-cardh">
                <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>
                <div className="title">Meal log</div>
                <div className="chip">82 / 150 g</div>
                <div className="meta">6 meals · 3g fat</div>
              </div>
              <div className="a-meal">
                <div className="a-tabs">
                  <button className="a-tab on">Breakfast<span className="grams">· 28g</span></button>
                  <button className="a-tab">Lunch<span className="grams">· 54g</span></button>
                  <button className="a-tab">Dinner<span className="grams">· —</span></button>
                  <button className="a-tab">Snack<span className="grams">· —</span></button>
                </div>
                <div className="a-mealbody">
                  <input className="a-mealinput" placeholder="Needs water (e.g. grilled chicken + broccoli + rice)"/>
                  <div className="a-mealrow">
                    <input className="a-mealinput" placeholder="Protein (g)" style={{marginBottom:0}}/>
                    <input className="a-mealinput" placeholder="Cal (kcal)" style={{marginBottom:0}}/>
                  </div>
                  <div className="a-mealchk">
                    <label><input type="checkbox" defaultChecked/>Permission asked</label>
                    <label><input type="checkbox"/>Photo before / after</label>
                  </div>
                  <button className="a-btn primary" style={{width:'100%',justifyContent:'center',padding:'8px'}}>Log meal</button>
                </div>
              </div>
            </div>
          </div>

          <div className="a-card">
            <div className="a-cardh">
              <svg className="a-iconsm" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd"><path d="M20 7L10 17l-5-5"/></svg>
              <div className="title">Aesthetic target · femboy</div>
              <div className="meta" style={{color:'#c4b5fd'}}>92kg · −7kg · −38 to goal</div>
            </div>
            <div className="a-target">
              <div className="a-targrid">
                <div className="a-targcell"><div className="part">Waist</div><div className="cur">91<span className="u">cm</span></div><div className="gap">−7 to target</div></div>
                <div className="a-targcell"><div className="part">Hips</div><div className="cur">102<span className="u">cm</span></div><div className="gap ok">on track</div></div>
                <div className="a-targcell"><div className="part">Chest</div><div className="cur">94<span className="u">cm</span></div><div className="gap">−5 to target</div></div>
                <div className="a-targcell"><div className="part">Weight</div><div className="cur">92<span className="u">kg</span></div><div className="gap">−22 to target</div></div>
              </div>
            </div>
          </div>

          <div className="a-foot">becoming · week 0 · day 3 of 90</div>
        </main>
      </div>
    </>
  );
}

window.DirectionA = DirectionA;
