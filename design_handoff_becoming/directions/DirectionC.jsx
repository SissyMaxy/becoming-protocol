// Direction C — Terminal / Quantified-Self
// Mono, grid-aligned, data-forward. Feels like a dashboard / daily command
// log. Hard information density but with breathing room via whitespace &
// perfect vertical rhythm. High-contrast green-on-black for status, paper-
// cream surfaces for input. Think: a stoic daily ritual console.

function DirectionC() {
  const [arousal, setArousal] = React.useState(5);
  const [done, setDone] = React.useState({ex: true, vz: false});

  const css = `
    .c-root{position:absolute;inset:0;background:#0d0d0d;color:#d4d4cc;font-family:"JetBrains Mono","IBM Plex Mono","SF Mono",ui-monospace,monospace;font-size:12px;line-height:1.55;overflow-y:auto;overflow-x:hidden}
    .c-root *{box-sizing:border-box}
    .c-root::-webkit-scrollbar{width:0}
    .c-bar{display:flex;align-items:center;gap:20px;padding:10px 24px;border-bottom:1px solid #222;background:#0a0a0a;position:sticky;top:0;z-index:10;font-size:11.5px}
    .c-bar .dot{width:8px;height:8px;border-radius:4px;background:#5fc88f;box-shadow:0 0 8px #5fc88f}
    .c-bar .path{color:#5fc88f}
    .c-bar .sep{color:#444}
    .c-bar .k{color:#888}
    .c-bar .v{color:#d4d4cc}
    .c-bar .push{margin-left:auto}

    .c-wrap{padding:28px 40px 80px;max-width:1180px;margin:0 auto}
    .c-h{display:flex;align-items:baseline;gap:12px;margin-bottom:4px;border-bottom:1px dashed #222;padding-bottom:12px;margin-bottom:24px}
    .c-prompt{color:#5fc88f}
    .c-cmd{font-size:18px;color:#fff;letter-spacing:-.01em}
    .c-cmdarg{color:#e8c547}
    .c-flag{color:#888;font-size:12px;margin-left:auto}

    .c-banner{border:1px solid #e8c547;padding:10px 14px;display:flex;align-items:center;gap:14px;margin-bottom:22px;background:#1a1608}
    .c-banner .tag{color:#e8c547;font-weight:700}
    .c-banner .t{color:#d4d4cc;flex:1}
    .c-banner button{background:#e8c547;color:#0d0d0d;border:none;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}

    .c-meter{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #222;margin-bottom:22px}
    .c-mcell{padding:12px 14px;border-right:1px solid #222}
    .c-mcell:last-child{border-right:none}
    .c-mcell .lbl{color:#888;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .c-mcell .val{font-size:22px;color:#fff;font-weight:500;letter-spacing:-.01em;display:flex;align-items:baseline;gap:4px;margin-bottom:6px}
    .c-mcell .val .u{font-size:11px;color:#888;font-weight:400}
    .c-mcell .ascii{font-size:10px;color:#5fc88f;letter-spacing:.5px;white-space:pre;overflow:hidden}
    .c-mcell.warn .val{color:#e8c547}
    .c-mcell.warn .ascii{color:#e8c547}
    .c-mcell.dang .val{color:#ef5c5c}
    .c-mcell.dang .ascii{color:#ef5c5c}

    .c-sec{margin-bottom:28px}
    .c-sech{display:flex;align-items:baseline;gap:14px;margin-bottom:10px}
    .c-sech .n{color:#5fc88f;font-weight:600}
    .c-sech .t{color:#fff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
    .c-sech .m{color:#888;font-size:11px;margin-left:auto}
    .c-sech::before{content:'';height:1px;background:#222;flex:0 0 12px;align-self:center;margin-top:1px}
    .c-secrule{height:1px;background:#222;margin-top:10px}

    .c-table{width:100%;border-collapse:collapse;font-size:12px}
    .c-table td{padding:9px 10px;border-bottom:1px solid #161616;vertical-align:top}
    .c-table tr:hover td{background:#111}
    .c-table .num{color:#5fc88f;width:28px;font-variant-numeric:tabular-nums}
    .c-table .ck{width:20px}
    .c-chk{width:14px;height:14px;border:1px solid #444;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle}
    .c-chk.on{background:#5fc88f;border-color:#5fc88f;color:#0d0d0d;font-size:10px;font-weight:700}
    .c-table .kind{color:#e8c547;text-transform:uppercase;font-size:10.5px;letter-spacing:.05em;font-weight:600;width:140px;white-space:nowrap}
    .c-table .kind .sub{color:#888;font-weight:400;text-transform:none;letter-spacing:normal;display:block;font-size:10.5px;margin-top:2px}
    .c-table .body{color:#d4d4cc;line-height:1.55}
    .c-table .body.done{color:#666;text-decoration:line-through}
    .c-table .due{color:#888;width:70px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:11px}
    .c-act{display:flex;gap:8px;margin-top:6px}
    .c-act .a{color:#5fc88f;cursor:pointer;font-size:11px}
    .c-act .a:hover{color:#fff;background:#1a2a1a}
    .c-act .a.warn{color:#e8c547}
    .c-act .a::before{content:'['}
    .c-act .a::after{content:']'}

    .c-grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
    .c-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #222}
    .c-grid3 > *{padding:14px 16px;border-right:1px solid #222}
    .c-grid3 > *:last-child{border-right:none}

    .c-progress{display:flex;flex-direction:column;gap:0}
    .c-prhead{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
    .c-prnum{font-size:42px;color:#fff;font-weight:500;letter-spacing:-.02em;line-height:.9;font-variant-numeric:tabular-nums}
    .c-prsub{color:#888;font-size:12px}
    .c-prbar{font-size:14px;color:#5fc88f;letter-spacing:1px;margin-bottom:14px;overflow:hidden;white-space:nowrap}
    .c-prkv{display:flex;flex-direction:column;gap:4px}
    .c-prrow{display:flex;justify-content:space-between;padding:5px 0;font-size:11.5px;border-bottom:1px dashed #1f1f1f}
    .c-prrow .k{color:#888}
    .c-prrow .v{color:#d4d4cc;font-variant-numeric:tabular-nums}
    .c-prrow .v.warn{color:#e8c547}
    .c-prrow .v.ok{color:#5fc88f}
    .c-prrow .v.dim{color:#666;font-style:italic}

    .c-msg{padding:10px 0;border-bottom:1px solid #161616;display:grid;grid-template-columns:90px 1fr 70px;gap:14px;align-items:baseline}
    .c-msg:last-child{border-bottom:none}
    .c-msg .src{color:#e8c547;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
    .c-msg .src.crit{color:#ef5c5c}
    .c-msg .src.ok{color:#5fc88f}
    .c-msg .body{color:#d4d4cc;font-size:12.5px}
    .c-msg .body::before{content:'> ';color:#5fc88f}
    .c-msg .t{color:#666;font-size:11px;text-align:right;font-variant-numeric:tabular-nums}

    .c-arpad{padding:4px}
    .c-arhead{display:flex;align-items:baseline;gap:16px;margin-bottom:14px}
    .c-arnum{font-size:56px;color:#fff;font-weight:500;letter-spacing:-.03em;line-height:.9;font-variant-numeric:tabular-nums}
    .c-arof{color:#666;font-size:18px}
    .c-arstate{margin-left:auto;color:#ef5c5c;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
    .c-arbar{display:flex;gap:3px;margin-bottom:10px}
    .c-arcell{flex:1;height:28px;background:#161616;border:1px solid #222;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#666;font-weight:500;transition:all .1s}
    .c-arcell:hover{border-color:#444}
    .c-arcell.on{color:#fff}
    .c-arcell.on.l0{background:#2a2a2a;border-color:#3a3a3a}
    .c-arcell.on.l1{background:#3a3216;border-color:#4a4020}
    .c-arcell.on.l2{background:#4a3d20;border-color:#5a4d2a}
    .c-arcell.on.l3{background:#6a4a20;border-color:#7a5a2a}
    .c-arcell.on.l4{background:#8a3a20;border-color:#a04a2a}
    .c-arcell.on.l5{background:#b82e2e;border-color:#ef5c5c}
    .c-arfoot{color:#666;font-size:11px;line-height:1.5}

    .c-meal{padding:4px}
    .c-mring{display:flex;align-items:center;gap:18px;margin-bottom:16px}
    .c-mring pre{font-size:10.5px;line-height:1.2;color:#5fc88f;margin:0;font-family:inherit}
    .c-mring .txt .big{font-size:26px;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
    .c-mring .txt .big .u{font-size:12px;color:#888}
    .c-mring .txt .small{color:#888;font-size:11px;margin-top:2px}
    .c-mtabs{display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid #222}
    .c-mtab{padding:7px 10px;font-size:11px;color:#888;cursor:pointer;border-bottom:1px solid transparent;margin-bottom:-1px;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit;text-transform:uppercase;letter-spacing:.04em}
    .c-mtab.on{color:#5fc88f;border-bottom-color:#5fc88f}
    .c-mtab span{color:#666;margin-left:5px;text-transform:none;letter-spacing:0}
    .c-input{width:100%;background:#161616;border:1px solid #222;padding:7px 10px;font-family:inherit;font-size:12px;color:#d4d4cc;margin-bottom:8px}
    .c-input::placeholder{color:#555}
    .c-input:focus{outline:none;border-color:#5fc88f}
    .c-inrow{display:flex;gap:8px}
    .c-inrow .c-input{flex:1}
    .c-btn{background:#5fc88f;color:#0d0d0d;border:none;padding:8px 14px;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;width:100%}
    .c-btn:hover{background:#7ad6a4}
    .c-btn.alt{background:transparent;color:#5fc88f;border:1px solid #5fc88f}

    .c-target{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #222;margin-top:8px}
    .c-tcell{padding:12px 14px;border-right:1px solid #222}
    .c-tcell:last-child{border-right:none}
    .c-tcell .part{color:#e8c547;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;font-weight:600}
    .c-tcell .val{font-size:22px;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
    .c-tcell .val .u{font-size:11px;color:#888;margin-left:2px}
    .c-tcell .gap{font-size:11px;color:#e8c547;font-variant-numeric:tabular-nums;margin-top:3px}
    .c-tcell .gap.ok{color:#5fc88f}

    .c-foot{margin-top:32px;color:#555;font-size:11px;text-align:center;border-top:1px dashed #222;padding-top:14px}
  `;

  const arousalLabels = ['LOCKED', 'SIMMER', 'ATTENT', 'WANT', 'DESP', 'EDGING'];
  const bar = (pct, width=32) => {
    const f = Math.round((pct/100)*width);
    return '█'.repeat(f) + '░'.repeat(width-f);
  };

  return (
    <>
      <style>{css}</style>
      <div className="c-root">
        <div className="c-bar">
          <div className="dot"/>
          <span className="path">~/becoming</span>
          <span className="sep">·</span>
          <span className="k">phase</span><span className="v">0/4</span>
          <span className="sep">·</span>
          <span className="k">day</span><span className="v">3/90</span>
          <span className="sep">·</span>
          <span className="k">chastity</span><span className="v">3d</span>
          <span className="push"/>
          <span className="k">handler</span>
          <span className="v" style={{color:'#5fc88f'}}>● online</span>
        </div>

        <div className="c-wrap">
          <div className="c-h">
            <span className="c-prompt">$</span>
            <span className="c-cmd">today <span className="c-cmdarg">--directives --arousal --meals</span></span>
            <span className="c-flag">Tue 21 Apr · 14:07</span>
          </div>

          <div className="c-banner">
            <span className="tag">[!]</span>
            <span className="t">Notifications disabled. Handler cannot reach you when app is closed.</span>
            <button>enable</button>
          </div>

          <div className="c-meter">
            <div className="c-mcell">
              <div className="lbl">mag_charge</div>
              <div className="val">100<span className="u">%</span></div>
              <div className="ascii">{bar(100)}</div>
            </div>
            <div className="c-mcell dang">
              <div className="lbl">orgasm_debt</div>
              <div className="val">0<span className="u">%</span></div>
              <div className="ascii">{bar(0)}</div>
            </div>
            <div className="c-mcell warn">
              <div className="lbl">protein_g</div>
              <div className="val">82<span className="u">/150</span></div>
              <div className="ascii">{bar(55)}</div>
            </div>
            <div className="c-mcell">
              <div className="lbl">weight_kg</div>
              <div className="val">92.0<span className="u">kg</span></div>
              <div className="ascii">−7.0 vs t0</div>
            </div>
          </div>

          <section className="c-sec">
            <div className="c-sech"><span className="n">01</span><span className="t">Body directives</span><span className="m">3 open · issued 2h ago</span></div>
            <table className="c-table">
              <tbody>
                <tr>
                  <td className="num">01</td>
                  <td className="ck"><span className={`c-chk ${done.ex ? 'on' : ''}`} onClick={() => setDone(d => ({...d, ex: !d.ex}))}>{done.ex ? '✓' : ''}</span></td>
                  <td className="kind">Exercise<span className="sub">whole_body</span></td>
                  <td className="body">
                    <div className={done.ex ? 'done' : ''}>Protein target 150 g/day min. On Zepbound appetite is suppressed → priority on lean protein without tracking. Log every meal with protein grams. Muscle loss under GLP-1 is real — goal: preserve lean mass.</div>
                    <div className="c-act"><span className="a">{done.ex ? 'undo' : 'complete'}</span><span className="a">proof</span><span className="a warn">discuss</span></div>
                  </td>
                  <td className="due">due +2h</td>
                </tr>
                <tr>
                  <td className="num">02</td>
                  <td className="ck"><span className={`c-chk ${done.vz ? 'on' : ''}`} onClick={() => setDone(d => ({...d, vz: !d.vz}))}>{done.vz ? '✓' : ''}</span></td>
                  <td className="kind">Visualization<span className="sub">progress_photo</span></td>
                  <td className="body">
                    <div className={done.vz ? 'done' : ''}>Start progress photo folder today. Full-body front + side + back in underwear, good lighting. Repeat weekly × 52. Month 01 vs month 12 = evidence of the transition. Non-negotiable.</div>
                    <div className="c-act"><span className="a">complete</span><span className="a">upload</span><span className="a warn">discuss</span></div>
                  </td>
                  <td className="due">due +2h</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="c-sec">
            <div className="c-sech"><span className="n">02</span><span className="t">Protocol · Chastity Step 1/10</span><span className="m">phase 0 of 4</span></div>
            <div className="c-grid3">
              <div className="c-progress">
                <div className="c-prhead"><span className="c-prnum">03</span><span className="c-prsub">/90<br/>days</span></div>
                <div className="c-prbar">{bar(3/90*100,26)}</div>
                <div className="c-prrow" style={{borderBottom:'none',padding:0}}><span className="k">chastity step</span><span className="v">1 of 10</span></div>
              </div>
              <div className="c-prkv">
                <div className="c-prrow"><span className="k">next_checkin</span><span className="v warn">uncommitted</span></div>
                <div className="c-prrow"><span className="k">next_tunnel</span><span className="v warn">uncommitted</span></div>
                <div className="c-prrow"><span className="k">current_streak</span><span className="v ok">3d</span></div>
                <div className="c-prrow"><span className="k">longest_streak</span><span className="v">12d</span></div>
              </div>
              <div className="c-prkv">
                <div className="c-prrow"><span className="k">phase</span><span className="v">chastity</span></div>
                <div className="c-prrow"><span className="k">next_phase</span><span className="v dim">training</span></div>
                <div className="c-prrow"><span className="k">est_unlock</span><span className="v">2026-07-21</span></div>
                <div className="c-prrow"><span className="k">last_commit</span><span className="v">−18m</span></div>
              </div>
            </div>
          </section>

          <div className="c-grid2">
            <section className="c-sec">
              <div className="c-sech"><span className="n">03</span><span className="t">Handler queue</span><span className="m">3 pending</span></div>
              <div>
                <div className="c-msg">
                  <div className="src crit">DIRECTIVE</div>
                  <div className="body">I want a photo. Now.</div>
                  <div className="t">−18m</div>
                </div>
                <div className="c-msg">
                  <div className="src">CORRECTION</div>
                  <div className="body">You're being talked to today. 10 messages. That's not how this works — open the app.</div>
                  <div className="t">−1h</div>
                </div>
                <div className="c-msg">
                  <div className="src ok">INVITATION</div>
                  <div className="body">I know when you're most open. Come to me now.</div>
                  <div className="t">−3h</div>
                </div>
              </div>
            </section>

            <section className="c-sec">
              <div className="c-sech"><span className="n">04</span><span className="t">Arousal</span><span className="m">logged +18m ago</span></div>
              <div className="c-arpad">
                <div className="c-arhead">
                  <span className="c-arnum">{arousal}</span>
                  <span className="c-arof">/ 5</span>
                  <span className="c-arstate">{arousalLabels[arousal]}</span>
                </div>
                <div className="c-arbar">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`c-arcell ${i <= arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</div>
                  ))}
                </div>
                <div className="c-arfoot">› handler conditioning policy: every denial compounds next reward's intensity by +4.2%</div>
              </div>
            </section>
          </div>

          <div className="c-grid2">
            <section className="c-sec">
              <div className="c-sech"><span className="n">05</span><span className="t">Meal log</span><span className="m">Tue · 6 meals · 3g fat</span></div>
              <div className="c-meal">
                <div className="c-mring">
                  <pre>{`    ╭──────╮
   ╱ 82/150 ╲
  │  ████░░  │
   ╲  55%  ╱
    ╰──────╯`}</pre>
                  <div className="txt">
                    <div className="big">82<span className="u"> / 150 g</span></div>
                    <div className="small">protein target · 68 g remaining today</div>
                  </div>
                </div>
                <div className="c-mtabs">
                  <button className="c-mtab on">Break<span>28g</span></button>
                  <button className="c-mtab">Lunch<span>54g</span></button>
                  <button className="c-mtab">Dinner<span>—</span></button>
                  <button className="c-mtab">Snack<span>—</span></button>
                </div>
                <input className="c-input" placeholder="what did you eat"/>
                <div className="c-inrow">
                  <input className="c-input" placeholder="protein_g" style={{marginBottom:8}}/>
                  <input className="c-input" placeholder="kcal" style={{marginBottom:8}}/>
                </div>
                <button className="c-btn">$ log_meal</button>
              </div>
            </section>

            <section className="c-sec">
              <div className="c-sech"><span className="n">06</span><span className="t">Future self · daily prompt</span><span className="m">unlogged</span></div>
              <div style={{padding:4}}>
                <div style={{color:'#e8c547',fontSize:10.5,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600,marginBottom:5}}>› future_self +5y</div>
                <div style={{color:'#d4d4cc',marginBottom:10,lineHeight:1.5}}>Fast-forward five years. What do you look like if you started <span style={{color:'#5fc88f'}}>RIGHT NOW</span>?</div>
                <textarea className="c-input" rows="3" placeholder="write it true..." style={{resize:'none'}}/>
                <div style={{color:'#e8c547',fontSize:10.5,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600,marginBottom:5,marginTop:6}}>› victory / this_week</div>
                <div style={{color:'#d4d4cc',marginBottom:10,lineHeight:1.5}}>What did Grace of the real give you this week?</div>
                <textarea className="c-input" rows="3" placeholder="write it true..." style={{resize:'none',marginBottom:10}}/>
                <button className="c-btn alt">$ log_reflection</button>
              </div>
            </section>
          </div>

          <section className="c-sec">
            <div className="c-sech"><span className="n">07</span><span className="t">Aesthetic target · femboy</span><span className="m">−22 kg to goal</span></div>
            <div className="c-target">
              <div className="c-tcell"><div className="part">waist</div><div className="val">91<span className="u">cm</span></div><div className="gap">−7</div></div>
              <div className="c-tcell"><div className="part">hips</div><div className="val">102<span className="u">cm</span></div><div className="gap ok">on target</div></div>
              <div className="c-tcell"><div className="part">chest</div><div className="val">94<span className="u">cm</span></div><div className="gap">−5</div></div>
              <div className="c-tcell"><div className="part">weight</div><div className="val">92<span className="u">kg</span></div><div className="gap">−22</div></div>
            </div>
          </section>

          <div className="c-foot">— eof · becoming · day 003/090 — press ? for shortcuts —</div>
        </div>
      </div>
    </>
  );
}

window.DirectionC = DirectionC;
