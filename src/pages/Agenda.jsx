import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, Timestamp, getDocs, arrayUnion
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const HORAS = Array.from({ length: 15 }, (_, i) => i + 8) // 8am-10pm

const ESTATUS_COLOR = {
  programada:  'bg-blue-100 text-blue-800 border-blue-200',
  confirmada:  'bg-green-100 text-green-800 border-green-200',
  completada:  'bg-gray-100 text-gray-500 border-gray-200',
  cancelada:   'bg-red-100 text-red-700 border-red-200',
  no_show:     'bg-amber-100 text-amber-800 border-amber-200',
  reagendada:  'bg-purple-100 text-purple-700 border-purple-200',
}
const ESTATUS_LABEL = {
  programada: 'Programada', confirmada: 'Confirmada',
  completada: 'Completada', cancelada: 'Cancelada',
  no_show: 'No llegó', reagendada: 'Reagendada',
}

const FORM_INICIAL = {
  pacienteId: '', pacienteNombre: '', pacienteTel: '', pacienteIdLegible: '',
  fechaHora: '', motivo: '', duracionMin: 30,
}

// Buscador de pacientes con debounce
function BuscadorPaciente({ tenantId, onSelect, valorInicial = '' }) {
  const [texto, setTexto]       = useState(valorInicial)
  const [resultados, setRes]    = useState([])
  const [abierto, setAbierto]   = useState(false)
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
    const filtro = todos.filter(p =>
      `${p.nombre} ${p.apellidos} ${p.pacienteId ?? ''}`.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 6)
    setRes(filtro)
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
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b
                         border-gray-100 last:border-0">
              <span className="font-mono text-xs bg-teal-50 text-teal-700 px-1.5
                               py-0.5 rounded mr-2">{p.pacienteId}</span>
              <span className="text-sm text-gray-800">{p.nombre} {p.apellidos}</span>
              {p.telefono && (
                <span className="text-xs text-gray-400 ml-2">{p.telefono}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {abierto && resultados.length === 0 && texto.length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border
                        border-gray-200 rounded-lg shadow-lg mt-1 px-3 py-2
                        text-sm text-gray-400">
          No se encontró ningún paciente
        </div>
      )}
    </div>
  )
}

export default function Agenda() {
  const { tenantId, tenant } = useTenant()
  const [semanaBase, setSemanaBase] = useState(new Date())
  const [citas,  setCitas]          = useState([])
  const [modal,  setModal]          = useState(null)
  const [form,   setForm]           = useState(FORM_INICIAL)
  const [saving, setSaving]         = useState(false)
  // Modo del modal de detalle: 'ver' | 'reagendar' | 'cancelar'
  const [modoDetalle, setModoDetalle] = useState('ver')
  const [nuevaFecha,  setNuevaFecha]  = useState('')
  const [motivoCancelacion, setMotivoCancelacion] = useState('')

  const permitirTraslape = tenant?.permitirTraslape ?? true

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

  // Verificar traslape: ¿hay otra cita activa en ese día y hora?
  const hayTraslape = (fechaHoraStr) => {
    const nueva = new Date(fechaHoraStr)
    return citas.some(c => {
      if (['cancelada','completada','reagendada'].includes(c.estatus)) return false
      const existente = c.fecha.toDate()
      return isSameDay(existente, nueva) && existente.getHours() === nueva.getHours()
    })
  }

  const guardarCita = async () => {
    if (!form.pacienteId) { toast.error('Selecciona un paciente de la lista'); return }
    if (!form.fechaHora)  { toast.error('Selecciona fecha y hora'); return }

    // Verificar traslape
    if (hayTraslape(form.fechaHora)) {
      if (!permitirTraslape) {
        toast.error('Ya existe una cita a esa hora. El consultorio no permite traslapes.')
        return
      }
      toast('⚠️ Ya hay una cita a esa hora — se guardará de todas formas.', { icon: '⚠️' })
    }

    setSaving(true)
    try {
      const fecha = Timestamp.fromDate(new Date(form.fechaHora))
      await addDoc(collection(db, `tenants/${tenantId}/citas`), {
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
        historial: [{
          accion:  'creada',
          fecha:   Timestamp.now(),
          nota:    'Cita creada',
        }],
        creadoEn: Timestamp.now(),
      })
      toast.success('Cita guardada ✓')
      // Enviar WA de confirmación al paciente
      if (form.pacienteTel) {
        const citaWA = formatCitaWA({ fecha: fecha })
        enviarWA(form.pacienteTel, MENSAJES.citaAgendada(
          { nombre: form.pacienteNombre.split(' ')[0] },
          { ...citaWA, motivo: form.motivo },
          tenant ?? { nombre: 'Consultorio', telefono: '', direccion: '' }
        )).then(r => r.ok && toast.success('✓ WA enviado al paciente', { duration: 2000 }))
      }
      setModal(null); setForm(FORM_INICIAL)
    } catch (e) {
      console.error(e); toast.error('Error al guardar la cita')
    } finally { setSaving(false) }
  }

  const cambiarEstatus = async (citaId, estatus) => {
    await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaId}`), {
      estatus,
      historial: arrayUnion({
        accion: estatus,
        fecha:  Timestamp.now(),
        nota:   `Marcada como: ${ESTATUS_LABEL[estatus]}`,
      }),
    })
    toast.success(`Marcada como: ${ESTATUS_LABEL[estatus]}`)
    setModal(null); setModoDetalle('ver')
  }

  const reagendarCita = async (citaId) => {
    if (!nuevaFecha) { toast.error('Selecciona la nueva fecha y hora'); return }
    if (hayTraslape(nuevaFecha)) {
      if (!permitirTraslape) {
        toast.error('Ya hay una cita a esa hora. No se permite el traslape.')
        return
      }
      toast('⚠️ Ya hay otra cita a esa hora.', { icon: '⚠️' })
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaId}`), {
        fecha:   Timestamp.fromDate(new Date(nuevaFecha)),
        estatus: 'programada',
        historial: arrayUnion({
          accion:      'reagendada',
          fecha:       Timestamp.now(),
          fechaAnterior: modal.fecha,
          nota:        `Reagendada para: ${format(new Date(nuevaFecha), "d MMM yyyy · HH:mm", { locale: es })}`,
        }),
      })
      toast.success('Cita reagendada ✓')
      setModal(null); setModoDetalle('ver'); setNuevaFecha('')
    } catch (e) {
      console.error(e); toast.error('Error al reagendar')
    } finally { setSaving(false) }
  }

  const cancelarCita = async (citaId) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/citas/${citaId}`), {
        estatus: 'cancelada',
        historial: arrayUnion({
          accion: 'cancelada',
          fecha:  Timestamp.now(),
          nota:   motivoCancelacion || 'Cancelada sin motivo especificado',
        }),
      })
      toast.success('Cita cancelada')
      // Notificar cancelación al paciente
      if (modal.pacienteTel) {
        const citaWA = formatCitaWA(modal)
        enviarWA(modal.pacienteTel, MENSAJES.citaCancelada(
          { nombre: modal.pacienteNombre.split(' ')[0] },
          citaWA,
          tenant ?? { nombre: 'Consultorio', telefono: '', direccion: '' }
        ))
      }
      setModal(null); setModoDetalle('ver'); setMotivoCancelacion('')
    } catch (e) {
      console.error(e); toast.error('Error al cancelar')
    } finally { setSaving(false) }
  }

  const citasDeDiaHora = (dia, hora) =>
    citas.filter(c => {
      const d = c.fecha.toDate()
      return isSameDay(d, dia) && d.getHours() === hora
    })

  const abrirNueva = (dia, hora) => {
    const d = new Date(dia)
    d.setHours(hora, 0, 0, 0)
    setForm({ ...FORM_INICIAL, fechaHora: d.toISOString().slice(0, 16) })
    setModal('nueva')
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white
                      border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setSemanaBase(d => addDays(d, -7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">‹</button>
          <h2 className="text-base font-semibold text-gray-800 w-52 text-center">
            {format(lunes, "d 'de' MMMM yyyy", { locale: es })}
          </h2>
          <button onClick={() => setSemanaBase(d => addDays(d, 7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">›</button>
          <button onClick={() => setSemanaBase(new Date())}
            className="ml-2 text-xs px-3 py-1 rounded-md bg-gray-100
                       hover:bg-gray-200 text-gray-600">Hoy</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex gap-2 flex-wrap">
            {Object.entries(ESTATUS_COLOR).map(([k, v]) => (
              <span key={k} className={`text-xs px-2 py-0.5 rounded border ${v}`}>
                {ESTATUS_LABEL[k]}
              </span>
            ))}
          </div>
          <button onClick={() => { setForm(FORM_INICIAL); setModal('nueva') }}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                       rounded-lg hover:bg-teal-700 transition-colors">
            + Nueva cita
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: '52px repeat(6,1fr)', minWidth: 700 }}>
          <div className="bg-white border-b border-r border-gray-200 sticky top-0 z-10" />
          {dias.map(dia => (
            <div key={dia.toISOString()}
              className="bg-white border-b border-r border-gray-200 py-2 text-center sticky top-0 z-10">
              <p className="text-xs text-gray-400 capitalize">{format(dia,'EEE',{locale:es})}</p>
              <p className={`text-lg font-semibold leading-tight
                ${isSameDay(dia, new Date()) ? 'text-teal-600' : 'text-gray-800'}`}>
                {format(dia,'d')}
              </p>
            </div>
          ))}
          {HORAS.map(hora => (
            <>
              <div key={`lbl-${hora}`}
                className="border-b border-r border-gray-100 bg-gray-50 text-xs
                           text-gray-400 text-right pr-2 pt-1 flex-shrink-0">
                {hora}:00
              </div>
              {dias.map(dia => {
                const celCitas = citasDeDiaHora(dia, hora)
                const tieneTraslape = celCitas.filter(c =>
                  !['cancelada','completada','reagendada'].includes(c.estatus)).length > 1
                return (
                  <div key={`${dia.toISOString()}-${hora}`}
                    className={`border-b border-r border-gray-100 min-h-[52px] p-0.5
                               bg-white hover:bg-teal-50 cursor-pointer transition-colors
                               ${tieneTraslape ? 'ring-1 ring-amber-300 ring-inset' : ''}`}
                    onClick={() => abrirNueva(dia, hora)}>
                    {celCitas.map(c => (
                      <div key={c.id}
                        onClick={e => { e.stopPropagation(); setModal(c); setModoDetalle('ver') }}
                        className={`text-xs rounded border px-1 py-0.5 mb-0.5 cursor-pointer
                                    hover:opacity-80 transition-opacity ${ESTATUS_COLOR[c.estatus]}`}>
                        <span className="font-mono opacity-60 mr-1">{c.pacienteIdLegible}</span>
                        {c.pacienteNombre}
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* Modal nueva cita */}
      {modal === 'nueva' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nueva cita</h3>

            <div className="space-y-3">
              {/* Búsqueda de paciente */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Paciente * — busca por nombre o ID
                </label>
                {tenantId && (
                  <BuscadorPaciente tenantId={tenantId}
                    valorInicial={form.pacienteNombre}
                    onSelect={p => setForm(f => ({
                      ...f,
                      pacienteId:        p.id,
                      pacienteIdLegible: p.pacienteId ?? '',
                      pacienteNombre:    `${p.nombre} ${p.apellidos}`,
                      pacienteTel:       p.telefono ?? '',
                    }))} />
                )}
                {form.pacienteId && (
                  <p className="text-xs text-teal-600 mt-1">
                    ✓ ID: {form.pacienteIdLegible} — Tel: {form.pacienteTel}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha y hora *</label>
                <input type="datetime-local" value={form.fechaHora}
                  onChange={e => setForm(f => ({ ...f, fechaHora: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
                {form.fechaHora && hayTraslape(form.fechaHora) && (
                  <p className={`text-xs mt-1 ${permitirTraslape ? 'text-amber-600' : 'text-red-600'}`}>
                    {permitirTraslape
                      ? '⚠️ Ya hay una cita a esa hora — se permitirá el traslape'
                      : '🚫 Ya hay una cita a esa hora — el consultorio no permite traslapes'}
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

              <div>
                <label className="block text-xs text-gray-500 mb-1">Duración</label>
                <select value={form.duracionMin}
                  onChange={e => setForm(f => ({ ...f, duracionMin: +e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={guardarCita} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Guardar cita'}
              </button>
              <button onClick={() => setModal(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm
                           hover:bg-gray-200 transition-colors">
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

            {/* Encabezado */}
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
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {['confirmada','completada'].map(s => (
                    <button key={s} onClick={() => cambiarEstatus(modal.id, s)}
                      className={`text-xs py-2 rounded-lg border hover:opacity-80 ${ESTATUS_COLOR[s]}`}>
                      {ESTATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
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
                    <p className="text-xs text-gray-400 mb-2">Historial de cambios</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {[...modal.historial].reverse().map((h, i) => (
                        <div key={i} className="text-xs text-gray-500 flex gap-2">
                          <span className="text-gray-300">
                            {h.fecha?.toDate
                              ? format(h.fecha.toDate(), "d/M HH:mm")
                              : '—'}
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
                <input type="datetime-local" value={nuevaFecha}
                  onChange={e => setNuevaFecha(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-purple-400 mb-3" />
                {nuevaFecha && hayTraslape(nuevaFecha) && (
                  <p className={`text-xs mb-2 ${permitirTraslape ? 'text-amber-600' : 'text-red-600'}`}>
                    {permitirTraslape ? '⚠️ Traslape detectado' : '🚫 Traslape — no permitido'}
                  </p>
                )}
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
                <p className="text-xs text-gray-500 mb-2">Motivo de cancelación (opcional):</p>
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
