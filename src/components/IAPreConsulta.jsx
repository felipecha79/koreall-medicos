// src/components/IAPreConsulta.jsx
// Panel de análisis IA pre-consulta visible para el doctor en la Agenda
import { useState, useEffect } from 'react'
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import toast from 'react-hot-toast'

const ANTHROPIC_KEY = () => import.meta.env.VITE_ANTHROPIC_API_KEY

// ── Análisis IA del padecimiento ──────────────────────────
async function analizarPadecimiento(texto, pacienteInfo = {}) {
  const key = ANTHROPIC_KEY()
  if (!key) return null

  const edad = pacienteInfo.fechaNacimiento
    ? `${new Date().getFullYear() - new Date(pacienteInfo.fechaNacimiento).getFullYear()} años`
    : 'edad no especificada'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: `Asistente clínico de apoyo para médicos en México. Analiza el padecimiento y responde SOLO con JSON válido y completo. Sin texto adicional, sin backticks. Sé conciso.`,
      messages: [{
        role: 'user',
        content: `Paciente: ${pacienteInfo.sexo === 'F' ? 'Femenino' : pacienteInfo.sexo === 'M' ? 'Masculino' : 'No especificado'}, ${edad}. Alergias: ${pacienteInfo.alergias || 'ninguna'}.
Padecimiento: "${texto}"

Responde SOLO este JSON completo:
{"observacionGeneral":"texto breve","diagnosticosDiferenciales":[{"diagnostico":"nombre","probabilidad":"alta","justificacion":"breve"},{"diagnostico":"nombre2","probabilidad":"media","justificacion":"breve"}],"estudiossugeridos":[{"estudio":"nombre","justificacion":"breve","urgencia":"electiva"}],"preguntasClave":["pregunta1","pregunta2","pregunta3"],"senalesAlarma":["señal1","señal2"]}`
      }]
    })
  })

  if (!response.ok) throw new Error(`API ${response.status}`)
  const data = await response.json()
  const texto_resp = data.content?.[0]?.text ?? '{}'
  return JSON.parse(texto_resp.replace(/```json|```/g, '').trim())
}

// ── Componente panel del doctor ───────────────────────────
export default function IAPreConsulta({ cita, paciente, iaActivo = true }) {
  // Si el doctor desactivó la IA, no mostrar el panel
  if (!iaActivo) return null
  const [analisis,   setAnalisis]   = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [revisado,   setRevisado]   = useState(false)
  const [expandido,  setExpandido]  = useState(true)

  const padecimiento = cita?.padecimientoPaciente

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
    // Solo auto-analizar si hay padecimiento, no hay cache, y hay API key
  }, [cita?.id])

  const generarAnalisis = async () => {
    if (!padecimiento) return
    if (!ANTHROPIC_KEY()) return
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
        } catch(e) { /* Guardar en BD falla silenciosamente — no crítico */ }
      }
    } catch(e) {
      console.error('IA pre-consulta error:', e)
    } finally { setLoading(false) }
  }

  if (!padecimiento) return null
  if (!ANTHROPIC_KEY()) return null

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
          {/* Padecimiento del paciente */}
          <div className="bg-white rounded-lg p-3 mb-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium mb-1">
              📝 Lo que describió el paciente:
            </p>
            <p className="text-sm text-gray-800 italic">"{padecimiento}"</p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-blue-600 text-sm py-3 justify-center">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Analizando padecimiento con IA...
            </div>
          )}

          {analisis && (
            <div className="space-y-3">
              {/* Observación general */}
              {analisis.observacionGeneral && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-xs text-blue-700">{analisis.observacionGeneral}</p>
                </div>
              )}

              {/* Diagnósticos diferenciales */}
              {analisis.diagnosticosDiferenciales?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Diagnósticos diferenciales
                  </p>
                  <div className="space-y-1.5">
                    {analisis.diagnosticosDiferenciales.map((dx, i) => {
                      const c = PROB_COLOR[dx.probabilidad] ?? PROB_COLOR.baja
                      return (
                        <div key={i} className={`flex items-start gap-2 rounded-lg p-2 border ${c.bg} ${c.border}`}>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border} flex-shrink-0`}>
                            {dx.probabilidad}
                          </span>
                          <div>
                            <p className={`text-sm font-medium ${c.text}`}>{dx.diagnostico}</p>
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
              {analisis.estudiossugeridos?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Estudios sugeridos
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {analisis.estudiossugeridos.map((est, i) => (
                      <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-2 border border-gray-100">
                        <span className="text-teal-600 text-sm flex-shrink-0">🔬</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{est.estudio}</span>
                            <span className={`text-xs ${URG_COLOR[est.urgencia] ?? 'text-gray-500'}`}>
                              {est.urgencia}
                            </span>
                          </div>
                          {est.justificacion && (
                            <p className="text-xs text-gray-500 mt-0.5">{est.justificacion}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preguntas clave */}
              {analisis.preguntasClave?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Preguntas clave para la consulta
                  </p>
                  <div className="space-y-1">
                    {analisis.preguntasClave.map((q, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 flex-shrink-0 font-semibold">{i + 1}.</span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Señales de alarma */}
              {analisis.senalesAlarma?.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">⚠️ Señales de alarma</p>
                  <div className="space-y-0.5">
                    {analisis.senalesAlarma.map((s, i) => (
                      <p key={i} className="text-xs text-red-600">• {s}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Marcar como revisado */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400 italic">
                  ⚕️ Solo de apoyo — la decisión clínica es del médico
                </p>
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
              onClick={generarAnalisis}
              className="w-full py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
              🤖 Generar análisis IA
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Campo de padecimiento para el modal de nueva cita (paciente) ─
export function CampoPadecimientoCita({ value, onChange }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        ¿Cuál es tu motivo de consulta? <span className="text-gray-400 font-normal">(opcional)</span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Describe brevemente tu padecimiento o el motivo de tu cita..."
        rows={3}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
      />
      <p className="text-xs text-gray-400 mt-0.5">
        Esta información ayudará al doctor a prepararse mejor para tu consulta.
      </p>
    </div>
  )
}
