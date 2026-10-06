// HUD stylesheet. OWNER: Agent E.  Everything is in `em` relative to .hud's font-size (16px * --ui-scale * --hud-scale, so settings.hudScale resizes the whole HUD).
//
// LAYOUT CONTRACT - the HUD is four reserved zones and every widget, dynamic or not, flows INSIDE its zone, so nothing can overlap:
//   .zl  left column    item (+count badge) | [position, coins] | status-chip row | standings | ghost delta
//   .zr  right column   lap / respawn / pause | timer | lap times | [minimap, speedometer]
//   .zb  bottom-centre  coaching card / nudge | rocket-start hint | "press X to skip" | drift label + meter | fps
//   .zt  top-centre     wrong-way | hold-to-respawn ring | event toasts
// The countdown number, "Final lap!" / finish ribbons and the intro card (.hz.c / .intro) are transient full-width flourishes on top.
// Budgets (em, 16:9 wide = 80 x 45, phone portrait = 24.4 x 52.7, phone landscape = 52.7 x 24.4) are noted per layout below; the
// @container rules at the end drop optional blocks (standings, lap times, minimap) when HUD size / large text leave too little room.
const RAW = /* css */ `
.hud{position:absolute;inset:0;font-family:var(--font-display);font-weight:400;font-size:calc(16px * var(--ui-scale) * var(--hud-scale));color:#fff;container:hud / size;
  -webkit-user-select:none;user-select:none;text-shadow:0 .07em 0 rgba(0,0,0,.55);--pad:1.3em;--ts:1;--pu:1.5;--glass1:rgba(26,36,92,.74);--glass2:rgba(8,12,34,.78);transition:opacity .35s,filter .35s;}
.hud *{box-sizing:border-box;}
.hud.dim{opacity:.4;filter:blur(1.5px);} .hud.gone{opacity:0;}
.hc .hud{--glass1:#101a52;--glass2:#080c22;}
.glass{position:relative;background:linear-gradient(180deg,var(--glass1),var(--glass2));border-radius:.8em;box-shadow:inset 0 0 0 .08em rgba(255,255,255,.15),inset 0 .08em 0 rgba(255,255,255,.12),0 .22em 0 rgba(0,0,0,.3);}

/* ------------------------------------------------------------ reserved zones */
.hz{position:absolute;display:flex;flex-direction:column;}
.hz.c{inset:0;align-items:center;justify-content:center;}
.zl,.zr{position:absolute;top:max(var(--pad),var(--sat));bottom:max(var(--pad),var(--sab));display:flex;flex-direction:column;gap:.55em;transition:opacity .5s,transform .5s var(--ease-out);}
.zl{left:max(var(--pad),var(--sal));align-items:flex-start;}
.zr{right:max(var(--pad),var(--sar));align-items:flex-end;}
.zl > *,.zr > *{flex:none;}
.zl-mid{display:contents;}
.zl .pos{order:9;margin-top:auto;}
.zr-inst{margin-top:auto;display:flex;flex-direction:column;align-items:flex-end;gap:.55em;}
.zb{position:absolute;left:50%;bottom:max(var(--pad),var(--sab));transform:translateX(-50%);width:max-content;max-width:calc(100% - 2 * (max(var(--pad),var(--sal)) + 14.5em));display:flex;flex-direction:column;align-items:center;gap:.5em;}
.zb > *{flex:none;max-width:100%;}
.zt{position:absolute;left:50%;top:calc(max(var(--pad),var(--sat)) + 2.6em);transform:translateX(-50%);width:26em;display:flex;flex-direction:column;align-items:center;gap:.4em;}

/* ------------------------------------------------------------ item slot */
.item{display:flex;align-items:center;gap:.7em;padding:0 .6em .6em .3em;}
.item-frame{position:relative;width:5.6em;height:5.6em;border-radius:1.1em;transform:skewX(-6deg);background:linear-gradient(180deg,rgba(40,56,130,.85),rgba(10,16,48,.88));box-shadow:inset 0 0 0 .1em rgba(255,255,255,.25),0 .25em 0 rgba(0,0,0,.35),0 .5em 1em rgba(0,0,0,.35);display:grid;place-items:center;transition:box-shadow .2s;}
.item-frame canvas{width:4.4em;height:4.4em;transform:skewX(6deg);filter:drop-shadow(0 .15em .15em rgba(0,0,0,.45));}
.item-frame .q{position:absolute;inset:0;display:grid;place-items:center;font-size:2.4em;color:rgba(255,255,255,.22);transform:skewX(6deg);}
.item.has .item-frame{box-shadow:inset 0 0 0 .14em var(--ic,#22d3ff),0 0 1.2em var(--ic,#22d3ff),0 .25em 0 rgba(0,0,0,.35);}
.item.roulette .item-frame{box-shadow:inset 0 0 0 .14em #ffd23f,0 0 1.1em rgba(255,210,63,.8),0 .25em 0 rgba(0,0,0,.35);}
.item.roulette .item-frame canvas{animation:roul .09s linear infinite;}
@keyframes roul{50%{transform:skewX(6deg) translateY(-.12em) scale(1.04)}}
.item.got .item-frame{animation:item-pop .55s var(--ease-spring);}
@keyframes item-pop{0%{transform:skewX(-6deg) scale(.6)}60%{transform:skewX(-6deg) scale(1.2)}100%{transform:skewX(-6deg) scale(1)}}
.item-count{position:absolute;right:-.5em;bottom:-.5em;min-width:1.8em;height:1.8em;padding:0 .35em;display:grid;place-items:center;border-radius:.9em;background:linear-gradient(180deg,#ffb04a,#ff7a1a);color:#fff;font-size:1.15em;box-shadow:0 .12em 0 #a34400,0 0 0 .1em #fff;transform:skewX(6deg);}
.item-meta{display:flex;flex-direction:column;gap:.2em;max-width:9em;}
.item-name{font-size:1.15em;line-height:1;text-transform:uppercase;letter-spacing:.03em;}
.item-hint{display:flex;align-items:center;gap:.4em;font-family:var(--font-ui);font-weight:900;font-size:.62em;letter-spacing:.06em;text-transform:uppercase;color:#dfe6ff;}
.item-hint .key{min-width:1.5em;height:1.5em;font-size:1em;}
.coins{display:inline-flex;align-items:center;gap:.4em;padding:.25em .8em .25em .35em;font-size:1.15em;}
.coins .ico{font-size:1.3em;color:#ffd23f;filter:drop-shadow(0 .06em 0 rgba(0,0,0,.5));}
.coins.pulse{animation:coin-pulse .3s var(--ease-spring);}
@keyframes coin-pulse{50%{transform:scale(1.18)}}

/* ------------------------------------------------------------ position */
.pos{position:relative;display:flex;align-items:flex-end;gap:.15em;line-height:.8;transform:skewX(-8deg);transform-origin:left bottom;}
.pos .pn{font-size:6.2em;text-shadow:none;background:linear-gradient(180deg,#fff 20%,var(--pc,#ff9a2a));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .06em 0 rgba(0,0,0,.6)) drop-shadow(0 0 .25em rgba(0,0,0,.5));}
.pos .ps{font-size:2.5em;margin-bottom:.1em;color:#fff;text-shadow:0 .06em 0 rgba(0,0,0,.7),0 0 .3em rgba(0,0,0,.6);}
.pos .po{align-self:flex-end;margin:0 0 .35em .4em;font-family:var(--font-ui);font-weight:900;font-size:1.05em;letter-spacing:.14em;text-transform:uppercase;color:#dfe6ff;text-shadow:0 .08em .3em rgba(0,0,0,.8);}
.pos.p1{--pc:#ffd23f;} .pos.p2{--pc:#cfd8ee;} .pos.p3{--pc:#e8934f;}
.pos.up{animation:pos-up .6s var(--ease-spring);} .pos.down{animation:pos-down .6s ease;}
@keyframes pos-up{0%{transform:skewX(-8deg) scale(var(--pu,1.5));filter:drop-shadow(0 0 .6em #7be04a) brightness(1.5)}100%{transform:skewX(-8deg) scale(1)}}
@keyframes pos-down{0%{transform:skewX(-8deg) scale(.8);filter:drop-shadow(0 0 .6em #ff3d6a)}100%{transform:skewX(-8deg) scale(1)}}

/* ------------------------------------------------------------ lap + timer */
.lapbox{display:flex;align-items:center;gap:.6em;padding:.3em .9em .3em .5em;transform:skewX(-6deg);}
.lapbox > *{transform:skewX(6deg);}
.lapbox .ll{font-family:var(--font-ui);font-weight:900;font-size:.62em;letter-spacing:.2em;color:#9db0ee;}
.lapbox .ln{font-size:1.9em;line-height:1;}
.lapbox .ln small{font-size:.6em;color:#b8c4f5;margin-left:.1em;}
.lapbox.pulse{animation:lap-pulse .5s var(--ease-spring);} @keyframes lap-pulse{40%{transform:skewX(-6deg) scale(1.2)}}
.timer{font-size:2.6em;line-height:1;letter-spacing:.01em;text-align:right;font-variant-numeric:tabular-nums;filter:drop-shadow(0 0 .25em rgba(0,0,0,.6));}
.timer small{font-size:.62em;opacity:.85;}
.laps{display:flex;flex-direction:column;gap:.18em;align-items:flex-end;font-size:1em;}
.laps .lr{display:flex;gap:.6em;align-items:baseline;padding:.12em .6em;border-radius:.5em;background:rgba(8,12,34,.5);font-variant-numeric:tabular-nums;animation:lap-in .5s var(--ease-spring) both;}
.laps .lr b{font-family:var(--font-ui);font-weight:900;font-size:.6em;letter-spacing:.14em;color:#9db0ee;}
.laps .lr span{font-size:1.05em;} .laps .lr i{font-style:normal;font-size:.8em;} .laps .lr i.up{color:#7be04a;} .laps .lr i.dn{color:#ff6f8f;}
.laps .lr.best span{color:#ffd23f;}
@keyframes lap-in{from{opacity:0;transform:translateX(1.2em)}to{opacity:1;transform:none}}
.ghostbox{display:flex;align-items:center;gap:.5em;padding:.25em .8em .25em .45em;font-size:1em;transform:skewX(-6deg);}
.ghostbox > *{transform:skewX(6deg);} .ghostbox .ico{font-size:1.4em;color:#cfe6ff;}
.ghostbox .gd{font-size:1.5em;font-variant-numeric:tabular-nums;min-width:3.4em;text-align:right;}
.ghostbox .gd.up{color:#7be04a;} .ghostbox .gd.dn{color:#ff6f8f;}
.ghostbox .gl{font-family:var(--font-ui);font-weight:900;font-size:.58em;letter-spacing:.16em;color:#9db0ee;}

/* ------------------------------------------------------------ leaderboard */
.board{display:flex;flex-direction:column;gap:.18em;min-width:11em;}
.board .br{display:grid;grid-template-columns:1.4em 1.9em minmax(0,1fr);align-items:center;gap:.4em;height:1.95em;padding:0 .7em 0 .3em;border-radius:.6em;background:rgba(8,12,34,.55);font-size:.95em;transform:skewX(-6deg);transition:background .2s;}
.board .br > *{transform:skewX(6deg);}
.board .br .bp{font-size:1.05em;text-align:center;} .board .br canvas{width:1.55em;height:1.55em;border-radius:50%;box-shadow:0 0 0 .1em rgba(255,255,255,.25);}
.board .br .bn{font-family:var(--font-ui);font-weight:900;font-size:.82em;letter-spacing:.03em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-shadow:0 .08em .2em rgba(0,0,0,.8);}
.board .br.me{background:linear-gradient(90deg,rgba(255,122,26,.85),rgba(255,122,26,.45));box-shadow:0 0 0 .1em rgba(255,255,255,.8);}
.board .br.me .bp{color:#fff;}
.board .br.p1 .bp{color:#ffd23f;} .board .br.p2 .bp{color:#cfd8ee;} .board .br.p3 .bp{color:#e8934f;}
.board .gap{height:.4em;margin:.05em 1em;border-radius:9px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.5) 0 .25em,transparent .25em .6em);opacity:.6;}

/* ------------------------------------------------------------ minimap */
.mini{width:10.4em;height:10.4em;padding:.35em;border-radius:1.1em;}
.mini canvas{width:100%;height:100%;display:block;border-radius:.8em;}

/* ------------------------------------------------------------ speedometer */
.speedo{position:relative;width:12.4em;height:11.2em;}
.speedo svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 .15em .3em rgba(0,0,0,.5));}
.speedo .trk{stroke:rgba(6,10,30,.72);}
.speedo .rim{stroke:rgba(255,255,255,.2);}
.speedo .tick{stroke:rgba(255,255,255,.55);} .speedo .tick.maj{stroke:rgba(255,255,255,.9);}
.speedo .fill{transition:none;}
.speedo .tip{fill:#fff;filter:drop-shadow(0 0 .3em #fff);}
.speedo .num{position:absolute;left:0;right:0;top:36%;text-align:center;line-height:.9;}
.speedo .num b{display:block;font-size:3.7em;font-weight:400;font-variant-numeric:tabular-nums;filter:drop-shadow(0 .06em 0 rgba(0,0,0,.65));}
.speedo .num span{font-family:var(--font-ui);font-weight:900;font-size:.8em;letter-spacing:.2em;color:#b8c4f5;text-transform:uppercase;text-shadow:0 .08em .3em rgba(0,0,0,.8);}
.speedo .boostlbl{position:absolute;left:0;right:0;bottom:.1em;text-align:center;font-size:1.25em;letter-spacing:.12em;color:#fff;opacity:0;transform:scale(.8);transition:opacity .15s,transform .2s var(--ease-spring);text-shadow:0 0 .6em #22d3ff,0 .06em 0 rgba(0,0,0,.6);}
.speedo.boost .boostlbl{opacity:1;transform:none;}
.speedo.boost .num b{color:#bdf3ff;text-shadow:0 0 .5em #22d3ff;}
.speedo.boost svg{filter:drop-shadow(0 0 .5em #22d3ff) drop-shadow(0 .15em .3em rgba(0,0,0,.5));}

/* ------------------------------------------------------------ drift meter (bottom of .zb: the label row above it is always reserved) */
.dwrap{position:relative;padding-top:1.7em;}
.dmeter{display:flex;gap:.35em;transform:skewX(-18deg);opacity:0;transition:opacity .15s;}
.dmeter.on{opacity:1;}
.dmeter i{display:block;width:3.4em;height:.95em;border-radius:.3em;background:rgba(6,10,30,.62);box-shadow:inset 0 0 0 .08em rgba(255,255,255,.22);overflow:hidden;position:relative;}
.dmeter i::after{content:'';position:absolute;inset:0;transform-origin:left;transform:scaleX(var(--f,0));background:linear-gradient(180deg,var(--c1),var(--c2));}
.dmeter i.lit{box-shadow:0 0 .9em var(--c2),inset 0 0 0 .08em #fff;animation:drift-lit .5s var(--ease-spring);}
@keyframes drift-lit{0%{transform:scale(1.35)}100%{transform:scale(1)}}
.dmeter i:nth-child(1){--c1:#7fc4ff;--c2:#3aa0ff;} .dmeter i:nth-child(2){--c1:#ffc46a;--c2:#ff9a1f;} .dmeter i:nth-child(3){--c1:#ff8fe3;--c2:#ff3dcb;}
.driftlbl{position:absolute;left:50%;top:0;transform:translateX(-50%) skewX(-8deg);font-size:.95em;letter-spacing:.1em;white-space:nowrap;opacity:0;}
.driftlbl.show{animation:driftlbl 1s ease both;} @keyframes driftlbl{0%{opacity:0;transform:translateX(-50%) skewX(-8deg) translateY(.6em)}15%{opacity:1;transform:translateX(-50%) skewX(-8deg)}70%{opacity:1}100%{opacity:0;transform:translateX(-50%) skewX(-8deg) translateY(-.4em)}}
.hint{font-family:var(--font-ui);font-weight:900;font-size:.8em;letter-spacing:.06em;text-transform:uppercase;color:#fff;padding:.4em 1em;border-radius:99px;background:rgba(8,12,34,.7);display:inline-flex;gap:.5em;align-items:center;box-shadow:inset 0 0 0 .1em rgba(255,255,255,.2);}
.hint .key{font-size:.9em;}

/* ------------------------------------------------------------ banners (centre) */
.cd{position:absolute;display:grid;place-items:center;font-size:12em;line-height:1;letter-spacing:.01em;opacity:0;transform:scale(2.2);pointer-events:none;}
.cd.show{animation:cd-pop .95s cubic-bezier(.2,1.5,.4,1) both;}
@keyframes cd-pop{0%{opacity:0;transform:scale(2.6) rotate(-8deg)}22%{opacity:1;transform:scale(1) rotate(0)}78%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.7)}}
.cd.n3{color:#ff4d6d;text-shadow:0 .06em 0 #7a0f27,0 0 .5em rgba(255,61,106,.7);} .cd.n2{color:#ff9a1f;text-shadow:0 .06em 0 #8a4400,0 0 .5em rgba(255,154,31,.7);} .cd.n1{color:#ffd23f;text-shadow:0 .06em 0 #8a6400,0 0 .5em rgba(255,210,63,.7);}
.cd.go{color:#8ff05a;font-size:11em;text-shadow:0 .06em 0 #2d7712,0 0 .6em rgba(123,224,74,.8);animation:go-pop 1.1s cubic-bezier(.2,1.5,.4,1) both;}
@keyframes go-pop{0%{opacity:0;transform:scale(.3) rotate(8deg)}20%{opacity:1;transform:scale(1.25)}35%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(1.9)}}
.burst{position:absolute;width:30em;height:30em;border-radius:50%;opacity:0;background:conic-gradient(from 0deg,rgba(255,255,255,.0),rgba(255,255,255,.55) 4%,rgba(255,255,255,0) 8%,rgba(255,255,255,0) 12.5%,rgba(255,255,255,.4) 16.5%,rgba(255,255,255,0) 20%,rgba(255,255,255,0) 25%,rgba(255,255,255,.55) 29%,rgba(255,255,255,0) 33%,rgba(255,255,255,0) 37.5%,rgba(255,255,255,.4) 41.5%,transparent 45%,transparent 50%,rgba(255,255,255,.55) 54%,transparent 58%,transparent 62.5%,rgba(255,255,255,.4) 66.5%,transparent 70%,transparent 75%,rgba(255,255,255,.55) 79%,transparent 83%,transparent 87.5%,rgba(255,255,255,.4) 91.5%,transparent 95%);-webkit-mask:radial-gradient(circle,transparent 18%,#000 30%,transparent 70%);mask:radial-gradient(circle,transparent 18%,#000 30%,transparent 70%);pointer-events:none;}
.burst.show{animation:burst .8s ease-out both;} @keyframes burst{0%{opacity:.9;transform:scale(.3) rotate(0)}100%{opacity:0;transform:scale(1.8) rotate(30deg)}}
.noflash .burst.show{animation:none;opacity:0;}
.cdhint{display:none;white-space:nowrap;} .cdhint.on{display:inline-flex;animation:fade-in .25s ease both;}
.banner{position:absolute;left:0;right:0;top:26%;display:flex;justify-content:center;opacity:0;pointer-events:none;}
.banner > div{position:relative;padding:.25em 2.2em .3em;font-size:4.4em;line-height:1;letter-spacing:.04em;text-transform:uppercase;transform:skewX(-10deg);background:linear-gradient(90deg,transparent,rgba(255,122,26,.92) 12%,rgba(255,154,31,.95) 50%,rgba(255,122,26,.92) 88%,transparent);box-shadow:0 .08em 0 rgba(0,0,0,.35);}
.banner > div::before,.banner > div::after{content:'';position:absolute;left:8%;right:8%;height:.1em;background:repeating-linear-gradient(90deg,#fff 0 .35em,transparent .35em .7em);opacity:.8;}
.banner > div::before{top:.06em;} .banner > div::after{bottom:.06em;}
.banner.show{animation:banner 2.4s cubic-bezier(.2,1,.3,1) both;}
@keyframes banner{0%{opacity:0;transform:translateX(-60%)}14%{opacity:1;transform:none}80%{opacity:1;transform:none}100%{opacity:0;transform:translateX(60%)}}
.banner.final > div{background:linear-gradient(90deg,transparent,rgba(139,77,255,.92) 12%,rgba(255,61,203,.95) 50%,rgba(139,77,255,.92) 88%,transparent);}
.banner.fin > div{background:linear-gradient(90deg,transparent,rgba(79,181,42,.94) 12%,rgba(123,224,74,.96) 50%,rgba(79,181,42,.94) 88%,transparent);color:#0e2a05;text-shadow:0 .06em 0 rgba(255,255,255,.35);}
.banner.fin.stay.show{animation:banner-stay .6s cubic-bezier(.2,1,.3,1) both;} @keyframes banner-stay{from{opacity:0;transform:translateX(-60%)}to{opacity:1;transform:none}}
.banner small{display:block;font-family:var(--font-ui);font-weight:900;font-size:.28em;letter-spacing:.2em;margin-top:.2em;}
.wrongway{display:none;align-items:center;gap:.6em;padding:.25em 1em;font-size:2.4em;color:#fff;background:linear-gradient(180deg,#ff5577,#d6193f);border-radius:.4em;box-shadow:0 .1em 0 #7a0f27,0 0 1em rgba(255,61,106,.8);pointer-events:none;white-space:nowrap;}
.wrongway.on{display:flex;animation:ww .6s steps(2) infinite;} .noflash .wrongway.on{animation:none;}
.wrongway .ico{font-size:1.1em;} @keyframes ww{50%{opacity:.35}}
.intro{position:absolute;left:0;top:30%;display:flex;flex-direction:column;gap:.3em;padding:1em 3em 1em 2em;transform:translateX(-110%) skewX(-10deg);transform-origin:left;background:linear-gradient(90deg,rgba(8,12,34,.92),rgba(20,30,90,.86) 70%,transparent);animation:none;pointer-events:none;}
.intro.show{animation:intro-in 3.4s cubic-bezier(.2,1,.3,1) both;}
@keyframes intro-in{0%{transform:translateX(-110%) skewX(-10deg)}12%{transform:translateX(0) skewX(-10deg)}86%{transform:translateX(0) skewX(-10deg);opacity:1}100%{transform:translateX(-30%) skewX(-10deg);opacity:0}}
.intro > *{transform:skewX(10deg);}
.intro .ik{font-family:var(--font-ui);font-weight:900;font-size:.82em;letter-spacing:.24em;text-transform:uppercase;color:#22d3ff;}
.intro .it{font-size:3.6em;line-height:.95;text-transform:uppercase;text-shadow:0 .06em 0 #b34700,0 .5em 1em rgba(0,0,0,.4);}
.intro .im{display:flex;gap:.6em;align-items:center;font-family:var(--font-ui);font-weight:900;font-size:.9em;letter-spacing:.06em;color:#dfe6ff;} .intro .im .stars{color:#ffd23f;display:inline-flex;}
.skip{display:none;gap:.5em;align-items:center;white-space:nowrap;}
.skip.show{display:inline-flex;animation:fade-in .25s ease both;}

/* ------------------------------------------------------------ event toasts */
.evs{display:flex;flex-direction:column;align-items:center;gap:.4em;}
.ev{display:inline-flex;align-items:center;gap:.5em;padding:.25em 1em .25em .5em;font-size:1.35em;border-radius:99px;background:linear-gradient(180deg,rgba(32,44,104,.94),rgba(10,16,48,.94));box-shadow:inset 0 0 0 .08em var(--ec,#22d3ff),0 .15em 0 rgba(0,0,0,.35);animation:ev-in .45s var(--ease-spring) both;white-space:nowrap;}
.ev .ico{font-size:1.15em;color:var(--ec,#22d3ff);} .ev.out{animation:ev-out .3s ease both;}
.ev.good{--ec:#7be04a;} .ev.bad{--ec:#ff6f8f;} .ev.gold{--ec:#ffd23f;} .ev.cy{--ec:#22d3ff;}
@keyframes ev-in{from{opacity:0;transform:translateY(-.9em) scale(.8)}to{opacity:1;transform:none}} @keyframes ev-out{to{opacity:0;transform:translateY(-.5em) scale(.9)}}

/* ------------------------------------------------------------ full-screen effect layers */
.fx{position:absolute;inset:0;pointer-events:none;opacity:0;}
.fx-boost{background:radial-gradient(ellipse at center,transparent 52%,rgba(34,211,255,.18) 78%,rgba(120,240,255,.55) 100%);mix-blend-mode:screen;transition:opacity .12s;}
.fx-star{opacity:0;background:conic-gradient(from 0deg,#ff3d6a,#ffd23f,#7be04a,#22d3ff,#8b4dff,#ff3d6a);-webkit-mask:radial-gradient(ellipse at center,transparent 78%,#000 100%);mask:radial-gradient(ellipse at center,transparent 78%,#000 100%);animation:hue 2.4s linear infinite;}
@keyframes hue{to{filter:hue-rotate(360deg)}} .noflash .fx-star{animation:none;}
.fx-shield{background:radial-gradient(ellipse at center,transparent 58%,rgba(34,211,255,.45) 100%);}
.fx-rocket{background:radial-gradient(ellipse at center,transparent 50%,rgba(255,122,26,.5) 100%);}
.fx-shrink{background:radial-gradient(ellipse at center,transparent 60%,rgba(139,77,255,.4) 100%);}
.fx-ink{opacity:0;overflow:hidden;transform-origin:50% 30%;} .fx-ink canvas{width:100%;height:100%;display:block;} .fx-ink.splat{animation:inksplat .22s cubic-bezier(.2,1.3,.4,1);}
@keyframes inksplat{from{transform:scale(1.35)}to{transform:scale(1)}}
.status{display:flex;flex-wrap:wrap;align-content:flex-start;gap:.4em;max-width:15em;min-height:2.2em;}
.chipst{display:inline-flex;align-items:center;gap:.35em;padding:.2em .7em .2em .4em;border-radius:99px;font-size:.95em;background:rgba(8,12,34,.72);box-shadow:inset 0 0 0 .08em var(--sc,#fff);}
.chipst .ico{color:var(--sc,#fff);font-size:1.15em;} .chipst small{font-family:var(--font-ui);font-weight:900;font-size:.7em;letter-spacing:.1em;}
.fps{display:none;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:.72em;text-shadow:0 .08em .2em #000;color:#cfe;background:rgba(0,0,0,.45);padding:.2em .5em;border-radius:.3em;white-space:pre;}

/* ------------------------------------------------------------ pause + touch */
.trrow{display:flex;gap:.5em;align-items:stretch;}
.hud-pause.hud-respawn{display:none;} .hud.touch .hud-pause.hud-respawn{display:grid;opacity:.8;}
.respawn-ring{position:relative;width:6em;display:none;flex-direction:column;align-items:center;gap:.2em;}
.respawn-ring.on{display:flex;animation:ring-in .2s var(--ease-spring) both;}
@keyframes ring-in{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
.respawn-ring .rr-svg{width:5em;height:5em;filter:drop-shadow(0 .1em .3em rgba(0,0,0,.6));} .respawn-ring .rr-bg{stroke:rgba(6,10,30,.7);} .respawn-ring .rr-arc{stroke:#ffd23f;}
.respawn-ring .ico{position:absolute;top:1.55em;font-size:1.9em;color:#fff;} .respawn-ring span{font-size:.9em;letter-spacing:.1em;text-transform:uppercase;text-shadow:0 .08em .3em #000;}
.cd.rwin{filter:drop-shadow(0 0 .35em #ffd23f);} .cdhint.hot{box-shadow:inset 0 0 0 .14em #ffd23f,0 0 1em rgba(255,210,63,.7);}
.banner.photo > div{background:linear-gradient(90deg,transparent,rgba(255,255,255,.92) 12%,rgba(220,235,255,.96) 50%,rgba(255,255,255,.92) 88%,transparent);color:#0a1030;text-shadow:none;} .banner.photo{top:34%;}
.banner.photo.show{animation:banner-stay .5s cubic-bezier(.2,1,.3,1) both;}
.hud-pause{pointer-events:auto;opacity:.45;width:2.7em;border:0;border-radius:.8em;background:linear-gradient(180deg,var(--glass1),var(--glass2));color:#fff;font-size:1em;display:grid;place-items:center;cursor:pointer;box-shadow:inset 0 0 0 .08em rgba(255,255,255,.2),0 .22em 0 rgba(0,0,0,.3);transition:opacity .2s,transform .15s var(--ease-spring);}
[data-device="mouse"] .hud-pause,[data-device="touch"] .hud-pause{opacity:.95;}
.hud.touch .hud-pause{width:3.3em;min-height:3.3em;} .hud-pause:hover{opacity:1;transform:scale(1.08);}
.touchc{position:absolute;inset:0;pointer-events:none;display:none;z-index:5;font-size:min(calc(var(--tsz,1) * 1em),calc(var(--tsz,1) * 100cqw / 24.5));}
.hud.touch .touchc{display:block;}
.tzone{position:absolute;left:0;bottom:0;width:52%;height:62%;pointer-events:auto;touch-action:none;}
.tbase{position:absolute;left:1.6em;bottom:2em;width:9em;height:9em;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.1),rgba(255,255,255,.04));box-shadow:inset 0 0 0 .14em rgba(255,255,255,.35),0 0 1.4em rgba(34,211,255,.25);pointer-events:none;transition:opacity .2s;opacity:.7;}
.tbase.on{opacity:1;}
.tknob{position:absolute;left:50%;top:50%;width:4.4em;height:4.4em;margin:-2.2em 0 0 -2.2em;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#bfe6ff 60%,#6fb7ff);box-shadow:0 .2em .5em rgba(0,0,0,.5);}
.tbtn{position:absolute;pointer-events:auto;touch-action:none;display:grid;place-items:center;border:0;border-radius:50%;color:#fff;font-size:1em;background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.28),rgba(255,255,255,.08));box-shadow:inset 0 0 0 .14em rgba(255,255,255,.55),0 .25em 0 rgba(0,0,0,.35);transition:transform .08s,background .08s;-webkit-tap-highlight-color:transparent;}
.tbtn.on{transform:scale(.92);background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.55),rgba(255,255,255,.2));}
.tbtn .ico{font-size:1.7em;filter:drop-shadow(0 .06em 0 rgba(0,0,0,.5));} .tbtn span{display:block;font-size:.7em;letter-spacing:.08em;margin-top:-.2em;font-family:var(--font-ui);font-weight:900;}
.tbtn.t-gas{background:radial-gradient(circle at 35% 28%,rgba(123,224,74,.7),rgba(79,181,42,.35));} .tbtn.t-drift{background:radial-gradient(circle at 35% 28%,rgba(255,154,31,.75),rgba(255,122,26,.35));}
.tbtn.t-item{background:radial-gradient(circle at 35% 28%,rgba(34,211,255,.7),rgba(15,180,228,.35));} .tbtn.t-brake{background:radial-gradient(circle at 35% 28%,rgba(255,61,106,.7),rgba(223,34,80,.35));}
.tbtn.t-back{background:radial-gradient(circle at 35% 28%,rgba(160,170,220,.55),rgba(90,100,160,.25));}

/* ------------------------------------------------------------ states */
.hud[data-phase="intro"] .zl,.hud[data-phase="intro"] .zr{opacity:0;transform:translateY(.6em);}
.hud.nomap .mini{display:none;} .hud.noboard .board{display:none;}
.hud.respawning .dwrap{visibility:hidden;} .hud.alert .coach,.hud.alert .coachpill,.hud.respawning .coach,.hud.respawning .coachpill,.hud.respawning .evs,.hud.respawning .wrongway{display:none;}

/* ------------------------------------------------------------ reduced motion: keep every message, drop the throw / scale / spin */
@keyframes fade-hold{0%{opacity:0}12%{opacity:1}82%{opacity:1}100%{opacity:0}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
[data-rm] .cd{transform:none;} [data-rm] .cd.show,[data-rm] .cd.go{animation:fade-hold .95s ease both;}
[data-rm] .burst.show{animation:none;opacity:0;}
[data-rm] .banner{transform:none;} [data-rm] .banner.show{animation:fade-hold 2.4s ease both;} [data-rm] .banner.fin.stay.show,[data-rm] .banner.photo.show{animation:fade-in .4s ease both;}
[data-rm] .intro{transform:skewX(-10deg);} [data-rm] .intro.show{animation:fade-hold 3.4s ease both;}
[data-rm] .pos.up,[data-rm] .pos.down,[data-rm] .item.got .item-frame,[data-rm] .lapbox.pulse,[data-rm] .coins.pulse,[data-rm] .item.roulette .item-frame canvas{animation:none;}
[data-rm] .ev,[data-rm] .laps .lr,[data-rm] .driftlbl.show,[data-rm] .coach{animation:fade-in .3s ease both;} [data-rm] .dmeter i.lit{animation:none;}
[data-rm] .respawn-ring.on{animation:fade-in .15s ease both;}

/* ------------------------------------------------------------ layouts */
/* WIDE (16:9 = 80 x 45em).  Left: item 6.2 + coins 2.7 + chip row 2.2 + standings <= 12.6 (+ghost) with the position pinned to the bottom.
   Right: lap row / timer / lap times at the top, minimap + speedometer pinned to the bottom (22em).  Both fit with room to spare. */
.l-wide .hud.touch .zl{bottom:calc(max(var(--pad),var(--sab)) + 11.8em * var(--ts));}
.l-wide .hud.touch .zr{bottom:calc(max(var(--pad),var(--sab)) + 13.8em * var(--ts));}
.l-wide .hud.touch .zl-mid{display:flex;align-items:center;gap:.9em;} .l-wide .hud.touch .zl .pos{order:0;margin-top:0;}
.l-wide .hud.touch .laps{display:none;} .l-wide .hud.touch .mini{width:8.4em;height:8.4em;}
.l-wide .hud.touch .speedo{width:9.8em;height:8.9em;} .l-wide .hud.touch .speedo .num b{font-size:3em;}

/* PORTRAIT (phone, ~24.4 x 52.7em).  Left column ~21em tall, right column ~22em tall; touch buttons own the bottom 14em. */
.l-portrait .hud{--pad:.9em;--pu:1.2;font-size:calc(16px * var(--ui-scale) * min(var(--hud-scale),1.15));} .l-portrait .hud.touch{font-size:calc(16px * var(--ui-scale) * min(var(--hud-scale),1));}
.l-portrait .zl,.l-portrait .zr{bottom:auto;}
.l-portrait .zl-mid{display:flex;flex-wrap:wrap;align-items:center;gap:.55em .8em;max-width:11em;} .l-portrait .ghostbox .gl{display:none;} .l-portrait .zl .pos{order:0;margin-top:0;}
.l-portrait .zr-inst{margin-top:0;}
.l-portrait .item-frame{width:4.4em;height:4.4em;} .l-portrait .item-frame canvas{width:3.4em;height:3.4em;} .l-portrait .item-meta{display:none;}
.l-portrait .pos .pn{font-size:3.6em;} .l-portrait .pos .ps{font-size:1.6em;} .l-portrait .pos .po{display:none;}
.l-portrait .timer{font-size:1.9em;} .l-portrait .laps{display:none;} .l-portrait .mini{width:7.4em;height:7.4em;}
.l-portrait .speedo{width:8.6em;height:7.8em;} .l-portrait .speedo .num b{font-size:2.7em;} .l-portrait .speedo .boostlbl{display:none;}
.l-portrait .board{min-width:9.8em;} .l-portrait .board .br:nth-child(n+4):not(.me){display:none;}
.l-portrait .status{max-width:min(14em,calc(100cqw - 10.5em));} .l-portrait .chipst .cl{display:none;}
.l-portrait .zb{max-width:calc(100% - 2 * var(--pad));} .l-portrait .hud.touch .zb{bottom:calc(max(var(--pad),var(--sab)) + 13.8em * var(--ts));}
.l-portrait .zt{top:calc(max(var(--pad),var(--sat)) + 22.4em);width:20em;} .l-portrait .ev{font-size:1.1em;} .l-portrait .ev:nth-last-child(n+3){display:none;}
.l-portrait .wrongway{font-size:1.7em;}
.l-portrait .respawn-ring{width:5em;} .l-portrait .respawn-ring .rr-svg{width:3.8em;height:3.8em;} .l-portrait .respawn-ring .ico{top:1.1em;font-size:1.5em;}
.l-portrait .hud:not([data-phase="intro"]):not([data-phase="countdown"]) .coach{display:none!important;} .l-portrait .coach .ch{display:none;} .l-portrait .coach .crow{gap:.6em;} .l-portrait .coach .cc{min-width:4.2em;}
.l-portrait .zb .hint{white-space:normal;text-align:center;justify-content:center;} .l-portrait .zb .cdhint.on{display:block;line-height:1.7;}
.l-portrait .cd{font-size:8em;} .l-portrait .banner{top:50%;} .l-portrait .banner.photo{top:50%;} .l-portrait .banner > div{font-size:2.6em;} .l-portrait .intro{top:24%;} .l-portrait .intro .it{font-size:2.2em;}

/* COMPACT (phone landscape, ~52.7 x 24.4em).  Left: item, [position coins], chip row (<= 12em).  Right: lap row, timer, then speedometer + minimap SIDE BY
   SIDE so the column stays above the touch buttons (their top edge is ~11.4em from the bottom).  No standings. */
.l-compact .hud{--pad:.7em;--pu:1.2;font-size:calc(16px * var(--ui-scale) * min(var(--hud-scale),1.1));} .l-compact .hud.touch{font-size:calc(16px * var(--ui-scale) * min(var(--hud-scale),1));}
.l-compact .zl,.l-compact .zr{bottom:auto;}
.l-compact .zl-mid{display:flex;align-items:center;gap:.7em;} .l-compact .zl .pos{order:0;margin-top:0;}
.l-compact .zl .board{display:none;}
.l-compact .item-frame{width:3.8em;height:3.8em;} .l-compact .item-frame canvas{width:3em;height:3em;} .l-compact .item-meta{display:none;} .l-compact .item{padding-bottom:.5em;}
.l-compact .pos .pn{font-size:3.2em;} .l-compact .pos .ps{font-size:1.35em;} .l-compact .pos .po{display:none;}
.l-compact .timer{font-size:1.7em;} .l-compact .laps{display:none;} .l-compact .lapbox .ln{font-size:1.4em;}
.l-compact .zr-inst{flex-direction:row-reverse;align-items:flex-start;margin-top:0;gap:.6em;}
.l-compact .mini{width:5.8em;height:5.8em;padding:.25em;}
.l-compact .speedo{width:7em;height:6.3em;} .l-compact .speedo .num b{font-size:2.2em;} .l-compact .speedo .num{top:34%;} .l-compact .speedo .boostlbl{display:none;}
.l-compact .hud.touch .mini{width:5.2em;height:5.2em;} .l-compact .hud.touch .speedo{width:6.4em;height:5.8em;} .l-compact .hud.touch .speedo .num b{font-size:2em;}
.l-compact .hud.touch .hud-pause{width:3em;min-height:3em;}
.l-compact .status{max-width:14em;} .l-compact .chipst .cl{display:none;}
.l-compact .zt{top:max(var(--pad),var(--sat));width:20em;} .l-compact .ev{font-size:.95em;} .l-compact .ev:nth-last-child(n+3){display:none;}
.l-compact .wrongway{font-size:1.6em;}
.l-compact .respawn-ring{width:5em;} .l-compact .respawn-ring .rr-svg{width:3.6em;height:3.6em;} .l-compact .respawn-ring .ico{top:1em;font-size:1.4em;}
.l-compact .coach{display:none!important;}
.l-compact .cd{font-size:7em;} .l-compact .banner{top:30%;} .l-compact .banner.photo{top:36%;} .l-compact .banner > div{font-size:2.4em;} .l-compact .intro{top:22%;} .l-compact .intro .it{font-size:2.2em;}

/* SAFETY NETS (container queries, in HUD em): short windows, HUD size and large text can leave less room than the layouts above budget for,
   so optional blocks are dropped instead of letting anything collide.  Phone layouts also cap the HUD size (see their font-size above). */
@container hud (max-height: 41em) { .l-wide .hud .board .br:nth-child(n+4):not(.me){display:none;} .l-wide .hud .laps{display:none;} }
@container hud (max-height: 34em) { .l-wide .hud .mini{width:7.4em;height:7.4em;} .l-wide .hud .speedo{width:9.8em;height:8.9em;} .l-wide .hud .speedo .num b{font-size:3em;} }
@container hud (max-height: 30em) { .l-wide .hud .zl .board{display:none;} .l-wide .hud .mini{display:none;} }
@container hud (max-height: 50em) { .l-portrait .hud .coach{display:none!important;} }
@container hud (max-height: 47em) { .l-portrait .hud .zt{top:calc(max(var(--pad),var(--sat)) + 21.5em);} .l-portrait .hud .ev:nth-last-child(n+2){display:none;} .l-portrait .hud.alert .evs,.l-portrait .hud.tip .evs,.l-portrait .hud.showfps .evs{display:none;} .l-portrait .hud .dwrap{padding-top:1.4em;} .l-portrait .hud .mini{width:6.8em;height:6.8em;} .l-portrait .hud .speedo{width:8em;height:7.2em;} .l-portrait .hud .speedo .num b{font-size:2.5em;} }
@container hud (max-height: 42.5em) { .l-portrait .hud .zt{top:calc(max(var(--pad),var(--sat)) + 20em);} .l-portrait .hud .zl .board{display:none;} .l-portrait .hud .mini{width:6.2em;height:6.2em;} .l-portrait .hud .speedo{width:7.4em;height:6.7em;} .l-portrait .hud .speedo .num b{font-size:2.3em;} }
@container hud (max-width: 22em) { .l-portrait .hud .zl .board{display:none;} .l-portrait .hud .lapbox .ll{display:none;} }
@container hud (max-height: 22em) { .l-compact .hud .zr-inst .mini{display:none;} }
`;

/**
 * Scope every rule under `.hud` so HUD class names (.drift, .cd, .item, .timer ...) can never leak into the menus.
 * Layout-prefixed selectors keep their prefix (".l-compact .pos" -> ".l-compact .hud .pos"); @keyframes / @container are left alone
 * (their rules are written with an explicit ".hud" prefix).
 */
function scopeSel(sel) {
  const s = sel.trim();
  if (!s) return s;
  const m = /^((?:\.l-(?:wide|portrait|compact)|\.noflash|\.hc|\[data-rm\]|\[data-device="\w+"\])\s+)(.*)$/.exec(s);
  const lead = m ? m[1] : '';
  const rest = m ? m[2] : s;
  if (/^\.hud(?![\w-])/.test(rest)) return lead + rest;
  return `${lead}.hud ${rest}`;
}

function scopeCss(css) {
  let out = '', i = 0;
  while (i < css.length) {
    if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i); out += css.slice(i, e + 2); i = e + 2; continue; }
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const sel = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    out += sel.startsWith('@') ? `${sel}{${body}}` : `${sel.split(',').map(scopeSel).join(',')}{${body}}`;
    i = j;
  }
  return out;
}

export const hudCss = scopeCss(RAW.replace(/\/\*[\s\S]*?\*\//g, ""));
