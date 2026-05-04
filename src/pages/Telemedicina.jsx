// src/pages/Telemedicina.jsx
// Videollamada integrada usando Daily.co — sin instalar nada, funciona en el browser
//
// CONFIGURACIÓN REQUERIDA:
//   1. Crear cuenta gratis en daily.co (10,000 min/mes gratis)
//   2. Obtener API Key en Daily.co → Developers → API Keys
//   3. Agregar en Vercel: VITE_DAILY_API_KEY=xxxxx
//
// ALTERNATIVA SIN CUENTA (Jitsi):
//   Si no configuras VITE_DAILY_API_KEY, el sistema usa Jitsi Meet automáticamente
//   (gratis, sin límites, sin cuenta) — menos control sobre la UI

import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, updateDoc, doc, onSnapshot,
         query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const DAILY_KEY = import.meta.env.VITE_DAILY_API_KEY

// ── Crear sala Daily.co ───────────────────────────────────
async function crearSalaDaily(citaId) {
  if (!DAILY_KEY) return null
  try {
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${DAILY_KEY}`,
      },
      body: JSON.stringify({
        name:       `medidesk-${citaId}-${Date.now()}`,
        properties: {
          max_participants: 4,
          enable_chat:      true,
          enable_screenshare: false,
          exp: Math.floor(Date.now() / 1000) + 7200, // expira en 2h
          lang: 'es',
        }
      })
    })
    const data = await response.json()
    return data.url ?? null
  } catch(e) {
    console.error('Daily.co error:', e)
    return null
  }
}

// ── Generar URL Jitsi (fallback sin cuenta) ───────────────
function urlJitsi(citaId, nombreDoctor) {
  const room = `MediDesk-${citaId.slice(0, 12)}`
  const nombre = encodeURIComponent(nombreDoctor ?? 'Doctor')
  return `https://meet.jit.si/${room}#userInfo.displayName="${nombre}"`
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function Telemedicina() {
  const { tenantId, tenant, role, user } = useTenant()
  const [citas,         setCitas]     = useState([])
  const [citaActiva,    setCitaActiva] = useState(null)
  const [sala,          setSala]      = useState(null)
  const [mostrarVideo,  setMostrarVideo] = useState(false)
  const [creandoSala,   setCreandoSala] = useState(false)
  const iframeRef = useRef()

  const esDoctor = ['admin','doctor'].includes(role)

  useEffect(() => {
    if (!tenantId) return
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    return onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/citas`),
        where('fecha', '>=', Timestamp.fromDate(hoy)),
        orderBy('fecha', 'asc')
      ),
      snap => {
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Solo citas con modalidad telemedicina o que apliquen
        setCitas(lista.filter(c => !['cancelada','no_show'].includes(c.estatus)))
      }
    )
  }, [tenantId])

  const iniciarLlamada = async (cita) => {
    setCreandoSala(true)
    setCitaActiva(cita)

    try {
      let urlSala = cita.urlTelemedicina // Si ya existe la sala

      if (!urlSala) {
        // Crear sala nueva
        if (DAILY_KEY) {
          urlSala = await crearSalaDaily(cita.id)
        }

        if (!urlSala) {
          // Fallback: Jitsi
          urlSala = urlJitsi(cita.id, tenant?.nombreDoctor)
        }

        // Guardar URL en la cita para que el paciente también la tenga
        await updateDoc(doc(db, `tenants/${tenantId}/citas/${cita.id}`), {
          urlTelemedicina: urlSala,
          estatusTelemedicina: 'activa',
          inicioTelemedicina: Timestamp.now(),
          estatus: 'en_consulta',
        })
      }

      setSala(urlSala)
      setMostrarVideo(true)
    } catch(e) {
      toast.error('Error al crear la sala de videollamada')
    } finally { setCreandoSala(false) }
  }

  const terminarLlamada = async () => {
    if (citaActiva) {
      await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaActiva.id}`), {
        estatusTelemedicina: 'terminada',
        finTelemedicina: Timestamp.now(),
        estatus: 'finalizada',
      })
    }
    setMostrarVideo(false)
    setSala(null)
    setCitaActiva(null)
    toast.success('Videollamada terminada')
  }

  const copiarEnlace = () => {
    if (!sala) return
    // En producción esto sería el link del portal del paciente
    const enlace = sala
    navigator.clipboard.writeText(enlace)
    toast.success('Enlace copiado — envíalo al paciente por WhatsApp')
  }

  const fmtHora = (f) => {
    try {
      const d = f?.toDate ? f.toDate() : new Date(f?.seconds * 1000)
      return format(d, 'HH:mm', { locale: es })
    } catch { return '—' }
  }

  // ── Vista de videollamada ──────────────────────────────
  if (mostrarVideo && sala) return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col z-50">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white text-sm font-medium">
            Consulta en curso — {citaActiva?.pacienteNombre}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copiarEnlace}
            className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700">
            📋 Copiar enlace
          </button>
          <button onClick={terminarLlamada}
            className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
            ⏹ Terminar llamada
          </button>
        </div>
      </div>

      {/* Iframe de videollamada */}
      <iframe
        ref={iframeRef}
        src={sala}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Videollamada médica"
      />
    </div>
  )

  // ── Vista principal ────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Telemedicina</h2>
        <p className="text-sm text-gray-400">
          {DAILY_KEY
            ? 'Salas privadas Daily.co — hasta 4 participantes, expiran en 2h'
            : 'Jitsi Meet — sin límites, sin cuenta requerida'}
        </p>
      </div>

      {/* Banner configuración */}
      {!DAILY_KEY && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-amber-800 mb-1">
            ⚡ Para salas privadas con tu marca: configura Daily.co
          </p>
          <p className="text-xs text-amber-700">
            1. Crea cuenta gratis en daily.co (10,000 min/mes gratuitos)
            &nbsp;→&nbsp; 2. Copia tu API Key
            &nbsp;→&nbsp; 3. Agrega en Vercel: <code className="bg-amber-100 px-1 rounded">VITE_DAILY_API_KEY=...</code>
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Sin configurar, se usa Jitsi Meet automáticamente (también funciona bien).
          </p>
        </div>
      )}

      {/* Lista de citas del día */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-700">Citas de hoy — selecciona para iniciar videollamada</p>
        </div>

        {citas.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-sm">Sin citas programadas para hoy</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {citas.map(cita => (
              <div key={cita.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-teal-600 w-12 text-center font-mono text-sm">
                    {fmtHora(cita.fecha)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{cita.pacienteNombre}</p>
                    <div className="flex gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full
                        ${cita.estatus === 'en_consulta' ? 'bg-blue-100 text-blue-700' :
                          cita.estatus === 'confirmada'  ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'}`}>
                        {cita.estatus}
                      </span>
                      {cita.urlTelemedicina && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          Sala activa
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {cita.urlTelemedicina && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(cita.urlTelemedicina)
                        toast.success('Enlace copiado')
                      }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                      📋 Copiar enlace
                    </button>
                  )}
                  <button
                    disabled={creandoSala}
                    onClick={() => iniciarLlamada(cita)}
                    className={`px-4 py-1.5 text-white text-xs font-medium rounded-lg transition-colors
                      ${cita.urlTelemedicina
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-teal-600 hover:bg-teal-700'}
                      disabled:opacity-50`}>
                    {creandoSala && citaActiva?.id === cita.id
                      ? '⏳ Creando...'
                      : cita.urlTelemedicina ? '📹 Retomar llamada' : '📹 Iniciar videollamada'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instrucciones para el paciente */}
      <div className="mt-5 bg-teal-50 border border-teal-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-teal-800 mb-2">
          📱 ¿Cómo entra el paciente?
        </p>
        <div className="space-y-1 text-xs text-teal-700">
          <p>1. El doctor inicia la videollamada desde esta pantalla</p>
          <p>2. El sistema envía automáticamente el enlace al portal del paciente</p>
          <p>3. El paciente entra desde su celular o computadora — sin instalar nada</p>
          <p>4. El doctor también puede copiar el enlace y enviarlo por WhatsApp</p>
        </div>
      </div>
    </div>
  )
}
