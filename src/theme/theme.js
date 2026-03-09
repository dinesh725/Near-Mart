export const T = {
  // SCM palette
  bg: "#070B12", surface: "#0C1018", card: "#111827", cardHov: "#141F30", panel: "#0F1621",
  border: "#1A2436", borderLt: "#243048",
  gold: "#F4B942", goldDim: "#C4922A", goldGlow: "rgba(244,185,66,0.18)", goldFg: "rgba(244,185,66,0.08)",
  emerald: "#10D9A0", emerGlow: "rgba(16,217,160,0.15)",
  sapphire: "#3B82F6", sapGlow: "rgba(59,130,246,0.18)",
  coral: "#F87171", corGlow: "rgba(248,113,113,0.18)",
  violet: "#A78BFA", violGlow: "rgba(167,139,250,0.18)",
  amber: "#FBBF24", sky: "#38BDF8", rose: "#FB7185", lime: "#84CC16",
  text: "#EEF2FF", textSub: "#94A3B8", textDim: "#475569", textFaint: "#1E293B",
  success: "#10D9A0", warning: "#FBBF24", danger: "#F87171", info: "#38BDF8",
};

export const P = {
  bg: "#0A0D14", surface: "#111520", card: "#161C2D", border: "#1E2A45",
  primary: "#3B6FFF", primaryGlow: "rgba(59,111,255,0.25)",
  accent: "#FF6B35", accentGlow: "rgba(255,107,53,0.2)",
  emerald: "#00E5A0", emeraldGlow: "rgba(0,229,160,0.2)",
  purple: "#9B6DFF", text: "#F0F4FF", textMuted: "#6B7A99", textDim: "#3A4560",
  success: "#00E5A0", warning: "#FFB800", danger: "#FF4757",
};

export const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@300;400;500;600;700&family=Cinzel:wght@500;700&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--z-map:1;--z-sidebar:100;--z-header:200;--z-nav:500;--z-dropdown:600;--z-modal:9000;--z-toast:9999;--z-tracking:10000}
html{font-size:clamp(12.5px,0.85vw + 7px,16px);scroll-behavior:smooth;overflow-x:hidden}
body{background:${T.bg};color:${T.text};font-family:'Sora',sans-serif;min-height:100vh;min-height:100dvh;overflow-x:hidden;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;overscroll-behavior-x:none}
body.scroll-locked{overflow:hidden !important;position:fixed;width:100%;touch-action:none;-ms-touch-action:none}
/* Leaflet containment — tiles and controls must stay below app chrome */
.leaflet-pane{z-index:var(--z-map) !important}
.leaflet-top,.leaflet-bottom{z-index:calc(var(--z-map) + 1) !important}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${T.border};border-radius:99px}

/* ── MODE BAR ──────────────────────────────── */
.mode-bar{position:fixed;top:0;left:0;right:0;height:48px;background:${T.bg};border-bottom:1px solid ${T.border};display:flex;align-items:center;gap:6px;z-index:1000;padding:0 env(safe-area-inset-right,8px) 0 env(safe-area-inset-left,8px)}
.mode-bar-brand{font-size:15px;font-weight:800;color:${T.gold};flex-shrink:0;margin-right:4px;white-space:nowrap}
.mode-bar-btns{display:flex;gap:4px;flex:1;overflow:hidden;min-width:0}
.mode-bar-ver{font-size:9px;color:${T.textDim};flex-shrink:0;margin-left:auto;display:flex;align-items:center;gap:6px;overflow:hidden;max-width:240px}
.mode-bar-ver .mode-bar-user{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:${T.textDim}}
.mode-btn{padding:5px 12px;border-radius:20px;border:1px solid ${T.border};background:transparent;color:${T.textDim};font-family:'Sora',sans-serif;font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.3px;white-space:nowrap;min-height:32px;-webkit-tap-highlight-color:transparent}
.mode-btn:hover{color:${T.textSub};border-color:${T.borderLt}}
.mode-btn.active{background:${T.goldFg};color:${T.gold};border-color:${T.goldDim}}
.mode-content{margin-top:48px;height:calc(100vh - 48px);height:calc(100dvh - 48px);overflow:hidden}

/* ── SCM ROOT ─────────────────────────────── */
.scm-root{display:flex;flex-direction:column;min-height:calc(100vh - 48px);position:relative;overflow-x:hidden}
.scm-ambient{position:fixed;inset:0;pointer-events:none;z-index:0;top:48px}
.scm-ambient::before{content:'';position:absolute;top:-200px;left:-200px;width:700px;height:700px;background:radial-gradient(circle,${T.goldGlow} 0%,transparent 70%);animation:ambientDrift 18s ease-in-out infinite alternate}
.scm-ambient::after{content:'';position:absolute;bottom:-150px;right:-100px;width:500px;height:500px;background:radial-gradient(circle,${T.emerGlow} 0%,transparent 70%);animation:ambientDrift 14s ease-in-out infinite alternate-reverse}
@keyframes ambientDrift{from{transform:translate(0,0) scale(1)}to{transform:translate(60px,40px) scale(1.15)}}
.hex-grid{position:fixed;inset:0;top:48px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52'%3E%3Cpath d='M30 2 L58 17 L58 46 L30 61 L2 46 L2 17 Z' fill='none' stroke='%231A2436' stroke-width='0.5'/%3E%3C/svg%3E");background-size:60px 52px;opacity:.35;pointer-events:none;z-index:0}

/* ── SCM HEADER ─── mobile: no tab nav, hamburger visible */
.module-header{position:relative;z-index:10;background:${T.surface};border-bottom:1px solid ${T.border};padding:0 14px;display:flex;align-items:center;height:54px;flex-shrink:0;gap:10px}
.module-logo{display:flex;align-items:center;gap:8px;flex-shrink:0}
.module-logo-mark{width:32px;height:32px;background:linear-gradient(135deg,${T.gold},${T.goldDim});border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#000;box-shadow:0 0 20px ${T.goldGlow};flex-shrink:0}
.tab-nav{display:none;gap:0;flex:1;overflow-x:auto}
.tab-nav::-webkit-scrollbar{height:0}
.tab-btn{padding:0 14px;height:54px;background:none;border:none;color:${T.textDim};font-family:'Sora',sans-serif;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;border-bottom:2px solid transparent;transition:all .2s ease;letter-spacing:.2px;flex-shrink:0}
.tab-btn:hover{color:${T.textSub}}
.tab-btn.active{color:${T.gold};border-bottom-color:${T.gold};background:${T.goldFg}22}
.tab-count{background:${T.goldFg};border:1px solid ${T.goldGlow};color:${T.gold};font-size:9px;font-family:'JetBrains Mono',monospace;padding:1px 5px;border-radius:4px}
.hdr-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0}
.scm-content{position:relative;z-index:1;flex:1;padding:14px 14px 80px;padding-bottom:calc(80px + env(safe-area-inset-bottom,0px));overflow-y:auto;display:flex;flex-direction:column;gap:14px}

/* ── HAMBURGER ─────────────────────────────── */
.hamburger-btn{display:flex;flex-direction:column;justify-content:center;gap:4px;width:36px;height:36px;background:${T.panel};border:1px solid ${T.border};border-radius:8px;cursor:pointer;padding:6px;flex-shrink:0}
.hbg-line{height:2px;background:var(--hbg-color,${T.gold});border-radius:2px;transition:all .25s ease;transform-origin:center}
.hbg-line.open:nth-child(1){transform:translateY(6px) rotate(45deg)}
.hbg-line.open:nth-child(2){opacity:0;transform:scaleX(0)}
.hbg-line.open:nth-child(3){transform:translateY(-6px) rotate(-45deg)}

/* ── SCM TAB DRAWER (mobile) ───────────────── */
.scm-tab-drawer{position:fixed;bottom:64px;left:0;right:0;background:${T.surface};border-top:1px solid ${T.border};z-index:400;max-height:55vh;overflow-y:auto;animation:slideUpDrawer .25s ease;padding:8px 0 8px}
@keyframes slideUpDrawer{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.scm-tab-drawer-item{display:flex;align-items:center;gap:12px;padding:12px 20px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;border-left:3px solid transparent}
.scm-tab-drawer-item:hover{background:${T.card}}
.scm-tab-drawer-item.active{background:${T.goldFg};border-left-color:${T.gold};color:${T.gold}}

/* ── MOBILE NAV BAR ───────────────────────── */
.mobile-nav{display:flex;position:fixed;bottom:0;left:0;right:0;height:calc(60px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);background:${T.surface};border-top:1px solid ${T.border};z-index:500;overflow:hidden;padding-left:env(safe-area-inset-left,4px);padding-right:env(safe-area-inset-right,4px)}
.mobile-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:none;cursor:pointer;padding:4px 0;transition:all .2s ease;position:relative;color:${T.textDim};font-family:'Sora',sans-serif;border-top:2px solid transparent;min-height:44px;-webkit-tap-highlight-color:transparent}
.mobile-nav-btn.active{color:var(--nav-accent,${T.gold});border-top-color:var(--nav-accent,${T.gold})}
.mobile-nav-icon{font-size:18px;line-height:1}
.mobile-nav-label{font-size:10px;font-weight:600;letter-spacing:.3px}
.mobile-nav-count{position:absolute;top:4px;right:calc(50% - 16px);min-width:16px;height:16px;padding:0 4px;background:${T.coral};color:white;border-radius:99px;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:1}

/* ── CARDS ─────────────────────────────────── */
.card{background:${T.card};border:1px solid ${T.border};border-radius:14px;padding:16px;position:relative;overflow:hidden;transition:border-color .25s,box-shadow .25s}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,${T.borderLt},transparent)}
.card:hover{border-color:${T.borderLt}}
.card.gold-glow:hover{border-color:${T.goldDim};box-shadow:0 0 30px ${T.goldGlow}}
.card.em-glow:hover{border-color:${T.emerald}44;box-shadow:0 0 30px ${T.emerGlow}}
.sec-title{font-size:13px;font-weight:700;letter-spacing:.4px;color:${T.text};display:flex;align-items:center;gap:8px;margin-bottom:12px}
.kpi-card{background:${T.card};border:1px solid ${T.border};border-radius:14px;padding:16px;position:relative;overflow:hidden;transition:all .25s ease;cursor:default}
.kpi-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:var(--kc,${T.gold});opacity:0;transition:opacity .25s}
.kpi-card:hover::after{opacity:1}
.kpi-card:hover{transform:translateY(-2px);border-color:var(--kc,${T.border});box-shadow:0 8px 24px rgba(0,0,0,.3)}
.kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${T.textSub};margin-bottom:8px}
.kpi-value{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1;margin-bottom:5px}
.kpi-delta{font-size:12px;font-weight:600;display:flex;align-items:center;gap:4px}
.kpi-icon{position:absolute;top:14px;right:14px;font-size:26px;opacity:.1}
.profit-meter{height:8px;border-radius:8px;background:${T.border};overflow:hidden;margin:8px 0}
.profit-fill{height:100%;border-radius:8px;position:relative;overflow:hidden;transition:width 1.2s cubic-bezier(.4,0,.2,1)}
.profit-fill::after{content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);animation:shimmer 2.5s infinite}
@keyframes shimmer{to{left:100%}}

/* ── TABLE (horizontally scrollable on mobile) */
.scm-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.scm-table{width:100%;border-collapse:collapse;min-width:500px}
.scm-table th{padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${T.textDim};border-bottom:1px solid ${T.border};text-align:left;white-space:nowrap}
.scm-table td{padding:11px 12px;font-size:13px;border-bottom:1px solid ${T.border}55;vertical-align:middle;transition:background .15s}
.scm-table tr:last-child td{border-bottom:none}
.scm-table tbody tr:hover td{background:${T.panel}}

/* ── MOBILE TABLE CARD VIEW ──────────────── */
.mob-card{background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.mob-card-row{display:flex;justify-content:space-between;align-items:center;font-size:13px}
.mob-card-label{font-size:10px;color:${T.textDim};font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px}

/* ── BADGES (high-contrast) ─────────────── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.2px;white-space:nowrap}
.badge-gold{background:#F4B94230;color:#F4B942;border:1.5px solid #F4B942}
.badge-emerald{background:#10D9A030;color:#10D9A0;border:1.5px solid #10D9A0}
.badge-coral{background:#F8717130;color:#F87171;border:1.5px solid #F87171}
.badge-sapphire{background:#3B82F630;color:#3B82F6;border:1.5px solid #3B82F6}
.badge-violet{background:#A78BFA30;color:#A78BFA;border:1.5px solid #A78BFA}
.badge-amber{background:#FBBF2430;color:#FBBF24;border:1.5px solid #FBBF24}
.badge-muted{background:${T.border};color:${T.textSub}}
.badge-rose{background:#FB718530;color:#FB7185;border:1.5px solid #FB7185}
.badge-lime{background:#84CC1630;color:#84CC16;border:1.5px solid #84CC16}

/* ── BUTTONS ──────────────────────────────── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:9px;border:none;font-family:'Sora',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s ease;white-space:nowrap;letter-spacing:.2px}
.btn-gold{background:linear-gradient(135deg,${T.gold},${T.goldDim});color:#070B12;box-shadow:0 4px 16px ${T.goldGlow}}
.btn-gold:hover{transform:translateY(-1px);box-shadow:0 8px 24px ${T.goldGlow}}
.btn-ghost{background:${T.panel};color:${T.textSub};border:1px solid ${T.border}}
.btn-ghost:hover{background:${T.card};color:${T.text};border-color:${T.borderLt}}
.btn-emerald{background:${T.emerGlow};color:${T.emerald};border:1px solid ${T.emerald}44}
.btn-danger{background:${T.corGlow};color:${T.coral};border:1px solid ${T.coral}44}
.btn-sapphire{background:${T.sapGlow};color:${T.sapphire};border:1px solid ${T.sapphire}44}
.btn-sm{padding:6px 13px;font-size:12px;border-radius:7px}
.btn-xs{padding:4px 10px;font-size:11px;border-radius:6px}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none}

/* ── INPUTS ───────────────────────────────── */
.input{background:${T.panel};border:1px solid ${T.border};border-radius:9px;padding:11px 14px;color:${T.text};font-family:'Sora',sans-serif;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s;width:100%}
.input:focus{border-color:${T.gold};box-shadow:0 0 0 3px ${T.goldGlow}}
.input::placeholder{color:${T.textDim}}
.input-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${T.textSub};margin-bottom:6px}
.select{background:${T.panel};border:1px solid ${T.border};border-radius:9px;padding:11px 14px;color:${T.text};font-family:'Sora',sans-serif;font-size:14px;outline:none;cursor:pointer;transition:border-color .2s}
.select:focus{border-color:${T.gold}}

/* ── SUPPLIER CARDS ──────────────────────── */
.supplier-card{background:${T.card};border:1px solid ${T.border};border-radius:14px;padding:14px;cursor:pointer;transition:all .25s ease;position:relative}
.supplier-card:hover{border-color:${T.gold}55;transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.35)}
.supplier-card.selected{border-color:${T.gold};background:${T.goldFg};box-shadow:0 0 20px ${T.goldGlow}}
.star-rating{color:${T.gold};font-size:13px;letter-spacing:1px}
.toggle-group{display:flex;background:${T.panel};border:1px solid ${T.border};border-radius:10px;padding:4px;gap:4px;flex-wrap:wrap}
.toggle-opt{padding:6px 12px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:transparent;color:${T.textDim};font-family:'Sora',sans-serif;transition:all .2s}
.toggle-opt.active{background:${T.goldFg};color:${T.gold};border:1px solid ${T.gold}33}
.chain-node{background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:12px 16px;flex:1;min-width:120px;transition:all .2s;cursor:pointer}
.chain-node:hover{border-color:${T.gold}55}
.chain-node.active{border-color:${T.gold};background:${T.goldFg}}

/* ── ALERTS ───────────────────────────────── */
.alert-strip{padding:10px 14px;border-radius:10px;font-size:13px;font-weight:600;display:flex;align-items:flex-start;gap:8px;line-height:1.4}
.alert-warning{background:rgba(251,191,36,.15);color:#FBBF24;border:1.5px solid #FBBF24}
.alert-danger{background:rgba(248,113,113,.15);color:#F87171;border:1.5px solid #F87171}
.alert-success{background:rgba(16,217,160,.15);color:#10D9A0;border:1.5px solid #10D9A0}
.alert-info{background:rgba(56,189,248,.15);color:#38BDF8;border:1.5px solid #38BDF8}

/* ── MODAL ───────────────────────────────── */
.modal-overlay{position:fixed;inset:0;top:48px;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .2s ease}
.modal-box{background:${T.card};border:1px solid ${T.border};border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:600px;max-height:88vh;overflow-y:auto;animation:slideUpDrawer .3s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}

/* ── TOASTS ──────────────────────────────── */
.scm-toast{position:fixed;bottom:72px;right:12px;left:12px;background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:10px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,.5);font-size:13px;animation:slideUp .3s ease}
.page-enter{animation:pageEnter .3s ease}
@keyframes pageEnter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

/* ── MISC UTILITY ─────────────────────────── */
.gauge-track{position:relative;height:12px;background:linear-gradient(90deg,${T.coral},${T.amber},${T.emerald});border-radius:99px;margin:8px 0}
.gauge-thumb{position:absolute;top:50%;transform:translate(-50%,-50%);width:20px;height:20px;background:white;border-radius:50%;border:3px solid ${T.gold};box-shadow:0 2px 8px rgba(0,0,0,.5);transition:left .6s ease}
.g2{display:grid;grid-template-columns:1fr;gap:12px}
.g3{display:grid;grid-template-columns:1fr;gap:12px}
.g4{display:grid;grid-template-columns:1fr;gap:12px}
.g21{display:grid;grid-template-columns:1fr;gap:14px}
.g12{display:grid;grid-template-columns:1fr;gap:14px}
.g31{display:grid;grid-template-columns:1fr;gap:14px}
.row{display:flex;align-items:center}
.row-between{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.col{display:flex;flex-direction:column}
.flex1{flex:1}
.gap4{gap:4px}.gap6{gap:6px}.gap8{gap:8px}.gap10{gap:10px}.gap12{gap:12px}.gap16{gap:16px}.gap20{gap:20px}
.mt4{margin-top:4px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}.mt20{margin-top:20px}
.mb4{margin-bottom:4px}.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}
.mono{font-family:'JetBrains Mono',monospace}
.text-xs{font-size:11px}.text-sm{font-size:13px}.text-muted{color:${T.textSub}}.text-dim{color:${T.textDim}}
.text-bg{color:${T.bg}}
.text-gold{color:${T.gold}}.text-emerald{color:${T.emerald}}.text-coral{color:${T.coral}}.text-violet{color:${T.violet}}
.text-sapphire{color:${T.sapphire}}.text-amber{color:${T.amber}}
.font-bold{font-weight:700}.font-semi{font-weight:600}
.text-right{text-align:right}.text-center{text-align:center}
.divider{height:1px;background:${T.border};margin:4px 0}
.waterfall-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid ${T.border}44;flex-wrap:wrap}
.waterfall-row:last-child{border-bottom:none}
.wf-bar-track{flex:1;min-width:80px;height:10px;background:${T.border};border-radius:6px;overflow:hidden}
.wf-bar-fill{height:100%;border-radius:6px;transition:width 1.2s cubic-bezier(.4,0,.2,1)}
.skeleton{background:linear-gradient(90deg,${T.border} 25%,${T.borderLt} 50%,${T.border} 75%);background-size:200% 100%;animation:skeletonShimmer 1.5s infinite;border-radius:8px}
@keyframes skeletonShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* ── PLATFORM STYLES ─────────────────────── */
.plat-root{display:flex;height:calc(100vh - 48px);height:calc(100dvh - 48px);overflow:hidden;position:relative;background:${P.bg};max-width:100vw}
.bg-grid{position:fixed;inset:0;top:48px;background-image:linear-gradient(${P.border}22 1px,transparent 1px),linear-gradient(90deg,${P.border}22 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
.bg-glow{position:fixed;width:600px;height:600px;border-radius:50%;filter:blur(120px);pointer-events:none;z-index:0;transition:all 1s ease}

/* ── SIDEBAR: hidden on mobile ─────────────── */
.plat-sidebar{display:none;width:72px;background:${P.surface};border-right:1px solid ${P.border};flex-direction:column;align-items:center;padding:12px 0;gap:8px;z-index:100;position:relative;flex-shrink:0;transition:width .3s cubic-bezier(.4,0,.2,1)}
.plat-sidebar.expanded{width:220px;align-items:flex-start;padding:12px}
.plat-logo{width:40px;height:40px;background:linear-gradient(135deg,${P.primary},${P.purple});border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:white;margin-bottom:12px;flex-shrink:0;box-shadow:0 0 30px ${P.primaryGlow};cursor:pointer;font-family:'Sora',sans-serif}
.plat-nav-item{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${P.textMuted};font-size:20px;transition:all .2s ease;position:relative;flex-shrink:0;border:1px solid transparent;background:none}
.plat-nav-item:hover{background:${P.card};color:${P.text}}
.plat-nav-item.active{background:${P.primaryGlow};color:${P.primary};border-color:${P.primary}44}
.plat-nav-full{width:100%;height:44px;border-radius:12px;display:flex;align-items:center;gap:12px;cursor:pointer;color:${P.textMuted};font-size:13px;font-weight:500;transition:all .2s ease;padding:0 12px;border:1px solid transparent;white-space:nowrap;background:none}
.plat-nav-full:hover{background:${P.card};color:${P.text}}
.plat-nav-full.active{background:${P.primaryGlow};color:${P.primary};border-color:${P.primary}44}

/* ── ROLE SWITCHER: hidden on mobile ─────── */
.role-switcher{display:none;position:fixed;top:52px;left:50%;transform:translateX(-50%);background:${P.surface};border:1px solid ${P.border};border-radius:16px;padding:6px;gap:4px;z-index:200;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.role-btn{padding:7px 12px;border-radius:10px;border:none;background:transparent;color:${P.textMuted};font-family:'Sora',sans-serif;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s ease;display:flex;align-items:center;gap:5px;white-space:nowrap}
.role-btn:hover{color:${P.text};background:${P.card}}
.role-btn.active{background:${P.primary};color:white;box-shadow:0 4px 12px ${P.primaryGlow}}

/* ── PLATFORM MAIN ─────────────────────── */
.plat-main{flex:1;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;position:relative;z-index:1;min-width:0}
.plat-header{height:56px;background:${P.surface}EE;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid ${P.border};display:flex;align-items:center;padding:0 16px;padding-right:env(safe-area-inset-right,16px);gap:12px;flex-shrink:0;position:sticky;top:0;z-index:200;overflow:hidden;min-width:0;will-change:transform}
.plat-content{flex:1;overflow-x:hidden;padding:16px 14px 80px;padding-bottom:calc(80px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:16px;width:100%;max-width:100vw}
.plat-content>*{max-width:1400px;width:100%}
.p-card{background:${P.card};border:1px solid ${P.border};border-radius:16px;padding:16px;position:relative;overflow:hidden;transition:border-color .2s ease}
.p-card:hover{border-color:${P.primary}44}
.p-card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,${P.primary}08,transparent 60%);pointer-events:none}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.stat-card{background:${P.card};border:1px solid ${P.border};border-radius:14px;padding:14px 16px;position:relative;overflow:hidden;transition:all .2s ease;cursor:default}
.stat-card:hover{transform:translateY(-2px);border-color:var(--ac,${P.border});box-shadow:0 8px 24px rgba(0,0,0,.3)}
.grid-2{display:grid;grid-template-columns:1fr;gap:14px}
.grid-3{display:grid;grid-template-columns:1fr;gap:14px}
.grid-2-1{display:grid;grid-template-columns:1fr;gap:14px}
.grid-1-2{display:grid;grid-template-columns:1fr;gap:14px}
.p-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700}
.p-badge-success{background:#00E5A030;color:#00E5A0;border:1.5px solid #00E5A0}
.p-badge-warning{background:#FFB80030;color:#FFB800;border:1.5px solid #FFB800}
.p-badge-danger{background:#FF475730;color:#FF4757;border:1.5px solid #FF4757}
.p-badge-primary{background:${P.primary}30;color:${P.primary};border:1.5px solid ${P.primary}}
.p-badge-muted{background:${P.textDim}30;color:${P.textMuted}}
.p-badge-purple{background:${P.purple}30;color:${P.purple};border:1.5px solid ${P.purple}}
.p-badge-accent{background:${P.accent}30;color:${P.accent};border:1.5px solid ${P.accent}}
.p-btn{padding:10px 18px;border-radius:10px;border:none;font-family:'Sora',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s ease;display:inline-flex;align-items:center;gap:6px}
.p-btn:disabled{opacity:.4;cursor:not-allowed}
.p-btn:focus-visible{outline:2px solid ${P.primary};outline-offset:2px}
.p-btn-primary{background:${P.primary};color:white;box-shadow:0 4px 12px ${P.primaryGlow}}
.p-btn-primary:hover:not(:disabled){background:#5580FF;transform:translateY(-1px)}
.p-btn-ghost{background:${P.surface};color:${P.text};border:1px solid ${P.border}}
.p-btn-ghost:hover:not(:disabled){background:${P.card}}
.p-btn-sm{padding:6px 13px;font-size:13px;border-radius:8px}
.p-btn-danger{background:${P.danger}22;color:${P.danger};border:1px solid ${P.danger}44}
.p-input{background:${P.surface};border:1px solid ${P.border};border-radius:10px;padding:11px 14px;color:${P.text};font-family:'Sora',sans-serif;font-size:14px;outline:none;transition:border-color .2s;width:100%}
.p-input:focus{border-color:${P.primary};box-shadow:0 0 0 3px ${P.primaryGlow}}
.p-input:focus-visible{outline:2px solid ${P.primary};outline-offset:1px}
.p-input::placeholder{color:${P.textMuted}}
.progress-bar{height:6px;background:${P.border};border-radius:6px;overflow:hidden}
.progress-fill{height:100%;border-radius:6px;transition:width 1s ease}
.mobile-frame{width:100%;max-width:320px;height:580px;background:${P.surface};border-radius:32px;border:2px solid ${P.border};overflow:hidden;position:relative;flex-shrink:0;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.order-card{background:${P.surface};border:1px solid ${P.border};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:all .2s ease}
.order-card:hover{border-color:${P.primary}44;transform:translateY(-1px)}
.product-card{background:${P.card};border:1px solid ${P.border};border-radius:14px;overflow:hidden;transition:all .2s ease;cursor:pointer}
.product-card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.4);border-color:${P.primary}44}
.p-divider{height:1px;background:${P.border};margin:4px 0}
.p-section-title{font-size:15px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.p-label{font-size:11px;font-weight:700;color:${P.textMuted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.p-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}
.ticket{background:${P.surface};border:1px solid ${P.border};border-radius:14px;padding:14px;display:flex;gap:12px;align-items:flex-start;transition:all .2s;cursor:pointer}
.ticket:hover{border-color:${P.primary}44}
.map-placeholder{background:linear-gradient(135deg,#0D1926 0%,#0A1520 50%,#0D1926 100%);border-radius:14px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.map-dot{width:10px;height:10px;border-radius:50%;background:${P.primary};position:absolute;animation:pulse-dot 2s infinite}
@keyframes pulse-dot{0%{box-shadow:0 0 0 0 ${P.primaryGlow}}70%{box-shadow:0 0 0 20px rgba(59,111,255,0)}100%{box-shadow:0 0 0 0 rgba(59,111,255,0)}}
.chat-bubble{padding:10px 14px;border-radius:14px;font-size:13px;max-width:80%;line-height:1.5}
.chat-in{background:${P.card};border-bottom-left-radius:4px}
.chat-out{background:${P.primary};color:white;border-bottom-right-radius:4px;align-self:flex-end}
.plat-toast{position:fixed;bottom:72px;right:12px;left:12px;background:${P.card};border:1px solid ${P.border};border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:10px;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:13px;animation:slideUp .3s ease}
.notif-dot{width:8px;height:8px;background:${P.accent};border-radius:50%;position:absolute;top:8px;right:8px}
.animate-up{animation:slideUp .4s ease forwards}
.stagger-1{animation-delay:.05s;opacity:0}
.stagger-2{animation-delay:.1s;opacity:0}
.stagger-3{animation-delay:.15s;opacity:0}
.stagger-4{animation-delay:.2s;opacity:0}
.w-100{width:100%}
.align-center{align-items:center}
.px8{padding-left:8px;padding-right:8px}
.p16{padding:16px}
.p20{padding:20px}
.ml8{margin-left:8px}
.line-clamp-1{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}


/* ── PLATFORM GRID (responsive auto-fit) ─────────────────── */
.plat-grid{display:grid;grid-template-columns:1fr;gap:14px}
.plat-grid-2{display:grid;grid-template-columns:1fr;gap:14px}

/* ── TOUCH TARGETS (min 44px for iOS/Android) ─────────────── */
.p-btn{min-height:44px;padding:10px 18px;border-radius:10px;border:none;font-family:'Sora',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;display:inline-flex;align-items:center;justify-content:center;gap:6px;-webkit-tap-highlight-color:transparent}
.p-btn-sm{min-height:36px;padding:8px 14px;font-size:13px;border-radius:8px}
.p-btn-xs{min-height:32px;padding:5px 10px;font-size:12px;border-radius:6px}
.p-btn:active:not(:disabled){transform:scale(0.97)}

/* ── FORM INPUTS (16px prevents iOS auto-zoom) ─────────────── */
.p-input{background:${P.surface};border:1px solid ${P.border};border-radius:10px;padding:12px 14px;color:${P.text};font-family:'Sora',sans-serif;font-size:16px;outline:none;transition:border-color 0.3s ease,box-shadow 0.3s ease;width:100%;-webkit-appearance:none}
.p-input:focus{border-color:${P.primary};box-shadow:0 0 0 3px ${P.primaryGlow}}
.p-input::placeholder{color:${P.textMuted}}
.p-field{display:flex;flex-direction:column;gap:6px}
.p-field label{font-size:12px;font-weight:700;color:${P.textMuted};text-transform:uppercase;letter-spacing:.6px}
select.p-input{cursor:pointer}

/* ── LOADING SPINNER ─────────────────────────────────────── */
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;flex-shrink:0}
.spinner-dark{border-color:${P.border};border-top-color:${P.primary}}
.loading-overlay{position:absolute;inset:0;background:${P.bg}99;display:flex;align-items:center;justify-content:center;z-index:20;border-radius:inherit;backdrop-filter:blur(4px)}

/* ── SUCCESS TOAST ───────────────────────────────────────── */
.plat-toast{position:fixed;bottom:80px;right:12px;left:12px;background:${P.card};border:1px solid ${P.border};border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:14px;animation:toastIn .35s cubic-bezier(.34,1.56,.64,1);max-width:440px;margin:0 auto}
@keyframes toastIn{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
.toast-icon{font-size:22px;flex-shrink:0}
.toast-msg{flex:1;font-weight:600;line-height:1.3}

/* ── MODAL: Bottom-sheet (mobile) / Centered (desktop) ─────── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:8000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.modal-sheet{background:${P.card};border-radius:24px 24px 0 0;padding:24px;width:100%;max-height:90vh;overflow-y:auto;animation:sheetUp .3s cubic-bezier(.34,1.2,.64,1)}
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.modal-handle{width:40px;height:4px;background:${P.border};border-radius:4px;margin:0 auto 20px}
.modal-close{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;border:1px solid ${P.border};background:${P.surface};color:${P.textMuted};font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer}

/* ── MAP RESPONSIVE ─────────────────────────────────────── */
.map-responsive{width:100%;min-height:240px;background:linear-gradient(135deg,#0D1926,#0A1520,#0D1926);border-radius:16px;position:relative;overflow:hidden;flex:1}
.map-road{position:absolute;background:${P.border};border-radius:2px}
.map-pin{position:absolute;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer}
.map-pin-dot{width:12px;height:12px;border-radius:50%;border:2px solid white}
.map-pin-tail{width:2px;height:8px}
.map-rider{position:absolute;font-size:22px;animation:riderMove 4s ease-in-out infinite alternate;transform:translate(-50%,-50%)}
@keyframes riderMove{0%{transform:translate(-50%,-50%) translateX(0)}100%{transform:translate(-50%,-50%) translateX(30px)}}

/* ── PERSISTENT DRAWER (desktop sidebar) ─────────────────── */
.persistent-drawer{position:fixed;top:48px;bottom:0;left:0;width:240px;background:${P.surface};border-right:1px solid ${P.border};z-index:100;display:flex;flex-direction:column;padding:16px;overflow:hidden;transform:translateX(-100%);transition:transform 0.3s ease}
.persistent-drawer.open{transform:translateX(0)}
.drawer-nav-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;cursor:pointer;color:${P.textMuted};font-size:14px;font-weight:500;transition:all 0.3s ease;border:1px solid transparent;text-decoration:none;min-height:44px}
.drawer-nav-item:hover{background:${P.card};color:${P.text}}
.drawer-nav-item.active{background:${P.primaryGlow};color:${P.primary};border-color:${P.primary}33}

/* ── DELIVERY STATUS ─────────────────────────────────────── */
.status-pill-on{background:${P.success}22;color:${P.success};border:1.5px solid ${P.success};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.status-pill-off{background:${P.textDim}22;color:${P.textMuted};border:1.5px solid ${P.border};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px}

/* ── HOVER & TRANSITION POLISH ───────────────────────────── */
.p-card,.stat-card,.order-card,.product-card,.ticket{transition:all 0.3s ease}
.p-btn-primary:hover:not(:disabled){background:#5580FF;transform:translateY(-1px);box-shadow:0 8px 20px ${P.primaryGlow}}
.p-btn-ghost:hover:not(:disabled){background:${P.card};border-color:${P.primary}44}
.p-btn-danger:hover:not(:disabled){background:${P.danger}33;border-color:${P.danger};transform:translateY(-1px)}

/* ── LOGIN PAGE DEMO GRID ─────────────────────────────── */
.login-demo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;width:100%;max-width:820px}
@media(max-width:480px){.login-demo-grid{grid-template-columns:1fr}}

/* ── SMALL PHONES (≤ 480px) ─────────────────────────────── */
@media(max-width:480px){
  .mode-bar{gap:4px;padding:0 6px}
  .mode-bar-brand{font-size:13px}
  .mode-bar-ver{max-width:100px}
  .mode-bar-ver .mode-bar-user{display:none}
  .mode-btn{padding:4px 8px;font-size:10px}
  .plat-header{padding:0 8px;gap:6px}
  .plat-header .p-badge{display:none}
  .plat-header>div:first-child{min-width:0;flex:1;overflow:hidden}
  .plat-header>div:first-child span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .plat-content{padding:12px 10px 80px}
  .scm-content{padding:10px 10px 80px}
  .mode-content{margin-top:48px;height:calc(100vh - 48px);height:calc(100dvh - 48px);overflow:hidden}
  .kpi-value{font-size:18px}
  .stat-card{padding:12px}
  .stat-grid{gap:8px}
  h2{font-size:18px !important}
  .p-section-title{font-size:14px}
  .modal-sheet{padding:18px 14px 24px;border-radius:20px 20px 0 0}
  .detail-sheet .ds-body{padding:14px}
  .detail-sheet .ds-footer{padding:12px 14px}
  .cart-fab{padding:10px 14px 10px 12px;font-size:13px;right:12px}
  .plat-toast,.scm-toast{left:8px;right:8px}
  .p-card{padding:14px;border-radius:14px}
  .product-grid-v2{gap:10px}
  .product-card-v2 .pc2-img{aspect-ratio:5/3}
  .mobile-nav-label{font-size:9px}
  .cat-pill{padding:6px 12px;font-size:11px}
  .welcome-hero{padding:18px 16px !important;border-radius:16px !important}
  .col.gap16{gap:12px}
  .col.gap14{gap:10px}
}

/* ── ULTRA-SMALL PHONES (≤ 375px) ───────────────────────── */
@media(max-width:375px){
  html{font-size:12.5px}
  .mode-bar{gap:3px;padding:0 4px;height:44px}
  .mode-bar-brand{font-size:11px;letter-spacing:0}
  .mode-bar-ver{max-width:60px;gap:4px}
  .mode-btn{padding:3px 7px;font-size:9px;min-height:28px;border-radius:14px}
  .mode-content{margin-top:44px;height:calc(100vh - 44px);height:calc(100dvh - 44px);overflow:hidden}
  .plat-root{height:calc(100vh - 44px);height:calc(100dvh - 44px)}
  .plat-header{padding:0 6px;gap:4px;height:46px}
  .plat-header>div:first-child{font-size:12px !important;gap:3px !important;flex:1;min-width:0;overflow:hidden}
  .plat-header>div:first-child>span:nth-child(2){display:none}
  .plat-content{padding:8px 6px 74px}
  .scm-content{padding:8px 6px 74px}
  .p-card{padding:12px;border-radius:12px}
  .stat-grid{grid-template-columns:1fr 1fr;gap:6px}
  .stat-card{padding:10px;border-radius:10px}
  .kpi-value{font-size:16px}
  h2{font-size:16px !important}
  .p-section-title{font-size:13px}
  .product-grid-v2{grid-template-columns:repeat(2,1fr);gap:8px}
  .product-card-v2{border-radius:12px}
  .product-card-v2 .pc2-img{aspect-ratio:1/1}
  .product-card-v2 .pc2-body{padding:8px 10px 10px}
  .product-card-v2 .pc2-name{font-size:12px;-webkit-line-clamp:1}
  .product-card-v2 .pc2-cat{font-size:10px;margin-bottom:4px}
  .product-card-v2 .pc2-price-row{gap:4px;margin-bottom:4px}
  .product-card-v2 .pc2-price{font-size:14px}
  .product-card-v2 .pc2-meta{gap:3px;font-size:9px}
  .product-card-v2 .pc2-add-wrap{bottom:8px;right:8px}
  .quick-add-btn{width:32px;height:32px;font-size:18px}
  .qty-stepper button{width:30px;height:30px;font-size:16px}
  .qty-stepper .qty-val{min-width:24px;font-size:12px}
  .badge-discount{top:6px;left:6px;font-size:9px;padding:2px 6px}
  .badge-rating,.badge-eta{font-size:9px}
  .badge-stock{font-size:9px;padding:1px 5px}
  .mobile-nav{height:calc(54px + env(safe-area-inset-bottom,0px))}
  .mobile-nav-btn{gap:1px}
  .mobile-nav-icon{font-size:16px}
  .mobile-nav-label{font-size:8px;letter-spacing:0}
  .mobile-nav-count{min-width:14px;height:14px;font-size:8px;top:2px}
  .cart-fab{padding:8px 12px 8px 10px;font-size:12px;gap:6px;bottom:calc(64px + env(safe-area-inset-bottom,0px));right:8px;border-radius:20px}
  .cart-fab .fab-badge{min-width:18px;height:18px;font-size:10px}
  .cat-pills{gap:4px}
  .cat-pill{padding:5px 10px;font-size:10px;border-radius:16px}
  .modal-sheet{padding:16px 12px 20px;border-radius:18px 18px 0 0}
  .modal-handle{margin-bottom:14px}
  .detail-sheet .ds-img{height:180px}
  .detail-sheet .ds-body{padding:12px}
  .detail-sheet .ds-footer{padding:10px 12px}
  .plat-toast,.scm-toast{left:6px;right:6px;padding:10px 12px;font-size:13px;border-radius:12px;bottom:64px}
  .toast-icon{font-size:18px}
  .p-btn{min-height:40px;padding:8px 14px;font-size:13px}
  .p-btn-sm{min-height:32px;padding:6px 10px;font-size:12px}
  .p-input{padding:10px 12px;font-size:16px;border-radius:8px}
  .col.gap16{gap:10px}
  .col.gap14{gap:8px}
  .col.gap12{gap:8px}
  .row-between{flex-wrap:wrap;gap:6px}
  .welcome-hero{padding:16px 14px !important;border-radius:14px !important}
  .login-demo-grid{gap:8px}
  .p-badge{font-size:10px;padding:3px 8px}
  .profile-container{max-width:100%}
  .support-layout .support-list{max-height:40vh}
  .g2{gap:8px}.g3{gap:8px}.g4{gap:8px}
}

/* ── EXTREME NARROW (≤ 320px) ────────────────────────── */
@media(max-width:320px){
  .product-grid-v2{grid-template-columns:1fr !important;gap:10px}
  .product-card-v2 .pc2-img{aspect-ratio:16/9}
  .product-card-v2 .pc2-body{padding:10px 12px 12px}
  .product-card-v2 .pc2-name{font-size:13px;-webkit-line-clamp:2}
  .product-card-v2 .pc2-price{font-size:15px}
  .product-card-v2 .pc2-meta{font-size:10px;gap:4px}
  .stat-grid{grid-template-columns:1fr !important}
  .mode-bar-brand{font-size:10px}
  .plat-content{padding:8px 4px 72px}
  .scm-content{padding:8px 4px 72px}
  .welcome-hero{padding:14px 12px !important}
  .cart-fab{right:6px;font-size:11px;padding:6px 10px}
}

/* ── TABLET (≥ 768px) ────────────────────────────────────── */
@media(min-width:768px){
  .plat-grid{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
  .plat-grid-2{grid-template-columns:1fr 1fr}
  .stat-grid{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
  .grid-2{grid-template-columns:1fr 1fr}
  .grid-3{grid-template-columns:1fr 1fr 1fr}
  .grid-2-1{grid-template-columns:2fr 1fr}
  .grid-1-2{grid-template-columns:1fr 2fr}
  .g2{grid-template-columns:1fr 1fr}
  .g3{grid-template-columns:1fr 1fr}
  .g4{grid-template-columns:repeat(2,1fr)}
  .modal-overlay{align-items:center;padding:24px}
  .modal-sheet{border-radius:20px;max-width:520px;margin:auto}
  .plat-toast{left:auto;right:24px;bottom:24px;width:380px}
  .role-switcher{display:flex}
  .mode-bar-ver{max-width:280px}
}

/* ── DESKTOP (≥ 1024px) ──────────────────────────────────── */
@media(min-width:1024px){
  .tab-nav{display:flex}
  .hamburger-btn{display:none}
  .mobile-nav{display:none}
  .plat-sidebar{display:flex}
  .plat-header{margin-top:0}
  .g3{grid-template-columns:1fr 1fr 1fr}
  .g4{grid-template-columns:repeat(4,1fr)}
  .plat-content{padding:24px 28px 24px}
  .scm-content{padding:20px 24px 24px}
  .map-responsive{min-height:360px}
  .persistent-drawer{transform:translateX(0)}
}

/* ── LARGE DESKTOP (≥ 1280px) ────────────────────────────── */
@media(min-width:1280px){
  .plat-content{padding:28px 36px 28px}
  .scm-content{padding:24px 32px 28px}
  .stat-grid{grid-template-columns:repeat(4,1fr)}
  .plat-grid{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
}

/* ── ULTRA-WIDE (≥ 1600px) ───────────────────────────────── */
@media(min-width:1600px){
  .plat-content{padding:32px 48px 32px}
  .scm-content{padding:28px 40px 32px}
  .plat-content>*{max-width:1400px;margin-left:auto;margin-right:auto}
  .scm-content>*{max-width:1400px;margin-left:auto;margin-right:auto}
}

/* ── GLOBAL NOTIFICATION PORTAL (renders to body via createPortal) ── */
.notif-stack-portal{position:fixed;top:56px;right:12px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:380px}
@media(max-width:640px){.notif-stack-portal{top:auto;bottom:80px;right:12px;left:12px;max-width:none}}
.notif-toast-item{display:flex;align-items:flex-start;gap:12px;background:${P.card};border:1px solid ${P.border};border-left:4px solid ${P.primary};border-radius:14px;padding:13px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:280;position:relative;overflow:hidden;animation:notifSlideIn .35s cubic-bezier(.34,1.56,.64,1);pointer-events:all}
.notif-progress-track{position:absolute;bottom:0;left:0;height:2px;background:rgba(255,255,255,0.06);width:100%;border-radius:0 0 0 14px}
.notif-progress-bar{height:100%;border-radius:0 0 0 14px;animation:notifProgress 4500ms linear forwards}
.notif-close-btn{background:none;border:none;color:${P.textMuted};cursor:pointer;font-size:16px;padding:0;flex-shrink:0;line-height:1;margin-top:1px;transition:color .2s}
.notif-close-btn:hover{color:${P.text}}
@keyframes notifSlideIn{from{opacity:0;transform:translateX(40px) scale(.96)}to{opacity:1;transform:translateX(0) scale(1)}}
@keyframes notifProgress{from{width:100%}to{width:0%}}

/* ── MODAL OVERLAY & SHEET ─────────────────────────────────────── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);z-index:9000;display:flex;align-items:flex-end;justify-content:center}
@media(min-width:600px){.modal-overlay{align-items:center}}
.modal-sheet{background:${P.card};border:1px solid ${P.border};border-radius:24px 24px 0 0;padding:24px 20px 32px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 -20px 60px rgba(0,0,0,.6);position:relative;animation:modalSlideUp .3s cubic-bezier(.34,1.56,.64,1)}
@media(min-width:600px){.modal-sheet{border-radius:20px}}
@keyframes modalSlideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.modal-handle{width:40px;height:4px;background:${P.border};border-radius:4px;margin:0 auto 20px}
.modal-close{position:absolute;top:16px;right:16px;background:${P.surface};border:1px solid ${P.border};border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${P.textMuted};font-size:14px;transition:all .2s}
.modal-close:hover{background:${P.border};color:${P.text}}

/* ── LAYOUT HELPERS ─────────────────────────────────────────────── */
.col{display:flex;flex-direction:column}
.gap0{gap:0}.gap8{gap:8px}.gap10{gap:10px}.gap12{gap:12px}.gap14{gap:14px}.gap16{gap:16px}.gap20{gap:20px}
.row-between{display:flex;align-items:center;justify-content:space-between}
.mb8{margin-bottom:8px}.mb10{margin-bottom:10px}.mb14{margin-bottom:14px}.mb20{margin-bottom:20px}
.mt8{margin-top:8px}
.w-100{width:100%}
.map-road{position:absolute;background:${P.border};border-radius:2px}
.status-pill-on{background:${P.success}22;color:${P.success};border:1.5px solid ${P.success};border-radius:20px;padding:8px 16px;font-family:'Sora',sans-serif;font-weight:700;font-size:13px}
.status-pill-off{background:${P.textDim}22;color:${P.textMuted};border:1.5px solid ${P.border};border-radius:20px;padding:8px 16px;font-family:'Sora',sans-serif;font-weight:700;font-size:13px}

/* ── SKELETON SHIMMER ──────────────────────────────────────────── */
@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
.skeleton{background:linear-gradient(90deg,${P.surface} 25%,${P.border}44 50%,${P.surface} 75%);background-size:800px 100%;animation:shimmer 1.8s infinite ease-in-out;border-radius:10px}
.skeleton-card{height:260px;border-radius:16px}
.skeleton-text{height:14px;margin-bottom:8px}
.skeleton-text.w60{width:60%}
.skeleton-text.w40{width:40%}
.skeleton-circle{width:40px;height:40px;border-radius:50%}

/* ── PRODUCT CARD V2 (Consumer Grade) ──────────────────────────── */
.product-card-v2{background:${P.card};border:1px solid ${P.border};border-radius:16px;overflow:hidden;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);position:relative}
.product-card-v2:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,0.4);border-color:${P.primary}44}
.product-card-v2:active{transform:scale(0.98);transition-duration:.1s}
.product-card-v2 .pc2-img{width:100%;aspect-ratio:4/3;background:${P.surface};display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
.product-card-v2 .pc2-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.product-card-v2:hover .pc2-img img{transform:scale(1.05)}
.product-card-v2 .pc2-body{padding:10px 12px 12px}
.product-card-v2 .pc2-name{font-weight:700;font-size:13px;line-height:1.3;margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.product-card-v2 .pc2-cat{font-size:11px;color:${P.textMuted};margin-bottom:8px}
.product-card-v2 .pc2-price-row{display:flex;align-items:baseline;gap:6px;margin-bottom:6px}
.product-card-v2 .pc2-price{font-weight:800;font-size:16px}
.product-card-v2 .pc2-mrp{font-size:11px;color:${P.textMuted};text-decoration:line-through}
.product-card-v2 .pc2-off{font-size:10px;color:${P.success};font-weight:700;background:${P.success}15;padding:2px 6px;border-radius:4px}
.product-card-v2 .pc2-meta{display:flex;align-items:center;gap:4px;font-size:10px;color:${P.textMuted};flex-wrap:wrap}
.product-card-v2 .pc2-add-wrap{position:absolute;bottom:10px;right:10px}

/* ── QUANTITY STEPPER ──────────────────────────────────────────── */
.qty-stepper{display:inline-flex;align-items:center;gap:0;border-radius:10px;overflow:hidden;border:1.5px solid ${P.primary};background:${P.primary}15}
.qty-stepper button{width:34px;height:34px;border:none;background:${P.primary};color:white;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}
.qty-stepper button:hover{background:${P.primary}dd}
.qty-stepper button:active{transform:scale(0.92)}
.qty-stepper .qty-val{min-width:30px;text-align:center;font-weight:800;font-size:14px;color:${P.primary};font-family:'Sora',sans-serif}

/* ── QUICK ADD BUTTON (circular, animated) ─────────────────────── */
.quick-add-btn{width:36px;height:36px;border-radius:50%;background:${P.primary};border:none;color:white;font-size:20px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px ${P.primaryGlow};transition:all .2s}
.quick-add-btn:hover{transform:scale(1.12);box-shadow:0 6px 20px ${P.primaryGlow}}
.quick-add-btn:active{transform:scale(0.9)}
.quick-add-btn.added{animation:cardPop .4s ease}
.quick-add-btn:disabled{background:${P.textDim};box-shadow:none;cursor:not-allowed;opacity:.5}
@keyframes cardPop{0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}}

/* ── BADGES (stock, rating, ETA, freshness, discount) ──────────── */
.badge-discount{position:absolute;top:10px;left:10px;background:${P.success};color:#000;font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;z-index:2;letter-spacing:.3px}
.badge-stock{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;letter-spacing:.3px}
.badge-stock.in{background:${P.success}20;color:${P.success};border:1px solid ${P.success}44}
.badge-stock.low{background:${P.warning}20;color:${P.warning};border:1px solid ${P.warning}44}
.badge-stock.out{background:${P.danger}20;color:${P.danger};border:1px solid ${P.danger}44}
.badge-rating{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:${P.text}}
.badge-eta{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${P.textMuted}}
.badge-freshness{font-size:10px;color:${P.success};font-weight:600;display:inline-flex;align-items:center;gap:3px}
.badge-trust{display:inline-flex;align-items:center;gap:4px;background:${P.primary}15;border:1px solid ${P.primary}33;color:${P.primary};font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px}
.badge-out-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:2;border-radius:16px 16px 0 0}
.badge-out-overlay span{background:${P.danger};color:white;font-weight:800;font-size:12px;padding:6px 16px;border-radius:20px}

/* ── CATEGORY PILLS (horizontal scroll) ────────────────────────── */
.cat-pills{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;-ms-overflow-style:none;scrollbar-width:none}
.cat-pills::-webkit-scrollbar{display:none}
.cat-pill{padding:7px 14px;border-radius:20px;border:1.5px solid ${P.border};background:transparent;color:${P.textMuted};font-family:'Sora',sans-serif;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s;flex-shrink:0;-webkit-tap-highlight-color:transparent}
.cat-pill:hover{border-color:${P.primary}66;color:${P.text}}
.cat-pill.active{background:${P.primary}18;border-color:${P.primary};color:${P.primary}}

/* ── FLOATING CART FAB ─────────────────────────────────────────── */
.cart-fab{position:fixed;bottom:20px;right:20px;z-index:8000;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,${P.primary},#6366F1);border:none;border-radius:28px;padding:12px 20px 12px 16px;color:white;font-family:'Sora',sans-serif;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 32px ${P.primaryGlow},0 2px 8px rgba(0,0,0,0.3);transition:all .25s;animation:fabEnter .4s cubic-bezier(.34,1.56,.64,1)}
.cart-fab:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 12px 40px ${P.primaryGlow}}
.cart-fab:active{transform:scale(0.96)}
.cart-fab .fab-badge{background:white;color:${P.primary};min-width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.cart-fab.pulse{animation:fabPulse .5s ease}
@media(max-width:1023px){.cart-fab{bottom:calc(70px + env(safe-area-inset-bottom,0px))}}
@keyframes fabEnter{from{opacity:0;transform:translateY(20px) scale(.8)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes fabPulse{0%{transform:scale(1)}30%{transform:scale(1.08)}60%{transform:scale(0.96)}100%{transform:scale(1)}}

/* ── PRODUCT DETAIL SHEET ──────────────────────────────────────── */
.detail-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:9500;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .2s ease}
@media(min-width:640px){.detail-overlay{align-items:center}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.detail-sheet{background:${P.card};border:1px solid ${P.border};border-radius:24px 24px 0 0;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;position:relative;animation:sheetUp .35s cubic-bezier(.34,1.56,.64,1)}
@media(min-width:640px){.detail-sheet{border-radius:20px;max-height:85vh}}
@keyframes sheetUp{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}
.detail-sheet .ds-handle{width:40px;height:4px;background:${P.border};border-radius:4px;margin:10px auto 0}
.detail-sheet .ds-img{width:100%;height:220px;background:${P.surface};display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
.detail-sheet .ds-img img{width:100%;height:100%;object-fit:cover}
.detail-sheet .ds-close{position:absolute;top:12px;right:12px;z-index:3;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);border:none;color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:all .2s}
.detail-sheet .ds-close:hover{background:rgba(0,0,0,0.7)}
.detail-sheet .ds-body{padding:20px}
.detail-sheet .ds-footer{padding:16px 20px;border-top:1px solid ${P.border};display:flex;gap:12px;align-items:center;position:sticky;bottom:0;background:${P.card}}

/* ── PRODUCT GRID (responsive) ─────────────────────────────────── */
.product-grid-v2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media(min-width:640px){.product-grid-v2{grid-template-columns:repeat(3,1fr);gap:16px}}
@media(min-width:1024px){.product-grid-v2{grid-template-columns:repeat(4,1fr);gap:16px}}
@media(min-width:1280px){.product-grid-v2{grid-template-columns:repeat(5,1fr);gap:18px}}

/* ── VISIBILITY UTILITIES ────────────────────────────────── */
.hide-mobile{display:none}
.hide-desktop{display:block}
@media(min-width:1024px){.hide-mobile{display:block}.hide-desktop{display:none}}
.show-tablet-only{display:none}
@media(min-width:768px) and (max-width:1023px){.show-tablet-only{display:block}}

/* ── RESPONSIVE CONTAINER ────────────────────────────────── */
.container-main{width:100%;max-width:1400px;margin:0 auto;padding:0 14px}
@media(min-width:768px){.container-main{padding:0 24px}}
@media(min-width:1280px){.container-main{padding:0 36px}}

/* ── RESPONSIVE PROFILE ──────────────────────────────────── */
.profile-container{width:100%;max-width:640px;margin:0 auto}

/* ── RESPONSIVE SUPPORT LAYOUT ───────────────────────────── */
.support-layout{display:flex;flex-direction:column;gap:14px;min-height:400px}
@media(min-width:768px){.support-layout{flex-direction:row;min-height:520px}}
.support-layout .support-list{flex:1;min-height:300px;max-height:50vh}
@media(min-width:768px){.support-layout .support-list{flex:0 0 320px;max-height:none;min-height:0}}
@media(min-width:1024px){.support-layout .support-list{flex:0 0 360px}}
.support-layout .support-chat{flex:2;min-height:300px;display:flex;flex-direction:column}

/* ── FOCUS VISIBLE ────────────────────────────────────────── */
*:focus-visible{outline:2px solid ${P.primary};outline-offset:2px}
button:focus-visible,.p-btn:focus-visible{outline:2px solid ${P.primary};outline-offset:2px}

/* ── SELECTION ────────────────────────────────────────────── */
::selection{background:${P.primary}44;color:${P.text}}

/* ── SKELETON LOADING ANIMATION ──────────────────────────── */
.skeleton{background:linear-gradient(90deg,${P.surface} 25%,${P.card} 37%,${P.surface} 63%);background-size:400% 100%;animation:skeletonPulse 1.5s ease infinite;border-radius:8px}
@keyframes skeletonPulse{0%{background-position:100% 50%}100%{background-position:0 50%}}
.skeleton-card{height:160px;border-radius:16px}

/* ── SPINNER ─────────────────────────────────────────────── */
.spinner{display:inline-block;width:20px;height:20px;border:2px solid ${P.border};border-top-color:${P.primary};border-radius:50%;animation:spinnerRotate .6s linear infinite}
@keyframes spinnerRotate{to{transform:rotate(360deg)}}

/* ── MODAL OVERLAY / SHEET ───────────────────────────────── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:9500;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .2s ease}
@media(min-width:640px){.modal-overlay{align-items:center}}
.modal-sheet{background:${P.card};border:1px solid ${P.border};border-radius:24px 24px 0 0;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;position:relative;animation:sheetUp .35s cubic-bezier(.34,1.56,.64,1)}
@media(min-width:640px){.modal-sheet{border-radius:20px;max-height:85vh}}
.modal-handle{width:40px;height:4px;background:${P.border};border-radius:4px;margin:10px auto 0}
`;


