import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy,
  onSnapshot, addDoc, updateDoc, doc,
  getDocs, Timestamp, arrayUnion
} from 'firebase/firestore'
import { signOut, onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { auth, db } from '../firebase'
import { format, isFuture, isPast } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ── Estatus del turno — el diferenciador de servicio ─────
const TURNO_ESTADOS = [
  { key: 'programada',   label: 'Programada',       icon: '📅', color: 'bg-gray-100 text-gray-500',   desc: 'Tu cita está agendada' },
  { key: 'confirmada',   label: 'Confirmada',        icon: '✅', color: 'bg-blue-100 text-blue-700',   desc: 'Confirmaste tu asistencia' },
  { key: 'en_camino',    label: 'En camino',         icon: '🚗', color: 'bg-yellow-100 text-yellow-700', desc: 'El consultorio sabe que vas en camino' },
  { key: 'en_sala',      label: 'En sala de espera', icon: '🪑', color: 'bg-orange-100 text-orange-700', desc: 'Ya llegaste — registrado en recepción' },
  { key: 'por_pasar',    label: 'Por pasar',         icon: '🔔', color: 'bg-purple-100 text-purple-700', desc: 'El doctor está listo para atenderte' },
  { key: 'completada',   label: 'En consulta',       icon: '🩺', color: 'bg-teal-100 text-teal-700',   desc: 'Estás siendo atendido' },
  { key: 'finalizada',   label: 'Finalizada',        icon: '🎉', color: 'bg-green-100 text-green-700', desc: 'Consulta completada' },
  { key: 'cancelada',    label: 'Cancelada',         icon: '❌', color: 'bg-red-100 text-red-600',     desc: 'Cita cancelada' },
  { key: 'no_show',      label: 'No llegó',          icon: '⏰', color: 'bg-red-50 text-red-400',      desc: 'No se presentó' },
]

const TURNO_ORDER = ['programada','confirmada','en_camino','en_sala','por_pasar','completada']

function getEstado(estatus) {
  return TURNO_ESTADOS.find(e => e.key === estatus) ?? TURNO_ESTADOS[0]
}

// ── Hook del portal ───────────────────────────────────────
function usePacientePortal() {
  const [state, setState] = useState({
    user: null, paciente: null, tenantId: null,
    tenant: null, loading: true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setState(s => ({ ...s, user: null, loading: false })); return }
      try {
        const token = await getIdTokenResult(user, true)
        const tenantId = token.claims.tenantId ?? null
        if (!tenantId) { setState(s => ({ ...s, user, loading: false })); return }

        // Cargar datos del tenant
        const { getDoc } = await import('firebase/firestore')
        const tenantSnap = await getDoc(doc(db, `tenants/${tenantId}`))
        const tenant = tenantSnap.exists() ? { id: tenantSnap.id, ...tenantSnap.data() } : null

        // Buscar paciente por email
        const snap = await getDocs(query(
          collection(db, `tenants/${tenantId}/pacientes`),
          where('email', '==', user.email)
        ))

        if (snap.empty) {
          setState(s => ({ ...s, user, tenantId, tenant, loading: false }))
          return
        }
        const paciente = { id: snap.docs[0].id, ...snap.docs[0].data() }
        setState(s => ({ ...s, user, paciente, tenantId, tenant, loading: false }))
      } catch(e) {
        console.error('Portal error:', e)
        setState(s => ({ ...s, user, loading: false }))
      }
    })
    return unsub
  }, [])

  return state
}

// ── Barra de progreso del turno ───────────────────────────
function BarraTurno({ estatus }) {
  const idx = TURNO_ORDER.indexOf(estatus)
  const estado = getEstado(estatus)

  if (['cancelada','no_show'].includes(estatus)) return (
    <div className={`rounded-xl p-3 text-center text-sm font-medium ${estado.color}`}>
      {estado.icon} {estado.label}
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Estado de tu cita</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estado.color}`}>
          {estado.icon} {estado.label}
        </span>
      </div>
      {/* Barra de progreso */}
      <div className="flex items-center gap-1">
        {TURNO_ORDER.map((key, i) => (
          <div key={key} className="flex-1 flex flex-col items-center">
            <div className={`w-full h-2 rounded-full transition-all
              ${i <= idx ? 'bg-teal-500' : 'bg-gray-200'}`} />
            <p className="text-xs text-gray-400 mt-1 hidden sm:block truncate w-full text-center"
              style={{ fontSize: 9 }}>
              {TURNO_ESTADOS.find(e=>e.key===key)?.icon}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2 text-center">{estado.desc}</p>
    </div>
  )
}

// ── Tarjeta de cita con acciones ──────────────────────────
function TarjetaCita({ cita, tenantId, onPagar }) {
  const [expanded, setExpanded] = useState(false)
  const estado = getEstado(cita.estatus)
  const esFutura = cita.fecha?.toDate ? isFuture(cita.fecha.toDate()) : false
  const esHoy = (() => {
    try {
      const f = cita.fecha?.toDate ? cita.fecha.toDate() : new Date(cita.fecha?.seconds*1000)
      return format(f, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
    } catch { return false }
  })()

  const fechaStr = (() => {
    try {
      const f = cita.fecha?.toDate ? cita.fecha.toDate()
        : cita.fecha?.seconds ? new Date(cita.fecha.seconds*1000) : null
      if (!f) return '—'
      return format(f, "EEEE d 'de' MMMM · HH:mm", { locale: es })
    } catch { return '—' }
  })()

  const actualizarEstatus = async (nuevoEstatus) => {
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/citas/${cita.id}`), {
        estatus: nuevoEstatus,
        historial: arrayUnion({
          accion: nuevoEstatus,
          fecha: Timestamp.now(),
          nota: `Actualizado por el paciente: ${nuevoEstatus}`,
        })
      })
      toast.success(`Estado actualizado: ${getEstado(nuevoEstatus).label}`)
    } catch(e) {
      toast.error('Error al actualizar')
    }
  }

  return (
    <div className={`bg-white rounded-xl border p-4 transition-all
      ${esHoy ? 'border-teal-300 ring-1 ring-teal-200' : 'border-gray-200'}`}>

      {esHoy && (
        <div className="bg-teal-50 text-teal-700 text-xs font-medium px-2 py-1
                        rounded-lg mb-3 inline-block">
          📅 Hoy
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium text-gray-800">{fechaStr} hrs</p>
          {cita.motivo && (
            <p className="text-sm text-gray-500 mt-0.5">{cita.motivo}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2
          ${estado.color}`}>
          {estado.icon} {estado.label}
        </span>
      </div>

      {/* Barra de turno para citas de hoy */}
      {esHoy && !['cancelada','no_show','finalizada'].includes(cita.estatus) && (
        <div className="mt-3">
          <BarraTurno estatus={cita.estatus} />
        </div>
      )}

      {/* Acciones del paciente */}
      {(esFutura || esHoy) && !['cancelada','completada','finalizada','no_show'].includes(cita.estatus) && (
        <div className="mt-3 pt-3 border-t border-gray-100">

          {/* Botones de estatus que el PACIENTE puede actualizar */}
          <p className="text-xs text-gray-400 mb-2">Actualiza tu estado:</p>
          <div className="flex gap-2 flex-wrap">

            {cita.estatus === 'programada' && (
              <button onClick={() => actualizarEstatus('confirmada')}
                className="flex-1 py-2 bg-green-600 text-white text-xs font-medium
                           rounded-lg hover:bg-green-700 transition-colors">
                ✓ Confirmar asistencia
              </button>
            )}

            {['programada','confirmada'].includes(cita.estatus) && (
              <button onClick={() => actualizarEstatus('en_camino')}
                className="py-2 px-3 bg-yellow-50 text-yellow-700 text-xs font-medium
                           rounded-lg hover:bg-yellow-100 border border-yellow-200 transition-colors">
                🚗 Voy en camino
              </button>
            )}

            {['confirmada','en_camino'].includes(cita.estatus) && (
              <button onClick={() => actualizarEstatus('en_sala')}
                className="py-2 px-3 bg-orange-50 text-orange-700 text-xs font-medium
                           rounded-lg hover:bg-orange-100 border border-orange-200 transition-colors">
                🪑 Ya llegué
              </button>
            )}

            {!['cancelada'].includes(cita.estatus) && (
              <button onClick={() => setExpanded(!expanded)}
                className="py-2 px-3 bg-red-50 text-red-500 text-xs rounded-lg
                           hover:bg-red-100 border border-red-100 transition-colors">
                Cancelar
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 mb-2">
                ¿Confirmas que deseas cancelar esta cita?
              </p>
              <div className="flex gap-2">
                <button onClick={() => { actualizarEstatus('cancelada'); setExpanded(false) }}
                  className="flex-1 py-1.5 bg-red-600 text-white text-xs rounded-lg
                             hover:bg-red-700 font-medium">
                  Sí, cancelar
                </button>
                <button onClick={() => setExpanded(false)}
                  className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                  No, regresar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botón pagar si tiene cobro pendiente */}
      {cita.cobroPendiente && (
        <button onClick={() => onPagar(cita)}
          className="w-full mt-3 py-2 bg-teal-600 text-white text-xs font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          💳 Pagar consulta — ${cita.montoPendiente?.toLocaleString('es-MX')} MXN
        </button>
      )}
    </div>
  )
}

// ── Tabs del portal ───────────────────────────────────────
const TABS = ['Mis citas', 'Mis documentos', 'Mis medicamentos', 'Pagos', 'Mis facturas', 'Solicitar cita']

// ── Componente principal ──────────────────────────────────
export default function PortalPaciente() {
  const { user, paciente, tenantId, tenant, loading } = usePacientePortal()
  const [tab, setTab]           = useState('Mis citas')
  const [citas, setCitas]       = useState([])
  const [docs,  setDocs]        = useState([])
  const [meds,  setMeds]        = useState([])
  const [cobros, setCobros]     = useState([])
  const [facturas, setFacturas] = useState([])
  const [docViewer, setDocViewer] = useState(null)
  const [formCita, setFormCita] = useState({ fechaHora: '', motivo: '' })
  const [savingCita, setSavingCita] = useState(false)

  // Pago en línea
  const [modalPago, setModalPago] = useState(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')

  useEffect(() => {
    if (!tenantId || !paciente) return

    // Citas — buscar por pacienteId con fallback
    const q = query(
      collection(db, `tenants/${tenantId}/citas`),
      where('pacienteId', '==', paciente.id),
      orderBy('fecha', 'desc')
    )
    const unsubCitas = onSnapshot(q,
      snap => {
        const found = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setCitas(found)
        // Fallback por pacienteIdLegible si no hay resultados
        if (found.length === 0 && paciente.pacienteId) {
          getDocs(query(
            collection(db, `tenants/${tenantId}/citas`),
            where('pacienteIdLegible', '==', paciente.pacienteId)
          )).then(s2 => {
            if (!s2.empty) setCitas(s2.docs.map(d => ({ id: d.id, ...d.data() })))
          }).catch(() => {})
        }
      },
      err => {
        console.error('Citas error:', err)
        // Fallback sin orderBy
        getDocs(query(
          collection(db, `tenants/${tenantId}/citas`),
          where('pacienteId', '==', paciente.id)
        )).then(s => setCitas(s.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => {})
      }
    )

    const unsubDocs = onSnapshot(
      query(collection(db, `tenants/${tenantId}/pacientes/${paciente.id}/documentos`),
            orderBy('fecha', 'desc')),
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    const unsubMeds = onSnapshot(
      collection(db, `tenants/${tenantId}/pacientes/${paciente.id}/medicamentos`),
      snap => setMeds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    // Cobros del paciente
    const unsubCobros = onSnapshot(
      query(collection(db, `tenants/${tenantId}/cobros`),
            where('pacienteId', '==', paciente.id),
            orderBy('fechaPago', 'desc')),
      snap => setCobros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    // Facturas del paciente
    const unsubFacturas = onSnapshot(
      query(collection(db, `tenants/${tenantId}/facturas`),
            where('pacienteId', '==', paciente.id),
            orderBy('fecha', 'desc')),
      snap => setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    return () => {
      unsubCitas(); unsubDocs(); unsubMeds()
      unsubCobros(); unsubFacturas()
    }
  }, [tenantId, paciente])

  const solicitarCita = async () => {
    if (!formCita.fechaHora) { toast.error('Selecciona fecha y hora'); return }
    setSavingCita(true)
    try {
      await addDoc(collection(db, `tenants/${tenantId}/citas`), {
        pacienteId:          paciente.id,
        pacienteIdLegible:   paciente.pacienteId ?? null,
        pacienteNombre:      `${paciente.nombre ?? ''} ${paciente.apellidos ?? ''}`.trim(),
        pacienteTel:         paciente.telefono ?? null,
        fecha:               Timestamp.fromDate(new Date(formCita.fechaHora)),
        motivo:              formCita.motivo ?? '',
        duracionMin:         30,
        tenantId,
        estatus:             'programada',
        solicitadaOnline:    true,
        recordatorioEnviado: false,
        historial: [{
          accion: 'creada',
          fecha: Timestamp.now(),
          nota: 'Solicitada por el paciente desde el portal',
        }],
        creadoEn: Timestamp.now(),
      })
      toast.success('Cita solicitada ✓ El consultorio confirmará pronto.')
      setFormCita({ fechaHora: '', motivo: '' })
      setTab('Mis citas')
    } catch(e) {
      console.error(e); toast.error('Error al solicitar cita')
    } finally { setSavingCita(false) }
  }

  const pagarCobro = async (cobro, metodo) => {
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/cobros/${cobro.id}`), {
        estadoPago: 'paid',
        metodoPago: metodo,
        fechaPagoOnline: Timestamp.now(),
      })
      toast.success('Pago registrado ✓')
      setModalPago(null)
    } catch(e) {
      toast.error('Error al registrar pago')
    }
  }

  const fmtFecha = (f) => {
    try {
      const d = f?.toDate ? f.toDate() : f?.seconds ? new Date(f.seconds*1000) : new Date(f)
      return format(d, "d 'de' MMMM yyyy", { locale: es })
    } catch { return '—' }
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
        <a href="/login"
          className="block w-full px-6 py-3 bg-teal-600 text-white rounded-xl
                     text-sm font-medium hover:bg-teal-700 transition-colors">
          Iniciar sesión
        </a>
      </div>
    </div>
  )

  if (!paciente) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl text-center">
        <p className="text-4xl mb-3">🔍</p>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Perfil no encontrado</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tu email no está registrado como paciente.<br/>
          Contacta al consultorio para que te registren.
        </p>
        <button onClick={() => signOut(auth)}
          className="text-sm text-teal-600 hover:underline">
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  const proximas = citas.filter(c =>
    !['cancelada','no_show'].includes(c.estatus) &&
    c.fecha?.toDate && isFuture(c.fecha.toDate())
  )
  const cobrosPendientes = cobros.filter(c => c.estadoPago !== 'paid')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">MediDesk</h1>
            <p className="text-xs text-slate-400">
              {tenant?.nombre ?? 'Portal del paciente'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{paciente.nombre} {paciente.apellidos}</p>
              <p className="text-xs text-slate-400 font-mono">{paciente.pacienteId}</p>
            </div>
            <button onClick={() => signOut(auth)}
              className="text-xs text-slate-400 hover:text-white border border-slate-600
                         px-3 py-1.5 rounded-lg transition-colors">
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* Alerta de alergias */}
      {paciente.alergias && paciente.alergias !== 'Ninguna' && paciente.alergias !== '' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-xs text-red-700 text-center max-w-2xl mx-auto">
            ⚠️ <strong>Alergias:</strong> {paciente.alergias}
          </p>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* Tarjeta de resumen */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center
                            justify-center text-teal-700 font-bold text-lg flex-shrink-0">
              {paciente.nombre?.[0]}{paciente.apellidos?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-800 truncate">
                {paciente.nombre} {paciente.apellidos}
              </h2>
              <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                {paciente.telefono && <span>📱 {paciente.telefono}</span>}
                {paciente.grupoSanguineo && (
                  <span className="text-red-500 font-semibold">
                    🩸 {paciente.grupoSanguineo}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-100">
            {[
              { v: proximas.length,                    l: 'Citas\npróximas',  c: 'text-teal-600' },
              { v: docs.length,                         l: 'Documentos',       c: 'text-gray-700' },
              { v: meds.filter(m=>m.activo).length,     l: 'Medicamentos',     c: 'text-green-600' },
              { v: cobrosPendientes.length,              l: 'Pagos\npendientes',c: 'text-amber-500' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className={`text-xl font-bold ${item.c}`}>{item.v}</p>
                <p className="text-xs text-gray-400 whitespace-pre-line">{item.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Próxima cita destacada */}
        {proximas[0] && (() => {
          const f = proximas[0].fecha?.toDate ? proximas[0].fecha.toDate()
            : new Date(proximas[0].fecha?.seconds*1000)
          return (
            <div className="bg-teal-600 text-white rounded-2xl p-4 mb-4">
              <p className="text-xs text-teal-200 mb-0.5">Próxima cita</p>
              <p className="font-semibold">
                {format(f, "EEEE d 'de' MMMM", {locale:es})}
              </p>
              <p className="text-teal-100 text-sm">
                {format(f, 'HH:mm')} hrs
                {proximas[0].motivo ? ` — ${proximas[0].motivo}` : ''}
              </p>
            </div>
          )
        })()}

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-0 border-b border-gray-200 mb-4 -mx-4 px-4">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2
                          transition-colors flex-shrink-0
                ${tab === t
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
              {t === 'Pagos' && cobrosPendientes.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs rounded-full
                                 px-1.5 py-0.5">{cobrosPendientes.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Mis citas ─────────────────────────────── */}
        {tab === 'Mis citas' && (
          <div className="space-y-3">
            {citas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm">Sin citas registradas</p>
                <button onClick={() => setTab('Solicitar cita')}
                  className="mt-3 text-teal-600 text-sm hover:underline">
                  Solicitar una cita →
                </button>
              </div>
            ) : (
              citas.map(c => (
                <TarjetaCita key={c.id} cita={c} tenantId={tenantId}
                  onPagar={(cita) => setModalPago(cita)} />
              ))
            )}
          </div>
        )}

        {/* ── Tab: Mis documentos ────────────────────────── */}
        {tab === 'Mis documentos' && (
          <div className="space-y-2">
            {docs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📁</p>
                <p className="text-sm">Sin documentos disponibles</p>
              </div>
            ) : docs.map(d => (
              <button key={d.id} onClick={() => setDocViewer(d)}
                className="w-full bg-white rounded-xl border border-gray-200 p-4
                           text-left hover:border-teal-300 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">
                    {d.ext === 'pdf' ? '📄' : '🖼'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{d.nombre}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(d.fecha)}</p>
                  </div>
                  <span className="text-teal-500 text-xs">Ver →</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Tab: Mis medicamentos ──────────────────────── */}
        {tab === 'Mis medicamentos' && (
          <div className="space-y-3">
            {meds.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">💊</p>
                <p className="text-sm">Sin medicamentos registrados</p>
              </div>
            ) : meds.filter(m => m.activo).map(m => (
              <div key={m.id} className="bg-white rounded-xl border border-green-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-800">{m.nombre}</p>
                    <p className="text-sm text-gray-600">{m.dosis} — {m.frecuencia}</p>
                    {m.indicadoPor && (
                      <p className="text-xs text-gray-400 mt-1">Dr. {m.indicadoPor}</p>
                    )}
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5
                                   rounded-full border border-green-200">
                    Activo
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Pagos ─────────────────────────────────── */}
        {tab === 'Pagos' && (
          <div className="space-y-3">
            {cobros.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">💳</p>
                <p className="text-sm">Sin cobros registrados</p>
              </div>
            ) : cobros.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{c.concepto}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(c.fechaPago)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">
                      ${Number(c.monto ?? 0).toLocaleString('es-MX')}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${c.estadoPago === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'}`}>
                      {c.estadoPago === 'paid' ? '✓ Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>

                {c.estadoPago !== 'paid' && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">Pagar con:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ['efectivo', '💵', 'Efectivo'],
                        ['tarjeta',  '💳', 'Tarjeta'],
                        ['transferencia', '🏦', 'Transferencia'],
                      ].map(([m, icon, label]) => (
                        <button key={m}
                          onClick={() => pagarCobro(c, m)}
                          className="py-2 text-xs bg-gray-50 border border-gray-200
                                     rounded-lg hover:border-teal-400 hover:bg-teal-50
                                     transition-colors text-center">
                          <div>{icon}</div>
                          <div className="text-gray-600 mt-0.5">{label}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Para pago con tarjeta en línea, el consultorio te enviará un link seguro.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Mis facturas ──────────────────────────── */}
        {tab === 'Mis facturas' && (
          <div className="space-y-3">
            {facturas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">🧾</p>
                <p className="text-sm">Sin facturas emitidas</p>
                <p className="text-xs mt-1">
                  Solicita tu CFDI al consultorio después de tu consulta
                </p>
              </div>
            ) : facturas.map(f => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-gray-400">
                      {f.serie}{f.folio}
                    </p>
                    <p className="font-medium text-gray-800 mt-0.5">{f.concepto}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(f.fecha)}</p>
                    {f.uuid && (
                      <p className="text-xs text-gray-300 font-mono mt-0.5 truncate">
                        UUID: {f.uuid}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-bold text-gray-800">
                      ${Number(f.total ?? 0).toLocaleString('es-MX')}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                      ${f.estatus === 'valid'
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-red-100 text-red-600 border-red-200'}`}>
                      {f.estatus === 'valid' ? 'Vigente' : 'Cancelada'}
                    </span>
                  </div>
                </div>

                {/* Botones de descarga */}
                {f.estatus === 'valid' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    {f.pdfUrl && (
                      <a href={f.pdfUrl} target="_blank" rel="noreferrer"
                        className="flex-1 py-2 bg-teal-50 text-teal-700 text-xs font-medium
                                   rounded-lg hover:bg-teal-100 text-center border border-teal-200
                                   transition-colors">
                        📄 Descargar PDF
                      </a>
                    )}
                    {f.xmlUrl && (
                      <a href={f.xmlUrl} target="_blank" rel="noreferrer"
                        className="flex-1 py-2 bg-blue-50 text-blue-700 text-xs font-medium
                                   rounded-lg hover:bg-blue-100 text-center border border-blue-200
                                   transition-colors">
                        📎 Descargar XML
                      </a>
                    )}
                    {!f.pdfUrl && !f.xmlUrl && (
                      <p className="text-xs text-gray-400">
                        Archivos procesándose...
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Solicitar cita ────────────────────────── */}
        {tab === 'Solicitar cita' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Solicitar nueva cita</h3>
            <p className="text-xs text-gray-400 mb-4">
              {tenant?.nombre} — El consultorio confirmará tu solicitud.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Fecha y hora de preferencia *
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
                {savingCita ? 'Enviando...' : 'Solicitar cita'}
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
              <p className="font-medium text-gray-800 text-sm truncate">{docViewer.nombre}</p>
              <div className="flex gap-2 ml-2">
                <a href={docViewer.url} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg whitespace-nowrap">
                  Descargar
                </a>
                <button onClick={() => setDocViewer(null)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              {['jpg','jpeg','png','webp'].includes(docViewer.ext) ? (
                <img src={docViewer.url} alt={docViewer.nombre}
                  className="w-full h-full object-contain p-4" />
              ) : docViewer.ext === 'pdf' ? (
                <iframe src={docViewer.url} className="w-full border-0"
                  title={docViewer.nombre} style={{ height: 400 }} />
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  <a href={docViewer.url} target="_blank" rel="noreferrer"
                    className="text-teal-600 hover:underline text-sm">
                    Descargar archivo →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
