import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { db } from '../firebase'
import { collection, getDocs, query, limit } from 'firebase/firestore'

// ── Estilos globales inyectados una sola vez ──────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400&display=swap');
  .ld{--navy:var(--ld-navy,#0D1F35);--teal:var(--ld-teal,#0A8076);--teal-lt:var(--ld-teal,#0FA898);--cream:var(--ld-cream,#F7F4EF);--gold:var(--ld-gold,#C4A265);--mint:#C8F0EC;--cream:#F7F4EF;--sand:#EDE9E1;--gold:#C4A265;--text:#1A2535;--muted:#6B7A8D;--font-d:'Cormorant Garamond',Georgia,serif;--font-ui:'DM Sans',system-ui,sans-serif;--font-mono:'DM Mono',monospace;font-family:var(--font-ui);color:var(--text);overflow-x:hidden}
  .ld *{box-sizing:border-box;margin:0;padding:0}
  .ld a{text-decoration:none;color:inherit}
  .ld .ldc{max-width:1160px;margin:0 auto;padding:0 24px}
  .ld .tag{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--teal)}
  .ld .rev{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s ease}
  .ld .rev.vis{opacity:1;transform:none}

  /* NAV */
  .ld .lnav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(13,31,53,.97);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,.07)}
  .ld .lnav-in{max-width:1160px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:66px}
  .ld .logo{font-family:var(--font-d);font-size:21px;font-weight:300;color:#fff;letter-spacing:.02em}
  .ld .logo span{color:var(--teal-lt);font-style:italic}
  .ld .lnav-links{display:flex;align-items:center;gap:28px;list-style:none}
  .ld .lnav-links a{font-size:13px;color:rgba(255,255,255,.7);transition:color .2s}
  .ld .lnav-links a:hover{color:#fff}
  .ld .nbtn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff!important;padding:7px 18px;border-radius:100px;font-size:13px;cursor:pointer}
  .ld .ncta{background:var(--teal)!important;color:#fff!important;padding:9px 22px;border-radius:100px;font-weight:500!important;transition:background .2s,transform .2s!important}
  .ld .ncta:hover{background:var(--teal-lt)!important;transform:translateY(-1px)}
  @media(max-width:800px){.ld .lnav-links{display:none}}

  /* HERO */
  .ld .hero{min-height:100vh;background:var(--navy);display:flex;align-items:center;position:relative;overflow:hidden}
  .ld .orb{position:absolute;right:-140px;top:-100px;width:700px;height:700px;background:radial-gradient(circle,rgba(10,128,118,.2) 0%,transparent 70%);border-radius:50%}
  .ld .hero-in{position:relative;z-index:1;display:grid;grid-template-columns:1fr 400px;gap:60px;align-items:center;padding:120px 24px 80px;max-width:1160px;margin:0 auto;width:100%}
  .ld .dot{width:6px;height:6px;background:var(--teal-lt);border-radius:50%;animation:dpulse 2s ease-in-out infinite;display:inline-block;margin-right:8px;vertical-align:middle}
  @keyframes dpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
  .ld h1{font-family:var(--font-d);font-size:clamp(42px,5.5vw,70px);font-weight:300;line-height:1.08;color:#fff;letter-spacing:-.01em;margin-bottom:12px}
  .ld h1 em{font-style:italic;color:var(--teal-lt)}
  .ld .spec{font-family:var(--font-mono);font-size:12px;letter-spacing:.18em;color:var(--gold);text-transform:uppercase;margin-bottom:26px}
  .ld .hdesc{font-size:17px;line-height:1.65;color:rgba(255,255,255,.6);max-width:480px;margin-bottom:40px}
  .ld .hacts{display:flex;gap:14px;flex-wrap:wrap}
  .ld .btnp{display:inline-flex;align-items:center;gap:8px;background:var(--teal);color:#fff;padding:13px 30px;border-radius:100px;font-size:15px;font-weight:500;transition:background .2s,transform .15s,box-shadow .2s;cursor:pointer;border:none;font-family:var(--font-ui)}
  .ld .btnp:hover{background:var(--teal-lt);transform:translateY(-2px);box-shadow:0 12px 32px rgba(10,128,118,.4)}
  .ld .btng{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.8);padding:13px 26px;border-radius:100px;font-size:15px;transition:border-color .2s,color .2s,transform .15s}
  .ld .btng:hover{border-color:rgba(255,255,255,.6);color:#fff;transform:translateY(-2px)}

  /* Hero card */
  .ld .hcard{background:rgba(255,255,255,.06);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:34px;animation:float 6s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .ld .hav{width:82px;height:82px;background:linear-gradient(135deg,var(--teal) 0%,var(--navy) 100%);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-size:28px;color:#fff;margin-bottom:18px;border:2px solid rgba(255,255,255,.15)}
  .ld .hcard h3{font-family:var(--font-d);font-size:22px;font-weight:400;color:#fff;margin-bottom:4px}
  .ld .hcard .sub{font-size:13px;color:rgba(255,255,255,.45);margin-bottom:18px}
  .ld .cr{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:rgba(255,255,255,.7)}
  .ld .cr-ico{width:30px;height:30px;background:rgba(10,128,118,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
  .ld .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.08);border-radius:12px;overflow:hidden;margin-top:20px}
  .ld .st{background:rgba(255,255,255,.04);padding:12px 8px;text-align:center}
  .ld .st-n{font-family:var(--font-d);font-size:24px;font-weight:300;color:var(--teal-lt);line-height:1}
  .ld .st-l{font-size:10px;color:rgba(255,255,255,.35);margin-top:3px}
  @media(max-width:800px){.ld .hero-in{grid-template-columns:1fr;padding:100px 20px 60px}.ld .hcard{display:none}}

  /* SECCIONES */
  .ld .sh{text-align:center;margin-bottom:60px}
  .ld .sh h2{font-family:var(--font-d);font-size:clamp(34px,4vw,52px);font-weight:300;line-height:1.15;color:var(--navy);margin:10px 0 14px}
  .ld .sh h2 em{font-style:italic;color:var(--teal)}
  .ld .sh p{font-size:17px;color:var(--muted);max-width:520px;margin:0 auto;line-height:1.6}

  /* Servicios */
  .ld .sec-cream{background:var(--cream);padding:96px 0}
  .ld .sec-white{background:#fff;padding:96px 0}
  .ld .grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:22px}
  .ld .svc{background:#fff;border-radius:20px;padding:34px 28px;border:1px solid rgba(0,0,0,.07);transition:transform .3s,box-shadow .3s;position:relative;overflow:hidden}
  .ld .svc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--teal),var(--teal-lt));transform:scaleX(0);transform-origin:left;transition:transform .3s}
  .ld .svc:hover{transform:translateY(-6px);box-shadow:0 20px 48px rgba(0,0,0,.1)}
  .ld .svc:hover::before{transform:scaleX(1)}
  .ld .svc-ico{font-size:34px;margin-bottom:18px;display:block}
  .ld .svc h3{font-family:var(--font-d);font-size:21px;font-weight:400;color:var(--navy);margin-bottom:8px}
  .ld .svc p{font-size:14px;line-height:1.65;color:var(--muted)}

  /* About */
  .ld .about-grid{display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}
  .ld .aphoto{width:100%;aspect-ratio:3/4;background:linear-gradient(160deg,var(--teal) 0%,var(--navy) 100%);border-radius:28px;display:flex;align-items:center;justify-content:center;font-size:72px;position:relative}
  .ld .aphoto::after{content:'';position:absolute;inset:-12px;border:1px solid var(--sand);border-radius:36px;z-index:-1}
  .ld .abadge{position:absolute;bottom:-18px;right:-18px;background:var(--navy);border-radius:16px;padding:16px 20px;border:3px solid #fff;text-align:center;min-width:120px}
  .ld .abadge strong{display:block;font-family:var(--font-d);font-size:32px;color:var(--teal-lt)}
  .ld .abadge span{font-size:11px;color:rgba(255,255,255,.55)}
  .ld .aimg{position:relative}
  .ld .about h2{font-family:var(--font-d);font-size:clamp(34px,3.5vw,48px);font-weight:300;line-height:1.15;color:var(--navy);margin:10px 0 18px}
  .ld .about h2 em{font-style:italic;color:var(--teal)}
  .ld .ap{font-size:16px;line-height:1.7;color:var(--muted);margin-bottom:18px}
  .ld .certs{display:flex;flex-direction:column;gap:8px;margin-top:24px}
  .ld .cert{display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--cream);border-radius:10px;font-size:14px;color:var(--text)}
  .ld .cok{width:22px;height:22px;background:var(--teal);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;flex-shrink:0}
  @media(max-width:800px){.ld .about-grid{grid-template-columns:1fr}}

  /* Tech */
  .ld .sec-navy{background:var(--navy);padding:96px 0;position:relative;overflow:hidden}
  .ld .sec-navy::before{content:'';position:absolute;right:-200px;top:-200px;width:600px;height:600px;background:radial-gradient(circle,rgba(10,128,118,.15) 0%,transparent 70%);border-radius:50%}
  .ld .sec-navy .sh h2{color:#fff}
  .ld .sec-navy .sh p{color:rgba(255,255,255,.5)}
  .ld .tgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:2px;margin-top:56px;background:rgba(255,255,255,.06);border-radius:20px;overflow:hidden}
  .ld .tf{background:rgba(13,31,53,.8);padding:28px 22px;transition:background .2s}
  .ld .tf:hover{background:rgba(10,128,118,.15)}
  .ld .tf-ico{font-size:28px;margin-bottom:12px;display:block}
  .ld .tf h4{font-family:var(--font-d);font-size:18px;font-weight:400;color:#fff;margin-bottom:7px}
  .ld .tf p{font-size:13px;color:rgba(255,255,255,.4);line-height:1.6}

  /* Horarios */
  .ld .loc-grid{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start}
  .ld .sch-t{font-family:var(--font-d);font-size:34px;font-weight:300;color:var(--navy);margin:10px 0 24px}
  .ld .sr{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(0,0,0,.07);font-size:15px}
  .ld .sr .day{font-weight:500;color:var(--text)}
  .ld .sr .time{color:var(--teal);font-family:var(--font-mono);font-size:12px}
  .ld .sr .cls{color:var(--muted);font-size:13px}
  .ld .map{background:linear-gradient(135deg,var(--sand) 0%,var(--mint) 100%);border-radius:22px;aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:44px;border:1px solid rgba(0,0,0,.07)}
  .ld .map p{font-size:14px;color:var(--muted)}
  .ld .addr{margin-top:14px;padding:16px;background:#fff;border-radius:12px;border:1px solid rgba(0,0,0,.07);font-size:14px;line-height:1.7;color:var(--text)}
  @media(max-width:800px){.ld .loc-grid{grid-template-columns:1fr}}

  /* Testimonios */
  .ld .tc{background:var(--cream);border-radius:18px;padding:28px;border:1px solid rgba(0,0,0,.05);position:relative}
  .ld .tc::before{content:'"';font-family:var(--font-d);font-size:72px;line-height:1;color:var(--teal);opacity:.2;position:absolute;top:10px;left:18px}
  .ld .tc-txt{font-size:15px;line-height:1.7;color:var(--text);margin-bottom:18px;padding-top:16px;font-style:italic}
  .ld .tc-auth{display:flex;align-items:center;gap:10px}
  .ld .tc-av{width:38px;height:38px;background:linear-gradient(135deg,var(--teal),var(--navy));border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px}
  .ld .tc-name{font-weight:500;font-size:14px}
  .ld .tc-sub{font-size:12px;color:var(--muted)}
  .ld .stars{color:var(--gold);font-size:12px;margin-bottom:4px}

  /* CTA */
  .ld .cta-s{background:var(--teal);padding:76px 0;text-align:center;position:relative;overflow:hidden}
  .ld .cta-s::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,.1) 0%,transparent 60%)}
  .ld .cta-s>*{position:relative}
  .ld .cta-s h2{font-family:var(--font-d);font-size:clamp(34px,4vw,54px);font-weight:300;color:#fff;margin-bottom:14px;line-height:1.15}
  .ld .cta-s p{font-size:18px;color:rgba(255,255,255,.75);margin-bottom:36px}
  .ld .btn-w{display:inline-flex;align-items:center;gap:10px;background:#fff;color:var(--teal);padding:15px 38px;border-radius:100px;font-size:16px;font-weight:500;transition:transform .2s,box-shadow .2s;cursor:pointer;border:none;font-family:var(--font-ui)}
  .ld .btn-w:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(0,0,0,.2)}

  /* Footer */
  .ld .foot{background:var(--navy);padding:56px 0 28px}
  .ld .fg{display:grid;grid-template-columns:2fr 1fr 1fr;gap:56px;margin-bottom:40px}
  .ld .fb p{font-size:14px;color:rgba(255,255,255,.4);line-height:1.7;margin-top:10px;max-width:260px}
  .ld .fc h4{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:12px}
  .ld .fc a{display:block;font-size:14px;color:rgba(255,255,255,.5);margin-bottom:8px;transition:color .2s}
  .ld .fc a:hover{color:#fff}
  .ld .fb-bot{border-top:1px solid rgba(255,255,255,.08);padding-top:20px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:rgba(255,255,255,.3)}
  .ld .fb-bot a{color:var(--teal-lt)}
  @media(max-width:800px){.ld .fg{grid-template-columns:1fr}}

  /* Modal */
  .ld .mover{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;pointer-events:none;transition:opacity .3s}
  .ld .mover.open{opacity:1;pointer-events:all}
  .ld .modal{background:#fff;border-radius:26px;padding:42px;width:100%;max-width:400px;transform:translateY(20px) scale(.97);transition:transform .3s;position:relative}
  .ld .mover.open .modal{transform:none}
  .ld .modal h3{font-family:var(--font-d);font-size:28px;font-weight:300;color:var(--navy);margin-bottom:6px}
  .ld .modal .msub{font-size:14px;color:var(--muted);margin-bottom:24px}
  .ld .rtabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:22px}
  .ld .rt{padding:10px 6px;border-radius:10px;border:1.5px solid var(--sand);text-align:center;cursor:pointer;transition:all .2s;font-size:12px;color:var(--muted)}
  .ld .rt.active{border-color:var(--teal);background:rgba(10,128,118,.06);color:var(--teal);font-weight:500}
  .ld .rt-ico{font-size:20px;margin-bottom:4px;display:block}
  .ld .mfg{margin-bottom:12px}
  .ld .mfg label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px}
  .ld .mfg input{width:100%;padding:11px 14px;border:1.5px solid var(--sand);border-radius:10px;font-size:15px;font-family:var(--font-ui);outline:none;transition:border-color .2s}
  .ld .mfg input:focus{border-color:var(--teal)}
  .ld .mbtn{width:100%;padding:13px;background:var(--teal);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:500;font-family:var(--font-ui);cursor:pointer;transition:background .2s;margin-top:6px}
  .ld .mbtn:hover{background:var(--teal-lt)}
  .ld .mclose{position:absolute;top:16px;right:16px;width:32px;height:32px;background:var(--sand);border:none;border-radius:50%;cursor:pointer;font-size:16px;color:var(--muted);display:flex;align-items:center;justify-content:center}
  .ld .wa{position:fixed;bottom:26px;right:26px;z-index:90;width:54px;height:54px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 20px rgba(37,211,102,.4);transition:transform .2s}
  .ld .wa:hover{transform:scale(1.1)}
`

export default function Landing() {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [role, setRole] = useState('doctor')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const closeModal = () => {
    setModalOpen(false)
    setLoginError?.('')
    setEmail('')
    setPassword('')
  }
//Agregado para los temas
const [siteConfig, setSiteConfig] = useState(null)

  useEffect(() => {
   // Cargar configuración del sitio desde el primer tenant
   getDocs(query(collection(db, 'tenants'), limit(1))).then(snap => {
     if (!snap.empty) {
       const t = snap.docs[0].data()
       if (t.sitioWeb) {
         setSiteConfig(t.sitioWeb)
         // Inyectar variables CSS en tiempo real
         const r = document.documentElement
         if (t.sitioWeb.colorPrimario)    r.style.setProperty('--ld-teal', t.sitioWeb.colorPrimario)
         if (t.sitioWeb.colorSecundario)  r.style.setProperty('--ld-navy', t.sitioWeb.colorSecundario)
         if (t.sitioWeb.colorFondo)       r.style.setProperty('--ld-cream', t.sitioWeb.colorFondo)
         if (t.sitioWeb.colorAccento)     r.style.setProperty('--ld-gold', t.sitioWeb.colorAccento)
         if (t.sitioWeb.sloganHero)       document.title = t.sitioWeb.nombreConsultorio ?? 'MediDesk'
       }
     }
   }).catch(() => {})
 }, [])


  // Inyectar estilos una vez
  useEffect(() => {
    if (!document.getElementById('ld-css')) {
      const style = document.createElement('style')
      style.id = 'ld-css'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    // Reveal on scroll
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('vis')
          observer.unobserve(e.target)
        }
      })
    }, { threshold: 0.1 })
    document.querySelectorAll('.rev').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { setLoginError('Ingresa tu email y contraseña'); return }
    setLoginLoading(true)
    setLoginError('')
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      // Obtener claims del token para saber el rol real
      const token = await cred.user.getIdTokenResult(true)
      const userRole = token.claims.role ?? null
      const isPaciente = userRole === 'paciente'

      // Redirigir según el rol real del token (ignora el selector visual)
      if (isPaciente) {
        navigate('/portal-paciente')
      } else {
        navigate('/agenda')
      }
    } catch (e) {
      const msgs = {
        'auth/user-not-found':  'No existe una cuenta con ese email',
        'auth/wrong-password':  'Contraseña incorrecta',
        'auth/invalid-credential': 'Email o contraseña incorrectos',
        'auth/too-many-requests':  'Demasiados intentos. Espera unos minutos.',
        'auth/invalid-email':   'El email no es válido',
      }
      setLoginError(msgs[e.code] ?? 'Error al iniciar sesión')
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div className="ld">

      {/* NAV */}
      <nav className="lnav">
        <div className="lnav-in">
          <div className="logo">Consultorio <span>Chávez</span></div>
          <ul className="lnav-links">
            <li><a href="#servicios">Servicios</a></li>
            <li><a href="#doctor">El doctor</a></li>
            <li><a href="#tecnologia">Tecnología</a></li>
            <li><a href="#ubicacion">Contacto</a></li>
            <li><a className="nbtn" style={{cursor:'pointer'}} onClick={() => setModalOpen(true)}>
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
              <span className="dot" /><span className="tag">Consultorio activo · Tampico, Tamps.</span>
            </div>
            <h1 className="rev" style={{transitionDelay:'.1s'}}>
                {siteConfig?.sloganHero
    ? <>{siteConfig.sloganHero.split(',')[0]},<br/><em>{siteConfig.sloganHero.split(',')[1] ?? 'nuestra prioridad'}</em></>
    : <>Su salud,<br/>nuestra <em>prioridad</em></>}
            </h1>
            <p className="spec rev" style={{transitionDelay:'.15s'}}>
              {siteConfig?.especialidad || 'Medicina General · Medicina Preventiva'}
            </p>
            <p className="hdesc rev" style={{transitionDelay:'.2s'}}>
              Atención médica personalizada con expediente digital, citas en línea
              y seguimiento continuo de su salud.
            </p>
            <div className="hacts rev" style={{transitionDelay:'.25s'}}>
              <button className="btnp" onClick={() => setModalOpen(true)}>
                📅 Agendar cita en línea
              </button>
              <a href="#servicios" className="btng">Ver servicios →</a>
            </div>
          </div>

          <div className="hcard rev" style={{transitionDelay:'.3s'}}>
            <div className="hav">JC</div>
            <h3>{siteConfig?.nombreDoctor ?? 'Dr. Juan Felipe Chávez'}</h3>
            <p className="sub">{siteConfig?.especialidad ?? 'Médico General'}</p>
            <div className="cr"><div className="cr-ico">🎓</div><span>Cédula Prof. 1234567 — SSA</span></div>
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
            {[
              ['🩺','Consulta General','Diagnóstico y tratamiento con expediente digital completo y recetas electrónicas.'],
              ['💉','Medicina Preventiva','Chequeos periódicos y programas de prevención personalizados.'],
              ['📊','Control Crónico','Seguimiento de diabetes, hipertensión y obesidad con monitoreo continuo.'],
              ['📋','Certificados Médicos','Para trabajo, escuela, deporte y trámites oficiales con validez.'],
              ['🧪','Interpretación Lab','Análisis de resultados integrado en su expediente digital.'],
              ['📱','Seguimiento Digital','Portal del paciente y comunicación directa por WhatsApp.'],
            ].map(([ico, title, desc], i) => (
              <div key={i} className="svc rev" style={{transitionDelay:`${i*.05}s`}}>
                <span className="svc-ico">{ico}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOBRE EL DOCTOR */}
      <section className="sec-white about" id="doctor">
        <div className="ldc">
          <div className="about-grid">
            <div className="aimg rev">
              <div className="aphoto">👨‍⚕️</div>
              <div className="abadge"><strong>15+</strong><span>años de<br/>experiencia</span></div>
            </div>
            <div>
              <span className="tag rev">Conoce al doctor</span>
              <h2 className="rev" style={{transitionDelay:'.1s'}}>Medicina con<br/><em>vocación humana</em></h2>
              <p className="ap rev" style={{transitionDelay:'.15s'}}>
                El Dr. Juan Felipe Chávez Bezares es médico general con más de 15 años de experiencia 
                clínica en Tampico. Su enfoque combina medicina basada en evidencia con atención personalizada.
              </p>
              <p className="ap rev" style={{transitionDelay:'.2s'}}>
                Pionero en la adopción de tecnología médica en la región, su consultorio cuenta con 
                expediente electrónico, citas en línea y comunicación directa con los pacientes.
              </p>
              <div className="certs rev" style={{transitionDelay:'.25s'}}>
                {[
                  'Cédula Profesional SSA No. 1234567',
                  'Medicina General — Universidad Autónoma de Tamaulipas',
                  'Certificado en Medicina Preventiva — 2018',
                  'Miembro activo del Colegio Médico de Tampico',
                ].map((c, i) => (
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
            <span className="tag" style={{color:'var(--teal-lt)'}}>Powered by MediDesk</span>
            <h2>Su consultorio en<br/>la <em>era digital</em></h2>
            <p>Sistema médico integral que conecta al doctor con sus pacientes.</p>
          </div>
          <div className="tgrid">
            {[
              ['📅','Citas en Línea','Agenda 24/7 con confirmación y recordatorio automático por WhatsApp.'],
              ['📋','Expediente Digital','Historial clínico, estudios y recetas accesibles desde cualquier dispositivo.'],
              ['💊','Recetas Digitales','Descargue su receta directamente desde el portal del paciente.'],
              ['🧾','Facturación CFDI','Solicite y descargue su factura electrónica sin llamar al consultorio.'],
              ['🔔','Turno en Tiempo Real','Sepa exactamente cuándo será atendido. Actualización en vivo.'],
              ['🔒','Privacidad Total','Sus datos médicos protegidos con los más altos estándares de seguridad.'],
            ].map(([ico, h, p], i) => (
              <div key={i} className="tf rev" style={{transitionDelay:`${i*.04}s`}}>
                <span className="tf-ico">{ico}</span>
                <h4>{h}</h4>
                <p>{p}</p>
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
                  ['Lunes','09:00 – 14:00 · 16:00 – 20:00'],
                  ['Martes','09:00 – 14:00 · 16:00 – 20:00'],
                  ['Miércoles','09:00 – 14:00 · 16:00 – 20:00'],
                  ['Jueves','09:00 – 14:00 · 16:00 – 20:00'],
                  ['Viernes','09:00 – 14:00 · 16:00 – 20:00'],
                  ['Sábado','09:00 – 13:00'],
                  ['Domingo', null],
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
              <div className="map"><span>📍</span><p>Av. Hidalgo 123, Centro, Tampico</p></div>
              <div className="addr">
                <strong>Consultorio Médico Chávez</strong><br/>
                Av. Hidalgo 123, Col. Centro<br/>
                Tampico, Tamaulipas, C.P. 89000<br/><br/>
                📱 <a href="tel:8331234567" style={{color:'var(--teal)'}}>833 123 4567</a><br/>
                ✉️ <a href="mailto:contacto@drchavetampico.com" style={{color:'var(--teal)'}}>
                  contacto@drchavetampico.com
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
              ['M','María L.','Paciente desde 2019','El Dr. Chávez es extraordinario. Su sistema digital me permite ver mis recetas desde el celular. Ya no guardo papeles.'],
              ['R','Roberto M.','Paciente desde 2021','El recordatorio de WhatsApp y ver el turno en mi celular es increíble. Por fin un consultorio moderno en Tampico.'],
              ['A','Ana G.','Paciente desde 2020','Expediente en línea, facturas automáticas y citas sin llamar. Así debería ser todo consultorio. Totalmente recomendado.'],
            ].map(([av, name, sub, text], i) => (
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
            onClick={() => setModalOpen(true)}>
            📅 Agendar mi cita
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="foot">
        <div className="ldc">
          <div className="fg">
            <div className="fb">
              <div className="logo">Consultorio <span>Chávez</span></div>
              <p>Atención médica personalizada con tecnología de vanguardia en Tampico, Tamaulipas.</p>
            </div>
            <div className="fc">
              <h4>Servicios</h4>
              <a href="#servicios">Consulta General</a>
              <a href="#servicios">Medicina Preventiva</a>
              <a href="#servicios">Control Crónico</a>
              <a href="#servicios">Certificados</a>
            </div>
            <div className="fc">
              <h4>Acceso</h4>
              <a style={{cursor:'pointer'}} onClick={() => setModalOpen(true)}>Portal del paciente</a>
              <a href="#cita">Agendar cita</a>
              <a href="#ubicacion">Contacto</a>
              <a href="#">Aviso de privacidad</a>
            </div>
          </div>
          <div className="fb-bot">
            <span>© 2026 Consultorio Médico Chávez · Todos los derechos reservados</span>
            <span>Powered by <a href="https://medideskmx.com" target="_blank" rel="noreferrer">MediDesk</a></span>
          </div>
        </div>
      </footer>

      {/* WhatsApp flotante */}
      <a href="https://wa.me/528331234567?text=Hola,%20quisiera%20informes"
         target="_blank" rel="noreferrer" className="wa">💬</a>

      {/* MODAL LOGIN */}
      <div className={`mover ${modalOpen ? 'open' : ''}`}
        onClick={e => e.target === e.currentTarget && closeModal()}>
        <div className="modal">
          <button className="mclose" onClick={closeModal}>✕</button>
          <h3>Bienvenido</h3>
          <p className="msub">Seleccione su perfil para continuar</p>
          <div className="rtabs">
            {[['doctor','🩺','Doctor'],['recepcion','👩‍💼','Recepción'],['paciente','👤','Paciente']].map(([r, ico, lbl]) => (
              <div key={r} className={`rt ${role === r ? 'active' : ''}`}
                onClick={() => setRole(r)}>
                <span className="rt-ico">{ico}</span>{lbl}
              </div>
            ))}
          </div>
          <form onSubmit={handleLogin}>
            <div className="mfg">
              <label>Correo electrónico</label>
              <input type="email" placeholder="tu@email.com"
                value={email} onChange={e => { setEmail(e.target.value); setLoginError('') }} />
            </div>
            <div className="mfg">
              <label>Contraseña</label>
              <input type="password" placeholder="••••••••"
                value={password} onChange={e => { setPassword(e.target.value); setLoginError('') }} />
            </div>
            {loginError && (
              <p style={{
                fontSize:13, color:'#dc2626', background:'#fef2f2',
                border:'1px solid #fecaca', borderRadius:8,
                padding:'8px 12px', marginBottom:8
              }}>{loginError}</p>
            )}
            <button type="submit" className="mbtn" disabled={loginLoading}
              style={{opacity: loginLoading ? .7 : 1}}>
              {loginLoading ? 'Entrando...' : 'Entrar al sistema'}
            </button>
          </form>
          <p style={{textAlign:'center',fontSize:12,color:'var(--muted)',marginTop:12}}>
            ¿Paciente nuevo?{' '}
            <a href="#" style={{color:'var(--teal)'}} onClick={e => {
              e.preventDefault()
              setModalOpen(false)
              navigate('/portal-paciente')
            }}>Solicite su registro</a>
          </p>
        </div>
      </div>

    </div>
  )
}
