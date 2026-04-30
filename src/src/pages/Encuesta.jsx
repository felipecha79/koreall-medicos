import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, onSnapshot, query,
  orderBy, Timestamp, getDocs, doc, updateDoc,
  where, limit
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ── Preguntas default de la encuesta ─────────────────────
const PREGUNTAS_DEFAULT = [
  {
    id: 'atencion',
    tipo: 'estrellas',
    texto: '¿Cómo calificarías la atención del doctor?',
    emoji: '🩺',
  },
  {
    id: 'espera',
    tipo: 'estrellas',
    texto: '¿El tiempo de espera fue razonable?',
    emoji: '⏱️',
  },
  {
    id: 'instalaciones',
    tipo: 'estrellas',
    texto: '¿Cómo te parecieron las instalaciones?',
    emoji: '🏥',
  },
  {
    id: 'recomendar',
    tipo: 'nps',
    texto: '¿Recomendarías este consultorio a un familiar?',
    emoji: '💬',
  },
  {
    id: 'comentario',
    tipo: 'texto',
    texto: '¿Algo que quieras compartir con nosotros?',
    emoji: '✍️',
    opcional: true,
  },
]

// ── Componente Estrellas ──────────────────────────────────
function Estrellas({ valor, onChange, size = 'lg' }) {
  const [hover, setHover] = useState(0)
  const sz = size === 'lg' ? 'text-5xl' : 'text-2xl'
  return (
    <div className="flex gap-3 justify-center">
      {[1,2,3,4,5].map(n => (
        <button key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className={`${sz} transition-all duration-150 transform hover:scale-110 active:scale-95`}
          style={{ filter: (hover || valor) >= n ? 'none' : 'grayscale(1) opacity(0.25)' }}>
          ⭐
        </button>
      ))}
    </div>
  )
}

// ── Componente NPS (0-10) ─────────────────────────────────
function NPS({ valor, onChange }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 justify-center flex-wrap">
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
          const color = n <= 6 ? 'border-red-200 hover:bg-red-50 hover:border-red-400'
            : n <= 8 ? 'border-amber-200 hover:bg-amber-50 hover:border-amber-400'
            : 'border-green-200 hover:bg-green-50 hover:border-green-400'
          const active = n <= 6 ? 'bg-red-500 border-red-500 text-white'
            : n <= 8 ? 'bg-amber-500 border-amber-500 text-white'
            : 'bg-green-500 border-green-500 text-white'
          return (
            <button key={n} onClick={() => onChange(n)}
              className={`w-10 h-10 rounded-xl border-2 text-sm font-bold transition-all
                ${valor === n ? active : `bg-white ${color} text-gray-700`}`}>
              {n}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 px-1">
        <span>No la recomendaría</span>
        <span>La recomendaría definitivamente</span>
      </div>
    </div>
  )
}

// ── Animación confeti ─────────────────────────────────────
function Confeti() {
  const canvasRef = useRef()
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const piezas = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      color: ['#0A8076','#C4A265','#0D1F35','#60B8AF','#FFD700','#E84393'][Math.floor(Math.random()*6)],
      size: 6 + Math.random() * 10,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 8,
    }))

    let anim
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      piezas.forEach(p => {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot * Math.PI / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2)
        ctx.restore()
        p.x  += p.vx; p.y += p.vy
        p.rot += p.rotV
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width }
      })
      anim = requestAnimationFrame(draw)
    }
    draw()
    const timer = setTimeout(() => cancelAnimationFrame(anim), 4000)
    return () => { cancelAnimationFrame(anim); clearTimeout(timer) }
  }, [])
  return (
    <canvas ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ mixBlendMode: 'multiply' }} />
  )
}

// ══════════════════════════════════════════════════════════
// MODO QUIOSCO — pantalla tablet en recepción
// ══════════════════════════════════════════════════════════
function ModoQuiosco({ tenantId, tenant, onCerrar }) {
  const [paso, setPaso]       = useState(0)  // 0=bienvenida, 1-N=preguntas, N+1=gracias
  const [respuestas, setResp] = useState({})
  const [enviando, setEnv]    = useState(false)
  const [listo, setListo]     = useState(false)

  const preguntas = tenant?.encuesta?.preguntas ?? PREGUNTAS_DEFAULT
  const total     = preguntas.length
  const pregActual = preguntas[paso - 1]

  const responder = (id, valor) => {
    setResp(r => ({ ...r, [id]: valor }))
  }

  const siguiente = async () => {
    // Validar que la pregunta actual tiene respuesta (excepto opcionales)
    if (pregActual && !pregActual.opcional && !respuestas[pregActual.id] && respuestas[pregActual.id] !== 0) {
      toast.error('Por favor responde esta pregunta')
      return
    }

    if (paso < total) {
      setPaso(p => p + 1)
    } else {
      // Enviar encuesta
      setEnv(true)
      try {
        const promedio = (() => {
          const nums = Object.entries(respuestas)
            .filter(([k]) => k !== 'comentario')
            .map(([,v]) => Number(v))
            .filter(n => !isNaN(n))
          return nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1) : null
        })()

        await addDoc(collection(db, `tenants/${tenantId}/encuestas`), {
          respuestas,
          promedioGeneral: promedio,
          fecha: Timestamp.now(),
          tenantId,
        })
        setListo(true)
        setPaso(total + 1)
      } catch(e) {
        toast.error('Error al enviar. Intenta de nuevo.')
      } finally { setEnv(false) }
    }
  }

  const reiniciar = () => {
    setPaso(0)
    setResp({})
    setListo(false)
  }

  // ── Pantalla de bienvenida ──────────────────────────────
  if (paso === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: 'linear-gradient(135deg, #0D1F35 0%, #0A4040 60%, #0A8076 100%)' }}>
      <div className="text-center max-w-lg">
        <div className="w-24 h-24 bg-white bg-opacity-10 rounded-3xl flex items-center
                        justify-center mx-auto mb-8 text-5xl"
          style={{ backdropFilter: 'blur(20px)' }}>
          😊
        </div>
        <h1 className="text-4xl font-light text-white mb-3"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          ¿Cómo fue tu visita?
        </h1>
        <p className="text-lg text-white text-opacity-70 mb-2">
          {tenant?.nombre ?? 'Consultorio Médico'}
        </p>
        <p className="text-sm text-white mb-10"
          style={{ opacity: 0.5 }}>
          Tu opinión nos ayuda a mejorar · Solo toma 1 minuto
        </p>
        <button onClick={() => setPaso(1)}
          className="px-10 py-4 bg-white text-teal-800 rounded-2xl text-lg font-semibold
                     hover:bg-teal-50 active:scale-95 transition-all shadow-2xl">
          Comenzar encuesta →
        </button>
        <p className="mt-4 text-xs text-white" style={{ opacity: 0.3 }}>
          Tus respuestas son anónimas
        </p>
      </div>
      {/* Botón cerrar quiosco (discreto, esquina) */}
      <button onClick={onCerrar}
        className="fixed top-4 right-4 text-white text-opacity-20 hover:text-opacity-60
                   text-xs px-3 py-1 rounded-lg transition-colors"
        style={{ opacity: 0.3 }}>
        ✕ Salir
      </button>
    </div>
  )

  // ── Pantalla de gracias ─────────────────────────────────
  if (paso === total + 1) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: 'linear-gradient(135deg, #0D1F35 0%, #0A4040 60%, #0A8076 100%)' }}>
      {listo && <Confeti />}
      <div className="text-center max-w-lg">
        <div className="text-7xl mb-8 animate-bounce">🎉</div>
        <h1 className="text-4xl font-light text-white mb-4"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          ¡Muchas gracias!
        </h1>
        <p className="text-lg text-white mb-2" style={{ opacity: 0.8 }}>
          Tu opinión ha sido registrada.
        </p>
        <p className="text-sm text-white mb-10" style={{ opacity: 0.5 }}>
          Nos ayuda a brindarte una mejor atención en tu próxima visita.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reiniciar}
            className="px-8 py-3 bg-white text-teal-800 rounded-2xl font-semibold
                       hover:bg-teal-50 active:scale-95 transition-all">
            Nueva encuesta
          </button>
        </div>
      </div>
      <button onClick={onCerrar}
        className="fixed top-4 right-4 text-xs text-white px-3 py-1 rounded-lg"
        style={{ opacity: 0.3 }}>
        ✕ Salir
      </button>
    </div>
  )

  // ── Preguntas ───────────────────────────────────────────
  const progreso = ((paso - 1) / total) * 100

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #0D1F35 0%, #0A4040 60%, #0A8076 100%)' }}>

      {/* Barra de progreso */}
      <div className="h-1 bg-white bg-opacity-10">
        <div className="h-full bg-teal-400 transition-all duration-500"
          style={{ width: `${progreso}%` }} />
      </div>

      {/* Contador */}
      <div className="flex justify-between items-center px-8 py-5">
        <span className="text-white text-sm font-medium"
          style={{ opacity: 0.5 }}>
          {tenant?.nombre ?? 'Consultorio'}
        </span>
        <span className="text-white text-sm font-mono"
          style={{ opacity: 0.5 }}>
          {paso} / {total}
        </span>
      </div>

      {/* Contenido de la pregunta */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-8">
        <div className="w-full max-w-lg">

          {/* Emoji de la pregunta */}
          <div className="text-6xl text-center mb-6 animate-pulse">
            {pregActual.emoji}
          </div>

          {/* Texto de la pregunta */}
          <h2 className="text-2xl md:text-3xl font-light text-white text-center mb-8 leading-snug"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            {pregActual.texto}
          </h2>

          {/* Input según tipo */}
          <div className="mb-8">
            {pregActual.tipo === 'estrellas' && (
              <Estrellas
                valor={respuestas[pregActual.id] ?? 0}
                onChange={v => responder(pregActual.id, v)}
              />
            )}

            {pregActual.tipo === 'nps' && (
              <NPS
                valor={respuestas[pregActual.id] ?? null}
                onChange={v => responder(pregActual.id, v)}
              />
            )}

            {pregActual.tipo === 'texto' && (
              <div>
                <textarea
                  value={respuestas[pregActual.id] ?? ''}
                  onChange={e => responder(pregActual.id, e.target.value)}
                  placeholder="Escribe aquí tu comentario..."
                  rows={4}
                  className="w-full bg-white bg-opacity-10 border border-white border-opacity-20
                             text-white placeholder-white placeholder-opacity-30 rounded-2xl
                             px-5 py-4 text-base resize-none focus:outline-none
                             focus:ring-2 focus:ring-teal-400 focus:ring-opacity-60"
                  style={{ backdropFilter: 'blur(10px)' }}
                />
                {pregActual.opcional && (
                  <p className="text-center text-white text-xs mt-2" style={{ opacity: 0.4 }}>
                    Opcional — puedes saltar esta pregunta
                  </p>
                )}
              </div>
            )}

            {pregActual.tipo === 'opcion' && (
              <div className="grid grid-cols-2 gap-3">
                {(pregActual.opciones ?? []).map((op, i) => (
                  <button key={i}
                    onClick={() => responder(pregActual.id, op)}
                    className={`py-4 px-5 rounded-2xl text-base font-medium transition-all
                      ${respuestas[pregActual.id] === op
                        ? 'bg-teal-500 text-white shadow-lg scale-[1.02]'
                        : 'bg-white bg-opacity-10 text-white border border-white border-opacity-20 hover:bg-opacity-20'}`}>
                    {op}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botón siguiente */}
          <button onClick={siguiente} disabled={enviando}
            className={`w-full py-4 rounded-2xl text-lg font-semibold transition-all
              ${(respuestas[pregActual.id] !== undefined && respuestas[pregActual.id] !== '') || pregActual.opcional
                ? 'bg-white text-teal-800 hover:bg-teal-50 active:scale-95 shadow-2xl'
                : 'bg-white bg-opacity-20 text-white cursor-not-allowed'}`}>
            {enviando ? '⏳ Enviando...' : paso === total ? '✓ Enviar encuesta' : 'Siguiente →'}
          </button>

          {pregActual.opcional && (
            <button onClick={siguiente}
              className="w-full mt-3 py-2 text-white text-sm opacity-40 hover:opacity-60 transition-opacity">
              Omitir esta pregunta
            </button>
          )}
        </div>
      </div>

      <button onClick={onCerrar}
        className="fixed top-4 right-4 text-xs text-white px-3 py-1 rounded-lg"
        style={{ opacity: 0.3 }}>
        ✕ Salir
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// PANEL DE RESULTADOS — para el doctor/admin
// ══════════════════════════════════════════════════════════
function PanelResultados({ tenantId, tenant, onAbrirQuiosco }) {
  const [encuestas, setEncuestas] = useState([])
  const [rango, setRango]         = useState(30) // últimos N días
  const [detalle, setDetalle]     = useState(null)

  useEffect(() => {
    if (!tenantId) return
    return onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/encuestas`),
        orderBy('fecha', 'desc'),
        limit(200)
      ),
      snap => setEncuestas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  const filtradas = encuestas.filter(e => {
    try {
      const f = e.fecha?.toDate ? e.fecha.toDate() : new Date(e.fecha?.seconds*1000)
      return f >= subDays(new Date(), rango)
    } catch { return true }
  })

  // ── Calcular métricas ──────────────────────────────────
  const promedios = PREGUNTAS_DEFAULT.reduce((acc, p) => {
    if (p.tipo === 'texto') return acc
    const vals = filtradas
      .map(e => e.respuestas?.[p.id])
      .filter(v => v !== undefined && v !== null && v !== '')
      .map(Number)
      .filter(n => !isNaN(n))
    acc[p.id] = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : null
    return acc
  }, {})

  const npsScores = filtradas.map(e => Number(e.respuestas?.recomendar)).filter(n => !isNaN(n))
  const promotores = npsScores.filter(n => n >= 9).length
  const detractores = npsScores.filter(n => n <= 6).length
  const nps = npsScores.length
    ? Math.round(((promotores - detractores) / npsScores.length) * 100)
    : null

  const promedioGeneral = filtradas.length
    ? (filtradas.map(e => Number(e.promedioGeneral)).filter(n=>!isNaN(n))
        .reduce((a,b)=>a+b,0) / filtradas.filter(e=>e.promedioGeneral).length
      ).toFixed(1)
    : null

  const comentarios = filtradas
    .map(e => e.respuestas?.comentario)
    .filter(c => c && c.trim())

  const renderEstrellas = (val) => {
    if (!val) return <span className="text-gray-300 text-xs">Sin datos</span>
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-yellow-400 text-sm">{'⭐'.repeat(Math.round(val))}</span>
        <span className="text-sm font-bold text-gray-800">{val}</span>
        <span className="text-xs text-gray-400">/ 5</span>
      </div>
    )
  }

  const npsColor = nps === null ? 'text-gray-400'
    : nps >= 50 ? 'text-green-600'
    : nps >= 0  ? 'text-amber-600'
    : 'text-red-600'

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Encuestas de satisfacción</h2>
          <p className="text-sm text-gray-400">{filtradas.length} respuestas · {tenant?.nombre}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Selector de rango */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {[[7,'7 días'],[30,'30 días'],[90,'3 meses']].map(([d,l]) => (
              <button key={d} onClick={() => setRango(d)}
                className={`px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 first:border-0
                  ${rango===d ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {/* Botón lanzar quiosco */}
          <button onClick={onAbrirQuiosco}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg
                       hover:bg-teal-700 transition-colors flex items-center gap-2">
            <span>📱</span> Lanzar encuesta (tablet)
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-teal-600 mb-1">
            {promedioGeneral ?? '—'}
          </p>
          <p className="text-xs text-gray-500">Satisfacción general</p>
          <div className="flex justify-center mt-1">
            {promedioGeneral && '⭐'.repeat(Math.round(promedioGeneral))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
          <p className={`text-3xl font-bold mb-1 ${npsColor}`}>
            {nps !== null ? (nps > 0 ? `+${nps}` : nps) : '—'}
          </p>
          <p className="text-xs text-gray-500">NPS Score</p>
          <p className="text-xs text-gray-400 mt-1">
            {nps >= 50 ? '🟢 Excelente' : nps >= 0 ? '🟡 Bueno' : '🔴 Mejorar'}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-blue-600 mb-1">{filtradas.length}</p>
          <p className="text-xs text-gray-500">Respuestas</p>
          <p className="text-xs text-gray-400 mt-1">Últimos {rango} días</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-purple-600 mb-1">{comentarios.length}</p>
          <p className="text-xs text-gray-500">Comentarios</p>
          <p className="text-xs text-gray-400 mt-1">Texto libre</p>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <p className="text-lg font-medium text-gray-700 mb-2">Sin encuestas todavía</p>
          <p className="text-sm text-gray-400 mb-6">
            Coloca la tablet en recepción y lanza la encuesta para comenzar a recopilar datos.
          </p>
          <button onClick={onAbrirQuiosco}
            className="px-6 py-3 bg-teal-600 text-white rounded-xl font-medium
                       hover:bg-teal-700 transition-colors">
            📱 Lanzar encuesta ahora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Promedios por pregunta */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Resultado por pregunta</p>
            <div className="space-y-4">
              {PREGUNTAS_DEFAULT.filter(p => p.tipo !== 'texto').map(p => (
                <div key={p.id} className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-1 truncate">{p.texto}</p>
                    {p.tipo === 'estrellas' && renderEstrellas(promedios[p.id])}
                    {p.tipo === 'nps' && (
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${npsColor}`}>
                          NPS {nps !== null ? (nps > 0 ? `+${nps}` : nps) : '—'}
                        </span>
                        <span className="text-xs text-gray-400">
                          · Promedio: {promedios[p.id] ?? '—'} / 10
                        </span>
                      </div>
                    )}
                    {/* Barra visual */}
                    {promedios[p.id] && (
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
                        <div className="h-1.5 rounded-full bg-teal-500 transition-all"
                          style={{ width: `${(promedios[p.id] / (p.tipo === 'nps' ? 10 : 5)) * 100}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Distribución NPS */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">
              Distribución NPS — ¿Recomendarías el consultorio?
            </p>
            {npsScores.length > 0 ? (
              <>
                <div className="flex gap-2 mb-4">
                  {[
                    { label: 'Promotores', count: promotores, color: 'bg-green-500', range: '9-10' },
                    { label: 'Pasivos', count: npsScores.filter(n=>n>=7&&n<=8).length, color: 'bg-amber-400', range: '7-8' },
                    { label: 'Detractores', count: detractores, color: 'bg-red-400', range: '0-6' },
                  ].map(item => (
                    <div key={item.label} className="flex-1 text-center">
                      <div className={`${item.color} rounded-xl p-3 mb-2`}>
                        <p className="text-white text-xl font-bold">{item.count}</p>
                      </div>
                      <p className="text-xs font-medium text-gray-700">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.range}</p>
                    </div>
                  ))}
                </div>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                  {npsScores.length > 0 && [
                    { pct: (detractores/npsScores.length)*100, color: 'bg-red-400' },
                    { pct: (npsScores.filter(n=>n>=7&&n<=8).length/npsScores.length)*100, color: 'bg-amber-400' },
                    { pct: (promotores/npsScores.length)*100, color: 'bg-green-500' },
                  ].map((b,i) => (
                    <div key={i} className={`${b.color} transition-all`} style={{ width: `${b.pct}%` }} />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Sin datos de NPS todavía</p>
            )}
          </div>

          {/* Comentarios */}
          {comentarios.length > 0 && (
            <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">
                ✍️ Comentarios de pacientes ({comentarios.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {comentarios.map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100 relative">
                    <span className="text-4xl text-gray-200 absolute top-2 left-3
                                     font-serif leading-none">"</span>
                    <p className="text-sm text-gray-700 relative z-10 pl-4">{c}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de respuestas */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Historial de respuestas</p>
              <p className="text-xs text-gray-400">{filtradas.length} encuestas</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Fecha</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">Atención</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">Espera</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">Instalaciones</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">NPS</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">Promedio</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Comentario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtradas.slice(0, 50).map(e => {
                    const fmtF = (() => {
                      try {
                        const d = e.fecha?.toDate ? e.fecha.toDate() : new Date(e.fecha?.seconds*1000)
                        return format(d, "d MMM · HH:mm", { locale: es })
                      } catch { return '—' }
                    })()
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtF}</td>
                        {['atencion','espera','instalaciones'].map(k => (
                          <td key={k} className="px-3 py-2.5 text-center">
                            {e.respuestas?.[k]
                              ? <span className="text-xs font-semibold text-gray-700">{e.respuestas[k]}⭐</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center">
                          {e.respuestas?.recomendar !== undefined ? (
                            <span className={`text-xs font-bold
                              ${e.respuestas.recomendar >= 9 ? 'text-green-600'
                                : e.respuestas.recomendar >= 7 ? 'text-amber-500'
                                : 'text-red-500'}`}>
                              {e.respuestas.recomendar}
                            </span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-bold text-teal-600">
                            {e.promedioGeneral ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                          {e.respuestas?.comentario || <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function Encuesta() {
  const { tenantId, tenant } = useTenant()
  const [modoQuiosco, setModoQuiosco] = useState(false)

  // Modo quiosco toma toda la pantalla
  if (modoQuiosco) return (
    <ModoQuiosco
      tenantId={tenantId}
      tenant={tenant}
      onCerrar={() => setModoQuiosco(false)}
    />
  )

  return (
    <PanelResultados
      tenantId={tenantId}
      tenant={tenant}
      onAbrirQuiosco={() => setModoQuiosco(true)}
    />
  )
}
