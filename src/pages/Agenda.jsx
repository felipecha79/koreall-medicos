import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, Timestamp, getDocs, arrayUnion
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { notificarCambioEstatus } from '../services/notificaciones'
import toast from 'react-hot-toast'
import IAPreConsulta, { CampoPadecimientoCita } from '../components/IAPreConsulta'

// Slots de 30 minutos de 8am a 10pm
const HORAS = []
for (let h = 8; h <= 22; h++) {
  HORAS.push({ h, m: 0,  label: `${h}:00` })
  if (h < 22) HORAS.push({ h, m: 30, label: `${h}:30` })
}

const ESTATUS_COLOR = {
  programada:  'bg-blue-100 text-blue-800 border-blue-200',
  confirmada:  'bg-green-100 text-green-800 border-green-200',
  en_camino:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  en_sala:     'bg-orange-100 text-orange-800 border-orange-200',
  por_pasar:   'bg-purple-100 text-purple-700 border-purple-200',
  completada:  'bg-teal-100 text-teal-700 border-teal-200',
  finalizada:  'bg-green-100 text-green-700 border-green-200',
  cancelada:   'bg-red-100 text-red-700 border-red-200',
  no_show:     'bg-amber-100 text-amber-800 border-amber-200',
  reagendada:  'bg-gray-100 text-gray-500 border-gray-200',
}
const ESTATUS_LABEL = {
  programada: 'Programada',  confirmada: 'Confirmada',
  en_camino:  'En camino',   en_sala: 'En sala',
  por_pasar:  'Por pasar',   completada: 'En consulta',
  finalizada: 'Finalizada',  cancelada: 'Cancelada',
  no_show: 'No llegó',       reagendada: 'Reagendada',
}

// Buscador de pacientes
function BuscadorPaciente({ tenantId, onSelect, valorInicial = '' }) {
  const [texto, setTexto]     = useState(valorInicial)
  const [resultados, setRes]  = useState([])
  const [abierto, setAbierto] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const buscar = async (val) => {
    setTexto(val)
    if (val.length < 2) { setRes([]); return }
    const snap = await getDocs(collection(db, `tenants/${tenantId}/pacientes`))
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    setRes(todos.filter(p =>
      `${p.nombre} ${p.apellidos} ${p.pacienteId ?? ''}`.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 6))
    setAbierto(true)
  }

  const seleccionar = (p) => {
    setTexto(`${p.nombre} ${p.apellidos}`)
    setAbierto(false)
    onSelect(p)
  }

  return (
    <div className="relative" ref={ref}>
      <input type="text" value={texto} placeholder="Buscar paciente por nombre o ID..."
        onChange={e => buscar(e.target.value)}
        onFocus={() => texto.length >= 2 && setAbierto(true)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-400" />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border
                        border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {resultados.map(p => (
            <button key={p.id} onClick={() => seleccionar(p)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0">
              <span className="font-mono text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded mr-2">
                {p.pacienteId}
              </span>
              <span className="text-sm text-gray-800">{p.nombre} {p.apellidos}</span>
              {p.telefono && <span className="text-xs text-gray-400 ml-2">{p.telefono}</span>}
            </button>
          ))}
        </div>
      )}
      {abierto && resultados.length === 0 && texto.length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border
                        border-gray-200 rounded-lg shadow-lg mt-1 px-3 py-2 text-sm text-gray-400">
          No se encontró ningún paciente
        </div>
      )}
    </div>
  )
}

const FORM_INICIAL = {
  padecimientoPaciente: '',
  pacienteId: '', pacienteNombre: '', pacienteTel: '', pacienteIdLegible: '',
  fechaHora: '', motivo: '', duracionMin: 30,
}

export default function Agenda() {
  const { tenantId, tenant } = useTenant()
  const [semanaBase, setSemanaBase] = useState(new Date())
  const [citas, setCitas]           = useState([])
  const [modal, setModal]           = useState(null)
  const [form, setForm]             = useState(FORM_INICIAL)
  const [saving, setSaving]         = useState(false)
  const [modoDetalle, setModoDetalle] = useState('ver')
  const [vista, setVista] = useState('semana') // 'semana' | 'dia'
  const [diaActivo, setDiaActivo] = useState(new Date())
  const [nuevaFecha, setNuevaFecha]   = useState('')
  const [motivoCancelacion, setMotivoCancelacion] = useState('')

  const permitirTraslape = tenant?.permitirTraslape ?? true
  const MAX_POR_SLOT = 2 // máximo 2 pacientes por franja de 30 min

  const lunes = startOfWeek(semanaBase, { weekStartsOn: 1 })
  const dias  = Array.from({ length: 6 }, (_, i) => addDays(lunes, i))

  useEffect(() => {
    if (!tenantId) return
    const fin = addDays(lunes, 6)
    const q = query(
      collection(db, `tenants/${tenantId}/citas`),
      where('fecha', '>=', Timestamp.fromDate(lunes)),
      where('fecha', '<=', Timestamp.fromDate(fin)),
      orderBy('fecha')
    )
    return onSnapshot(q, snap =>
      setCitas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId, lunes.toISOString()])

  // Contar citas activas en un slot de 30 min
  const contarSlot = (dia, h, m) =>
    citas.filter(c => {
      if (['cancelada','completada','reagendada','finalizada'].includes(c.estatus)) return false
      const d = c.fecha.toDate()
      return isSameDay(d, dia) && d.getHours() === h && d.getMinutes() === m
    }).length

  const hayTraslape = (fechaHoraStr) => {
    const nueva = new Date(fechaHoraStr)
    return contarSlot(nueva, nueva.getHours(), nueva.getMinutes()) >= MAX_POR_SLOT
  }

  // Cambiar estatus + notificar WA
  const cambiarEstatus = async (citaId, estatus, citaData) => {
    const cita = citaData ?? citas.find(c => c.id === citaId)
    await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaId}`), {
      estatus,
      historial: arrayUnion({
        accion: estatus, fecha: Timestamp.now(),
        nota: `Marcada como: ${ESTATUS_LABEL[estatus]}`,
      }),
    })
    toast.success(`${ESTATUS_LABEL[estatus]} ✓`)

    // Notificar al paciente por WhatsApp
    if (cita) {
      notificarCambioEstatus({ cita, nuevoEstatus: estatus, tenant })
        .then(r => { if (r.ok) toast('📱 WA enviado al paciente', { icon: '✓', duration: 2000 }) })
        .catch(() => {}) // No romper si WA falla
    }

    setModal(null); setModoDetalle('ver')
  }

  const guardarCita = async () => {
    if (!form.pacienteId) { toast.error('Selecciona un paciente de la lista'); return }
    if (!form.fechaHora)  { toast.error('Selecciona fecha y hora'); return }

    // Verificar máximo 2 por slot
    if (hayTraslape(form.fechaHora)) {
      if (!permitirTraslape) {
        toast.error('Este horario ya tiene 2 pacientes agendados. Elige otro horario.')
        return
      }
      toast('⚠️ Ese horario ya tiene un paciente', { icon: '⚠️' })
    }

    setSaving(true)
    try {
      const fecha = Timestamp.fromDate(new Date(form.fechaHora))
      const nuevaCita = {
        pacienteId:          form.pacienteId,
        pacienteIdLegible:   form.pacienteIdLegible,
        pacienteNombre:      form.pacienteNombre,
        pacienteTel:         form.pacienteTel,
        fecha,
        motivo:              form.motivo,
        duracionMin:         form.duracionMin,
        tenantId,
        estatus:             'programada',
        recordatorioEnviado: false,
        historial: [{ accion: 'creada', fecha: Timestamp.now(), nota: 'Cita creada' }],
        creadoEn: Timestamp.now(),
      }
      await addDoc(collection(db, `tenants/${tenantId}/citas`), nuevaCita)
      toast.success('Cita guardada ✓')

      // WA de confirmación
      if (form.pacienteTel) {
        notificarCambioEstatus({
          cita: { ...nuevaCita, fecha: { toDate: () => new Date(form.fechaHora) } },
          nuevoEstatus: 'programada_nueva',
          tenant,
        }).catch(() => {})
      }

      setModal(null); setForm(FORM_INICIAL)
    } catch(e) {
      console.error(e); toast.error('Error al guardar la cita')
    } finally { setSaving(false) }
  }

  const reagendarCita = async (citaId) => {
    if (!nuevaFecha) { toast.error('Selecciona la nueva fecha y hora'); return }
    if (hayTraslape(nuevaFecha) && !permitirTraslape) {
      toast.error('Ese horario ya tiene 2 pacientes. Elige otro.'); return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaId}`), {
        fecha: Timestamp.fromDate(new Date(nuevaFecha)),
        estatus: 'programada',
        historial: arrayUnion({
          accion: 'reagendada', fecha: Timestamp.now(),
          nota: `Reagendada para: ${format(new Date(nuevaFecha), "d MMM yyyy · HH:mm", { locale: es })}`,
        }),
      })
      toast.success('Cita reagendada ✓')

      // Notificar
      if (modal?.pacienteTel) {
        notificarCambioEstatus({
          cita: { ...modal, fecha: { toDate: () => new Date(nuevaFecha) } },
          nuevoEstatus: 'confirmada',
          tenant,
        }).catch(() => {})
      }

      setModal(null); setModoDetalle('ver'); setNuevaFecha('')
    } catch(e) {
      toast.error('Error al reagendar')
    } finally { setSaving(false) }
  }

  const cancelarCita = async (citaId) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaId}`), {
        estatus: 'cancelada',
        historial: arrayUnion({
          accion: 'cancelada', fecha: Timestamp.now(),
          nota: motivoCancelacion || 'Cancelada sin motivo especificado',
        }),
      })
      toast.success('Cita cancelada')
      notificarCambioEstatus({ cita: modal, nuevoEstatus: 'cancelada', tenant }).catch(() => {})
      setModal(null); setModoDetalle('ver'); setMotivoCancelacion('')
    } catch { toast.error('Error al cancelar') }
    finally { setSaving(false) }
  }

  // Citas de un día y slot específico
  const citasDeDiaSlot = (dia, h, m) =>
    citas.filter(c => {
      const d = c.fecha.toDate()
      return isSameDay(d, dia) && d.getHours() === h && d.getMinutes() === m
    })

  const abrirNueva = (dia, h, m) => {
    const d = new Date(dia)
    d.setHours(h, m, 0, 0)
    // Usar hora LOCAL (no UTC) para evitar desfase de zona horaria
    const pad = n => String(n).padStart(2, '0')
    const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setForm({ ...FORM_INICIAL, fechaHora: local })
    setModal('nueva')
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => vista==='dia'
            ? setDiaActivo(d => addDays(d, -1))
            : setSemanaBase(d => addDays(d, -7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">‹</button>
          <h2 className="text-sm font-semibold text-gray-800 w-52 text-center">
            {vista==='dia'
              ? format(diaActivo, "EEEE d 'de' MMMM yyyy", { locale: es })
              : format(lunes, "d 'de' MMMM yyyy", { locale: es })}
          </h2>
          <button onClick={() => vista==='dia'
            ? setDiaActivo(d => addDays(d, 1))
            : setSemanaBase(d => addDays(d, 7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">›</button>
          <button onClick={() => { setSemanaBase(new Date()); setDiaActivo(new Date()) }}
            className="ml-1 text-xs px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600">
            Hoy
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-2 flex-wrap">
            {Object.entries(ESTATUS_COLOR).slice(0,6).map(([k, v]) => (
              <span key={k} className={`text-xs px-2 py-0.5 rounded border ${v}`}>
                {ESTATUS_LABEL[k]}
              </span>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mr-1">
            <button onClick={() => setVista('dia')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${vista==='dia' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              Día
            </button>
            <button onClick={() => setVista('semana')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200
                ${vista==='semana' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              Semana
            </button>
          </div>
          <button onClick={() => { setForm(FORM_INICIAL); setModal('nueva') }}
            className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
            + Nueva cita
          </button>
        </div>
      </div>

      {/* Vista día */}
      {vista === 'dia' && (
        <div className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto p-4">
            {/* Resumen del día */}
            {(() => {
              const citasDelDia = citas.filter(c => isSameDay(c.fecha.toDate(), diaActivo))
              const activas = citasDelDia.filter(c => !['cancelada','no_show'].includes(c.estatus))
              return (
                <div>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { l:'Total', v: citasDelDia.length, c:'bg-blue-50 text-blue-700' },
                      { l:'Confirmadas', v: citasDelDia.filter(c=>c.estatus==='confirmada').length, c:'bg-green-50 text-green-700' },
                      { l:'Pendientes', v: citasDelDia.filter(c=>c.estatus==='programada').length, c:'bg-amber-50 text-amber-700' },
                      { l:'Finalizadas', v: citasDelDia.filter(c=>c.estatus==='finalizada').length, c:'bg-gray-50 text-gray-600' },
                    ].map((item,i) => (
                      <div key={i} className={`rounded-xl p-3 text-center ${item.c}`}>
                        <p className="text-xl font-bold">{item.v}</p>
                        <p className="text-xs mt-0.5">{item.l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {HORAS.map(({h, m, label}) => {
                      const slotCitas = citasDelDia.filter(c => {
                        const d = c.fecha.toDate()
                        return d.getHours()===h && d.getMinutes()===m
                      })
                      if (slotCitas.length === 0) {
                        return (
                          <div key={`${h}-${m}`}
                            className={`flex items-center gap-3 cursor-pointer group
                              ${m===0 ? '' : 'opacity-40'}`}
                            onClick={() => abrirNueva(diaActivo, h, m)}>
                            <span className="text-xs text-gray-300 w-12 text-right flex-shrink-0 font-mono">
                              {m===0 ? label : ''}
                            </span>
                            <div className="flex-1 h-7 border border-dashed border-gray-100
                                            rounded-lg group-hover:border-teal-300 group-hover:bg-teal-50
                                            transition-colors flex items-center px-3">
                              <span className="text-xs text-gray-200 group-hover:text-teal-400">+ Agregar cita</span>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={`${h}-${m}`} className="flex items-start gap-3">
                          <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0 font-mono pt-2">
                            {label}
                          </span>
                          <div className="flex-1 space-y-1.5">
                            {slotCitas.map(c => (
                              <div key={c.id}
                                onClick={() => { setModal(c); setModoDetalle('ver') }}
                                className={`rounded-xl border p-3 cursor-pointer hover:shadow-md
                                  transition-all ${ESTATUS_COLOR[c.estatus]}`}>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{c.pacienteNombre}</p>
                                    <p className="text-xs opacity-70 font-mono">{c.pacienteIdLegible}</p>
                                    {c.motivo && <p className="text-xs opacity-70 mt-0.5 truncate">{c.motivo}</p>}
                                  </div>
                                  <div className="ml-2 flex flex-col items-end gap-1">
                                    <span className="text-xs font-medium">
                                      {ESTATUS_LABEL[c.estatus]}
                                    </span>
                                    {c.pacienteTel && (
                                      <a href={`tel:${c.pacienteTel}`}
                                        onClick={e => e.stopPropagation()}
                                        className="text-xs opacity-60 hover:opacity-100">
                                        📱 {c.pacienteTel}
                                      </a>
                                    )}
                                  </div>
                                </div>
                                {/* Botones de turno rápidos */}
                                {!['cancelada','finalizada','no_show'].includes(c.estatus) && (
                                  <div className="flex gap-1.5 mt-2 pt-2 border-t border-current border-opacity-20">
                                    {[
                                      ['en_sala','🪑 En sala'],
                                      ['por_pasar','🔔 Por pasar'],
                                      ['completada','🩺 Consulta'],
                                      ['finalizada','✅ Finalizar'],
                                    ].filter(([s]) => s !== c.estatus).slice(0,3).map(([s, lbl]) => (
                                      <button key={s}
                                        onClick={e => { e.stopPropagation(); cambiarEstatus(c.id, s, c) }}
                                        className="text-xs px-2 py-1 bg-white bg-opacity-50
                                                   rounded-lg hover:bg-opacity-80 transition-colors font-medium">
                                        {lbl}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {citasDelDia.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                      <p className="text-4xl mb-3">📅</p>
                      <p className="text-sm">Sin citas para este día</p>
                      <button onClick={() => abrirNueva(diaActivo, 9, 0)}
                        className="mt-3 text-sm text-teal-600 hover:underline">
                        + Agregar la primera cita del día
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Vista semana — con slots de 30 min */}
      {vista === 'semana' && <div className="flex-1 overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: '52px repeat(6,1fr)', minWidth: 700 }}>
          {/* Cabecera de días */}
          <div className="bg-white border-b border-r border-gray-200 sticky top-0 z-10" />
          {dias.map(dia => (
            <div key={dia.toISOString()}
              className="bg-white border-b border-r border-gray-200 py-2 text-center sticky top-0 z-10">
              <p className="text-xs text-gray-400 capitalize">{format(dia,'EEE',{locale:es})}</p>
              <p className={`text-base font-semibold leading-tight
                ${isSameDay(dia, new Date()) ? 'text-teal-600' : 'text-gray-800'}`}>
                {format(dia,'d')}
              </p>
            </div>
          ))}

          {/* Slots de 30 min */}
          {HORAS.map(({ h, m, label }) => (
            <div key={`${h}-${m}`} style={{display:'contents'}}>
              {/* Etiqueta hora */}
              <div className={`border-b border-r border-gray-100 text-right pr-2 pt-0.5 flex-shrink-0
                ${m === 0 ? 'bg-gray-50 border-gray-200' : 'bg-white'}`}
                style={{fontSize:10, color: m === 0 ? '#6b7280' : '#d1d5db', minHeight:28}}>
                {m === 0 ? label : ''}
              </div>

              {/* Celdas por día */}
              {dias.map(dia => {
                const celCitas = citasDeDiaSlot(dia, h, m)
                const count = celCitas.filter(c =>
                  !['cancelada','completada','reagendada','finalizada'].includes(c.estatus)).length
                const lleno = count >= MAX_POR_SLOT

                return (
                  <div key={`${dia.toISOString()}-${h}-${m}`}
                    className={`border-b border-r border-gray-100 p-0.5 cursor-pointer
                      transition-colors
                      ${m === 0 ? 'border-gray-200' : ''}
                      ${lleno ? 'bg-red-50' : 'bg-white hover:bg-teal-50'}
                    `}
                    style={{minHeight:28}}
                    onClick={() => !lleno && abrirNueva(dia, h, m)}>
                    {celCitas.map(c => (
                      <div key={c.id}
                        onClick={e => { e.stopPropagation(); setModal(c); setModoDetalle('ver') }}
                        className={`text-xs rounded border px-1 py-0.5 mb-0.5 cursor-pointer
                                    hover:opacity-80 leading-tight truncate
                                    ${ESTATUS_COLOR[c.estatus]}`}>
                        <span className="font-mono opacity-60 mr-0.5" style={{fontSize:9}}>
                          {c.pacienteIdLegible}
                        </span>
                        {c.pacienteNombre?.split(' ')[0]}
                      </div>
                    ))}
                    {lleno && celCitas.length === 0 && (
                      <div className="text-xs text-red-300 text-center">lleno</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      }

      {/* Modal nueva cita */}
      {modal === 'nueva' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nueva cita</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Paciente *</label>
                {tenantId && (
                  <BuscadorPaciente tenantId={tenantId} valorInicial={form.pacienteNombre}
                    onSelect={p => setForm(f => ({
                      ...f,
                      pacienteId: p.id,
                      pacienteIdLegible: p.pacienteId ?? '',
                      pacienteNombre: `${p.nombre} ${p.apellidos}`,
                      pacienteTel: p.telefono ?? '',
                    }))} />
                )}
                {form.pacienteId && (
                  <p className="text-xs text-teal-600 mt-1">
                    ✓ {form.pacienteIdLegible} — {form.pacienteTel}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha y hora *</label>
                <input type="datetime-local" value={form.fechaHora}
                  onChange={e => setForm(f => ({ ...f, fechaHora: e.target.value }))}
                  step={1800} // pasos de 30 min
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
                {form.fechaHora && hayTraslape(form.fechaHora) && (
                  <p className={`text-xs mt-1 ${permitirTraslape ? 'text-amber-600' : 'text-red-600'}`}>
                    {permitirTraslape
                      ? '⚠️ Ya hay 2 pacientes a esa hora'
                      : '🚫 Horario lleno — elige otra hora'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Motivo</label>
                <input type="text" value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={guardarCita} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Guardar cita'}
              </button>
              <button onClick={() => setModal(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle de cita */}
      {modal && modal !== 'nueva' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setModal(null); setModoDetalle('ver') }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>

            <div className={`inline-block text-xs px-2 py-0.5 rounded border mb-3
                            ${ESTATUS_COLOR[modal.estatus]}`}>
              {ESTATUS_LABEL[modal.estatus]}
            </div>
            <h3 className="font-semibold text-gray-800 text-lg leading-tight">
              {modal.pacienteNombre}
            </h3>
            <p className="text-xs font-mono text-teal-600 mb-1">{modal.pacienteIdLegible}</p>
            <p className="text-sm text-gray-500">
              {format(modal.fecha.toDate(), "EEEE d 'de' MMMM · HH:mm", { locale: es })} hrs
            </p>
            {modal.motivo && <p className="text-sm text-gray-600 mt-1">{modal.motivo}</p>}

            {/* Modo VER */}
            {modoDetalle === 'ver' && (
              <>
                {/* Turno del paciente */}
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-2">Estado del turno:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      ['en_sala',   '🪑', 'Llegó a sala'],
                      ['por_pasar', '🔔', 'Por pasar'],
                      ['completada','🩺', 'En consulta'],
                      ['finalizada','✅', 'Finalizada'],
                    ].map(([s, icon, label]) => (
                      <button key={s}
                        onClick={() => cambiarEstatus(modal.id, s, modal)}
                        className={`text-xs py-2 rounded-lg border hover:opacity-80
                          ${modal.estatus === s ? 'ring-2 ring-teal-400' : ''}
                          ${ESTATUS_COLOR[s] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={() => setModoDetalle('reagendar')}
                    className="text-xs py-2 rounded-lg border bg-purple-50 text-purple-700
                               border-purple-200 hover:opacity-80">
                    Reagendar
                  </button>
                  <button onClick={() => setModoDetalle('cancelar')}
                    className="text-xs py-2 rounded-lg border bg-red-50 text-red-700
                               border-red-200 hover:opacity-80">
                    Cancelar cita
                  </button>
                </div>

                {/* Historial */}
                {modal.historial?.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-400 mb-2">Historial</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {[...modal.historial].reverse().map((h, i) => (
                        <div key={i} className="text-xs text-gray-500 flex gap-2">
                          <span className="text-gray-300">
                            {h.fecha?.toDate ? format(h.fecha.toDate(), "d/M HH:mm") : '—'}
                          </span>
                          <span>{h.nota}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Modo REAGENDAR */}
            {modoDetalle === 'reagendar' && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">Nueva fecha y hora:</p>
                <input type="datetime-local" value={nuevaFecha} step={1800}
                  onChange={e => setNuevaFecha(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-purple-400 mb-3" />
                <div className="flex gap-2">
                  <button onClick={() => reagendarCita(modal.id)} disabled={saving}
                    className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-xs
                               font-medium hover:bg-purple-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Confirmar reagenda'}
                  </button>
                  <button onClick={() => setModoDetalle('ver')}
                    className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-xs hover:bg-gray-200">
                    Atrás
                  </button>
                </div>
              </div>
            )}

            {/* Modo CANCELAR */}
            {modoDetalle === 'cancelar' && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">Motivo de cancelación:</p>
                <input type="text" value={motivoCancelacion}
                  onChange={e => setMotivoCancelacion(e.target.value)}
                  placeholder="Ej: Paciente llamó para cancelar"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-red-300 mb-3" />
                <div className="flex gap-2">
                  <button onClick={() => cancelarCita(modal.id)} disabled={saving}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg text-xs
                               font-medium hover:bg-red-700 disabled:opacity-50">
                    {saving ? 'Cancelando...' : 'Confirmar cancelación'}
                  </button>
                  <button onClick={() => setModoDetalle('ver')}
                    className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-xs hover:bg-gray-200">
                    Atrás
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => { setModal(null); setModoDetalle('ver') }}
              className="w-full mt-3 text-xs text-gray-400 py-2 hover:text-gray-600">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
