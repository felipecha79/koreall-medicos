import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, getIdTokenResult } from 'firebase/auth'
import { auth, db } from '../firebase'
import { collection, getDocs, query, limit } from 'firebase/firestore'

// ── CSS inyectado dinámicamente ───────────────────────────
const buildCSS = (c) => `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=Nunito:wght@300;400;600&family=Playfair+Display:ital,wght@0,400;1,400&family=Lora:ital,wght@0,400;1,400&family=Inter:wght@300;400;500&display=swap');

  :root {
    --ld-teal:  ${c.colorPrimario   || '#0A8076'};
    --ld-navy:  ${c.colorSecundario || '#0D1F35'};
    --ld-cream: ${c.colorFondo      || '#F7F4EF'};
    --ld-gold:  ${c.colorAccento    || '#C4A265'};
    --ld-teal-lt: ${c.colorPrimario || '#0A8076'}CC;
    --ld-font-d:  '${c.tipografia   || 'Cormorant Garamond'}', Georgia, serif;
    --ld-font-ui: '${c.tipografiaUI || 'DM Sans'}', system-ui, sans-serif;
  }

  .ld * { box-sizing: border-box; margin: 0; padding: 0 }
  .ld a { text-decoration: none; color: inherit }
  .ld { font-family: var(--ld-font-ui); color: var(--ld-navy); overflow-x: hidden }

  /* NAV */
  .ld .lnav { position:fixed;top:0;left:0;right:0;z-index:100;
    background:rgba(13,31,53,.97);backdrop-filter:blur(12px);
    border-bottom:1px solid rgba(255,255,255,.07) }
  .ld .lnav-in { max-width:1160px;margin:0 auto;padding:0 24px;
    display:flex;align-items:center;justify-content:space-between;height:66px }
  .ld .logo { font-family:var(--ld-font-d);font-size:21px;font-weight:300;
    color:#fff;letter-spacing:.02em }
  .ld .logo span { color:var(--ld-teal);font-style:italic }
  .ld .lnav-links { display:flex;align-items:center;gap:28px;list-style:none }
  .ld .lnav-links a { font-size:13px;color:rgba(255,255,255,.7);transition:color .2s }
  .ld .lnav-links a:hover { color:#fff }
  .ld .nbtn { background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
    color:#fff!important;padding:7px 18px;border-radius:100px;font-size:13px;cursor:pointer }
  .ld .ncta { background:var(--ld-teal)!important;color:#fff!important;
    padding:9px 22px;border-radius:100px;font-weight:500!important;
    transition:background .2s,transform .2s!important }
  .ld .ncta:hover { background:var(--ld-teal-lt)!important;transform:translateY(-1px) }
  @media(max-width:800px){ .ld .lnav-links { display:none } }

  /* HERO */
  .ld .hero { min-height:100vh;background:var(--ld-navy);display:flex;align-items:center;
    position:relative;overflow:hidden }
  .ld .orb { position:absolute;right:-140px;top:-100px;width:700px;height:700px;
    background:radial-gradient(circle,rgba(10,128,118,.2) 0%,transparent 70%);
    border-radius:50% }
  .ld .hero-in { position:relative;z-index:1;display:grid;
    grid-template-columns:1fr 400px;gap:60px;align-items:center;
    padding:120px 24px 80px;max-width:1160px;margin:0 auto;width:100% }
  .ld .dot { width:6px;height:6px;background:var(--ld-teal);border-radius:50%;
    animation:dpulse 2s ease-in-out infinite;display:inline-block;
    margin-right:8px;vertical-align:middle }
  @keyframes dpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
  .ld h1 { font-family:var(--ld-font-d);font-size:clamp(42px,5.5vw,70px);
    font-weight:300;line-height:1.08;color:#fff;letter-spacing:-.01em;margin-bottom:12px }
  .ld h1 em { font-style:italic;color:var(--ld-teal) }
  .ld .spec { font-size:12px;letter-spacing:.18em;color:var(--ld-gold);
    text-transform:uppercase;margin-bottom:26px;font-family:monospace }
  .ld .hdesc { font-size:17px;line-height:1.65;color:rgba(255,255,255,.6);
    max-width:480px;margin-bottom:40px }
  .ld .hacts { display:flex;gap:14px;flex-wrap:wrap }
  .ld .btnp { display:inline-flex;align-items:center;gap:8px;background:var(--ld-teal);
    color:#fff;padding:13px 30px;border-radius:100px;font-size:15px;font-weight:500;
    transition:background .2s,transform .15s,box-shadow .2s;cursor:pointer;
    border:none;font-family:var(--ld-font-ui) }
  .ld .btnp:hover { background:var(--ld-teal-lt);transform:translateY(-2px);
    box-shadow:0 12px 32px rgba(10,128,118,.4) }
  .ld .btng { display:inline-flex;align-items:center;gap:8px;
    border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.8);
    padding:13px 26px;border-radius:100px;font-size:15px;
    transition:border-color .2s,color .2s,transform .15s }
  .ld .btng:hover { border-color:rgba(255,255,255,.6);color:#fff;transform:translateY(-2px) }

  /* Hero card */
  .ld .hcard { background:rgba(255,255,255,.06);backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:34px;
    animation:float 6s ease-in-out infinite }
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .ld .hav { width:82px;height:82px;border-radius:50%;display:flex;
    align-items:center;justify-content:center;font-family:var(--ld-font-d);
    font-size:28px;color:#fff;margin-bottom:18px;
    border:2px solid rgba(255,255,255,.15);overflow:hidden;flex-shrink:0;
    background:linear-gradient(135deg,var(--ld-teal) 0%,var(--ld-navy) 100%) }
  .ld .hav img { width:100%;height:100%;object-fit:cover }
  .ld .hcard h3 { font-family:var(--ld-font-d);font-size:22px;font-weight:400;
    color:#fff;margin-bottom:4px }
  .ld .hcard .sub { font-size:13px;color:rgba(255,255,255,.45);margin-bottom:18px }
  .ld .cr { display:flex;align-items:center;gap:10px;padding:9px 0;
    border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:rgba(255,255,255,.7) }
  .ld .cr-ico { width:30px;height:30px;background:rgba(10,128,118,.2);border-radius:8px;
    display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0 }
  .ld .stats { display:grid;grid-template-columns:repeat(3,1fr);gap:1px;
    background:rgba(255,255,255,.08);border-radius:12px;overflow:hidden;margin-top:20px }
  .ld .st { background:rgba(255,255,255,.04);padding:12px 8px;text-align:center }
  .ld .st-n { font-family:var(--ld-font-d);font-size:24px;font-weight:300;
    color:var(--ld-teal);line-height:1 }
  .ld .st-l { font-size:10px;color:rgba(255,255,255,.35);margin-top:3px }
  @media(max-width:800px){ .ld .hero-in{grid-template-columns:1fr;padding:100px 20px 60px}
    .ld .hcard{display:none} }

  /* SECCIONES */
  .ld .sh { text-align:center;margin-bottom:60px }
  .ld .sh h2 { font-family:var(--ld-font-d);font-size:clamp(34px,4vw,52px);
    font-weight:300;line-height:1.15;color:var(--ld-navy);margin:10px 0 14px }
  .ld .sh h2 em { font-style:italic;color:var(--ld-teal) }
  .ld .sh p { font-size:17px;color:#6B7A8D;max-width:520px;margin:0 auto;line-height:1.6 }
  .ld .tag { font-family:monospace;font-size:11px;letter-spacing:.12em;
    text-transform:uppercase;color:var(--ld-teal) }

  /* Reveal */
  .ld .rev { opacity:0;transform:translateY(24px);
    transition:opacity .7s ease,transform .7s ease }
  .ld .rev.vis { opacity:1;transform:none }

  /* Servicios */
  .ld .sec-cream { background:var(--ld-cream);padding:96px 0 }
  .ld .sec-white { background:#fff;padding:96px 0 }
  .ld .ldc { max-width:1160px;margin:0 auto;padding:0 24px }
  .ld .grid3 { display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:22px }
  .ld .svc { background:#fff;border-radius:20px;padding:34px 28px;
    border:1px solid rgba(0,0,0,.07);transition:transform .3s,box-shadow .3s;
    position:relative;overflow:hidden }
  .ld .svc::before { content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(90deg,var(--ld-teal),var(--ld-teal-lt));
    transform:scaleX(0);transform-origin:left;transition:transform .3s }
  .ld .svc:hover { transform:translateY(-6px);box-shadow:0 20px 48px rgba(0,0,0,.1) }
  .ld .svc:hover::before { transform:scaleX(1) }
  .ld .svc-ico { font-size:34px;margin-bottom:18px;display:block }
  .ld .svc h3 { font-family:var(--ld-font-d);font-size:21px;font-weight:400;
    color:var(--ld-navy);margin-bottom:8px }
  .ld .svc p { font-size:14px;line-height:1.65;color:#6B7A8D }

  /* About */
  .ld .about-grid { display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center }
  .ld .aphoto-wrap { position:relative }
  .ld .aphoto { width:100%;aspect-ratio:3/4;border-radius:28px;
    display:flex;align-items:center;justify-content:center;font-size:72px;
    position:relative;overflow:hidden;
    background:linear-gradient(160deg,var(--ld-teal) 0%,var(--ld-navy) 100%) }
  .ld .aphoto img { width:100%;height:100%;object-fit:cover;object-position:top }
  .ld .aphoto::after { content:'';position:absolute;inset:-12px;
    border:1px solid var(--ld-cream);border-radius:36px;z-index:-1 }
  .ld .abadge { position:absolute;bottom:-18px;right:-18px;background:var(--ld-navy);
    border-radius:16px;padding:16px 20px;border:3px solid #fff;
    text-align:center;min-width:120px }
  .ld .abadge strong { display:block;font-family:var(--ld-font-d);
    font-size:32px;color:var(--ld-teal) }
  .ld .abadge span { font-size:11px;color:rgba(255,255,255,.55) }
  .ld .about h2 { font-family:var(--ld-font-d);
    font-size:clamp(34px,3.5vw,48px);font-weight:300;line-height:1.15;
    color:var(--ld-navy);margin:10px 0 18px }
  .ld .about h2 em { font-style:italic;color:var(--ld-teal) }
  .ld .ap { font-size:16px;line-height:1.7;color:#6B7A8D;margin-bottom:18px }
  .ld .certs { display:flex;flex-direction:column;gap:8px;margin-top:24px }
  .ld .cert { display:flex;align-items:center;gap:12px;padding:11px 14px;
    background:var(--ld-cream);border-radius:10px;font-size:14px;color:var(--ld-navy) }
  .ld .cok { width:22px;height:22px;background:var(--ld-teal);border-radius:50%;
    display:flex;align-items:center;justify-content:center;color:#fff;
    font-size:11px;flex-shrink:0 }
  @media(max-width:800px){ .ld .about-grid{grid-template-columns:1fr} }

  /* Tech */
  .ld .sec-navy { background:var(--ld-navy);padding:96px 0;position:relative;overflow:hidden }
  .ld .sec-navy::before { content:'';position:absolute;right:-200px;top:-200px;
    width:600px;height:600px;
    background:radial-gradient(circle,rgba(10,128,118,.15) 0%,transparent 70%);
    border-radius:50% }
  .ld .sec-navy .sh h2 { color:#fff }
  .ld .sec-navy .sh p { color:rgba(255,255,255,.5) }
  .ld .tgrid { display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:2px;margin-top:56px;background:rgba(255,255,255,.06);
    border-radius:20px;overflow:hidden }
  .ld .tf { background:rgba(13,31,53,.8);padding:28px 22px;transition:background .2s }
  .ld .tf:hover { background:rgba(10,128,118,.15) }
  .ld .tf-ico { font-size:28px;margin-bottom:12px;display:block }
  .ld .tf h4 { font-family:var(--ld-font-d);font-size:18px;font-weight:400;
    color:#fff;margin-bottom:7px }
  .ld .tf p { font-size:13px;color:rgba(255,255,255,.4);line-height:1.6 }

  /* Horarios */
  .ld .loc-grid { display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start }
  .ld .sch-t { font-family:var(--ld-font-d);font-size:34px;font-weight:300;
    color:var(--ld-navy);margin:10px 0 24px }
  .ld .sr { display:flex;justify-content:space-between;align-items:center;
    padding:11px 0;border-bottom:1px solid rgba(0,0,0,.07);font-size:15px }
  .ld .sr .day { font-weight:500;color:var(--ld-navy) }
  .ld .sr .time { color:var(--ld-teal);font-family:monospace;font-size:12px }
  .ld .sr .cls { color:#6B7A8D;font-size:13px }
  .ld .map { background:linear-gradient(135deg,#EDE9E1 0%,#C8F0EC 100%);
    border-radius:22px;aspect-ratio:4/3;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:8px;font-size:44px;
    border:1px solid rgba(0,0,0,.07) }
  .ld .map p { font-size:14px;color:#6B7A8D }
  .ld .addr { margin-top:14px;padding:16px;background:#fff;border-radius:12px;
    border:1px solid rgba(0,0,0,.07);font-size:14px;line-height:1.7;color:var(--ld-navy) }
  @media(max-width:800px){ .ld .loc-grid{grid-template-columns:1fr} }

  /* Testimonios */
  .ld .tc { background:var(--ld-cream);border-radius:18px;padding:28px;
    border:1px solid rgba(0,0,0,.05);position:relative }
  .ld .tc::before { content:'"';font-family:var(--ld-font-d);font-size:72px;
    line-height:1;color:var(--ld-teal);opacity:.2;
    position:absolute;top:10px;left:18px }
  .ld .tc-txt { font-size:15px;line-height:1.7;color:var(--ld-navy);
    margin-bottom:18px;padding-top:16px;font-style:italic }
  .ld .tc-auth { display:flex;align-items:center;gap:10px }
  .ld .tc-av { width:38px;height:38px;
    background:linear-gradient(135deg,var(--ld-teal),var(--ld-navy));
    border-radius:50%;display:flex;align-items:center;justify-content:center;
    color:#fff;font-size:14px }
  .ld .tc-name { font-weight:500;font-size:14px }
  .ld .tc-sub { font-size:12px;color:#6B7A8D }
  .ld .stars { color:var(--ld-gold);font-size:12px;margin-bottom:4px }

  /* CTA */
  .ld .cta-s { background:var(--ld-teal);padding:76px 0;text-align:center;
    position:relative;overflow:hidden }
  .ld .cta-s::before { content:'';position:absolute;inset:0;
    background:linear-gradient(135deg,rgba(0,0,0,.1) 0%,transparent 60%) }
  .ld .cta-s>* { position:relative }
  .ld .cta-s h2 { font-family:var(--ld-font-d);
    font-size:clamp(34px,4vw,54px);font-weight:300;color:#fff;
    margin-bottom:14px;line-height:1.15 }
  .ld .cta-s p { font-size:18px;color:rgba(255,255,255,.75);margin-bottom:36px }
  .ld .btn-w { display:inline-flex;align-items:center;gap:10px;background:#fff;
    color:var(--ld-teal);padding:15px 38px;border-radius:100px;font-size:16px;
    font-weight:500;transition:transform .2s,box-shadow .2s;cursor:pointer;
    border:none;font-family:var(--ld-font-ui) }
  .ld .btn-w:hover { transform:translateY(-3px);box-shadow:0 16px 40px rgba(0,0,0,.2) }

  /* Footer */
  .ld .foot { background:var(--ld-navy);padding:56px 0 28px }
  .ld .fg { display:grid;grid-template-columns:2fr 1fr 1fr;gap:56px;margin-bottom:40px }
  .ld .fb p { font-size:14px;color:rgba(255,255,255,.4);line-height:1.7;
    margin-top:10px;max-width:260px }
  .ld .fc h4 { font-size:11px;letter-spacing:.1em;text-transform:uppercase;
    color:rgba(255,255,255,.3);margin-bottom:12px }
  .ld .fc a { display:block;font-size:14px;color:rgba(255,255,255,.5);
    margin-bottom:8px;transition:color .2s;cursor:pointer }
  .ld .fc a:hover { color:#fff }
  .ld .fb-bot { border-top:1px solid rgba(255,255,255,.08);padding-top:20px;
    display:flex;justify-content:space-between;align-items:center;
    font-size:12px;color:rgba(255,255,255,.3) }
  .ld .fb-bot a { color:var(--ld-teal) }
  @media(max-width:800px){ .ld .fg{grid-template-columns:1fr} }

  /* Modal */
  .ld .mover { position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);
    backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;
    padding:24px;opacity:0;pointer-events:none;transition:opacity .3s }
  .ld .mover.open { opacity:1;pointer-events:all }
  .ld .modal { background:#fff;border-radius:26px;padding:42px;width:100%;max-width:400px;
    transform:translateY(20px) scale(.97);transition:transform .3s;position:relative }
  .ld .mover.open .modal { transform:none }
  .ld .modal h3 { font-family:var(--ld-font-d);font-size:28px;font-weight:300;
    color:var(--ld-navy);margin-bottom:6px }
  .ld .modal .msub { font-size:14px;color:#6B7A8D;margin-bottom:24px }
  .ld .rtabs { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:22px }
  .ld .rt { padding:10px 6px;border-radius:10px;border:1.5px solid #EDE9E1;
    text-align:center;cursor:pointer;transition:all .2s;font-size:12px;color:#6B7A8D }
  .ld .rt.active { border-color:var(--ld-teal);background:rgba(10,128,118,.06);
    color:var(--ld-teal);font-weight:500 }
  .ld .rt-ico { font-size:20px;margin-bottom:4px;display:block }
  .ld .mfg { margin-bottom:12px }
  .ld .mfg label { display:block;font-size:12px;color:#6B7A8D;margin-bottom:5px }
  .ld .mfg input { width:100%;padding:11px 14px;border:1.5px solid #EDE9E1;
    border-radius:10px;font-size:15px;font-family:var(--ld-font-ui);
    outline:none;transition:border-color .2s }
  .ld .mfg input:focus { border-color:var(--ld-teal) }
  .ld .merr { font-size:12px;color:#dc2626;background:#fef2f2;
    border:1px solid #fecaca;border-radius:8px;padding:8px 12px;margin-bottom:8px }
  .ld .mbtn { width:100%;padding:13px;background:var(--ld-teal);color:#fff;
    border:none;border-radius:10px;font-size:15px;font-weight:500;
    font-family:var(--ld-font-ui);cursor:pointer;transition:background .2s;margin-top:6px }
  .ld .mbtn:hover { background:var(--ld-teal-lt) }
  .ld .mbtn:disabled { opacity:.6;cursor:not-allowed }
  .ld .mclose { position:absolute;top:16px;right:16px;width:32px;height:32px;
    background:#EDE9E1;border:none;border-radius:50%;cursor:pointer;
    font-size:16px;color:#6B7A8D;display:flex;align-items:center;justify-content:center }
  .ld .wa { position:fixed;bottom:26px;right:26px;z-index:90;width:54px;height:54px;
    background:#25D366;border-radius:50%;display:flex;align-items:center;
    justify-content:center;font-size:24px;
    box-shadow:0 4px 20px rgba(37,211,102,.4);transition:transform .2s }
  .ld .wa:hover { transform:scale(1.1) }
`

// ── Defaults ──────────────────────────────────────────────
const DEFAULT_CONFIG = {
  colorPrimario:    '#0A8076',
  colorSecundario:  '#0D1F35',
  colorFondo:       '#F7F4EF',
  colorAccento:     '#C4A265',
  tipografia:       'Cormorant Garamond',
  tipografiaUI:     'DM Sans',
  nombreConsultorio: 'Consultorio Chávez',
  nombreDoctor:     'Dr. Juan Felipe Chávez',
  especialidad:     'Medicina General · Medicina Preventiva',
  sloganHero:       'Su salud, nuestra prioridad',
  descripcionDoctor: 'Médico general con más de 15 años de experiencia clínica en Tampico. Su enfoque integral combina medicina basada en evidencia con atención personalizada y cálida.',
  descripcionDoctor2: 'Pionero en la adopción de tecnología médica en la región, su consultorio cuenta con expediente electrónico, citas en línea y comunicación directa con los pacientes.',
  cedulaProfesional: '1234567',
  direccion:        'Av. Hidalgo 123, Col. Centro, Tampico, Tamps.',
  telefonoContacto: '833 123 4567',
  emailContacto:    'contacto@drchavetampico.com',
  logoUrl:          '',
  fotoDoctorUrl:    '',
  horarios: {
    lun: '09:00 – 14:00 · 16:00 – 20:00',
    mar: '09:00 – 14:00 · 16:00 – 20:00',
    mie: '09:00 – 14:00 · 16:00 – 20:00',
    jue: '09:00 – 14:00 · 16:00 – 20:00',
    vie: '09:00 – 14:00 · 16:00 – 20:00',
    sab: '09:00 – 13:00',
    dom: '',
  },
  servicios: [
    { titulo: 'Consulta General', descripcion: 'Diagnóstico y tratamiento con expediente digital completo y recetas electrónicas.', icono: '🩺' },
    { titulo: 'Medicina Preventiva', descripcion: 'Chequeos periódicos y programas de prevención personalizados.', icono: '💉' },
    { titulo: 'Control Crónico', descripcion: 'Seguimiento de diabetes, hipertensión y obesidad con monitoreo continuo.', icono: '📊' },
    { titulo: 'Certificados Médicos', descripcion: 'Para trabajo, escuela, deporte y trámites oficiales.', icono: '📋' },
    { titulo: 'Interpretación Lab', descripcion: 'Análisis de resultados integrado en su expediente digital.', icono: '🧪' },
    { titulo: 'Seguimiento Digital', descripcion: 'Portal del paciente y comunicación directa por WhatsApp.', icono: '📱' },
  ],
  certificaciones: [
    'Cédula Profesional SSA No. 1234567',
    'Medicina General — Universidad Autónoma de Tamaulipas',
    'Certificado en Medicina Preventiva — 2018',
    'Miembro activo del Colegio Médico de Tampico',
  ],
}

export default function Landing() {
  const navigate = useNavigate()
  const [cfg, setCfg]           = useState(DEFAULT_CONFIG)
  const [cssReady, setCssReady] = useState(false)
  const [modalOpen, setModal]   = useState(false)
  const [role, setRole]         = useState('doctor')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [logging, setLogging]   = useState(false)

  // ── Cargar config del tenant desde Firestore ──────────
  useEffect(() => {
    getDocs(query(collection(db, 'tenants'), limit(1))).then(snap => {
      if (!snap.empty) {
        const t = snap.docs[0].data()
        const sw = t.sitioWeb ?? {}
        setCfg(prev => ({
          ...prev,
          ...sw,
          nombreDoctor:     t.nombreDoctor  ?? sw.nombreDoctor  ?? prev.nombreDoctor,
          especialidad:     t.especialidad  ?? sw.especialidad  ?? prev.especialidad,
          telefonoContacto: t.telefono      ?? sw.telefonoContacto ?? prev.telefonoContacto,
          emailContacto:    t.email         ?? sw.emailContacto ?? prev.emailContacto,
          cedulaProfesional: t.cedula       ?? sw.cedulaProfesional ?? prev.cedulaProfesional,
          direccion:        t.direccion     ?? sw.direccion     ?? prev.direccion,
          nombreConsultorio: t.nombre       ?? sw.nombreConsultorio ?? prev.nombreConsultorio,
          horarios: sw.horarios ?? t.horarios ?? prev.horarios,
          servicios: sw.servicios ?? prev.servicios,
          certificaciones: sw.certificaciones ?? prev.certificaciones,
        }))
      }
    }).catch(() => {})
  }, [])

  // ── Inyectar CSS cuando config está lista ─────────────
  useEffect(() => {
    let styleEl = document.getElementById('ld-dynamic-css')
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'ld-dynamic-css'
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = buildCSS(cfg)
    setCssReady(true)
  }, [cfg])

  // ── Reveal on scroll ──────────────────────────────────
  useEffect(() => {
    if (!cssReady) return
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target) } })
    }, { threshold: 0.1 })
    document.querySelectorAll('.ld .rev').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [cssReady])

  // ── Login con Firebase ────────────────────────────────
  const closeModal = () => { setModal(false); setLoginErr(''); setEmail(''); setPassword('') }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { setLoginErr('Ingresa tu email y contraseña'); return }
    setLogging(true); setLoginErr('')
    try {
      const cred  = await signInWithEmailAndPassword(auth, email, password)
      const token = await getIdTokenResult(cred.user, true)
      const r     = token.claims.role ?? null
      navigate(r === 'paciente' ? '/portal-paciente' : '/agenda')
    } catch(e) {
      const msgs = {
        'auth/user-not-found':    'No existe una cuenta con ese email',
        'auth/wrong-password':    'Contraseña incorrecta',
        'auth/invalid-credential':'Email o contraseña incorrectos',
        'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
        'auth/invalid-email':     'El email no es válido',
      }
      setLoginErr(msgs[e.code] ?? 'Error al iniciar sesión')
    } finally { setLogging(false) }
  }

  const hor = cfg.horarios ?? DEFAULT_CONFIG.horarios
  const svcs = cfg.servicios ?? DEFAULT_CONFIG.servicios
  const certs = cfg.certificaciones ?? DEFAULT_CONFIG.certificaciones
  const tel = (cfg.telefonoContacto ?? '').replace(/\D/g,'')

  if (!cssReady) return <div style={{minHeight:'100vh',background:'#0D1F35'}} />

  return (
    <div className="ld">

      {/* NAV */}
      <nav className="lnav">
        <div className="lnav-in">
          <div className="logo">
            {cfg.logoUrl
              ? <img src={cfg.logoUrl} alt="Logo" style={{height:36,objectFit:'contain'}} />
              : <span>Consultorio <span>{cfg.nombreConsultorio?.split(' ').pop()}</span></span>
            }
          </div>
          <ul className="lnav-links">
            <li><a href="#servicios">Servicios</a></li>
            <li><a href="#doctor">El doctor</a></li>
            <li><a href="#tecnologia">Tecnología</a></li>
            <li><a href="#ubicacion">Contacto</a></li>
            <li><a className="nbtn" style={{cursor:'pointer'}} onClick={() => setModal(true)}>
              Iniciar sesión
            </a></li>
            <li><a href="#cita" className="ncta">Agendar cita</a></li>
          </ul>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="orb" />
        <div className="hero-in">
          <div>
            <div className="rev" style={{display:'flex',alignItems:'center',marginBottom:24}}>
              <span className="dot" />
              <span className="tag">Consultorio activo · Tampico, Tamps.</span>
            </div>
            <h1 className="rev" style={{transitionDelay:'.1s'}}>
              {cfg.sloganHero?.includes(',')
                ? <>{cfg.sloganHero.split(',')[0]},<br/><em>{cfg.sloganHero.split(',').slice(1).join(',').trim()}</em></>
                : <>{cfg.sloganHero || 'Su salud,'}<br/><em>nuestra prioridad</em></>
              }
            </h1>
            <p className="spec rev" style={{transitionDelay:'.15s'}}>{cfg.especialidad}</p>
            <p className="hdesc rev" style={{transitionDelay:'.2s'}}>
              {cfg.descripcionDoctor?.slice(0, 160) || 'Atención médica personalizada con expediente digital, citas en línea y seguimiento continuo de su salud.'}
            </p>
            <div className="hacts rev" style={{transitionDelay:'.25s'}}>
              <button className="btnp" onClick={() => setModal(true)}>📅 Agendar cita en línea</button>
              <a href="#servicios" className="btng">Ver servicios →</a>
            </div>
          </div>

          {/* Tarjeta del doctor */}
          <div className="hcard rev" style={{transitionDelay:'.3s'}}>
            <div className="hav">
              {cfg.fotoDoctorUrl
                ? <img src={cfg.fotoDoctorUrl} alt={cfg.nombreDoctor} />
                : <span style={{fontFamily:'var(--ld-font-d)',fontSize:28}}>
                    {cfg.nombreDoctor?.split(' ').filter(w=>!w.startsWith('Dr')).map(w=>w[0]).slice(0,2).join('')}
                  </span>
              }
            </div>
            <h3>{cfg.nombreDoctor}</h3>
            <p className="sub">{cfg.especialidad?.split('·')[0]?.trim()} · Cédula {cfg.cedulaProfesional}</p>
            <div className="cr"><div className="cr-ico">🎓</div><span>Cédula Prof. {cfg.cedulaProfesional} — SSA</span></div>
            <div className="cr"><div className="cr-ico">🏥</div><span>Consultorio digital con MediDesk</span></div>
            <div className="cr"><div className="cr-ico">📋</div><span>Expediente clínico electrónico</span></div>
            <div className="stats">
              <div className="st"><div className="st-n">15+</div><div className="st-l">Años</div></div>
              <div className="st"><div className="st-n">2k+</div><div className="st-l">Pacientes</div></div>
              <div className="st"><div className="st-n">4.9</div><div className="st-l">Calificación</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICIOS */}
      <section className="sec-cream" id="servicios">
        <div className="ldc">
          <div className="sh rev">
            <span className="tag">Lo que ofrecemos</span>
            <h2>Medicina integral<br/>para toda <em>la familia</em></h2>
            <p>Consulta general, medicina preventiva y manejo de enfermedades crónicas.</p>
          </div>
          <div className="grid3">
            {svcs.map((svc, i) => (
              <div key={i} className="svc rev" style={{transitionDelay:`${i*.05}s`}}>
                <span className="svc-ico">{svc.icono}</span>
                <h3>{svc.titulo}</h3>
                <p>{svc.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOBRE EL DOCTOR */}
      <section className="sec-white about" id="doctor">
        <div className="ldc">
          <div className="about-grid">
            <div className="aphoto-wrap rev">
              <div className="aphoto">
                {cfg.fotoDoctorUrl
                  ? <img src={cfg.fotoDoctorUrl} alt={cfg.nombreDoctor} />
                  : <span>👨‍⚕️</span>
                }
              </div>
              <div className="abadge"><strong>15+</strong><span>años de<br/>experiencia</span></div>
            </div>
            <div>
              <span className="tag rev">Conoce al doctor</span>
              <h2 className="rev" style={{transitionDelay:'.1s'}}>
                Medicina con<br/><em>vocación humana</em>
              </h2>
              <p className="ap rev" style={{transitionDelay:'.15s'}}>
                {cfg.descripcionDoctor}
              </p>
              <p className="ap rev" style={{transitionDelay:'.2s'}}>
                {cfg.descripcionDoctor2 || 'Pionero en la adopción de tecnología médica en la región.'}
              </p>
              <div className="certs rev" style={{transitionDelay:'.25s'}}>
                {certs.map((c, i) => (
                  <div key={i} className="cert">
                    <div className="cok">✓</div><span>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TECNOLOGÍA */}
      <section className="sec-navy" id="tecnologia">
        <div className="ldc" style={{position:'relative',zIndex:1}}>
          <div className="sh rev">
            <span className="tag" style={{color:'var(--ld-teal)'}}>Powered by MediDesk</span>
            <h2>Su consultorio en<br/>la <em>era digital</em></h2>
            <p>Sistema médico integral que conecta al doctor con sus pacientes.</p>
          </div>
          <div className="tgrid">
            {[
              ['📅','Citas en Línea','Agenda 24/7 con confirmación y recordatorio automático por WhatsApp.'],
              ['📋','Expediente Digital','Historial clínico, estudios y recetas accesibles desde cualquier dispositivo.'],
              ['💊','Recetas Digitales','Descargue su receta directamente desde el portal del paciente.'],
              ['🧾','Facturación CFDI','Solicite y descargue su factura electrónica sin llamar al consultorio.'],
              ['🔔','Turno en Tiempo Real','Sepa cuándo será atendido. Actualización en vivo desde su celular.'],
              ['🔒','Privacidad Total','Sus datos médicos protegidos con los más altos estándares de seguridad.'],
            ].map(([ico,h,p],i) => (
              <div key={i} className="tf rev" style={{transitionDelay:`${i*.04}s`}}>
                <span className="tf-ico">{ico}</span><h4>{h}</h4><p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HORARIOS */}
      <section className="sec-cream" id="ubicacion">
        <div className="ldc">
          <div className="loc-grid">
            <div>
              <span className="tag rev">Horarios de atención</span>
              <h2 className="sch-t rev" style={{transitionDelay:'.1s'}}>
                Siempre disponibles<br/>para usted
              </h2>
              <div className="rev" style={{transitionDelay:'.15s'}}>
                {[
                  ['Lunes',      hor.lun],
                  ['Martes',     hor.mar],
                  ['Miércoles',  hor.mie],
                  ['Jueves',     hor.jue],
                  ['Viernes',    hor.vie],
                  ['Sábado',     hor.sab],
                  ['Domingo',    hor.dom],
                ].map(([day, time]) => (
                  <div key={day} className="sr">
                    <span className="day">{day}</span>
                    {time
                      ? <span className="time">{time}</span>
                      : <span className="cls">Cerrado</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="rev" style={{transitionDelay:'.2s'}}>
              <div className="map">
                <span>📍</span>
                <p>{cfg.direccion?.split(',').slice(0,2).join(',')}</p>
              </div>
              <div className="addr">
                <strong>{cfg.nombreConsultorio}</strong><br/>
                {cfg.direccion}<br/><br/>
                📱 <a href={`tel:${tel}`} style={{color:'var(--ld-teal)'}}>
                  {cfg.telefonoContacto}
                </a><br/>
                ✉️ <a href={`mailto:${cfg.emailContacto}`} style={{color:'var(--ld-teal)'}}>
                  {cfg.emailContacto}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="sec-white">
        <div className="ldc">
          <div className="sh rev">
            <span className="tag">Lo que dicen nuestros pacientes</span>
            <h2>La confianza que<br/><em>nos respalda</em></h2>
          </div>
          <div className="grid3">
            {[
              ['M','María L.','Paciente desde 2019','El sistema digital me permite ver mis recetas desde el celular. Ya no guardo papeles.'],
              ['R','Roberto M.','Paciente desde 2021','El recordatorio de WhatsApp y ver el turno en mi celular es increíble. Muy moderno.'],
              ['A','Ana G.','Paciente desde 2020','Expediente en línea, facturas automáticas y citas sin llamar. Totalmente recomendado.'],
            ].map(([av,name,sub,text],i) => (
              <div key={i} className="tc rev" style={{transitionDelay:`${i*.1}s`}}>
                <div className="stars">★★★★★</div>
                <p className="tc-txt">{text}</p>
                <div className="tc-auth">
                  <div className="tc-av">{av}</div>
                  <div>
                    <div className="tc-name">{name}</div>
                    <div className="tc-sub">{sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-s" id="cita">
        <div className="ldc">
          <h2 className="rev">¿Listo para cuidar<br/>su salud?</h2>
          <p className="rev" style={{transitionDelay:'.1s'}}>
            Agende su cita en línea ahora mismo. Sin llamadas, sin esperas.
          </p>
          <button className="btn-w rev" style={{transitionDelay:'.2s'}}
            onClick={() => setModal(true)}>
            📅 Agendar mi cita
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="foot">
        <div className="ldc">
          <div className="fg">
            <div className="fb">
              <div className="logo">Consultorio <span>{cfg.nombreConsultorio?.split(' ').pop()}</span></div>
              <p>Atención médica personalizada con tecnología de vanguardia en Tampico, Tamaulipas.</p>
            </div>
            <div className="fc">
              <h4>Servicios</h4>
              {svcs.slice(0,4).map((s,i) => <a key={i} href="#servicios">{s.titulo}</a>)}
            </div>
            <div className="fc">
              <h4>Acceso</h4>
              <a onClick={() => setModal(true)}>Portal del paciente</a>
              <a href="#cita">Agendar cita</a>
              <a href="#ubicacion">Contacto</a>
              <a href="#">Aviso de privacidad</a>
            </div>
          </div>
          <div className="fb-bot">
            <span>© 2026 {cfg.nombreConsultorio} · Todos los derechos reservados</span>
            <span>Powered by <a href="https://medideskmx.com" target="_blank" rel="noreferrer">MediDesk</a></span>
          </div>
        </div>
      </footer>

      {/* WhatsApp */}
      <a href={`https://wa.me/52${tel}?text=Hola,%20quisiera%20información`}
         target="_blank" rel="noreferrer" className="wa">💬</a>

      {/* MODAL LOGIN */}
      <div className={`mover ${modalOpen ? 'open' : ''}`}
        onClick={e => e.target === e.currentTarget && closeModal()}>
        <div className="modal">
          <button className="mclose" onClick={closeModal}>✕</button>
          <h3>Bienvenido</h3>
          <p className="msub">Seleccione su perfil para continuar</p>
          <div className="rtabs">
            {[['doctor','🩺','Doctor'],['recepcion','👩‍💼','Recepción'],['paciente','👤','Paciente']].map(([r,ico,lbl]) => (
              <div key={r} className={`rt ${role===r?'active':''}`} onClick={() => setRole(r)}>
                <span className="rt-ico">{ico}</span>{lbl}
              </div>
            ))}
          </div>
          <form onSubmit={handleLogin}>
            <div className="mfg">
              <label>Correo electrónico</label>
              <input type="email" placeholder="tu@email.com"
                value={email} onChange={e => { setEmail(e.target.value); setLoginErr('') }} />
            </div>
            <div className="mfg">
              <label>Contraseña</label>
              <input type="password" placeholder="••••••••"
                value={password} onChange={e => { setPassword(e.target.value); setLoginErr('') }} />
            </div>
            {loginErr && <div className="merr">{loginErr}</div>}
            <button type="submit" className="mbtn" disabled={logging}>
              {logging ? 'Entrando...' : 'Entrar al sistema'}
            </button>
          </form>
          <p style={{textAlign:'center',fontSize:12,color:'#6B7A8D',marginTop:12}}>
            ¿Paciente nuevo?{' '}
            <a href="/registro" style={{color:'var(--ld-teal)'}}
              onClick={e => { e.preventDefault(); closeModal(); navigate('/registro') }}>
              Crear cuenta gratis
            </a>
          </p>
        </div>
      </div>

    </div>
  )
}
