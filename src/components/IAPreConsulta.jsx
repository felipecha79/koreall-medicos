// src/components/IAPreConsulta.jsx
// Panel de análisis IA pre-consulta visible para el doctor en la Agenda
// OPTIMIZADO: max_tokens reducido a 600, prompt mínimo, análisis conciso
import { useState, useEffect } from 'react'
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import toast from 'react-hot-toast'

// ── Análisis IA del padecimiento (vía endpoint server-side) ──
async function analizarPadecimiento(texto, pacienteInfo = {}) {
  const response = await fetch('/api/ia-prediagnostico', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, pacienteInfo }),
  })

  if (!response.ok) throw new Error(`API ${response.status}`)
  const data = await response.json()
  return data.resultado ?? {}
}

// ── Componente panel del doctor ───────────────────────────
export default function IAPreConsulta({ cita, paciente, iaActivo = true }) {
  const [analisis,   setAnalisis]   = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [revisado,   setRevisado]   = useState(false)
  const [expandido,  setExpandido]  = useState(true)
  const [iaStatus,   setIaStatus]   = useState(null)

  // Leer estado de créditos IA al montar — con cleanup correcto
  useEffect(() => {
    let unsub = null
    import('firebase/firestore').then(({ doc: fDoc, onSnapshot: fSnap }) => {
      import('../firebase').then(({ db: fdb }) => {
        const ref = fDoc(fdb, 'configuracion', 'ia_status')
        unsub = fSnap(ref, snap => {
          if (snap.exists()) setIaStatus(snap.data())
        })
      })
    }).catch(() => {})

    // ✅ CLEANUP: desinscribir cuando el componente se desmonta
    return () => {
      if (unsub) unsub()
    }
  }, [])

  const creditosPct = iaStatus
    ? Math.round((iaStatus.creditosUsadosMes / (iaStatus.creditosLimiteMes || 500000)) * 100)
    : 0
  const sinCreditos = creditosPct >= 100
  const pocosCreditos = creditosPct >= 80 && !sinCreditos

  const padecimiento = cita?.padecimientoPaciente || cita?.motivo

  useEffect(() => {
    // Si ya hay análisis guardado en la cita — usar ese, NO llamar a la API
    if (cita?.iaPreConsulta) {
      try {
        const cached = typeof cita.iaPreConsulta === 'string'
          ? JSON.parse(cita.iaPreConsulta)
          : cita.iaPreConsulta
        setAnalisis(cached)
      } catch(e) { /* JSON malformado — ignorar */ }
    }
  }, [cita?.id])

  const generarAnalisis = async () => {
    if (!padecimiento) return
    setLoading(true)
    try {
      const result = await analizarPadecimiento(padecimiento, paciente ?? {})
      setAnalisis(result)

      // Guardar en Firestore para no volver a consultar
      if (cita?.id && cita?.tenantId) {
        try {
          await updateDoc(
            doc(db, `tenants/${cita.tenantId}/citas/${cita.id}`),
            { iaPreConsulta: JSON.stringify(result) }
          )
        } catch(e) { /* Guardar en BD falla silenciosamente */ }
      }
    } catch(e) {
      console.error('IA pre-consulta error:', e)
      toast.error('Error en análisis IA')
    } finally { setLoading(false) }
  }

  // Guards after hooks (React rules)
  if (!iaActivo) return null
  if (!padecimiento) return null

  // Banner de estado de créditos
  const bannerCreditos = sinCreditos ? (
    <div className="mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
      <span>⚠️</span>
      <span><strong>Créditos IA agotados.</strong> Contacta al administrador.</span>
    </div>
  ) : pocosCreditos ? (
    <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
      <span>🔋</span>
      <span>Créditos IA al <strong>{creditosPct}%</strong>.</span>
    </div>
  ) : null

  const PROB_COLOR = {
    alta:  { bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200' },
    media: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    baja:  { bg: 'bg-gray-50',  text: 'text-gray-600',  border: 'border-gray-200' },
  }
  const URG_COLOR = {
    inmediata: 'text-red-600 font-semibold',
    electiva:  'text-gray-500',
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-teal-50 rounded-xl border border-blue-200 overflow-hidden mb-4">
      {/* Banner de créditos */}
      {bannerCreditos}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-100/50 transition-colors"
        onClick={() => setExpandido(e => !e)}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="text-sm font-semibold text-blue-800">Análisis IA pre-consulta</span>
          {!revisado && analisis && (
            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Nuevo</span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{expandido ? '▲' : '▼'}</span>
      </div>

      {expandido && (
        <div className="px-4 pb-4">
          {/* Padecimiento */}
          <div className="bg-white rounded-lg p-3 mb-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium mb-1">📝 Padecimiento:</p>
            <p className="text-sm text-gray-800 italic">"{padecimiento}"</p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-blue-600 text-sm py-3 justify-center">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Analizando con IA...
            </div>
          )}

          {analisis && (
            <div className="space-y-3">
              {/* Observación general */}
              {analisis.observacion && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-xs text-blue-700">{analisis.observacion}</p>
                </div>
              )}

              {/* Diagnósticos diferenciales */}
              {analisis.diagnosticos?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Diagnósticos diferenciales
                  </p>
                  <div className="space-y-1.5">
                    {analisis.diagnosticos.map((dx, i) => {
                      const c = PROB_COLOR[dx.probabilidad] ?? PROB_COLOR.baja
                      return (
                        <div key={i} className={`flex items-start gap-2 rounded-lg p-2 border ${c.bg} ${c.border}`}>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border} flex-shrink-0`}>
                            {dx.probabilidad}
                          </span>
                          <div>
                            <p className={`text-sm font-medium ${c.text}`}>{dx.dx}</p>
                            {dx.justificacion && (
                              <p className="text-xs text-gray-500 mt-0.5">{dx.justificacion}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Estudios sugeridos */}
              {analisis.estudios?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Estudios sugeridos
                  </p>
                  <div className="space-y-1">
                    {analisis.estudios.map((est, i) => (
                      <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-2 border border-gray-100">
                        <span className="text-teal-600 text-sm flex-shrink-0">🔬</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800">{est.estudio}</span>
                          {est.urgencia && (
                            <span className={`text-xs ml-2 ${URG_COLOR[est.urgencia] ?? 'text-gray-500'}`}>
                              {est.urgencia}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Marcar como revisado */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400 italic">⚕️ Solo apoyo — decisión clínica del médico</p>
                <button
                  onClick={() => setRevisado(true)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors
                    ${revisado
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {revisado ? '✓ Revisado' : 'Marcar revisado'}
                </button>
              </div>
            </div>
          )}

          {!analisis && !loading && (
            <button
              onClick={() => !sinCreditos && generarAnalisis()}
              disabled={sinCreditos}
              className={`w-full py-2 text-sm rounded-lg transition-colors ${
                sinCreditos
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
              {sinCreditos ? '⚠️ Sin créditos IA' : '🤖 Generar análisis'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Campo de padecimiento para el modal de nueva cita ──
export function CampoPadecimientoCita({ value, onChange }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        ¿Cuál es tu motivo de consulta? <span className="text-gray-400 font-normal">(opcional)</span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Describe brevemente tu padecimiento..."
        rows={3}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
      />
    </div>
  )
}
