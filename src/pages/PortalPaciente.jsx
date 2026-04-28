import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy,
  onSnapshot, addDoc, updateDoc, doc,
  getDocs, Timestamp, arrayUnion, getDoc
} from 'firebase/firestore'
import { signOut, onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { auth, db } from '../firebase'
import { format, isFuture, differenceInHours, addMinutes } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ── Estatus del turno ─────────────────────────────────────
const TURNO_ESTADOS = [
  { key: 'programada',  label: 'Programada',       icon: '📅', color: 'bg-gray-100 text-gray-500' },
  { key: 'confirmada',  label: 'Confirmada',        icon: '✅', color: 'bg-blue-100 text-blue-700' },
  { key: 'en_camino',   label: 'En camino',         icon: '🚗', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'en_sala',     label: 'En sala de espera', icon: '🪑', color: 'bg-orange-100 text-orange-700' },
  { key: 'por_pasar',   label: 'Por pasar',         icon: '🔔', color: 'bg-purple-100 text-purple-700' },
  { key: 'completada',  label: 'En consulta',       icon: '🩺', color: 'bg-teal-100 text-teal-700' },
  { key: 'finalizada',  label: 'Finalizada',        icon: '🎉', color: 'bg-green-100 text-green-700' },
  { key: 'cancelada',   label: 'Cancelada',         icon: '❌', color: 'bg-red-100 text-red-600' },
]
const TURNO_ORDER = ['programada','confirmada','en_camino','en_sala','por_pasar','completada']
const getEstado = (estatus) => TURNO_ESTADOS.find(e => e.key === estatus) ?? TURNO_ESTADOS[0]

// ── Hook del portal ───────────────────────────────────────
function usePacientePortal() {
  const [state, setState] = useState({
    user: null, paciente: null, tenantId: null, tenant: null, loading: true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setState(s => ({ ...s, user: null, loading: false })); return }
      try {
        const token = await getIdTokenResult(user, true)
        const tenantId = token.claims.tenantId ?? null
        if (!tenantId) { setState(s => ({ ...s, user, loading: false })); return }

        const tenantSnap = await getDoc(doc(db, `tenants/${tenantId}`))
        const tenant = tenantSnap.exists() ? { id: tenantSnap.id, ...tenantSnap.data() } : null

        const snap = await getDocs(query(
          collection(db, `tenants/${tenantId}/pacientes`),
          where('email', '==', user.email)
        ))
        if (snap.empty) { setState(s => ({ ...s, user, tenantId, tenant, loading: false })); return }
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

// ── Selector de cita amigable ─────────────────────────────
// Muestra calendario + slots de 30 min en lugar del input datetime-local
function SelectorCita({ value, onChange, tenantId }) {
  const [mes, setMes] = useState(new Date())
  const [diaSeleccionado, setDia] = useState(null)
  const [citasExistentes, setCitasExistentes] = useState([])

  // Generar slots de 30 min de 8am a 9pm
  const slots = []
  for (let h = 8; h < 21; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`)
    slots.push(`${String(h).padStart(2,'0')}:30`)
  }

  // Cargar citas del día seleccionado para mostrar disponibilidad
  useEffect(() => {
    if (!diaSeleccionado || !tenantId) return
    const inicio = new Date(diaSeleccionado)
    inicio.setHours(0,0,0,0)
    const fin = new Date(diaSeleccionado)
    fin.setHours(23,59,59,999)
    getDocs(query(
      collection(db, `tenants/${tenantId}/citas`),
      where('fecha', '>=', Timestamp.fromDate(inicio)),
      where('fecha', '<=', Timestamp.fromDate(fin))
    )).then(snap => {
      const activas = snap.docs
        .map(d => d.data())
        .filter(c => !['cancelada','no_show'].includes(c.estatus))
      setCitasExistentes(activas)
    })
  }, [diaSeleccionado, tenantId])

  // Contar pacientes en cada slot (máx 2 permitidos visualmente)
  const contarSlot = (slot) => {
    if (!diaSeleccionado) return 0
    const [h, m] = slot.split(':').map(Number)
    return citasExistentes.filter(c => {
      const f = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha?.seconds*1000)
      return f.getHours() === h && f.getMinutes() === m
    }).length
  }

  // Días del mes
  const diasDelMes = () => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
    const dias = []
    // Padding inicio
    for (let i = 0; i < inicio.getDay(); i++) dias.push(null)
    for (let d = 1; d <= fin.getDate(); d++) {
      dias.push(new Date(mes.getFullYear(), mes.getMonth(), d))
    }
    return dias
  }

  const seleccionarSlot = (slot) => {
    if (!diaSeleccionado) { toast.error('Primero selecciona un día'); return }
    const [h, m] = slot.split(':').map(Number)
    const fecha = new Date(diaSeleccionado)
    fecha.setHours(h, m, 0, 0)
    onChange(fecha.toISOString())
  }

  const hoy = new Date()
  hoy.setHours(0,0,0,0)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Cabecera del mes */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth()-1, 1))}
          className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold">
          ‹
        </button>
        <p className="font-medium text-gray-800 capitalize">
          {format(mes, "MMMM yyyy", { locale: es })}
        </p>
        <button onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth()+1, 1))}
          className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold">
          ›
        </button>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 text-center py-2 border-b border-gray-100">
        {['D','L','M','M','J','V','S'].map((d,i) => (
          <span key={i} className="text-xs text-gray-400 font-medium">{d}</span>
        ))}
      </div>

      {/* Calendario */}
      <div className="grid grid-cols-7 gap-1 p-3">
        {diasDelMes().map((dia, i) => {
          if (!dia) return <div key={i} />
          const esHoy = dia.toDateString() === new Date().toDateString()
          const esPasado = dia < hoy
          const esDomingo = dia.getDay() === 0
          const seleccionado = diaSeleccionado && dia.toDateString() === new Date(diaSeleccionado).toDateString()
          return (
            <button key={i}
              disabled={esPasado || esDomingo}
              onClick={() => { setDia(dia); onChange('') }}
              className={`aspect-square rounded-full text-sm flex items-center justify-center transition-all
                ${seleccionado ? 'bg-teal-600 text-white font-semibold' :
                  esHoy ? 'border-2 border-teal-400 text-teal-700 font-semibold' :
                  esPasado || esDomingo ? 'text-gray-200 cursor-not-allowed' :
                  'hover:bg-teal-50 text-gray-700 hover:text-teal-700'}`}>
              {dia.getDate()}
            </button>
          )
        })}
      </div>

      {/* Slots de horario */}
      {diaSeleccionado && (
        <div className="border-t border-gray-100 p-3">
          <p className="text-xs text-gray-500 mb-2 font-medium">
            Selecciona horario — {format(diaSeleccionado, "d 'de' MMMM", { locale: es })}
          </p>
          <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
            {slots.map(slot => {
              const count = contarSlot(slot)
              const lleno = count >= 2
              // Mostrar como "disponible" aunque haya 1 cita (no mostrar al paciente el empalme)
              const disponible = count < 2
              const slotDate = new Date(diaSeleccionado)
              const [h,m] = slot.split(':').map(Number)
              slotDate.setHours(h, m, 0, 0)
              const pasado = slotDate <= new Date()

              // Slot seleccionado actualmente
              const seleccionadoActual = value && (() => {
                const v = new Date(value)
                return v.getHours() === h && v.getMinutes() === m
              })()

              return (
                <button key={slot}
                  disabled={lleno || pasado}
                  onClick={() => seleccionarSlot(slot)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all border
                    ${seleccionadoActual ? 'bg-teal-600 text-white border-teal-600' :
                      lleno || pasado ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' :
                      'bg-white text-gray-700 border-gray-200 hover:border-teal-400 hover:bg-teal-50'}`}>
                  {slot}
                </button>
              )
            })}
          </div>
          {value && (
            <div className="mt-2 p-2 bg-teal-50 rounded-lg border border-teal-200">
              <p className="text-xs text-teal-700 font-medium text-center">
                ✓ {format(new Date(value), "EEEE d 'de' MMMM · HH:mm", { locale: es })} hrs
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">Estado de tu cita</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estado.color}`}>
          {estado.icon} {estado.label}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {TURNO_ORDER.map((key, i) => (
          <div key={key} className={`flex-1 h-1.5 rounded-full transition-all
            ${i <= idx ? 'bg-teal-500' : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1.5 text-center">{estado.desc ?? estado.label}</p>
    </div>
  )
}

// ── Tarjeta de cita ───────────────────────────────────────
function TarjetaCita({ cita, tenantId }) {
  const [expanded, setExpanded] = useState(false)
  const estado = getEstado(cita.estatus)

  const fechaStr = (() => {
    try {
      const f = cita.fecha?.toDate ? cita.fecha.toDate()
        : cita.fecha?.seconds ? new Date(cita.fecha.seconds*1000) : null
      if (!f) return '—'
      return format(f, "EEEE d 'de' MMMM · HH:mm", { locale: es })
    } catch { return '—' }
  })()

  const esFutura = (() => {
    try {
      const f = cita.fecha?.toDate ? cita.fecha.toDate()
        : new Date(cita.fecha?.seconds*1000)
      return isFuture(f)
    } catch { return false }
  })()

  const esHoy = (() => {
    try {
      const f = cita.fecha?.toDate ? cita.fecha.toDate()
        : new Date(cita.fecha?.seconds*1000)
      return format(f, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
    } catch { return false }
  })()

  // Verificar si es dentro de 24h para mostrar reminder
  const esEnMenos24h = (() => {
    try {
      const f = cita.fecha?.toDate ? cita.fecha.toDate()
        : new Date(cita.fecha?.seconds*1000)
      const horas = differenceInHours(f, new Date())
      return horas > 0 && horas <= 24
    } catch { return false }
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
      toast.success(`${getEstado(nuevoEstatus).icon} ${getEstado(nuevoEstatus).label}`)
    } catch { toast.error('Error al actualizar') }
  }

  return (
    <div className={`bg-white rounded-2xl border p-4 transition-all
      ${esHoy ? 'border-teal-300 ring-1 ring-teal-100' : 'border-gray-200'}
      ${esEnMenos24h && cita.estatus === 'programada' ? 'border-amber-300 ring-1 ring-amber-100' : ''}`}>

      {/* Banner recordatorio 24h */}
      {esEnMenos24h && cita.estatus === 'programada' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-start gap-2">
          <span className="text-lg">⏰</span>
          <div>
            <p className="text-xs font-semibold text-amber-800">Recordatorio — tu cita es mañana</p>
            <p className="text-xs text-amber-700 mt-0.5">No olvides confirmar tu asistencia.</p>
          </div>
        </div>
      )}

      {esHoy && <div className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-1 rounded-lg mb-2 inline-block">📅 Hoy</div>}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 text-sm">{fechaStr} hrs</p>
          {cita.motivo && <p className="text-xs text-gray-500 mt-0.5 truncate">{cita.motivo}</p>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${estado.color}`}>
          {estado.icon} {estado.label}
        </span>
      </div>

      {/* Barra de turno para citas de hoy */}
      {esHoy && !['cancelada','no_show','finalizada'].includes(cita.estatus) && (
        <div className="mt-3"><BarraTurno estatus={cita.estatus} /></div>
      )}

      {/* Acciones */}
      {(esFutura || esHoy) && !['cancelada','completada','finalizada','no_show'].includes(cita.estatus) && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex gap-2 flex-wrap">
            {cita.estatus === 'programada' && (
              <button onClick={() => actualizarEstatus('confirmada')}
                className="flex-1 py-2 bg-green-600 text-white text-xs font-medium rounded-xl hover:bg-green-700 transition-colors">
                ✓ Confirmar asistencia
              </button>
            )}
            {['programada','confirmada'].includes(cita.estatus) && (
              <button onClick={() => actualizarEstatus('en_camino')}
                className="py-2 px-3 bg-yellow-50 text-yellow-700 text-xs font-medium rounded-xl hover:bg-yellow-100 border border-yellow-200">
                🚗 Voy en camino
              </button>
            )}
            {['confirmada','en_camino'].includes(cita.estatus) && (
              <button onClick={() => actualizarEstatus('en_sala')}
                className="py-2 px-3 bg-orange-50 text-orange-700 text-xs font-medium rounded-xl hover:bg-orange-100 border border-orange-200">
                🪑 Ya llegué
              </button>
            )}
            <button onClick={() => setExpanded(!expanded)}
              className="py-2 px-3 bg-red-50 text-red-500 text-xs rounded-xl hover:bg-red-100 border border-red-100">
              Cancelar
            </button>
          </div>
          {expanded && (
            <div className="mt-2 p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs text-red-700 mb-2">¿Confirmas que deseas cancelar?</p>
              <div className="flex gap-2">
                <button onClick={() => { actualizarEstatus('cancelada'); setExpanded(false) }}
                  className="flex-1 py-1.5 bg-red-600 text-white text-xs rounded-lg font-medium">
                  Sí, cancelar
                </button>
                <button onClick={() => setExpanded(false)}
                  className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg">
                  No, regresar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TABS = ['Mis citas', 'Mis documentos', 'Mis medicamentos', 'Pagos', 'Mis facturas', 'Solicitar cita']

export default function PortalPaciente() {
  const { user, paciente, tenantId, tenant, loading } = usePacientePortal()
  const [tab, setTab]           = useState('Mis citas')
  const [citas, setCitas]       = useState([])
  const [docs,  setDocs]        = useState([])
  const [meds,  setMeds]        = useState([])
  const [cobros, setCobros]     = useState([])
  const [facturas, setFacturas] = useState([])
  const [docViewer, setDocViewer] = useState(null)

  // Form nueva cita
  const [fechaSeleccionada, setFecha] = useState('')
  const [motivo, setMotivo]           = useState('')
  const [savingCita, setSavingCita]   = useState(false)

  useEffect(() => {
    if (!tenantId || !paciente) return

    // Citas — realtime con fallback
    const q = query(
      collection(db, `tenants/${tenantId}/citas`),
      where('pacienteId', '==', paciente.id),
      orderBy('fecha', 'desc')
    )
    const unsubCitas = onSnapshot(q,
      snap => {
        const found = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Actualizar inmediatamente — sin necesidad de refresh
        setCitas(found)
        if (found.length === 0 && paciente.pacienteId) {
          getDocs(query(
            collection(db, `tenants/${tenantId}/citas`),
            where('pacienteIdLegible', '==', paciente.pacienteId)
          )).then(s2 => {
            if (!s2.empty) setCitas(s2.docs.map(d => ({ id: d.id, ...d.data() })))
          }).catch(() => {})
        }
      },
      () => {
        getDocs(query(
          collection(db, `tenants/${tenantId}/citas`),
          where('pacienteId', '==', paciente.id)
        )).then(s => setCitas(s.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => {})
      }
    )

    const unsubDocs = onSnapshot(
      query(collection(db, `tenants/${tenantId}/pacientes/${paciente.id}/documentos`),
            orderBy('fecha','desc')),
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubMeds = onSnapshot(
      collection(db, `tenants/${tenantId}/pacientes/${paciente.id}/medicamentos`),
      snap => setMeds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubCobros = onSnapshot(
      query(collection(db, `tenants/${tenantId}/cobros`),
            where('pacienteId', '==', paciente.id),
            orderBy('fechaPago','desc')),
      snap => setCobros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubFacturas = onSnapshot(
      query(collection(db, `tenants/${tenantId}/facturas`),
            where('pacienteId', '==', paciente.id),
            orderBy('fecha','desc')),
      snap => setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    return () => { unsubCitas(); unsubDocs(); unsubMeds(); unsubCobros(); unsubFacturas() }
  }, [tenantId, paciente])

  const solicitarCita = async () => {
    if (!fechaSeleccionada) { toast.error('Selecciona fecha y hora'); return }
    setSavingCita(true)
    try {
      await addDoc(collection(db, `tenants/${tenantId}/citas`), {
        pacienteId:          paciente.id,
        pacienteIdLegible:   paciente.pacienteId ?? null,
        pacienteNombre:      `${paciente.nombre ?? ''} ${paciente.apellidos ?? ''}`.trim(),
        pacienteTel:         paciente.telefono ?? null,
        fecha:               Timestamp.fromDate(new Date(fechaSeleccionada)),
        motivo:              motivo ?? '',
        duracionMin:         30,
        tenantId,
        estatus:             'programada',
        solicitadaOnline:    true,
        recordatorioEnviado: false,
        historial: [{
          accion: 'creada',
          fecha: Timestamp.now(),
          nota: 'Solicitada desde el portal del paciente',
        }],
        creadoEn: Timestamp.now(),
      })
      toast.success('✓ Cita solicitada — el consultorio confirmará pronto')
      setFecha('')
      setMotivo('')
      // Cambiar a tab de citas inmediatamente — ya aparecerá via onSnapshot
      setTab('Mis citas')
    } catch(e) {
      console.error(e)
      toast.error('Error al solicitar cita')
    } finally { setSavingCita(false) }
  }

  const pagarCobro = async (cobro, metodo) => {
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/cobros/${cobro.id}`), {
        estadoPago: 'paid', metodoPago: metodo, fechaPagoOnline: Timestamp.now(),
      })
      toast.success('Pago registrado ✓')
    } catch { toast.error('Error al registrar pago') }
  }

  const fmtFecha = (f) => {
    try {
      const d = f?.toDate ? f.toDate() : f?.seconds ? new Date(f.seconds*1000) : new Date(f)
      return format(d, "d 'de' MMMM yyyy", { locale: es })
    } catch { return '—' }
  }

  // ── Loading / no user / no paciente ──────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">MediDesk</h1>
        <p className="text-sm text-gray-500 mb-6">Portal del paciente</p>
        <a href="/login"
          className="block w-full px-6 py-3 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700">
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
          Tu email no está registrado. Contacta al consultorio.
        </p>
        <button onClick={() => signOut(auth)} className="text-sm text-teal-600 hover:underline">
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
    <div className="min-h-screen bg-gray-50 max-w-2xl mx-auto">

      {/* Header — sticky */}
      <div className="bg-slate-900 text-white px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold leading-tight">MediDesk</h1>
            <p className="text-xs text-slate-400 leading-tight truncate max-w-[140px]">
              {tenant?.nombre ?? 'Portal del paciente'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs font-medium leading-tight">
                {paciente.nombre} {paciente.apellidos}
              </p>
              <p className="text-xs text-slate-400 font-mono leading-tight">
                {paciente.pacienteId}
              </p>
            </div>
            <button onClick={() => signOut(auth)}
              className="text-xs text-slate-400 hover:text-white border border-slate-600 px-2 py-1 rounded-lg">
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* Alerta alergias */}
      {paciente.alergias && paciente.alergias !== 'Ninguna' && paciente.alergias !== '' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-xs text-red-700 text-center">
            ⚠️ <strong>Alergias:</strong> {paciente.alergias}
          </p>
        </div>
      )}

      <div className="px-4 py-4">

        {/* Tarjeta resumen */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-teal-100 flex items-center justify-center
                            text-teal-700 font-bold text-base flex-shrink-0">
              {paciente.nombre?.[0]}{paciente.apellidos?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-800 text-sm truncate">
                {paciente.nombre} {paciente.apellidos}
              </h2>
              <div className="flex flex-wrap gap-2 mt-0.5">
                {paciente.telefono && <span className="text-xs text-gray-500">📱 {paciente.telefono}</span>}
                {paciente.grupoSanguineo && (
                  <span className="text-xs text-red-500 font-semibold">🩸 {paciente.grupoSanguineo}</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-100">
            {[
              { v: proximas.length,             l: 'Citas',        c: 'text-teal-600' },
              { v: docs.length,                  l: 'Documentos',   c: 'text-gray-700' },
              { v: meds.filter(m=>m.activo).length, l: 'Medicamentos', c: 'text-green-600' },
              { v: cobrosPendientes.length,      l: 'Pagos',        c: 'text-amber-500' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className={`text-lg font-bold ${item.c}`}>{item.v}</p>
                <p className="text-xs text-gray-400 leading-tight">{item.l}</p>
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
              <p className="font-semibold text-sm">
                {format(f, "EEEE d 'de' MMMM", {locale:es})}
              </p>
              <p className="text-teal-100 text-xs">
                {format(f, 'HH:mm')} hrs
                {proximas[0].motivo ? ` — ${proximas[0].motivo}` : ''}
              </p>
            </div>
          )
        })()}

        {/* Tabs — scroll horizontal en móvil */}
        <div className="flex overflow-x-auto gap-0 border-b border-gray-200 mb-4 -mx-4 px-4
                        scrollbar-none" style={{scrollbarWidth:'none'}}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2
                          transition-colors flex-shrink-0
                ${tab === t
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500'}`}>
              {t}
              {t === 'Pagos' && cobrosPendientes.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5">
                  {cobrosPendientes.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Mis citas ─────────────────────────────────── */}
        {tab === 'Mis citas' && (
          <div className="space-y-3">
            {citas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm">Sin citas registradas</p>
                <button onClick={() => setTab('Solicitar cita')}
                  className="mt-2 text-teal-600 text-sm hover:underline">
                  Solicitar una cita →
                </button>
              </div>
            ) : citas.map(c => (
              <TarjetaCita key={c.id} cita={c} tenantId={tenantId} />
            ))}
          </div>
        )}

        {/* ── Mis documentos ────────────────────────────── */}
        {tab === 'Mis documentos' && (
          <div className="space-y-2">
            {docs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📁</p>
                <p className="text-sm">Sin documentos disponibles</p>
              </div>
            ) : docs.map(d => (
              <button key={d.id} onClick={() => setDocViewer(d)}
                className="w-full bg-white rounded-xl border border-gray-200 p-3 text-left
                           hover:border-teal-300 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">
                    {d.ext === 'pdf' ? '📄' : '🖼'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{d.nombre}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(d.fecha)}</p>
                  </div>
                  <span className="text-teal-500 text-xs flex-shrink-0">Ver →</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Mis medicamentos ──────────────────────────── */}
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
                    <p className="font-semibold text-gray-800 text-sm">{m.nombre}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{m.dosis} — {m.frecuencia}</p>
                    {m.indicadoPor && <p className="text-xs text-gray-400 mt-0.5">Dr. {m.indicadoPor}</p>}
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Activo</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pagos ─────────────────────────────────────── */}
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
                    <p className="font-medium text-gray-800 text-sm">{c.concepto}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(c.fechaPago)}</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-bold text-gray-800 text-sm">
                      ${Number(c.monto ?? 0).toLocaleString('es-MX')}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${c.estadoPago === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {c.estadoPago === 'paid' ? '✓ Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
                {c.estadoPago !== 'paid' && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">Pagar con:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[['efectivo','💵','Efectivo'],['tarjeta','💳','Tarjeta'],['transferencia','🏦','Transfer']].map(([m,ico,lbl]) => (
                        <button key={m} onClick={() => pagarCobro(c, m)}
                          className="py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition-colors text-center">
                          <div>{ico}</div><div className="text-gray-600 mt-0.5">{lbl}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Mis facturas ──────────────────────────────── */}
        {tab === 'Mis facturas' && (
          <div className="space-y-3">
            {facturas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">🧾</p>
                <p className="text-sm">Sin facturas emitidas</p>
              </div>
            ) : facturas.map(f => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-gray-400">{f.serie}{f.folio}</p>
                    <p className="font-medium text-gray-800 text-sm mt-0.5">{f.concepto}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(f.fecha)}</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-bold text-gray-800 text-sm">
                      ${Number(f.total ?? 0).toLocaleString('es-MX')}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                      ${f.estatus === 'valid' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-600 border-red-200'}`}>
                      {f.estatus === 'valid' ? 'Vigente' : 'Cancelada'}
                    </span>
                  </div>
                </div>
                {f.estatus === 'valid' && (f.pdfUrl || f.xmlUrl) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    {f.pdfUrl && (
                      <a href={f.pdfUrl} target="_blank" rel="noreferrer"
                        className="flex-1 py-2 bg-teal-50 text-teal-700 text-xs font-medium rounded-xl hover:bg-teal-100 text-center border border-teal-200">
                        📄 Descargar PDF
                      </a>
                    )}
                    {f.xmlUrl && (
                      <a href={f.xmlUrl} target="_blank" rel="noreferrer"
                        className="flex-1 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-xl hover:bg-blue-100 text-center border border-blue-200">
                        📎 Descargar XML
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Solicitar cita ────────────────────────────── */}
        {tab === 'Solicitar cita' && (
          <div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Solicitar nueva cita</h3>
              <p className="text-xs text-gray-400 mb-4">
                {tenant?.nombre} — El consultorio confirmará tu solicitud.
              </p>

              {/* Selector de cita amigable para móvil */}
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-2 font-medium">
                  Fecha y hora de preferencia *
                </label>
                <SelectorCita
                  value={fechaSeleccionada}
                  onChange={setFecha}
                  tenantId={tenantId}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Motivo de la consulta
                </label>
                <textarea value={motivo} rows={3}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Describe brevemente el motivo de tu visita..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>

              <button onClick={solicitarCita} disabled={savingCita || !fechaSeleccionada}
                className="w-full bg-teal-600 text-white py-3 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {savingCita ? 'Enviando...' : '📅 Solicitar cita'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Visor de documento */}
      {docViewer && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-0"
          onClick={() => setDocViewer(null)}>
          <div className="bg-white rounded-t-2xl w-full max-h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <p className="font-medium text-gray-800 text-sm truncate">{docViewer.nombre}</p>
              <div className="flex gap-2 ml-2">
                <a href={docViewer.url} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg">
                  Descargar
                </a>
                <button onClick={() => setDocViewer(null)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden" style={{minHeight:300}}>
              {['jpg','jpeg','png','webp'].includes(docViewer.ext) ? (
                <img src={docViewer.url} alt={docViewer.nombre} className="w-full h-full object-contain p-4" />
              ) : docViewer.ext === 'pdf' ? (
                <iframe src={docViewer.url} className="w-full border-0" title={docViewer.nombre} style={{height:400}} />
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  <a href={docViewer.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline text-sm">
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
