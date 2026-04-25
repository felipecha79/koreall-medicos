import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, addDoc, Timestamp, getDocs
} from 'firebase/firestore'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '../firebase'
import { format, isFuture, isPast } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ── Hook: obtener datos del paciente usando claims del token ─
function usePacientePortal() {
  const [state, setState] = useState({
    user: null, paciente: null, tenantId: null, loading: true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setState(s => ({ ...s, user: null, loading: false })); return }

      try {
        // Obtener tenantId del JWT claim (asignado por set-paciente.cjs)
        const token = await user.getIdTokenResult(true)
        const tenantId = token.claims.tenantId

        if (!tenantId) {
          console.warn('Usuario sin tenantId en claims')
          setState(s => ({ ...s, user, loading: false }))
          return
        }

        // Buscar paciente por email dentro del tenant correcto
        const { getDocs, query, collection, where } = await import('firebase/firestore')
        const snap = await getDocs(
          query(
            collection(db, `tenants/${tenantId}/pacientes`),
            where('email', '==', user.email)
          )
        )

        if (snap.empty) {
          // Intentar buscar sin filtro de email (compatibilidad)
          setState(s => ({ ...s, user, tenantId, loading: false }))
          return
        }

        const paciente = { id: snap.docs[0].id, ...snap.docs[0].data() }
        setState(s => ({ ...s, user, paciente, tenantId, loading: false }))
      } catch(e) {
        console.error('Portal error:', e)
        setState(s => ({ ...s, user, loading: false }))
      }
    })
    return unsub
  }, [])

  return state
}

const TABS_PACIENTE = ['Mis citas', 'Mis documentos', 'Mis medicamentos', 'Solicitar cita']

const ESTATUS_COLOR = {
  programada: 'bg-blue-100 text-blue-700 border-blue-200',
  confirmada: 'bg-green-100 text-green-700 border-green-200',
  completada: 'bg-gray-100 text-gray-500 border-gray-200',
  cancelada:  'bg-red-100 text-red-600 border-red-200',
  no_show:    'bg-amber-100 text-amber-700 border-amber-200',
}
const ESTATUS_LABEL = {
  programada: 'Programada', confirmada: 'Confirmada',
  completada: 'Completada', cancelada: 'Cancelada', no_show: 'No llegó',
}

export default function PortalPaciente() {
  const { user, paciente, tenantId, loading } = usePacientePortal()
  const [tab,       setTab]      = useState('Mis citas')
  const [citas,     setCitas]    = useState([])
  const [docs,      setDocs]     = useState([])
  const [meds,      setMeds]     = useState([])
  const [docViewer, setDocViewer] = useState(null)

  // Form solicitud de cita
  const [formCita, setFormCita] = useState({ fechaHora: '', motivo: '' })
  const [savingCita, setSavingCita] = useState(false)

  // Suscripciones en tiempo real
  useEffect(() => {
    if (!tenantId || !paciente) return

    // Buscar citas por pacienteId (Firestore doc ID) O por pacienteIdLegible
    const unsubCitas = onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/citas`),
        where('pacienteId', '==', paciente.id),
        orderBy('fecha', 'desc')
      ),
      snap => {
        const citasEncontradas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setCitas(citasEncontradas)
      }
    )

    const unsubDocs = onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/pacientes/${paciente.id}/documentos`),
        orderBy('fecha', 'desc')
      ),
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    const unsubMeds = onSnapshot(
      collection(db, `tenants/${tenantId}/pacientes/${paciente.id}/medicamentos`),
      snap => setMeds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    return () => { unsubCitas(); unsubDocs(); unsubMeds() }
  }, [tenantId, paciente])

  const solicitarCita = async () => {
    if (!formCita.fechaHora) { toast.error('Selecciona fecha y hora'); return }
    setSavingCita(true)
    try {
      // Sanitizar para evitar undefined en Firestore
      const citaData = {
        pacienteId:          paciente.id ?? null,
        pacienteIdLegible:   paciente.pacienteId ?? null,
        pacienteNombre:      `${paciente.nombre ?? ''} ${paciente.apellidos ?? ''}`.trim(),
        pacienteTel:         paciente.telefono ?? null,
        fecha:               Timestamp.fromDate(new Date(formCita.fechaHora)),
        motivo:              formCita.motivo ?? '',
        duracionMin:         30,
        tenantId:            tenantId ?? null,
        estatus:             'programada',
        solicitadaOnline:    true,
        recordatorioEnviado: false,
        historial: [{
          accion: 'creada',
          fecha:  Timestamp.now(),
          nota:   'Cita solicitada por el paciente desde el portal',
        }],
        creadoEn: Timestamp.now(),
      }
      await addDoc(collection(db, `tenants/${tenantId}/citas`), citaData)
      toast.success('Cita solicitada ✓ El consultorio confirmará pronto.')
      setFormCita({ fechaHora: '', motivo: '' })
      setTab('Mis citas')
    } catch(e) {
      console.error(e); toast.error('Error al solicitar cita')
    } finally { setSavingCita(false) }
  }

  // ── Estados de carga ──────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent
                      rounded-full animate-spin" />
    </div>
  )

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">MediDesk</h1>
        <p className="text-sm text-gray-500 mb-6">Portal del paciente</p>
        <p className="text-sm text-gray-600 mb-4">
          Inicia sesión con el email que registraste en el consultorio.
        </p>
        <a href="/login"
          className="block w-full px-6 py-3 bg-teal-600 text-white
                     rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors">
          Iniciar sesión
        </a>
      </div>
    </div>
  )

  if (!paciente) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl text-center">
        <p className="text-4xl mb-3">🔍</p>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Perfil no encontrado
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Tu email no está registrado como paciente. Contacta al consultorio para que te registren.
        </p>
        <button onClick={() => signOut(auth)}
          className="text-sm text-teal-600 hover:underline">
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  const proximas = citas.filter(c =>
    c.estatus !== 'cancelada' && c.fecha?.toDate && isFuture(c.fecha.toDate())
  )
  const pasadas = citas.filter(c =>
    c.estatus === 'completada' || (c.fecha?.toDate && isPast(c.fecha.toDate()))
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">MediDesk</h1>
            <p className="text-xs text-slate-400">Portal del paciente</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{paciente.nombre} {paciente.apellidos}</p>
              <p className="text-xs text-slate-400 font-mono">{paciente.pacienteId}</p>
            </div>
            <button onClick={() => signOut(auth)}
              className="text-xs text-slate-400 hover:text-white border border-slate-600
                         px-3 py-1.5 rounded-lg hover:border-slate-400 transition-colors">
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* Alertas médicas */}
      {paciente.alergias && paciente.alergias !== 'Ninguna' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-xs text-red-700 text-center max-w-2xl mx-auto">
            ⚠️ <strong>Alergias registradas:</strong> {paciente.alergias}
          </p>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Tarjeta de resumen */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center
                            justify-center text-teal-700 font-bold text-xl flex-shrink-0">
              {paciente.nombre?.[0]}{paciente.apellidos?.[0]}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-800">
                {paciente.nombre} {paciente.apellidos}
              </h2>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                <span>📱 {paciente.telefono}</span>
                {paciente.grupoSanguineo && (
                  <span className="text-red-500 font-semibold">
                    🩸 {paciente.grupoSanguineo}
                  </span>
                )}
                {paciente.rfc && (
                  <span className="font-mono">RFC: {paciente.rfc}</span>
                )}
              </div>
            </div>
          </div>

          {/* Stats rápidos */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xl font-bold text-teal-600">{proximas.length}</p>
              <p className="text-xs text-gray-400">Citas próximas</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-700">{docs.length}</p>
              <p className="text-xs text-gray-400">Documentos</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-600">
                {meds.filter(m => m.activo).length}
              </p>
              <p className="text-xs text-gray-400">Medicamentos activos</p>
            </div>
          </div>
        </div>

        {/* Próxima cita destacada */}
        {proximas[0] && (
          <div className="bg-teal-600 text-white rounded-2xl p-4 mb-5">
            <p className="text-xs text-teal-200 mb-1">Próxima cita</p>
            <p className="font-semibold text-lg">
              {format(proximas[0].fecha.toDate(), "EEEE d 'de' MMMM", { locale: es })}
            </p>
            <p className="text-teal-100 text-sm">
              {format(proximas[0].fecha.toDate(), 'HH:mm', { locale: es })} hrs
              {proximas[0].motivo ? ` — ${proximas[0].motivo}` : ''}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto border-b border-gray-200">
          {TABS_PACIENTE.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                ${tab === t
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab: Mis citas */}
        {tab === 'Mis citas' && (
          <div className="space-y-3">
            {citas.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm">Sin citas registradas</p>
              </div>
            )}
            {citas.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">
                      {c.fecha?.toDate
                        ? format(c.fecha.toDate(), "EEEE d 'de' MMMM yyyy · HH:mm", { locale: es })
                        : '—'}
                    </p>
                    {c.motivo && (
                      <p className="text-sm text-gray-500 mt-0.5">{c.motivo}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ml-2
                    ${ESTATUS_COLOR[c.estatus] ?? ''}`}>
                    {ESTATUS_LABEL[c.estatus] ?? c.estatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Mis documentos */}
        {tab === 'Mis documentos' && (
          <div>
            {docs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📁</p>
                <p className="text-sm">Sin documentos disponibles</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(d => (
                  <button key={d.id}
                    onClick={() => setDocViewer(d)}
                    className="w-full bg-white rounded-xl border border-gray-200 p-4
                               text-left hover:border-teal-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl flex-shrink-0">
                        {d.ext === 'pdf' ? '📄' : '🖼'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{d.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {d.fecha?.toDate
                            ? format(d.fecha.toDate(), "d 'de' MMMM yyyy", { locale: es })
                            : '—'}
                          {d.motivo && ` — ${d.motivo}`}
                        </p>
                      </div>
                      <span className="text-teal-500 text-xs flex-shrink-0">Ver →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Mis medicamentos */}
        {tab === 'Mis medicamentos' && (
          <div className="space-y-3">
            {meds.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">💊</p>
                <p className="text-sm">Sin medicamentos registrados</p>
              </div>
            )}
            {meds.filter(m => m.activo).map(m => (
              <div key={m.id} className="bg-white rounded-xl border border-green-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{m.nombre}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {m.dosis} — {m.frecuencia}
                    </p>
                    {m.indicadoPor && (
                      <p className="text-xs text-gray-400 mt-1">
                        Indicado por: {m.indicadoPor}
                      </p>
                    )}
                    {m.notas && (
                      <p className="text-xs text-gray-500 mt-1 italic">{m.notas}</p>
                    )}
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5
                                   rounded-full border border-green-200 flex-shrink-0 ml-2">
                    Activo
                  </span>
                </div>
              </div>
            ))}
            {meds.filter(m => !m.activo).length > 0 && (
              <>
                <p className="text-xs text-gray-400 font-medium mt-4 mb-2">
                  Medicamentos suspendidos
                </p>
                {meds.filter(m => !m.activo).map(m => (
                  <div key={m.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 opacity-60">
                    <p className="font-medium text-gray-700">{m.nombre}</p>
                    <p className="text-xs text-gray-400">{m.dosis} — Suspendido</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Tab: Solicitar cita */}
        {tab === 'Solicitar cita' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Solicitar nueva cita</h3>
            <p className="text-xs text-gray-400 mb-4">
              El consultorio revisará tu solicitud y la confirmará.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Fecha y hora de preferencia
                </label>
                <input type="datetime-local" value={formCita.fechaHora}
                  onChange={e => setFormCita(f => ({ ...f, fechaHora: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Motivo de la consulta
                </label>
                <textarea value={formCita.motivo} rows={3}
                  onChange={e => setFormCita(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Describe brevemente el motivo de tu visita..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>
              <button onClick={solicitarCita} disabled={savingCita}
                className="w-full bg-teal-600 text-white py-3 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {savingCita ? 'Enviando solicitud...' : 'Solicitar cita'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Visor de documento */}
      {docViewer && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center
                        justify-center z-50 p-4"
          onClick={() => setDocViewer(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh]
                          flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3
                            border-b border-gray-200">
              <p className="font-medium text-gray-800 text-sm truncate">
                {docViewer.nombre}
              </p>
              <div className="flex gap-2 ml-2">
                <a href={docViewer.url} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg
                             hover:bg-teal-700 whitespace-nowrap">
                  Descargar
                </a>
                <button onClick={() => setDocViewer(null)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600
                             rounded-lg hover:bg-gray-200">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              {['jpg','jpeg','png','webp'].includes(docViewer.ext) ? (
                <img src={docViewer.url} alt={docViewer.nombre}
                  className="w-full h-full object-contain p-4" />
              ) : docViewer.ext === 'pdf' ? (
                <iframe src={docViewer.url} className="w-full h-full border-0"
                  title={docViewer.nombre} style={{ minHeight: 400 }} />
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  <div className="text-center">
                    <p className="text-3xl mb-2">📎</p>
                    <a href={docViewer.url} target="_blank" rel="noreferrer"
                      className="text-teal-600 hover:underline text-sm">
                      Descargar archivo →
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
