// Design system for every non-HUD surface. OWNER: Agent E.  Injected at runtime by UI (the build only inlines shell.css,
// so UI CSS lives in JS strings).  Sizes are in rem: html font-size = 16px * --ui-scale (set by UI.resize), so the whole UI
// scales from a 1280x720 design.  Layout variants are chosen in JS (classes on #ui-root: l-wide | l-portrait | l-compact).
export const baseCss = /* css */ `
:root{
  --ui-scale:1; --hud-scale:1;
  --kr-violet:#8b4dff; --kr-gold:#ffd23f; --kr-silver:#cfd8ee; --kr-bronze:#e8934f;
  --d1:#3aa0ff; --d2:#ff9a1f; --d3:#ff3dcb;
  --ease-spring:cubic-bezier(.2,1.4,.4,1); --ease-out:cubic-bezier(.16,.84,.24,1); --ease-in:cubic-bezier(.5,0,.9,.4);
  --panel:rgba(14,20,52,.84); --panel-2:rgba(26,36,86,.88); --line:rgba(255,255,255,.13);
  --sh:rgba(0,0,0,.4);
}
html{font-size:calc(16px * var(--ui-scale));}
body{font-size:1rem;}
#ui-root{font-family:var(--font-ui);font-weight:700;color:var(--kr-ink);line-height:1.25;--sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);}
:where(#ui-root) *{box-sizing:border-box;}
#ui-root > .layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
#ui-root > .layer > *{pointer-events:auto;}
#ui-root > .layer-hud{z-index:10;}
#ui-root > .layer-hud > *{pointer-events:none;}
#ui-root > .layer-screens{z-index:20;}
#ui-root > .layer-modal{z-index:30;}
#ui-root > .layer-toast{z-index:40;}
#ui-root > .layer-wipe{z-index:45;}
#ui-root > .layer-error{z-index:60;}
:where(#ui-root) button,:where(#ui-root) input,:where(#ui-root) textarea{font:inherit;color:inherit;}
:where(#ui-root) button{-webkit-appearance:none;appearance:none;margin:0;}
:where(#ui-root) [data-nav]{outline:none;}
.sr-only{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
.ico{width:1em;height:1em;flex:none;display:inline-block;vertical-align:middle;overflow:visible;fill:currentColor;}
.ico-s{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}
.disp{font-family:var(--font-display);font-weight:400;letter-spacing:.02em;}

/* ---------------------------------------------------------------- screens + transitions */
.screen{position:absolute;inset:0;display:flex;flex-direction:column;padding:max(1.2rem,var(--sat)) max(1.6rem,var(--sar)) calc(max(1rem,var(--sab)) + var(--hint-room,2.3rem)) max(1.6rem,var(--sal));overflow:hidden;}
.l-portrait{--hint-room:.4rem;} .l-compact{--hint-room:.3rem;}
.l-compact .screen{padding:.55rem max(1rem,var(--sar)) calc(max(.4rem,var(--sab)) + var(--hint-room)) max(1rem,var(--sal));}
.l-compact .h1{font-size:1.9rem;} .l-compact .kicker{font-size:.7rem;} .l-compact .scr-head{margin-bottom:.35rem;gap:.8rem;}
.l-compact .btn{min-height:2.4rem;font-size:1.05rem;padding:.4rem 1.3rem;} .l-compact .btn.lg{min-height:2.8rem;font-size:1.2rem;} .l-compact .btn.sm{min-height:2.1rem;}
.l-compact .hintbar{bottom:.15rem;} .l-compact .hintbar .h{font-size:.7rem;} .l-compact .key{min-width:1.4rem;height:1.4rem;font-size:.68rem;}
.screen.in-fwd{animation:scr-in-fwd .5s var(--ease-out) both;}
.screen.in-back{animation:scr-in-back .5s var(--ease-out) both;}
.screen.in-fade{animation:scr-fade .45s ease both;}
.screen.out-fwd{animation:scr-out-fwd .26s var(--ease-in) both;pointer-events:none;}
.screen.out-back{animation:scr-out-back .26s var(--ease-in) both;pointer-events:none;}
.screen.out-fade{animation:scr-fade-out .22s ease both;pointer-events:none;}
@keyframes scr-in-fwd{from{opacity:0;transform:translateX(3.5rem)}to{opacity:1;transform:none}}
@keyframes scr-in-back{from{opacity:0;transform:translateX(-3.5rem)}to{opacity:1;transform:none}}
@keyframes scr-out-fwd{to{opacity:0;transform:translateX(-3rem)}}
@keyframes scr-out-back{to{opacity:0;transform:translateX(3rem)}}
@keyframes scr-fade{from{opacity:0}to{opacity:1}}
@keyframes scr-fade-out{to{opacity:0}}
.pop{animation:pop-in .55s var(--ease-spring) both;animation-delay:calc(var(--i,0) * 55ms + 90ms);}
.slide-l{animation:slide-l .6s var(--ease-out) both;animation-delay:calc(var(--i,0) * 60ms + 80ms);}
.slide-r{animation:slide-r .6s var(--ease-out) both;animation-delay:calc(var(--i,0) * 60ms + 80ms);}
.rise{animation:rise .6s var(--ease-out) both;animation-delay:calc(var(--i,0) * 60ms + 80ms);}
@keyframes pop-in{from{opacity:0;transform:scale(.8) translateY(.8rem)}to{opacity:1;transform:none}}
@keyframes slide-l{from{opacity:0;transform:translateX(-2.6rem)}to{opacity:1;transform:none}}
@keyframes slide-r{from{opacity:0;transform:translateX(2.6rem)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(1.4rem)}to{opacity:1;transform:none}}
[data-rm] .screen,[data-rm] .pop,[data-rm] .slide-l,[data-rm] .slide-r,[data-rm] .rise{animation-duration:.01s!important;animation-delay:0s!important;}

/* scrims: keep menus readable on top of the 3D stage */
.scrim-side{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(6,9,26,.88) 0%,rgba(6,9,26,.62) 34%,rgba(6,9,26,0) 62%);}
.scrim-bottom{position:absolute;left:0;right:0;bottom:0;height:46%;pointer-events:none;background:linear-gradient(0deg,rgba(6,9,26,.9),rgba(6,9,26,0));}
.scrim-top{position:absolute;left:0;right:0;top:0;height:30%;pointer-events:none;background:linear-gradient(180deg,rgba(6,9,26,.8),rgba(6,9,26,0));}
.scrim-all{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 100% at 50% 40%,rgba(6,9,26,.55),rgba(6,9,26,.9));}
.screen > *{position:relative;}
.screen > .scrim-side,.screen > .scrim-bottom,.screen > .scrim-top,.screen > .scrim-all{position:absolute;}

/* ---------------------------------------------------------------- headings */
.kicker{font-family:var(--font-display);font-size:.95rem;letter-spacing:.2em;text-transform:uppercase;color:var(--kr-accent-2);text-shadow:0 .12rem 0 rgba(0,0,0,.4);}
.h1{font-family:var(--font-display);font-weight:400;font-size:2.7rem;line-height:1;text-transform:uppercase;letter-spacing:.015em;transform:skewX(-8deg);transform-origin:left bottom;color:#fff;text-shadow:0 .16rem 0 #b34700,0 .22rem 0 #b34700,0 .6rem 1.4rem rgba(0,0,0,.45);}
.h1 .acc{color:var(--kr-accent);text-shadow:0 .16rem 0 #6b2a00,0 .6rem 1.4rem rgba(0,0,0,.45);}
.h2{font-family:var(--font-display);font-weight:400;font-size:1.5rem;text-transform:uppercase;letter-spacing:.03em;transform:skewX(-6deg);text-shadow:0 .1rem 0 rgba(0,0,0,.5);}
.dim{color:var(--kr-ink-dim);}
.small{font-size:.82rem;}
.tiny{font-size:.72rem;}
.eyebrow{font-size:.78rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--kr-ink-dim);}

/* ---------------------------------------------------------------- buttons */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:2.9rem;padding:.55rem 1.7rem;border:0;background:none;cursor:pointer;font-family:var(--font-display);font-size:1.2rem;letter-spacing:.04em;text-transform:uppercase;color:#fff;
  transform:skewX(-8deg);transition:transform .2s var(--ease-spring),filter .15s;text-shadow:0 .1rem 0 rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent;isolation:isolate;--c1:#ffb04a;--c2:#ff7a1a;--c3:#ee5f08;--lip:#a34400;--glow:rgba(255,122,26,.55);}
.btn::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:.8rem;background:linear-gradient(180deg,var(--c1),var(--c2) 55%,var(--c3));box-shadow:0 .28rem 0 var(--lip),0 .6rem 1.1rem rgba(0,0,0,.35),inset 0 .09rem 0 rgba(255,255,255,.5),inset 0 -.1rem 0 rgba(0,0,0,.12);transition:box-shadow .15s,transform .15s;}
.btn::after{content:'';position:absolute;inset:-.28rem;border-radius:1.1rem;border:.2rem solid transparent;pointer-events:none;transition:border-color .12s,box-shadow .12s;}
.btn > .in{display:inline-flex;align-items:center;gap:.55rem;transform:skewX(8deg);white-space:nowrap;}
.btn.is-focus,.btn:hover{transform:skewX(-8deg) translateY(-.12rem) scale(1.045);filter:brightness(1.08) saturate(1.05);}
.btn.is-focus::after{border-color:#fff;box-shadow:0 0 1.3rem var(--glow),inset 0 0 .8rem rgba(255,255,255,.15);}
.btn:active,.btn.is-down{transform:skewX(-8deg) translateY(.18rem) scale(.985);}
.btn:active::before,.btn.is-down::before{box-shadow:0 .08rem 0 var(--lip),0 .2rem .5rem rgba(0,0,0,.35),inset 0 .09rem 0 rgba(255,255,255,.4);}
.btn.cyan{--c1:#7fe9ff;--c2:#22d3ff;--c3:#0fb4e4;--lip:#0a6a88;--glow:rgba(34,211,255,.6);color:#04222e;text-shadow:0 .08rem 0 rgba(255,255,255,.35);}
.btn.green{--c1:#b5f67d;--c2:#7be04a;--c3:#51b82a;--lip:#2d7712;--glow:rgba(123,224,74,.6);color:#0c2a05;text-shadow:0 .08rem 0 rgba(255,255,255,.3);}
.btn.red{--c1:#ff7b98;--c2:#ff3d6a;--c3:#df2250;--lip:#8a1030;--glow:rgba(255,61,106,.6);}
.btn.violet{--c1:#b690ff;--c2:#8b4dff;--c3:#6a30d8;--lip:#3d1788;--glow:rgba(139,77,255,.6);}
.btn.gold{--c1:#ffe985;--c2:#ffd23f;--c3:#f0ae14;--lip:#9c6d06;--glow:rgba(255,210,63,.65);color:#3a2600;text-shadow:0 .08rem 0 rgba(255,255,255,.4);}
.btn.glass{--c1:#34427f;--c2:#273164;--c3:#1d264f;--lip:#0d1230;--glow:rgba(255,255,255,.4);}
.btn.glass::before{box-shadow:0 .28rem 0 var(--lip),0 .6rem 1.1rem rgba(0,0,0,.3),inset 0 .09rem 0 rgba(255,255,255,.22);}
.btn.lg{font-size:1.5rem;min-height:3.5rem;padding:.65rem 2.4rem;}
.btn.sm{font-size:.95rem;min-height:2.3rem;padding:.35rem 1.1rem;}
.btn.block{display:flex;width:100%;}
.btn[aria-disabled="true"]{filter:grayscale(.85) brightness(.7);cursor:not-allowed;}
.btn[aria-disabled="true"].is-focus{filter:grayscale(.6) brightness(.85);}
.btn > .in .ico{font-size:1.15em;}
.icon-btn{position:relative;width:2.8rem;height:2.8rem;padding:0;border:0;border-radius:.9rem;display:inline-grid;place-items:center;cursor:pointer;color:#fff;font-size:1.3rem;background:rgba(18,26,64,.78);box-shadow:inset 0 0 0 .1rem var(--line),0 .25rem 0 rgba(0,0,0,.3);transition:transform .18s var(--ease-spring),background .15s,box-shadow .15s;}
.icon-btn:hover,.icon-btn.is-focus{background:rgba(40,56,128,.95);transform:translateY(-.1rem) scale(1.06);box-shadow:inset 0 0 0 .15rem #fff,0 0 1.2rem rgba(255,255,255,.35),0 .25rem 0 rgba(0,0,0,.3);}
.icon-btn:active{transform:translateY(.1rem) scale(.96);}

/* ---------------------------------------------------------------- panels */
.panel{position:relative;border-radius:1.1rem;background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:inset 0 0 0 .1rem var(--line),inset 0 .1rem 0 rgba(255,255,255,.1),0 .5rem 0 rgba(0,0,0,.28),0 1rem 2.2rem rgba(0,0,0,.35);}
.panel.flat{box-shadow:inset 0 0 0 .1rem var(--line),0 .8rem 1.8rem rgba(0,0,0,.3);}
.panel-h{display:flex;align-items:center;gap:.6rem;padding:.7rem 1.1rem;font-family:var(--font-display);font-size:1.1rem;letter-spacing:.06em;text-transform:uppercase;border-bottom:.1rem solid var(--line);}
.stripes{background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.05) 0 .9rem,transparent .9rem 1.8rem);}
.chip{display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .7rem;border-radius:99px;background:rgba(255,255,255,.1);font-size:.82rem;font-weight:900;letter-spacing:.04em;box-shadow:inset 0 0 0 .08rem rgba(255,255,255,.12);}
.chip.cy{background:rgba(34,211,255,.18);color:#8eeaff;}
.chip.or{background:rgba(255,122,26,.2);color:#ffb878;}
.chip.gd{background:rgba(255,210,63,.2);color:#ffe27a;}
.chip.gn{background:rgba(123,224,74,.2);color:#b5f67d;}
.chip.rd{background:rgba(255,61,106,.2);color:#ff9fb4;}
.chip .ico{font-size:1.05em;}

/* ---------------------------------------------------------------- stat bars (5 segments, supports halves) */
.stat{display:grid;grid-template-columns:5rem 1fr 3.3rem;align-items:center;gap:.6rem;font-size:.8rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--kr-ink-dim);}
.stat .seg5{display:grid;grid-template-columns:repeat(5,1fr);gap:.22rem;height:.8rem;transform:skewX(-14deg);}
.stat .seg5 i{position:relative;display:block;border-radius:.2rem;background:rgba(255,255,255,.12);overflow:hidden;}
.stat .seg5 i::after{content:'';position:absolute;inset:0;transform-origin:left;transform:scaleX(var(--f,0));background:linear-gradient(180deg,var(--sc1,#ffb04a),var(--sc2,#ff7a1a));transition:transform .45s var(--ease-spring);transition-delay:calc(var(--k,0) * 40ms);}
.stat .val{color:#fff;text-align:right;font-family:var(--font-display);font-size:1rem;letter-spacing:0;white-space:nowrap;}
.stat.speed{--sc1:#ff9bb0;--sc2:#ff3d6a;} .stat.accel{--sc1:#ffe27a;--sc2:#ffb81f;} .stat.handling{--sc1:#8eeaff;--sc2:#22d3ff;} .stat.weight{--sc1:#c9a6ff;--sc2:#8b4dff;} .stat.drift{--sc1:#b5f67d;--sc2:#58c42e;}
.stat .delta{font-size:.7rem;margin-left:.3rem;}
.stat .delta.up{color:var(--kr-good);} .stat .delta.down{color:var(--kr-bad);}

/* ---------------------------------------------------------------- form controls (settings) */
.row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:center;gap:1rem;padding:.55rem 1rem;min-height:3.3rem;border-radius:.9rem;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 .1rem transparent;cursor:pointer;transition:background .15s,box-shadow .15s,transform .18s var(--ease-spring);}
.row.is-focus,.row:hover{background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 .14rem rgba(255,255,255,.7),0 0 1.2rem rgba(34,211,255,.25);}
.row .lbl{font-size:1.02rem;font-weight:900;}
.row .desc{font-size:.8rem;font-weight:700;color:var(--kr-ink-dim);margin-top:.1rem;}
.row .ctl{display:flex;align-items:center;justify-content:flex-end;gap:.7rem;min-width:0;}
.toggle{position:relative;width:3.6rem;height:2rem;border-radius:99px;border:0;padding:0;background:rgba(255,255,255,.14);box-shadow:inset 0 .12rem .3rem rgba(0,0,0,.4);cursor:pointer;transition:background .2s;flex:none;}
.toggle::after{content:'';position:absolute;top:.2rem;left:.2rem;width:1.6rem;height:1.6rem;border-radius:50%;background:#fff;box-shadow:0 .12rem .3rem rgba(0,0,0,.45);transition:transform .25s var(--ease-spring);}
.toggle[aria-checked="true"]{background:linear-gradient(180deg,#8ff05a,#4fb52a);}
.toggle[aria-checked="true"]::after{transform:translateX(1.6rem);}
.slider{position:relative;flex:1;min-width:6rem;height:2rem;touch-action:none;cursor:pointer;}
.slider .trk{position:absolute;left:0;right:0;top:50%;height:.8rem;margin-top:-.4rem;border-radius:99px;background:rgba(255,255,255,.14);box-shadow:inset 0 .1rem .25rem rgba(0,0,0,.4);overflow:hidden;}
.slider .fill{position:absolute;left:0;top:0;bottom:0;width:calc(var(--v,0) * 100%);background:linear-gradient(90deg,#22d3ff,#7be04a);border-radius:99px;}
.slider .knob{position:absolute;top:50%;left:calc(var(--v,0) * 100%);width:1.6rem;height:1.6rem;margin:-.8rem 0 0 -.8rem;border-radius:50%;background:#fff;box-shadow:0 .14rem .4rem rgba(0,0,0,.5),inset 0 -.15rem 0 rgba(0,0,0,.12);transition:transform .15s var(--ease-spring);}
.row.is-focus .slider .knob,.slider:active .knob{transform:scale(1.2);}
.sval{min-width:3.2rem;text-align:right;font-family:var(--font-display);font-size:1.05rem;color:#fff;}
.seg{display:inline-flex;gap:.25rem;padding:.25rem;border-radius:.9rem;background:rgba(0,0,0,.28);box-shadow:inset 0 .1rem .25rem rgba(0,0,0,.4);}
.seg button{border:0;cursor:pointer;padding:.4rem .95rem;border-radius:.65rem;background:transparent;font-weight:900;font-size:.9rem;color:var(--kr-ink-dim);transition:background .15s,color .15s,transform .15s var(--ease-spring);min-height:2rem;}
.seg button:hover{color:#fff;}
.seg button[aria-checked="true"]{background:linear-gradient(180deg,#ffa23d,#ff7a1a);color:#fff;box-shadow:0 .14rem 0 #a34400;transform:translateY(-.05rem);}
.stepper{display:inline-flex;align-items:center;gap:.5rem;}
.stepper button{width:2.2rem;height:2.2rem;border:0;border-radius:.7rem;cursor:pointer;background:rgba(255,255,255,.14);display:grid;place-items:center;font-size:1.1rem;transition:background .15s,transform .15s var(--ease-spring);}
.stepper button:hover{background:rgba(255,255,255,.28);transform:scale(1.1);}
.stepper .sv{min-width:2.6rem;text-align:center;font-family:var(--font-display);font-size:1.3rem;}
.tabs{display:flex;gap:.35rem;flex-wrap:wrap;}
.tab{position:relative;border:0;cursor:pointer;padding:.5rem 1.1rem;font-family:var(--font-display);font-size:1rem;letter-spacing:.05em;text-transform:uppercase;color:var(--kr-ink-dim);background:rgba(255,255,255,.07);border-radius:.8rem .8rem .3rem .3rem;transform:skewX(-8deg);transition:background .15s,color .15s,transform .18s var(--ease-spring);}
.tab > span{display:inline-flex;gap:.45rem;align-items:center;transform:skewX(8deg);}
.tab:hover,.tab.is-focus{background:rgba(255,255,255,.16);color:#fff;}
.tab.is-focus{box-shadow:inset 0 0 0 .13rem rgba(255,255,255,.75);}
.tab[aria-selected="true"]{background:linear-gradient(180deg,#ffa23d,#ff7a1a);color:#fff;box-shadow:0 .2rem 0 #a34400;}
input.txt,textarea.txt{width:100%;border:0;border-radius:.8rem;padding:.7rem .95rem;background:rgba(0,0,0,.36);color:#fff;font-weight:900;font-size:1.05rem;box-shadow:inset 0 0 0 .12rem var(--line),inset 0 .15rem .35rem rgba(0,0,0,.35);outline:none;-webkit-user-select:text;user-select:text;}
input.txt:focus,textarea.txt:focus{box-shadow:inset 0 0 0 .16rem var(--kr-accent-2),0 0 1rem rgba(34,211,255,.35);}
textarea.txt{resize:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;font-weight:700;line-height:1.35;word-break:break-all;}

/* ---------------------------------------------------------------- keycaps + gamepad glyphs (hint bar, help) */
.key{display:inline-flex;align-items:center;justify-content:center;min-width:1.7rem;height:1.7rem;padding:0 .45rem;border-radius:.4rem;background:linear-gradient(180deg,#f4f7ff,#c9d3ee);color:#1a2250;font-family:var(--font-ui);font-weight:900;font-size:.78rem;letter-spacing:.02em;box-shadow:0 .14rem 0 #6c78a8,0 .22rem .4rem rgba(0,0,0,.35);}
.key .ico{font-size:.95em;stroke-width:2.8;}
.pad{display:inline-flex;align-items:center;justify-content:center;width:1.7rem;height:1.7rem;border-radius:50%;font-weight:900;font-size:.85rem;color:#fff;box-shadow:inset 0 -.12rem 0 rgba(0,0,0,.25),0 .14rem 0 rgba(0,0,0,.4);}
.pad.a{background:#3ec26a;} .pad.b{background:#ec4a5b;} .pad.x{background:#3d83f0;} .pad.y{background:#f0b422;color:#2d2200;}
.pad.sh{border-radius:.5rem;width:auto;min-width:2.1rem;padding:0 .45rem;background:#56628f;font-size:.72rem;white-space:nowrap;}
.pad.dp{background:#56628f;border-radius:.45rem;width:auto;min-width:1.7rem;padding:0 .45rem;white-space:nowrap;font-size:.72rem;}
.hintbar{position:absolute;left:0;right:0;bottom:max(.7rem,var(--sab));display:flex;justify-content:center;gap:1.4rem;pointer-events:none!important;z-index:5;}
.hintbar .h{display:inline-flex;align-items:center;gap:.5rem;font-size:.82rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#dfe6ff;text-shadow:0 .08rem .3rem rgba(0,0,0,.7);}
.hintbar.hidden{opacity:0;}

/* ---------------------------------------------------------------- modal */
.modal-scrim{position:absolute;inset:0;display:grid;place-items:center;padding:1rem;background:radial-gradient(120% 100% at 50% 50%,rgba(6,9,26,.72),rgba(6,9,26,.92));animation:scr-fade .2s ease both;}
.modal-scrim.out{animation:scr-fade-out .18s ease both;}
.modal{width:min(34rem,94vw);max-height:92vh;display:flex;flex-direction:column;padding:0;animation:modal-in .38s var(--ease-spring) both;background:linear-gradient(180deg,#1f2b72,#0e1535);}
.modal.wide{width:min(46rem,94vw);}
.modal-scrim.out .modal{animation:modal-out .18s ease both;}
@keyframes modal-in{from{opacity:0;transform:translateY(1.6rem) scale(.9)}to{opacity:1;transform:none}}
@keyframes modal-out{to{opacity:0;transform:translateY(.8rem) scale(.96)}}
.modal .mh{padding:1.1rem 1.5rem .3rem;}
.modal .mb{padding:.4rem 1.5rem 1rem;color:#dfe6ff;font-size:1.02rem;overflow:auto;}
.modal .mf{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:1.1rem;padding:.9rem 1.5rem 1.4rem;}
.modal.danger .mh .h2{color:#ff9fb4;}

/* ---------------------------------------------------------------- toasts */
.toasts{position:absolute;left:50%;top:max(1rem,var(--sat));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:.6rem;pointer-events:none!important;width:min(30rem,92vw);}
.toast{pointer-events:none;display:flex;align-items:center;gap:.8rem;padding:.55rem 1.1rem .55rem .65rem;border-radius:1rem;background:linear-gradient(180deg,rgba(32,44,104,.96),rgba(14,20,52,.96));box-shadow:inset 0 0 0 .1rem var(--line),0 .4rem 0 rgba(0,0,0,.3),0 1rem 2rem rgba(0,0,0,.4);animation:toast-in .5s var(--ease-spring) both;max-width:100%;}
.toast.out{animation:toast-out .3s var(--ease-in) both;}
.toast .ti{width:2.6rem;height:2.6rem;border-radius:.8rem;display:grid;place-items:center;font-size:1.5rem;flex:none;background:linear-gradient(180deg,#ffb04a,#ff7a1a);color:#fff;box-shadow:0 .14rem 0 #a34400;overflow:hidden;}
.toast .ti canvas{width:100%;height:100%;display:block;}
.toast.unlock .ti{background:linear-gradient(180deg,#ffe985,#ffd23f);color:#3a2600;box-shadow:0 .14rem 0 #9c6d06;}
.toast.good .ti{background:linear-gradient(180deg,#b5f67d,#51b82a);color:#0c2a05;box-shadow:0 .14rem 0 #2d7712;}
.toast.bad .ti{background:linear-gradient(180deg,#ff7b98,#df2250);box-shadow:0 .14rem 0 #8a1030;}
.toast .tt{font-family:var(--font-display);font-size:1.05rem;letter-spacing:.04em;text-transform:uppercase;}
.toast .ts{font-size:.85rem;color:var(--kr-ink-dim);}
@keyframes toast-in{from{opacity:0;transform:translateY(-1.6rem) scale(.85)}to{opacity:1;transform:none}}
@keyframes toast-out{to{opacity:0;transform:translateY(-1rem) scale(.95)}}

/* ---------------------------------------------------------------- wipe transition (diagonal chequered bands) */
.wipe{position:absolute;inset:-10% -20%;display:flex;transform:skewX(-14deg);pointer-events:none;}
.wipe i{flex:1;background:linear-gradient(180deg,#0a0f24,#141b3d);transform:scaleY(0);transform-origin:top;}
.wipe i:nth-child(even){transform-origin:bottom;background:linear-gradient(180deg,#141b3d,#1d2760);}
.wipe i::after{content:'';position:absolute;left:0;right:0;bottom:0;height:.9rem;background:repeating-linear-gradient(90deg,#fff 0 .9rem,#10163a .9rem 1.8rem);opacity:.9;}
.wipe i{position:relative;}
.wipe.cover i{animation:wipe-cover .38s var(--ease-out) both;animation-delay:calc(var(--n,0) * 28ms);}
.wipe.reveal i{transform:scaleY(1);animation:wipe-reveal .42s var(--ease-in) both;animation-delay:calc(var(--n,0) * 24ms);}
.wipe.reveal i:nth-child(odd){transform-origin:top;} .wipe.reveal i:nth-child(even){transform-origin:bottom;}
@keyframes wipe-cover{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes wipe-reveal{from{transform:scaleY(1)}to{transform:scaleY(0)}}

/* ---------------------------------------------------------------- error boundary */
.fatal{position:absolute;inset:0;display:grid;place-items:center;padding:1.2rem;background:radial-gradient(100% 100% at 50% 40%,#1b2a6b,#0a0f24);}
.fatal .panel{width:min(38rem,94vw);padding:1.6rem;}
.fatal pre{margin:.8rem 0 0;max-height:8rem;overflow:auto;padding:.7rem;border-radius:.6rem;background:rgba(0,0,0,.4);font-size:.72rem;font-weight:700;color:#ffb4c2;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text;}

/* ---------------------------------------------------------------- misc */
.row-gap{display:flex;gap:.8rem;align-items:center;}
.spacer{flex:1;}
.scroll{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent;overscroll-behavior:contain;}
.scroll::-webkit-scrollbar{width:.5rem;} .scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.28);border-radius:1rem;}
.lockdim{filter:grayscale(.9) brightness(.55);}
.ghost-pulse{animation:ghostp 1.6s ease-in-out infinite;}
@keyframes ghostp{50%{opacity:.55}}
.backbtn{position:absolute;left:max(1.2rem,var(--sal));top:max(1.2rem,var(--sat));z-index:6;}
.noflash [class*="flash"]{animation:none!important;}
[data-rm] .toast,[data-rm] .modal,[data-rm] .modal-scrim{animation-duration:.01s!important;} [data-rm] .btn,[data-rm] .mbtn,[data-rm] .chip-d,[data-rm] .kcard,[data-rm] .ccard,[data-rm] .tcard,[data-rm] .cupcard,[data-rm] .row,[data-rm] .icon-btn{transition-duration:.01s!important;} [data-rm] .press,[data-rm] .ghost-pulse,[data-rm] .logo,[data-rm] .lw .t,[data-rm] .bar i::after,[data-rm] .keybtn.listening{animation:none!important;}

[data-large] #ui-root{--ui-large:1;}
.icon-btn{min-width:2.8rem;}

`;

/** Appended AFTER every screen's CSS so its compact-layout overrides cannot shrink touch targets. */
export const coarseCss = /* css */ `
/* touch: every tap target >= 44 px (art direction), even in the compact layouts */
@media (any-pointer:coarse){
  .btn.sm,.l-compact .btn.sm{min-height:2.8rem;}
  .btn,.l-compact .btn{min-height:2.8rem;}
  .icon-btn{width:3rem;height:3rem;}
  .keybtn,.l-compact .keybtn{height:2.8rem;}
  .seg button,.l-compact .seg button{min-height:2.4rem;}
  .stepper button,.l-compact .stepper button{width:2.8rem;height:2.8rem;}
  .slider{height:2.8rem;}
  .row,.l-compact .row,.krow,.l-compact .krow{min-height:3rem;}
  .tab,.l-compact .tab{min-height:2.8rem;}
  .mbtn,.l-compact .mbtn,.l-portrait .mbtn{min-height:2.9rem;}
}
`;
