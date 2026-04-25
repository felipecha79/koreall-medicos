import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, Timestamp, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const METODO_COLOR = {
  efectivo:      'bg-green-100 text-green-700',
  transferencia: 'bg-blue-100 text-blue-700',
  tarjeta:       'bg-purple-100 text-purple-700',
}

const FORM_INICIAL = {
  pacienteId: '', pacienteIdLegible: '', pacienteNombre: '',
  concepto: 'Consulta general', monto: '', metodo: 'efectivo',
}

// Buscador inline de pacientes
function BuscadorPaciente({ tenantId, onSelect }) {
  const [texto,     setTexto]   = useState('')
  const [resultados, setRes]    = useState([])
  const [abierto,   setAbierto] = useState(false)

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
    <div className="relative">
      <input type="text" value={texto} placeholder="Buscar paciente por nombre o ID..."
        onChange={e => buscar(e.target.value)}
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

export default function Cobros() {
  const { tenantId } = useTenant()
  const [cobros,  setCobros]  = useState([])
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(FORM_INICIAL)
  const [saving,  setSaving]  = useState(false)
  const [busqCobros, setBusq] = useState('')

  useEffect(() => {
    if (!tenantId) return
    const q = query(
      collection(db, `tenants/${tenantId}/cobros`),
      orderBy('fechaPago', 'desc')
    )
    return onSnapshot(q, snap =>
      setCobros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  const ahora  = new Date()
  const inicio = startOfMonth(ahora)
  const fin    = endOfMonth(ahora)
  const delMes = cobros.filter(c => {
    const f = c.fechaPago?.toDate?.()
    return f && f >= inicio && f <= fin
  })
  const totalMes = delMes.reduce((s, c) => s + Number(c.monto ?? 0), 0)

  // Filtrado de cobros por búsqueda
  const filtrados = cobros.filter(c =>
    `${c.pacienteNombre ?? ''} ${c.pacienteIdLegible ?? ''}`
      .toLowerCase().includes(busqCobros.toLowerCase())
  )

  const guardar = async () => {
    if (!form.pacienteId) { toast.error('Selecciona un paciente'); return }
    if (!form.monto)      { toast.error('El monto es obligatorio'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, `tenants/${tenantId}/cobros`), {
        pacienteId:        form.pacienteId,
        pacienteIdLegible: form.pacienteIdLegible,
        pacienteNombre:    form.pacienteNombre,
        concepto:          form.concepto,
        monto:             Number(form.monto),
        metodo:            form.metodo,
        tenantId,
        facturado: false,
        cfdiUuid:  null,
        cfdiUrl:   null,
        fechaPago: Timestamp.now(),
      })
      toast.success('Cobro registrado ✓')
      setModal(false); setForm(FORM_INICIAL)
    } catch (e) {
      console.error(e); toast.error('Error al guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Cobros</h2>
          <p className="text-sm text-gray-400">{format(ahora,"MMMM yyyy",{locale:es})}</p>
        </div>
        <button onClick={() => { setForm(FORM_INICIAL); setModal(true) }}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Registrar cobro
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Ingresos del mes</p>
          <p className="text-2xl font-bold text-gray-800">
            ${totalMes.toLocaleString('es-MX')}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Consultas del mes</p>
          <p className="text-2xl font-bold text-teal-600">{delMes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Pendientes de CFDI</p>
          <p className="text-2xl font-bold text-amber-500">
            {cobros.filter(c => !c.facturado).length}
          </p>
        </div>
      </div>

      {/* Buscador de cobros */}
      <input type="text" placeholder="Buscar por nombre o ID de paciente..."
        value={busqCobros} onChange={e => setBusq(e.target.value)}
        className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2.5
                   text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400" />

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">💳</p>
            <p className="text-sm">Sin cobros registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Fecha','ID Paciente','Paciente','Concepto','Método','Monto','CFDI'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                         text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {c.fechaPago
                      ? format(c.fechaPago.toDate(), 'd MMM · HH:mm', {locale:es})
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-teal-50 text-teal-700
                                     px-2 py-0.5 rounded border border-teal-100">
                      {c.pacienteIdLegible ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.pacienteNombre}</td>
                  <td className="px-4 py-3 text-gray-600">{c.concepto}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium
                                     ${METODO_COLOR[c.metodo] ?? ''}`}>
                      {c.metodo}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    ${Number(c.monto).toLocaleString('es-MX')}
                  </td>
                  <td className="px-4 py-3">
                    {c.facturado
                      ? <span className="text-xs text-green-600 font-medium">✓ Timbrado</span>
                      : <span className="text-xs text-gray-400">Pendiente</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo cobro */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Registrar cobro</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Paciente * — busca por nombre o ID
                </label>
                {tenantId && (
                  <BuscadorPaciente tenantId={tenantId}
                    onSelect={p => setForm(f => ({
                      ...f,
                      pacienteId:        p.id,
                      pacienteIdLegible: p.pacienteId ?? '',
                      pacienteNombre:    `${p.nombre} ${p.apellidos}`,
                    }))} />
                )}
                {form.pacienteId && (
                  <p className="text-xs text-teal-600 mt-1">
                    ✓ {form.pacienteIdLegible} — {form.pacienteNombre}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Concepto</label>
                <input type="text" value={form.concepto}
                  onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Monto (MXN) *</label>
                <input type="number" value={form.monto} min="0" step="50"
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Método de pago</label>
                <select value={form.metodo}
                  onChange={e => setForm(f => ({ ...f, metodo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={guardar} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Registrar cobro'}
              </button>
              <button onClick={() => setModal(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm
                           hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
