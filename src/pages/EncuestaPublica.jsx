// src/pages/EncuestaPublica.jsx — Novaryk.Med
// Kiosco de encuesta para tableta — sin login, ruta pública
// Auto-reset después de gracias, confetti, pantalla completa
import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, getDocs, query, where, limit, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'

// ── Obtener tenant por subdominio ──────────────────────
async function getTenantPublico() {
  try {
    const hostname = window.location.hostname
    const parts = hostname.split('.')
    const RESERVED = ['med','www','app','api','admin','localhost']
    const slug = parts.length >= 3 && !RESERVED.includes(parts[0]) ? parts[0] : null
    const snap = await getDocs(collection(db, 'tenants'))
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (slug) {
      const match = todos.find(t => t.slug === slug)
      if (match) return match
    }
    return todos[0] ?? null
  } catch { return null }
}

// ── Preguntas ──────────────────────────────────────────
const PREGUNTAS = [
  { id: 'atencion',      tipo: 'estrellas', texto: '¿Cómo calificarías la atención del doctor?',       emoji: '🩺' },
  { id: 'espera',        tipo: 'estrellas', texto: '¿El tiempo de espera fue razonable?',              emoji: '⏱️' },
  { id: 'instalaciones', tipo: 'estrellas', texto: '¿Cómo te parecieron las instalaciones?',           emoji: '🏥' },
  { id: 'recomendar',    tipo: 'nps',       texto: '¿Recomendarías este consultorio a un familiar?',   emoji: '💬' },
  { id: 'comentario',    tipo: 'texto',     texto: '¿Algo que quieras compartir?',                     emoji: '✍️', opcional: true },
]

// ── Confetti ───────────────────────────────────────────
function Confetti() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const pieces = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: ['#0D9488','#7C3AED','#F59E0B','#EF4444','#3B82F6','#10B981'][Math.floor(Math.random()*6)],
      speed: 2 + Math.random() * 4,
      angle: Math.random() * 360,
      spin:  (Math.random() - 0.5) * 4,
    }))
    let raf
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pieces.forEach(p => {
        p.y    += p.speed
        p.angle += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle * Math.PI / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h)
        ctx.restore()
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width }
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <canvas ref={canvasRef}
      style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:100 }} />
  )
}

// ── Estrellas ──────────────────────────────────────────
function Estrellas({ valor, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-3 justify-center mt-4">
      {[1,2,3,4,5].map(i => (
        <button key={i}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="text-5xl transition-transform active:scale-90"
          style={{ transform: (hover||valor) >= i ? 'scale(1.15)' : 'scale(1)' }}>
          <span style={{ filter: (hover||valor) >= i ? 'none' : 'grayscale(1) opacity(0.3)' }}>⭐</span>
        </button>
      ))}
    </div>
  )
}

// ── NPS ────────────────────────────────────────────────
function NPS({ valor, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center mt-4">
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button key={n} onClick={() => onChange(n)}
          className={`w-14 h-14 rounded-2xl text-lg font-bold transition-all active:scale-90 ${
            valor === n
              ? 'bg-teal-600 text-white shadow-lg scale-110'
              : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-teal-400'
          }`}>
          {n}
        </button>
      ))}
    </div>
  )
}

// ── Componente principal ───────────────────────────────
export default function EncuestaPublica() {
  const [tenant,  setTenant]  = useState(null)
  const [paso,    setPaso]    = useState(0)   // 0=bienvenida, 1..N=preguntas, N+1=gracias
  const [resp,    setResp]    = useState({})
  const [enviado, setEnviado] = useState(false)
  const [cuenta,  setCuenta]  = useState(5)   // cuenta regresiva para auto-reset
  const timerRef = useRef(null)

  useEffect(() => {
    getTenantPublico().then(t => setTenant(t))
  }, [])

  // Auto-reset en pantalla de gracias
  useEffect(() => {
    if (paso !== PREGUNTAS.length + 1) return
    setCuenta(5)
    timerRef.current = setInterval(() => {
      setCuenta(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          reiniciar()
          return 5
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [paso])

  const reiniciar = () => {
    setPaso(0)
    setResp({})
    setEnviado(false)
  }

  const setRespuesta = (id, val) => setResp(r => ({ ...r, [id]: val }))

  const enviar = async () => {
    if (enviado) return
    setEnviado(true)
    try {
      await addDoc(collection(db, `tenants/${tenant?.id ?? 'public'}/encuestas`), {
        respuestas: resp,
        fecha: Timestamp.now(),
        fuente: 'kiosco_publico',
      })
    } catch {}
    setPaso(PREGUNTAS.length + 1)
  }

  const cp = tenant?.sitioWeb?.colorPrimario ?? tenant?.colorPrimario ?? '#0D9488'
  const total = PREGUNTAS.length
  const pregActual = PREGUNTAS[paso - 1]

  // ── Pantalla de bienvenida ─────────────────────────
  if (paso === 0) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-8 select-none"
      style={{ background: `linear-gradient(135deg, #0D1F35 0%, ${cp}99 60%, ${cp} 100%)` }}>
      <div className="text-center max-w-xl">
        <div className="w-28 h-28 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center
                        justify-center mx-auto mb-10 text-6xl">
          😊
        </div>
        <h1 className="text-5xl font-light text-white mb-4"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          ¿Cómo fue tu visita?
        </h1>
        <p className="text-xl text-white/80 mb-2">{tenant?.nombre ?? 'Consultorio Médico'}</p>
        <p className="text-sm text-white/40 mb-12">Tu opinión nos ayuda a mejorar · Solo toma 1 minuto</p>
        <button onClick={() => setPaso(1)}
          className="px-14 py-5 bg-white rounded-3xl text-xl font-bold
                     active:scale-95 transition-all shadow-2xl"
          style={{ color: cp }}>
          Comenzar encuesta →
        </button>
        <p className="mt-6 text-xs text-white/30">Tus respuestas son anónimas</p>
      </div>
    </div>
  )

  // ── Pantalla de gracias ────────────────────────────
  if (paso === total + 1) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-8 select-none"
      style={{ background: `linear-gradient(135deg, #0D1F35 0%, ${cp}99 60%, ${cp} 100%)` }}>
      <Confetti />
      <div className="text-center max-w-xl relative z-10">
        <div className="text-8xl mb-8 animate-bounce">🎉</div>
        <h1 className="text-5xl font-light text-white mb-6"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          ¡Muchas gracias!
        </h1>
        <p className="text-xl text-white/80 mb-2">Tu opinión ha sido registrada.</p>
        <p className="text-sm text-white/50 mb-12">
          Nos ayuda a brindarte una mejor atención en tu próxima visita.
        </p>
        <div className="w-16 h-16 rounded-full border-4 border-white/30 flex items-center
                        justify-center mx-auto mb-6">
          <span className="text-2xl font-bold text-white">{cuenta}</span>
        </div>
        <p className="text-sm text-white/50">
          La encuesta se reiniciará automáticamente en {cuenta} segundo{cuenta !== 1 ? 's' : ''}
        </p>
        <button onClick={reiniciar}
          className="mt-8 px-10 py-3 bg-white/20 text-white border border-white/30
                     rounded-2xl text-sm hover:bg-white/30 transition-all">
          Reiniciar ahora
        </button>
      </div>
    </div>
  )

  // ── Preguntas ──────────────────────────────────────
  const progreso = ((paso - 1) / total) * 100
  const puedeAvanzar = pregActual.opcional || resp[pregActual.id] !== undefined

  return (
    <div className="fixed inset-0 flex flex-col select-none"
      style={{ background: `linear-gradient(135deg, #0D1F35 0%, ${cp}99 60%, ${cp} 100%)` }}>

      {/* Barra de progreso */}
      <div className="h-1.5 bg-white/20">
        <div className="h-full bg-white transition-all duration-500 ease-out"
          style={{ width: `${progreso}%` }} />
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          {/* Número de pregunta */}
          <p className="text-center text-white/50 text-sm mb-8 tracking-widest uppercase">
            Pregunta {paso} de {total}
          </p>

          {/* Emoji + pregunta */}
          <div className="text-center mb-10">
            <div className="text-6xl mb-6">{pregActual.emoji}</div>
            <h2 className="text-3xl font-light text-white leading-snug"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
              {pregActual.texto}
            </h2>
          </div>

          {/* Input según tipo */}
          {pregActual.tipo === 'estrellas' && (
            <Estrellas valor={resp[pregActual.id] ?? 0}
              onChange={v => setRespuesta(pregActual.id, v)} />
          )}
          {pregActual.tipo === 'nps' && (
            <NPS valor={resp[pregActual.id] ?? 0}
              onChange={v => setRespuesta(pregActual.id, v)} />
          )}
          {pregActual.tipo === 'texto' && (
            <textarea
              value={resp[pregActual.id] ?? ''}
              onChange={e => setRespuesta(pregActual.id, e.target.value)}
              placeholder="Escribe aquí... (opcional)"
              rows={4}
              className="w-full bg-white/15 backdrop-blur text-white placeholder-white/40
                         border border-white/30 rounded-2xl p-4 text-lg resize-none
                         focus:outline-none focus:border-white/60 transition-colors" />
          )}
        </div>
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between p-6 gap-4">
        <button onClick={() => setPaso(p => Math.max(1, p - 1))}
          className="px-8 py-4 bg-white/10 text-white rounded-2xl text-lg border border-white/20
                     hover:bg-white/20 active:scale-95 transition-all">
          ← Atrás
        </button>

        {paso < total ? (
          <button onClick={() => puedeAvanzar && setPaso(p => p + 1)}
            className={`flex-1 py-4 rounded-2xl text-lg font-semibold transition-all active:scale-95 ${
              puedeAvanzar
                ? 'bg-white text-gray-800 shadow-lg hover:bg-gray-50'
                : 'bg-white/20 text-white/40 cursor-not-allowed'
            }`}>
            Siguiente →
          </button>
        ) : (
          <button onClick={enviar}
            disabled={enviado}
            className="flex-1 py-4 bg-white rounded-2xl text-lg font-bold shadow-lg
                       hover:bg-gray-50 active:scale-95 transition-all"
            style={{ color: cp }}>
            {enviado ? 'Enviando...' : 'Enviar encuesta ✓'}
          </button>
        )}
      </div>
    </div>
  )
}
