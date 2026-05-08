// src/pages/Cobros.jsx
import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, Timestamp, getDocs
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
  concepto: 'Consulta general', monto: '', metodoPago: 'efectivo',
}

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
  const [cobros,   setCobros]  = useState([])
  const [modal,    setModal]   = useState(false)
  const [form,     setForm]    = useState(FORM_INICIAL)
  const [saving,   setSaving]  = useState(false)
  const [busq,     setBusq]    = useState('')
  // ── FIX: tab state with proper string key ──
  const [tab,      setTab]     = useState('pendientes')

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

  const totalMes = cobros
    .filter(c => { const f = c.fechaPago?.toDate?.(); return f && f >= inicio && f <= fin })
    .reduce((s, c) => s + Number(c.monto ?? 0), 0)

  const pendientes = cobros.filter(c =>
    c.estadoPago !== 'paid' &&
    `${c.pacienteNombre ?? ''} ${c.pacienteIdLegible ?? ''}`.toLowerCase().includes(busq.toLowerCase())
  )
  const pagados = cobros.filter(c =>
    c.estadoPago === 'paid' &&
    `${c.pacienteNombre ?? ''} ${c.pacienteIdLegible ?? ''}`.toLowerCase().includes(busq.toLowerCase())
  )
  const lista = tab === 'pendientes' ? pendientes : pagados

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
        metodoPago:        form.metodoPago,
        estadoPago:        'pending',
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

  const marcarPagado = async (cobro) => {
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/cobros/${cobro.id}`), {
        estadoPago: 'paid',
        fechaPagoConfirmado: Timestamp.now(),
      })
      toast.success('Marcado como pagado ✓')
    } catch { toast.error('Error') }
  }

  const fmtFecha = (f) => {
    try { return format(f.toDate(), "d MMM · HH:mm", { locale: es }) }
    catch { return '—' }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Cobros</h2>
          <p className="text-sm text-gray-400">{format(ahora, "MMMM yyyy", { locale: es })}</p>
        </div>
        <button onClick={() => { setForm(FORM_INICIAL); setModal(true) }}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Registrar cobro
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Ingresos del mes</p>
          <p className="text-2xl font-bold text-gray-800">${totalMes.toLocaleString('es-MX')}</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Pendientes de cobro</p>
          <p className="text-2xl font-bold text-amber-600">{cobros.filter(c => c.estadoPago !== 'paid').length}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Pagados hoy</p>
          <p className="text-2xl font-bold text-green-600">
            {cobros.filter(c => {
              const f = c.fechaPagoConfirmado?.toDate?.() ?? c.fechaPago?.toDate?.()
              return c.estadoPago === 'paid' && f && f >= new Date(new Date().setHours(0,0,0,0))
            }).length}
          </p>
        </div>
      </div>

      {/* Buscador + Tabs */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input type="text" placeholder="Buscar por paciente..."
          value={busq} onChange={e => setBusq(e.target.value)}
          className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-teal-400" />

        {/* Tabs — key fix: usando string explícito */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setTab('pendientes')}
            className={`px-4 py-2 text-sm font-medium transition-colors
              ${tab === 'pendientes'
                ? 'bg-amber-500 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            Pendientes ({cobros.filter(c => c.estadoPago !== 'paid').length})
          </button>
          <button
            onClick={() => setTab('pagados')}
            className={`px-4 py-2 text-sm font-medium border-l border-gray-200 transition-colors
              ${tab === 'pagados'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            Pagados ({cobros.filter(c => c.estadoPago === 'paid').length})
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">{tab === 'pendientes' ? '✅' : '💳'}</p>
            <p className="text-sm">
              {tab === 'pendientes' ? 'Sin cobros pendientes' : 'Sin cobros pagados'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Fecha', 'Paciente', 'Concepto', 'Método', 'Monto', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                           text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50
                    ${c.estadoPago !== 'paid' ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {fmtFecha(c.fechaPago)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 text-sm">{c.pacienteNombre ?? '—'}</p>
                      <span className="font-mono text-xs text-teal-600">{c.pacienteIdLegible}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{c.concepto}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium
                        ${METODO_COLOR[c.metodoPago ?? c.metodo] ?? 'bg-gray-100 text-gray-500'}`}>
                        {c.metodoPago ?? c.metodo ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      ${Number(c.monto ?? 0).toLocaleString('es-MX')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${c.estadoPago === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'}`}>
                        {c.estadoPago === 'paid' ? '✓ Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.estadoPago !== 'paid' ? (
                        <button onClick={() => marcarPagado(c)}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white
                                     rounded-lg hover:bg-green-700 whitespace-nowrap">
                          ✓ Marcar pagado
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {c.fechaPagoConfirmado ? fmtFecha(c.fechaPagoConfirmado) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <select value={form.metodoPago}
                  onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta (TPV)</option>
                  <option value="transferencia">Transferencia</option>
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
