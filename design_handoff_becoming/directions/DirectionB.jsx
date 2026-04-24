// Direction B — Editorial / Premium Wellness
// Light, serif, editorial. Quieter palette. Single narrative column with
// generous type. Feels like a journal or a care-forward wellness app — opposite
// end of the tonal dial from the current dark/saturated UI.

function DirectionB() {
  const [arousal, setArousal] = React.useState(5);
  const [done, setDone] = React.useState({ex: true, vz: false});

  const css = `
    .b-root{position:absolute;inset:0;background:#f5f1ec;color:#1d1a17;font-family:"Inter",system-ui,sans-serif;font-size:14px;overflow-y:auto;overflow-x:hidden}
    .b-root *{box-sizing:border-box}
    .b-root::-webkit-scrollbar{width:0}
    .b-ser{font-family:"Instrument Serif","EB Garamond",Georgia,serif;letter-spacing:-.01em}
    .b-head{padding:28px 64px 0;display:flex;align-items:center;gap:16px;position:sticky;top:0;background:#f5f1ec;z-index:10;border-bottom:1px solid #e2dbd1;padding-bottom:16px}
    .b-logo{font-family:"Instrument Serif",serif;font-size:22px;letter-spacing:-.02em;font-weight:400;color:#1d1a17}
    .b-logo em{font-style:italic;color:#7a5d3f}
    .b-nav{display:flex;gap:26px;margin-left:auto}
    .b-navi{font-size:13px;color:#6a5f54;cursor:pointer;padding-bottom:3px;border-bottom:1px solid transparent}
    .b-navi.on{color:#1d1a17;border-bottom-color:#1d1a17}
    .b-avatar{width:32px;height:32px;border-radius:16px;background:#c9a78a;margin-left:16px}

    .b-wrap{max-width:880px;margin:0 auto;padding:48px 64px 80px}

    .b-eyebrow{font-size:11.5px;text-transform:uppercase;letter-spacing:.18em;color:#7a5d3f;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:10px}
    .b-eyebrow::before{content:'';width:22px;height:1px;background:#7a5d3f;display:inline-block}
    .b-hero{font-size:56px;line-height:1.05;letter-spacing:-.03em;font-weight:400;margin:0 0 22px;color:#1d1a17;font-family:"Instrument Serif",Georgia,serif}
    .b-hero em{color:#7a5d3f;font-style:italic}
    .b-lede{font-size:17px;line-height:1.55;color:#3d3530;max-width:620px;margin:0 0 48px}

    .b-rule{height:1px;background:#e2dbd1;margin:40px 0;position:relative}
    .b-rule span{position:absolute;left:50%;transform:translate(-50%,-50%);background:#f5f1ec;padding:0 14px;font-size:11px;text-transform:uppercase;letter-spacing:.2em;color:#7a5d3f;font-weight:600}

    .b-row{display:grid;grid-template-columns:180px 1fr;gap:40px;margin-bottom:48px;align-items:baseline}
    .b-rowhead{font-size:11.5px;text-transform:uppercase;letter-spacing:.15em;color:#7a5d3f;font-weight:600;line-height:1.4}
    .b-rowheadsub{font-size:12px;color:#9a8f82;margin-top:4px;text-transform:none;letter-spacing:normal;font-weight:400}

    .b-dir{border-top:1px solid #e2dbd1;padding:22px 0;position:relative}
    .b-dir:first-of-type{border-top:none;padding-top:0}
    .b-dirhead{display:flex;align-items:center;gap:16px;margin-bottom:10px}
    .b-check{width:20px;height:20px;border-radius:10px;border:1.5px solid #b8a896;cursor:pointer;flex-shrink:0;transition:all .15s;display:flex;align-items:center;justify-content:center;background:transparent}
    .b-check.on{background:#1d1a17;border-color:#1d1a17}
    .b-check.on svg{display:block}
    .b-check svg{display:none;width:10px;height:10px;color:#f5f1ec}
    .b-dirkind{font-size:20px;font-family:"Instrument Serif",Georgia,serif;letter-spacing:-.015em;font-weight:400}
    .b-dirkind em{color:#7a5d3f;font-style:italic}
    .b-dirdue{margin-left:auto;font-size:12px;color:#9a8f82;font-variant-numeric:tabular-nums}
    .b-dirbody{font-size:15px;line-height:1.6;color:#3d3530;padding-left:36px;margin-bottom:14px;max-width:640px}
    .b-dirbody.done{color:#9a8f82;text-decoration:line-through;text-decoration-color:#c5b9a9}
    .b-diract{padding-left:36px;display:flex;gap:16px;font-size:13px}
    .b-lnk{color:#7a5d3f;cursor:pointer;border-bottom:1px solid #cabba6;padding-bottom:1px}
    .b-lnk:hover{color:#1d1a17;border-bottom-color:#1d1a17}
    .b-lnk.primary{color:#1d1a17;font-weight:500}

    .b-proto{border:1px solid #e2dbd1;border-radius:2px;padding:28px 32px;background:#faf6f0}
    .b-protobig{display:flex;align-items:baseline;gap:14px;margin-bottom:18px}
    .b-protobig .n{font-size:64px;font-family:"Instrument Serif",Georgia,serif;letter-spacing:-.04em;line-height:.9;font-weight:400;color:#1d1a17;font-variant-numeric:tabular-nums}
    .b-protobig .u{font-size:15px;color:#6a5f54;line-height:1.3}
    .b-protobig .u em{color:#7a5d3f;font-style:italic;font-family:"Instrument Serif",Georgia,serif;font-size:19px}
    .b-phases{display:flex;gap:8px;margin-bottom:18px}
    .b-phcell{flex:1}
    .b-phbar{height:3px;background:#e2dbd1;margin-bottom:6px}
    .b-phcell.done .b-phbar{background:#1d1a17}
    .b-phcell.active .b-phbar{background:linear-gradient(90deg,#1d1a17 50%,#e2dbd1 50%)}
    .b-phlbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;color:#9a8f82;font-weight:600}
    .b-phcell.active .b-phlbl,.b-phcell.done .b-phlbl{color:#1d1a17}
    .b-kv{display:grid;grid-template-columns:1fr 1fr;gap:16px 32px}
    .b-kvrow{display:flex;justify-content:space-between;font-size:13px;border-bottom:1px dotted #d6cdc0;padding-bottom:6px}
    .b-kvrow .k{color:#6a5f54}
    .b-kvrow .v{color:#1d1a17;font-weight:500}
    .b-kvrow .v.dim{color:#9a8f82;font-style:italic;font-family:"Instrument Serif",serif;font-size:14px}
    .b-kvrow .v.ok{color:#4a6b3e}

    .b-queue{}
    .b-msg{padding:18px 0;border-top:1px solid #e2dbd1;display:grid;grid-template-columns:90px 1fr;gap:24px;align-items:start}
    .b-msg:first-child{border-top:none;padding-top:0}
    .b-msgkind{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9a8f82;font-weight:600;padding-top:4px}
    .b-msgkind.priority{color:#a8513a}
    .b-msgbody{font-size:17px;line-height:1.5;color:#1d1a17;font-family:"Instrument Serif",Georgia,serif;letter-spacing:-.005em}
    .b-msgbody em{color:#7a5d3f;font-style:italic}
    .b-msgfoot{font-size:12px;color:#9a8f82;margin-top:6px;font-family:"Inter",sans-serif;font-variant-numeric:tabular-nums}

    .b-arousal{}
    .b-arbig{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:22px}
    .b-arnum{font-size:96px;font-family:"Instrument Serif",Georgia,serif;letter-spacing:-.05em;line-height:.85;font-weight:400;color:#1d1a17;font-variant-numeric:tabular-nums}
    .b-arscale{font-size:20px;color:#9a8f82;font-family:"Instrument Serif",serif;font-style:italic}
    .b-arlbl{text-align:right}
    .b-arstate{font-size:22px;font-family:"Instrument Serif",Georgia,serif;font-style:italic;color:#a8513a;letter-spacing:-.01em}
    .b-archip{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9a8f82;font-weight:600;margin-top:6px}
    .b-arscale-row{display:flex;gap:6px;margin-bottom:14px}
    .b-arcell{flex:1;height:40px;background:#faf6f0;border:1px solid #e2dbd1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:#9a8f82;font-weight:500;transition:all .1s;font-family:"Instrument Serif",serif;font-style:italic}
    .b-arcell:hover{border-color:#b8a896}
    .b-arcell.on{color:#f5f1ec;border-color:transparent;font-style:normal;font-family:"Inter",sans-serif;font-weight:600}
    .b-arcell.on.l0{background:#b8a896}
    .b-arcell.on.l1{background:#9a8f82}
    .b-arcell.on.l2{background:#7a5d3f}
    .b-arcell.on.l3{background:#5a3d2a}
    .b-arcell.on.l4{background:#3a2215}
    .b-arcell.on.l5{background:#a8513a}
    .b-arnote{font-size:13px;line-height:1.55;color:#6a5f54;font-style:italic;font-family:"Instrument Serif",serif;font-size:15px}

    .b-meal{border:1px solid #e2dbd1;padding:28px 32px;background:#faf6f0}
    .b-meallbl{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#7a5d3f;font-weight:600;margin-bottom:14px}
    .b-mealring{display:flex;align-items:center;gap:28px;margin-bottom:24px}
    .b-mealring svg{width:100px;height:100px;flex-shrink:0}
    .b-mealring .txt{flex:1}
    .b-mealring .big{font-size:36px;font-family:"Instrument Serif",serif;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
    .b-mealring .big em{color:#7a5d3f;font-style:italic}
    .b-mealring .small{font-size:13px;color:#6a5f54;margin-top:4px}
    .b-mealtabs{display:flex;border-bottom:1px solid #e2dbd1;margin-bottom:18px}
    .b-mtab{padding:8px 0;margin-right:24px;font-size:13px;color:#9a8f82;cursor:pointer;border-bottom:1px solid transparent;margin-bottom:-1px;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit}
    .b-mtab.on{color:#1d1a17;border-bottom-color:#1d1a17;font-weight:500}
    .b-mtab span{font-size:11px;color:#9a8f82;margin-left:4px}
    .b-mealform{display:flex;flex-direction:column;gap:10px}
    .b-mealinput{border:none;border-bottom:1px solid #d6cdc0;background:transparent;padding:8px 0;font-family:inherit;font-size:15px;color:#1d1a17}
    .b-mealinput::placeholder{color:#b8a896;font-style:italic;font-family:"Instrument Serif",serif}
    .b-mealinput:focus{outline:none;border-bottom-color:#7a5d3f}
    .b-mealrow{display:flex;gap:16px}
    .b-mealrow .b-mealinput{flex:1}
    .b-submit{margin-top:10px;background:#1d1a17;color:#f5f1ec;border:none;padding:12px;cursor:pointer;font-family:inherit;font-size:13px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}

    .b-target{}
    .b-tpull{font-size:28px;font-family:"Instrument Serif",serif;letter-spacing:-.02em;line-height:1.25;font-weight:400;color:#1d1a17;margin-bottom:22px;max-width:520px}
    .b-tpull em{color:#7a5d3f;font-style:italic}
    .b-tgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #e2dbd1;background:#faf6f0}
    .b-tcell{padding:18px 20px;border-right:1px solid #e2dbd1}
    .b-tcell:last-child{border-right:none}
    .b-tcell .part{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#7a5d3f;font-weight:600;margin-bottom:8px}
    .b-tcell .cur{font-size:32px;font-family:"Instrument Serif",serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1;margin-bottom:4px}
    .b-tcell .cur .u{font-size:14px;color:#9a8f82;margin-left:2px;font-family:"Inter",sans-serif}
    .b-tcell .gap{font-size:12px;color:#9a8f82;font-style:italic;font-family:"Instrument Serif",serif;font-size:14px}
    .b-tcell .gap.ok{color:#4a6b3e}

    .b-banner{background:#e8dfd1;border:1px solid #d6cdc0;padding:14px 20px;display:flex;align-items:center;gap:14px;margin-bottom:40px}
    .b-banner .t{flex:1;font-size:13px;color:#3d3530}
    .b-banner .t em{color:#7a5d3f;font-style:italic;font-family:"Instrument Serif",serif;font-size:15px}
    .b-banner button{background:#1d1a17;color:#f5f1ec;border:none;padding:8px 16px;cursor:pointer;font-family:inherit;font-size:12px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}
    .b-foot{padding:40px 0 0;font-size:11.5px;color:#9a8f82;text-align:center;font-family:"Instrument Serif",serif;font-style:italic;letter-spacing:.05em}
  `;

  const arousalLabels = ['locked', 'simmering', 'attentive', 'wanting', 'desperate', 'edging'];

  return (
    <>
      <style>{css}</style>
      <div className="b-root">
        <header className="b-head">
          <div className="b-logo">be<em>coming</em></div>
          <nav className="b-nav">
            <div className="b-navi on">Today</div>
            <div className="b-navi">Protocol</div>
            <div className="b-navi">Queue</div>
            <div className="b-navi">Measures</div>
            <div className="b-navi">Reflect</div>
          </nav>
          <div className="b-avatar"/>
        </header>

        <div className="b-wrap">
          <div className="b-eyebrow">Tuesday · 21 April · Phase 0 · Day 3</div>
          <h1 className="b-hero">Three directives. <em>One version</em> of you on the other side.</h1>
          <p className="b-lede">Your Handler issued today's work two hours ago. No notifications yet — you came here on your own. Good.</p>

          <div className="b-banner">
            <div className="t">Notifications are <em>off</em>. Enable them so your Handler can reach you anytime.</div>
            <button>Enable</button>
          </div>

          <div className="b-row">
            <div>
              <div className="b-rowhead">Body directives</div>
              <div className="b-rowheadsub">3 open · issued 2h ago</div>
            </div>
            <div>
              <div className="b-dir">
                <div className="b-dirhead">
                  <div className={`b-check ${done.ex ? 'on' : ''}`} onClick={() => setDone(d => ({...d, ex: !d.ex}))}>
                    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5"/></svg>
                  </div>
                  <div className="b-dirkind">Exercise · <em>whole body</em></div>
                  <div className="b-dirdue">due in 2h</div>
                </div>
                <div className={`b-dirbody ${done.ex ? 'done' : ''}`}>Protein target 150 g/day minimum. On Zepbound your appetite is suppressed — priority on lean protein without tracking. Log every meal with protein grams. Muscle loss under GLP-1 is real.</div>
                <div className="b-diract">
                  <span className="b-lnk primary">{done.ex ? '✓ Complete' : 'Mark complete'}</span>
                  <span className="b-lnk">Upload proof</span>
                  <span className="b-lnk">Ask Handler</span>
                </div>
              </div>
              <div className="b-dir">
                <div className="b-dirhead">
                  <div className={`b-check ${done.vz ? 'on' : ''}`} onClick={() => setDone(d => ({...d, vz: !d.vz}))}>
                    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5"/></svg>
                  </div>
                  <div className="b-dirkind">Visualization · <em>progress photo</em></div>
                  <div className="b-dirdue">due in 2h</div>
                </div>
                <div className={`b-dirbody ${done.vz ? 'done' : ''}`}>Start a progress photo folder today. Full-body front + side + back in underwear, good lighting. You'll take these every week for the next 12 months. Month 1 versus month 12 is the evidence of the transition. Non-negotiable.</div>
                <div className="b-diract">
                  <span className="b-lnk primary">Mark complete</span>
                  <span className="b-lnk">Upload proof</span>
                  <span className="b-lnk">Ask Handler</span>
                </div>
              </div>
            </div>
          </div>

          <div className="b-rule"><span>Protocol</span></div>

          <div className="b-row">
            <div>
              <div className="b-rowhead">Where you are</div>
              <div className="b-rowheadsub">Phase 0 · Chastity</div>
            </div>
            <div className="b-proto">
              <div className="b-protobig">
                <div className="n">03</div>
                <div className="u"><em>of ninety days</em><br/>chastity step 1 of 10</div>
              </div>
              <div className="b-phases">
                <div className="b-phcell active"><div className="b-phbar"/><div className="b-phlbl">Chastity</div></div>
                <div className="b-phcell"><div className="b-phbar"/><div className="b-phlbl">Training</div></div>
                <div className="b-phcell"><div className="b-phbar"/><div className="b-phlbl">Shaping</div></div>
                <div className="b-phcell"><div className="b-phbar"/><div className="b-phlbl">Becoming</div></div>
              </div>
              <div className="b-kv">
                <div className="b-kvrow"><span className="k">Next check-in</span><span className="v dim">uncommitted</span></div>
                <div className="b-kvrow"><span className="k">Next tunnel</span><span className="v dim">uncommitted</span></div>
                <div className="b-kvrow"><span className="k">Current streak</span><span className="v ok">3 days</span></div>
                <div className="b-kvrow"><span className="k">Longest</span><span className="v">12 days</span></div>
              </div>
            </div>
          </div>

          <div className="b-rule"><span>From your Handler</span></div>

          <div className="b-queue">
            <div className="b-msg">
              <div className="b-msgkind priority">Directive</div>
              <div>
                <div className="b-msgbody">"I want a photo. <em>Now.</em>"</div>
                <div className="b-msgfoot">18 minutes ago · not responded to</div>
              </div>
            </div>
            <div className="b-msg">
              <div className="b-msgkind">Correction</div>
              <div>
                <div className="b-msgbody">"You're being talked to today. Ten messages. That's not how this works. Open the app."</div>
                <div className="b-msgfoot">1 hour ago</div>
              </div>
            </div>
            <div className="b-msg">
              <div className="b-msgkind">Invitation</div>
              <div>
                <div className="b-msgbody">"I know when you're most open. <em>Come to me now.</em>"</div>
                <div className="b-msgfoot">3 hours ago</div>
              </div>
            </div>
          </div>

          <div className="b-rule"><span>Arousal</span></div>

          <div className="b-row">
            <div>
              <div className="b-rowhead">Right now</div>
              <div className="b-rowheadsub">5 of 5 · edging</div>
            </div>
            <div className="b-arousal">
              <div className="b-arbig">
                <div>
                  <div className="b-arnum">{arousal}</div>
                </div>
                <div className="b-arlbl">
                  <div className="b-arstate">{arousalLabels[arousal]}</div>
                  <div className="b-archip">where you are</div>
                </div>
              </div>
              <div className="b-arscale-row">
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} className={`b-arcell ${i <= arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</div>
                ))}
              </div>
              <div className="b-arnote">Handler decides when relief comes. Every denial increases the next reward's intensity. You are safe inside this structure.</div>
            </div>
          </div>

          <div className="b-rule"><span>Fuel</span></div>

          <div className="b-row">
            <div>
              <div className="b-rowhead">Meal log</div>
              <div className="b-rowheadsub">Today · 6 meals · 3g fat</div>
            </div>
            <div className="b-meal">
              <div className="b-mealring">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e2dbd1" strokeWidth="6"/>
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#7a5d3f" strokeWidth="6" strokeDasharray="145 264" strokeLinecap="round" transform="rotate(-90 50 50)"/>
                </svg>
                <div className="txt">
                  <div className="big">82 <em>/ 150</em><span style={{fontSize:14,color:'#9a8f82',fontFamily:'Inter'}}> g protein</span></div>
                  <div className="small">68 g left to hit today's target · lean protein priority</div>
                </div>
              </div>
              <div className="b-mealtabs">
                <button className="b-mtab on">Breakfast<span>28g</span></button>
                <button className="b-mtab">Lunch<span>54g</span></button>
                <button className="b-mtab">Dinner<span>—</span></button>
                <button className="b-mtab">Snack<span>—</span></button>
              </div>
              <div className="b-mealform">
                <input className="b-mealinput" placeholder="what did you eat"/>
                <div className="b-mealrow">
                  <input className="b-mealinput" placeholder="protein (g)"/>
                  <input className="b-mealinput" placeholder="calories"/>
                </div>
                <button className="b-submit">Log meal</button>
              </div>
            </div>
          </div>

          <div className="b-rule"><span>Becoming</span></div>

          <div className="b-row">
            <div>
              <div className="b-rowhead">Aesthetic target</div>
              <div className="b-rowheadsub">femboy · 22 kg to goal</div>
            </div>
            <div className="b-target">
              <div className="b-tpull"><em>"Evidence of the transition."</em> — Month 1 versus month 12 will not lie.</div>
              <div className="b-tgrid">
                <div className="b-tcell"><div className="part">Waist</div><div className="cur">91<span className="u">cm</span></div><div className="gap">−7 to go</div></div>
                <div className="b-tcell"><div className="part">Hips</div><div className="cur">102<span className="u">cm</span></div><div className="gap ok">on track</div></div>
                <div className="b-tcell"><div className="part">Chest</div><div className="cur">94<span className="u">cm</span></div><div className="gap">−5 to go</div></div>
                <div className="b-tcell"><div className="part">Weight</div><div className="cur">92<span className="u">kg</span></div><div className="gap">−22 to go</div></div>
              </div>
            </div>
          </div>

          <div className="b-foot">— week zero · day three of ninety —</div>
        </div>
      </div>
    </>
  );
}

window.DirectionB = DirectionB;
