import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, getDocs,
  onSnapshot, doc, updateDoc, addDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import PacientesSinCita from '../components/PacientesSinCita'

// ── Exportar a CSV (compatible con Excel) ─────────────────
function exportarCSV(datos, nombreArchivo) {
  if (!datos.length) { toast.error('Sin datos para exportar'); return }
  const cols = Object.keys(datos[0])
  const encabezado = cols.join(',')
  const filas = datos.map(row =>
    cols.map(col => {
      const v = row[col] ?? ''
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    }).join(',')
  )
  const csv = '\uFEFF' + [encabezado, ...filas].join('\n') // BOM para Excel en español
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${nombreArchivo}.csv`; a.click()
  URL.revokeObjectURL(url)
  toast.success(`Exportado: ${nombreArchivo}.csv`)
}

// ── Selector de rango de fechas ───────────────────────────
function SelectorRango({ desde, hasta, onChange }) {
  const rangos = [
    { label: 'Hoy',         fn: () => ({ desde: format(new Date(),'yyyy-MM-dd'), hasta: format(new Date(),'yyyy-MM-dd') }) },
    { label: 'Últimos 7 días', fn: () => ({ desde: format(subDays(new Date(),6),'yyyy-MM-dd'), hasta: format(new Date(),'yyyy-MM-dd') }) },
    { label: 'Este mes',    fn: () => ({ desde: format(startOfMonth(new Date()),'yyyy-MM-dd'), hasta: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
    { label: 'Mes anterior',fn: () => {
      const p = subDays(startOfMonth(new Date()),1)
      return { desde: format(startOfMonth(p),'yyyy-MM-dd'), hasta: format(endOfMonth(p),'yyyy-MM-dd') }
    }},
  ]
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {rangos.map(r => (
        <button key={r.label} onClick={() => onChange(r.fn())}
          className="text-gray-800 text-xs px-3 py-1.5 bg-gray-100 hover:bg-teal-50 hover:text-teal-700
                     rounded-lg transition-colors border border-gray-200">
          {r.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <input type="date" value={desde}
          onChange={e => onChange({ desde: e.target.value, hasta })}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 bg-white
                     focus:outline-none focus:ring-2 focus:ring-teal-400" />
        <span className="text-gray-500 text-xs">al</span>
        <input type="date" value={hasta}
          onChange={e => onChange({ desde, hasta: e.target.value })}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 bg-white
                     focus:outline-none focus:ring-2 focus:ring-teal-400" />
      </div>
    </div>
  )
}

const TABS = ['Pagos y facturas', 'Consultas', 'Corte diario', 'Seguimiento pacientes', 'Resumen KPIs', '💊 Medicamentos']

function imprimirCorte() {
  const el = document.getElementById('corte-diario-print')
  if (!el) return
  const css = [
    'body{font-family:Arial,sans-serif;padding:20px;color:#1a2e42}',
    'table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}',
    'th{background:#1a2e42;color:white;padding:6px 10px;text-align:left;font-size:11px}',
    'td{padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}',
    'tr:nth-child(even){background:#f9fafb}',
    '.total-box{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;display:inline-block;margin:4px}',
    '.total-label{font-size:10px;color:#6b7280;text-transform:uppercase}',
    '.total-valor{font-size:18px;font-weight:700;margin-top:2px}',
    '.footer{margin-top:24px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}',
    '.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600}',
    '.badge-efectivo{background:#d1fae5;color:#065f46}',
    '.badge-tarjeta{background:#ede9fe;color:#5b21b6}',
    '.badge-stripe{background:#e0e7ff;color:#3730a3}',
    '.badge-transferencia{background:#dbeafe;color:#1e40af}',
  ].join('')
  const html = '<html><head><title>Corte Diario — Novaryk.Med</title>'
    + '<style>' + css + '</style>'
    + '</head><body>' + el.innerHTML + '</body></html>'
  const win = window.open('', '_blank', 'width=800,height=700')
  if (!win) { alert('Activa los popups para imprimir'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(function() { win.print(); win.close() }, 400)
}


// T-03: Badge tipo persona fiscal
const BadgeTipoPersonaRep = ({ tipo }) => {
  if (!tipo) return <span className="text-xs text-gray-300">—</span>
  const f = tipo === 'F' || tipo === 'fisica'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
      f ? 'bg-blue-50 text-blue-700 border border-blue-200'
        : 'bg-purple-50 text-purple-700 border border-purple-200'}`}>
      {f ? 'Física' : 'Moral'}
    </span>
  )
}

export default function Reportes() {
  const { tenantId, tenant } = useTenant()
  const [tab, setTab] = useState('Pagos y facturas')
  // T-04: Dashboard de medicamentos
  const [procedimientos, setProcedimientos] = useState([])
  useEffect(() => {
    if (!tenantId) return
    import('firebase/firestore').then(({ collection: col, getDocs: gd, query: q, where: w, orderBy: ob, Timestamp: TS }) => {
      import('../firebase').then(({ db: fdb }) => {
        const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90)
        gd(q(col(fdb, `tenants/${tenantId}/consultas`),
          w('tipo', '==', 'procedimiento'),
          w('fecha', '>=', TS.fromDate(hace90))
        )).then(snap => {
          setProcedimientos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }).catch(() => {})
      })
    }).catch(() => {})
  }, [tenantId])

  // ── Estado tab Seguimiento ───────────────────────────
  const [filtroMinDias, setFiltroMinDias] = useState(30)
  const [totalPacientes, setTotalPacientes] = useState('—')
  const [kpiTipos, setKpiTipos] = useState({ primeraVez: '—', subsecuente: '—' })

  // ── Rango de fechas ──────────────────────────────────
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const inicioMes = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const [rangoPagos,    setRangoPagos]    = useState({ desde: inicioMes, hasta: hoy })
  const [rangoConsultas,setRangoConsultas]= useState({ desde: inicioMes, hasta: hoy })

  // ── Datos ────────────────────────────────────────────
  const [cobros,   setCobros]   = useState([])
  const [facturas, setFacturas] = useState([])
  const [consultas,setConsultas]= useState([])
  const [citas,    setCitas]    = useState([])
  const [loading,  setLoading]  = useState(false)

  // ── Modal factura global ─────────────────────────────
  const [modalFG,       setModalFG]       = useState(false)
  const [generandoFG,   setGenerandoFG]   = useState(false)
  const [rfcGlobal,     setRfcGlobal]     = useState('XAXX010101000')
  const [conceptoGlobal,setConceptoGlobal]= useState('Servicios médicos — Factura global')

  // Cargar total de pacientes para KPI (con breakdown de tipo)
  useEffect(() => {
    if (!tenantId) return
    const unsub = onSnapshot(
      collection(db, `tenants/${tenantId}/pacientes`),
      snap => {
        const docs = snap.docs.map(d => d.data())
        setTotalPacientes(docs.length)
        setKpiTipos({
          primeraVez:  docs.filter(p => p.tipoPaciente === 'primera_vez').length,
          subsecuente: docs.filter(p => p.tipoPaciente === 'subsecuente' || !p.tipoPaciente).length,
        })
      }
    )
    return unsub
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    // Cargar todos los cobros y facturas del tenant (sin filtrar por fecha en Firestore)
    const unsubCobros = onSnapshot(
      query(collection(db, `tenants/${tenantId}/cobros`), orderBy('fechaPago', 'desc')),
      snap => setCobros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubFacturas = onSnapshot(
      query(collection(db, `tenants/${tenantId}/facturas`), orderBy('fecha', 'desc')),
      snap => setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubConsultas = onSnapshot(
      query(collection(db, `tenants/${tenantId}/consultas`), orderBy('fecha', 'desc')),
      snap => setConsultas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubCitas = onSnapshot(
      query(collection(db, `tenants/${tenantId}/citas`), orderBy('fecha', 'desc')),
      snap => setCitas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => { unsubCobros(); unsubFacturas(); unsubConsultas(); unsubCitas() }
  }, [tenantId])

  // ── Filtrar por rango de fechas (client-side) ─────────
  const filtrarPorRango = (items, campo, rango) => {
    const desde = startOfDay(new Date(rango.desde))
    const hasta  = endOfDay(new Date(rango.hasta))
    return items.filter(item => {
      try {
        const f = item[campo]?.toDate ? item[campo].toDate()
          : item[campo]?.seconds ? new Date(item[campo].seconds*1000)
          : new Date(item[campo])
        return f >= desde && f <= hasta
      } catch { return false }
    })
  }

  // Para cobros usar fechaPagoConfirmado cuando existe (fecha real del pago)
  // fechaPago es la fecha de creación del cobro — puede ser diferente
  const cobrosConFechaReal = cobros.map(c => ({
    ...c,
    _fechaFiltro: c.fechaPagoConfirmado ?? c.fechaPago,
  }))
  const cobrosFiltrados = filtrarPorRango(cobrosConFechaReal, '_fechaFiltro', rangoPagos)
  const consultasFiltradas = filtrarPorRango(consultas, 'fecha', rangoConsultas)

  // ── Cruzar cobros con facturas ────────────────────────
  const cobrosConFactura = cobrosFiltrados.map(c => {
    const factura = facturas.find(f => f.cobroId === c.id || f.pacienteId === c.pacienteId)
    return { ...c, factura }
  })

  const cobrosNoFacturados = cobrosConFactura.filter(c =>
    !c.factura && c.estadoPago === 'paid' && !c.incluidoEnFacturaGlobal
  )
  const totalNoFacturado = cobrosNoFacturados.reduce((s,c) => s + Number(c.monto ?? 0), 0)

  // ── KPIs ─────────────────────────────────────────────
  const totalCobrado  = cobrosFiltrados.filter(c=>c.estadoPago==='paid').reduce((s,c)=>s+Number(c.monto??0),0)
  const totalPendiente = cobrosFiltrados.filter(c=>c.estadoPago!=='paid').reduce((s,c)=>s+Number(c.monto??0),0)
  const totalFacturado = facturas.filter(f=>filtrarPorRango([f],'fecha',rangoPagos).length>0 && f.estatus==='valid')
    .reduce((s,f)=>s+Number(f.total??0),0)

  const fmtFecha = (f) => {
    try {
      const d = f?.toDate ? f.toDate() : f?.seconds ? new Date(f.seconds*1000) : new Date(f)
      return format(d, "d/MM/yy HH:mm", { locale: es })
    } catch { return '—' }
  }
  const fmtDia = (f) => {
    try {
      const d = f?.toDate ? f.toDate() : f?.seconds ? new Date(f.seconds*1000) : new Date(f)
      return format(d, "d 'de' MMMM yyyy", { locale: es })
    } catch { return '—' }
  }

  // ── Factura global ────────────────────────────────────
  const generarFacturaGlobal = async () => {
    if (!cobrosNoFacturados.length) { toast.error('Sin cobros pendientes de facturar'); return }
    setGenerandoFG(true)
    try {
      // Crear factura global en Firestore
      const total = cobrosNoFacturados.reduce((s,c) => s+Number(c.monto??0), 0)
      const nuevaFactura = await addDoc(collection(db, `tenants/${tenantId}/facturas`), {
        tipo:            'global',
        serie:           'FG',
        folio:           `${Date.now().toString().slice(-6)}`,
        rfc:             rfcGlobal,
        concepto:        conceptoGlobal,
        total,
        subtotal:        total,
        iva:             0,
        estatus:         'valid',
        tenantId,
        cobroIds:        cobrosNoFacturados.map(c => c.id),
        numCobros:       cobrosNoFacturados.length,
        fecha:           Timestamp.now(),
        creadoEn:        Timestamp.now(),
      })

      // Marcar todos los cobros como incluidos en factura global
      await Promise.all(cobrosNoFacturados.map(c =>
        updateDoc(doc(db, `tenants/${tenantId}/cobros/${c.id}`), {
          incluidoEnFacturaGlobal: true,
          facturaGlobalId: nuevaFactura.id,
        })
      ))

      toast.success(`✅ Factura global generada — ${cobrosNoFacturados.length} cobros por $${total.toLocaleString('es-MX')} MXN`)
      setModalFG(false)
    } catch(e) {
      console.error(e); toast.error('Error al generar factura global')
    } finally { setGenerandoFG(false) }
  }

  const exportarCortePDF = () => {
    const hoy = format(new Date(), 'dd/MM/yyyy')
    const cobrosCorte = cobrosFiltrados
    const totalTPV = cobrosCorte.filter(c => c.metodoPago === 'tarjeta').reduce((s,c)=>s+Number(c.monto??0),0)
    const totalStripe = cobrosCorte.filter(c => c.metodoPago === 'stripe').reduce((s,c)=>s+Number(c.monto??0),0)
    const totalTransf = cobrosCorte.filter(c => c.metodoPago === 'transferencia').reduce((s,c)=>s+Number(c.monto??0),0)
    const totalEfectivo = cobrosCorte.filter(c => c.metodoPago === 'efectivo').reduce((s,c)=>s+Number(c.monto??0),0)
    const cols = 'No.,Fecha,Hora,Paciente,Servicio,Monto,Metodo,Factura'
    const filas = cobrosCorte.map((c, i) => {
      const d = c.fechaPago?.toDate?.()
      return [
        i+1,
        d ? format(d,'d/MM/yy') : '-',
        d ? format(d,'HH:mm') : '-',
        (c.pacienteNombre ?? 'Sin asignar').toUpperCase(),
        (c.concepto ?? 'Consulta Normal').replace(/,/g,' '),
        Number(c.monto??0).toFixed(2),
        c.metodoPago ?? '-',
        c.facturado ? 'SI' : 'NO',
      ].join(',')
    }).join('\n')
    const totales = `,,,,TOTAL TPV,${totalTPV},,\n,,,,TOTAL STRIPE,${totalStripe},,\n,,,,TOTAL TRANSF,${totalTransf},,\n,,,,TOTAL EFECTIVO,${totalEfectivo},,\n,,,,TOTAL GENERAL,${totalTPV+totalStripe+totalTransf+totalEfectivo},,`
    const csv = '\uFEFF' + `CORTE DEL DIA ${hoy}\n${cols}\n${filas}\n${totales}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Corte_${hoy.replace(/\//g,'-')}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Corte exportado en CSV')
  }

  const exportarPagos = () => {
    const datos = cobrosConFactura.map(c => ({
      Fecha:           fmtFecha(c.fechaPago),
      Paciente:        c.pacienteNombre ?? '—',
      ID_Paciente:     c.pacienteIdLegible ?? '—',
      Concepto:        c.concepto ?? 'Consulta',
      Monto:           Number(c.monto ?? 0).toFixed(2),
      Metodo_Pago:     c.metodoPago ?? '—',
      Estado:          c.estadoPago === 'paid' ? 'Pagado' : 'Pendiente',
      Facturado:       c.factura ? 'Sí' : c.incluidoEnFacturaGlobal ? 'Factura global' : 'No',
      No_Factura:      c.factura?.serie ? `${c.factura.serie}${c.factura.folio}` : '—',
    }))
    exportarCSV(datos, `Pagos_${rangoPagos.desde}_${rangoPagos.hasta}`)
  }

  const exportarConsultas = () => {
    const datos = consultasFiltradas.map(c => ({
      Fecha:            fmtFecha(c.fecha),
      Paciente_ID:      c.pacienteId ?? '—',
      Diagnostico:      c.diagnostico ?? '—',
      Motivo:           c.motivoConsulta ?? '—',
      Tratamiento:      c.tratamiento ?? '—',
      CIE10:            c.cie10 ?? '—',
      TA:               c.ta ?? '—',
      FC:               c.fc ?? '—',
      Peso_kg:          c.peso ?? '—',
    }))
    exportarCSV(datos, `Consultas_${rangoConsultas.desde}_${rangoConsultas.hasta}`)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-gray-800">Reportes</h2>
        <p className="text-sm text-gray-400">{tenant?.nombre}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab===t ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ══ Tab: Pagos y Facturas ══════════════════════════ */}
      {tab === 'Pagos y facturas' && (
        <div>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { l:'Cobrado', v:`$${totalCobrado.toLocaleString('es-MX')}`, c:'text-teal-600', bg:'bg-teal-50' },
              { l:'Pendiente', v:`$${totalPendiente.toLocaleString('es-MX')}`, c:'text-amber-600', bg:'bg-amber-50' },
              { l:'Facturado', v:`$${totalFacturado.toLocaleString('es-MX')}`, c:'text-blue-600', bg:'bg-blue-50' },
              { l:'Sin facturar', v:`$${totalNoFacturado.toLocaleString('es-MX')}`, c:'text-red-600', bg:'bg-red-50' },
            ].map((item,i) => (
              <div key={i} className={`${item.bg} rounded-xl p-4`}>
                <p className="text-xs text-gray-500 mb-1">{item.l}</p>
                <p className={`text-xl font-bold ${item.c}`}>{item.v}</p>
              </div>
            ))}
          </div>

          {/* Filtros y acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <SelectorRango desde={rangoPagos.desde} hasta={rangoPagos.hasta} onChange={setRangoPagos} />
            <div className="flex gap-2">
              {cobrosNoFacturados.length > 0 && (
                <button onClick={() => setModalFG(true)}
                  className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg
                             hover:bg-purple-700 transition-colors">
                  🧾 Factura global ({cobrosNoFacturados.length})
                </button>
              )}
              <button onClick={exportarPagos}
                className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg
                           hover:bg-green-700 transition-colors">
                📊 Exportar Excel
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Fecha','Paciente','Tipo','Concepto','Monto','Método','Estado','Facturado','Factura'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cobrosConFactura.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {fmtFecha(c.fechaPago)}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-medium text-gray-800">{c.pacienteNombre ?? '—'}</p>
                        <p className="text-xs text-gray-400 font-mono">{c.pacienteIdLegible}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <BadgeTipoPersonaRep tipo={c.tipoPersona ?? c.factura?.receptor?.tipo_persona ?? null} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{c.concepto ?? 'Consulta'}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-800 whitespace-nowrap">
                        ${Number(c.monto??0).toLocaleString('es-MX')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">
                          {c.metodoPago ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${c.estadoPago==='paid'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'}`}>
                          {c.estadoPago==='paid' ? '✓ Pagado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {c.factura ? (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">✓ Sí</span>
                        ) : c.incluidoEnFacturaGlobal ? (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Global</span>
                        ) : (
                          <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-500">
                        {c.factura ? `${c.factura.serie}${c.factura.folio}` : '—'}
                      </td>
                    </tr>
                  ))}
                  {cobrosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                        Sin cobros en el rango seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
                {cobrosFiltrados.length > 0 && (
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-600">
                        Total — {cobrosFiltrados.length} cobros
                      </td>
                      <td className="px-3 py-2 text-sm font-bold text-teal-700">
                        ${(totalCobrado + totalPendiente).toLocaleString('es-MX')}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: Consultas ════════════════════════════════ */}
      {tab === 'Consultas' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { l:'Consultas', v: consultasFiltradas.length, c:'text-teal-600', bg:'bg-teal-50' },
              { l:'Diagnósticos únicos', v: new Set(consultasFiltradas.map(c=>c.diagnostico)).size, c:'text-blue-600', bg:'bg-blue-50' },
              { l:'Promedio por día', v: (() => {
                const dias = Math.max(1, Math.ceil((new Date(rangoConsultas.hasta) - new Date(rangoConsultas.desde)) / 86400000) + 1)
                return (consultasFiltradas.length / dias).toFixed(1)
              })(), c:'text-purple-600', bg:'bg-purple-50' },
            ].map((item,i) => (
              <div key={i} className={`${item.bg} rounded-xl p-4`}>
                <p className="text-xs text-gray-500 mb-1">{item.l}</p>
                <p className={`text-xl font-bold ${item.c}`}>{item.v}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <SelectorRango desde={rangoConsultas.desde} hasta={rangoConsultas.hasta} onChange={setRangoConsultas} />
            <button onClick={exportarConsultas}
              className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg
                         hover:bg-green-700 transition-colors">
              📊 Exportar Excel
            </button>
          </div>

          {/* Agrupar por diagnóstico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Top diagnósticos</p>
              {(() => {
                const conteo = {}
                consultasFiltradas.forEach(c => {
                  if (c.diagnostico) conteo[c.diagnostico] = (conteo[c.diagnostico]??0) + 1
                })
                return Object.entries(conteo).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([dx,n],i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700 truncate flex-1">{dx}</span>
                    <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                      {n} consultas
                    </span>
                  </div>
                ))
              })()}
              {consultasFiltradas.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Consultas por día</p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {(() => {
                  const porDia = {}
                  consultasFiltradas.forEach(c => {
                    try {
                      const d = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha?.seconds*1000)
                      const key = format(d, 'yyyy-MM-dd')
                      porDia[key] = (porDia[key]??0) + 1
                    } catch {}
                  })
                  return Object.entries(porDia).sort((a,b)=>b[0].localeCompare(a[0])).map(([dia,n]) => {
                    const max = Math.max(...Object.values(porDia))
                    return (
                      <div key={dia} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-20 flex-shrink-0">
                          {format(new Date(dia+'T12:00:00'), "d MMM", {locale:es})}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                          <div className="h-full bg-teal-400 rounded-full transition-all"
                            style={{width:`${(n/max)*100}%`}} />
                          <span className="absolute right-2 top-0 text-xs text-gray-600 leading-5">{n}</span>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>

          {/* Tabla de consultas */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Fecha','Paciente','Estatus','Diagnóstico','Motivo','CIE-10','TA','Acciones'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {consultasFiltradas.map(c => {
                    // Buscar datos completos del paciente
                    const citaPac = citas.find(ci => ci.pacienteId === c.pacienteId)
                    const nombrePac = c.pacienteNombre || citaPac?.pacienteNombre || c.pacienteId || '—'
                    const telPac   = citaPac?.pacienteTel
                    const estatusCita = citaPac?.estatus ?? c.estatus ?? ''
                    const noAsistio = ['no_show','cancelada'].includes(estatusCita)
                    return (
                    <tr key={c.id} className={`hover:bg-gray-50 ${noAsistio ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtFecha(c.fecha)}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-medium text-gray-800">{nombrePac}</p>
                        <p className="text-xs text-gray-400 font-mono">{c.pacienteId ?? ''}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize
                          ${estatusCita === 'finalizada' || estatusCita === 'completada'
                            ? 'bg-green-100 text-green-700'
                            : estatusCita === 'no_show' ? 'bg-red-100 text-red-700'
                            : estatusCita === 'cancelada' ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-500'}`}>
                          {estatusCita || 'registrada'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-800 max-w-[120px] truncate">{c.diagnostico ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[120px] truncate">{c.motivoConsulta ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-blue-600">{c.cie10 ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{c.ta ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          {telPac && (
                            <button
                              onClick={async () => {
                                const { enviarWA } = await import('../services/whatsapp')
                                const msg = `Hola ${nombrePac}, le contactamos del consultorio. Notamos que no pudo asistir a su cita. ¿Le gustaría reprogramarla? Estamos para servirle.`
                                const res = await enviarWA(telPac, msg)
                                if (res.ok) toast.success('WA enviado')
                                else toast.error('No se pudo enviar WA')
                              }}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"
                              title="Enviar WhatsApp">
                              💬
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  {consultasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                        Sin consultas en el rango seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: Corte diario — estilo Dr. Salas ═══════════ */}
      {tab === 'Corte diario' && (() => { /* id se aplica al div interno */
        const hoy = format(new Date(), 'dd/MM/yyyy')
        const cobrosCorte = cobrosFiltrados
        // Conteos por método
        const totalTPV      = cobrosCorte.filter(c => c.metodoPago === 'tarjeta').reduce((s,c) => s+Number(c.monto??0), 0)
        const totalStripe   = cobrosCorte.filter(c => c.metodoPago === 'stripe').reduce((s,c) => s+Number(c.monto??0), 0)
        const totalTransf   = cobrosCorte.filter(c => c.metodoPago === 'transferencia').reduce((s,c) => s+Number(c.monto??0), 0)
        const totalEfectivo = cobrosCorte.filter(c => c.metodoPago === 'efectivo').reduce((s,c) => s+Number(c.monto??0), 0)
        const totalGeneral  = totalTPV + totalStripe + totalTransf + totalEfectivo
        const sinPaciente  = cobrosCorte.filter(c => !c.pacienteId || !c.pacienteNombre).length

        return (
          <div>
            {/* Header estilo corte */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <div className="bg-gray-800 text-white px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{tenant?.nombreDoctor ?? tenant?.nombre ?? 'Consultorio'}</p>
                  <p className="text-xs text-gray-300">Corte del día {hoy}</p>
                </div>
                <div className="flex items-center gap-3">
                  <SelectorRango desde={rangoPagos.desde} hasta={rangoPagos.hasta} onChange={setRangoPagos} />
                  <button onClick={imprimirCorte}
              className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors no-print">
              🖨️ Imprimir
            </button>
            <button onClick={exportarCortePDF}
                    className="px-3 py-1.5 bg-teal-500 text-white text-xs rounded-lg hover:bg-teal-600">
                    📄 Exportar
                  </button>
                </div>
              </div>

              {/* KPIs rápidos */}
              <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-200">
                {[
                  { l: 'Total general', v: `$${totalGeneral.toLocaleString('es-MX')}`, c: 'text-gray-800' },
                  { l: 'TPV / Tarjeta',   v: `$${totalTPV.toLocaleString('es-MX')}`,      c: 'text-purple-700' },
                  { l: 'Transferencia',  v: `$${totalTransf.toLocaleString('es-MX')}`,    c: 'text-blue-700' },
                  { l: 'Efectivo',       v: `$${totalEfectivo.toLocaleString('es-MX')}`, c: 'text-green-700' },
                ].map((k,i) => (
                  <div key={i} className="px-4 py-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">{k.l}</p>
                    <p className={`text-lg font-bold ${k.c}`}>{k.v}</p>
                  </div>
                ))}
              </div>

              {/* Tabla estilo corte Dr. Salas */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['No.','Fecha','Hora','Paciente','Servicio','Débito','Crédito','Efectivo','Transf.','Total','Factura','Elaboró','Método'].map(h => (
                        <th key={h} className="text-center px-2 py-2 font-semibold text-gray-600 uppercase whitespace-nowrap border-r border-gray-100 last:border-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cobrosCorte.map((c, idx) => {
                      const sinPac = !c.pacienteId || !c.pacienteNombre
                      const metodo = c.metodoPago ?? c.metodo ?? ''
                      const monto  = Number(c.monto ?? 0)
                      const debito = metodo === 'tarjeta' ? monto : 0
                      // credito = tarjeta crédito (no hay distinción por ahora — se muestra en débito)
                      const efectivo = metodo === 'efectivo' ? monto : 0
                      const transf   = metodo === 'transferencia' ? monto : 0
                      const fechaC = (() => {
                        try { const d=c.fechaPago?.toDate?.();return d?format(d,'d/M/yy'):'—' } catch{return '—'}
                      })()
                      const horaC = (() => {
                        try { const d=c.fechaPago?.toDate?.();return d?format(d,'HH:mm'):'—' } catch{return '—'}
                      })()
                      return (
                        <tr key={c.id} className={`text-center ${sinPac ? 'bg-red-50' : idx%2===0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                          <td className="px-2 py-1.5 border-r border-gray-100 font-mono text-gray-500">{idx+1}</td>
                          <td className="px-2 py-1.5 border-r border-gray-100 whitespace-nowrap">{fechaC}</td>
                          <td className="px-2 py-1.5 border-r border-gray-100 whitespace-nowrap">{horaC}</td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-left font-medium max-w-[160px] truncate">
                            {sinPac
                              ? <span className="text-red-600 font-semibold">⚠️ Sin asignar</span>
                              : (c.pacienteNombre ?? '—').toUpperCase()}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-left max-w-[100px] truncate text-gray-600">
                            {c.concepto ?? 'Consulta Normal'}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-right">
                            {debito > 0 ? `$${debito.toLocaleString('es-MX')}` : '$—'}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-right text-gray-400">$—</td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-right">
                            {efectivo > 0 ? `$${efectivo.toLocaleString('es-MX')}` : '$—'}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-right">
                            {transf > 0 ? `$${transf.toLocaleString('es-MX')}` : '$—'}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-right font-semibold text-gray-800">
                            {monto > 0 ? `$${monto.toLocaleString('es-MX')}` : '$—'}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100">
                            {c.facturado
                              ? <span className="text-green-600 font-semibold">SI</span>
                              : <span className="text-gray-400">NO</span>}
                          </td>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-gray-500">
                            {c.elaboradoPor ?? 'Recepción'}
                          </td>
                          <td className="px-2 py-1.5 capitalize text-gray-600">
                            {metodo === 'tarjeta' ? 'Tarjeta' : metodo === 'transferencia' ? 'Transferencia' : metodo === 'efectivo' ? 'Efectivo' : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {cobrosCorte.length === 0 && (
                      <tr><td colSpan={13} className="text-center py-8 text-gray-400">Sin cobros en el período</td></tr>
                    )}
                  </tbody>
                  {/* Totales finales estilo Dr. Salas */}
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold text-xs">
                      <td colSpan={5} className="px-3 py-2 text-right text-gray-600 uppercase tracking-wide">
                        TOTALES
                      </td>
                      <td className="px-2 py-2 text-right text-purple-700">
                        ${totalTPV.toLocaleString('es-MX')}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-400">$—</td>
                      <td className="px-2 py-2 text-right text-green-700">
                        ${totalEfectivo.toLocaleString('es-MX')}
                      </td>
                      <td className="px-2 py-2 text-right text-blue-700">
                        ${totalTransf.toLocaleString('es-MX')}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-800 text-sm">
                        ${totalGeneral.toLocaleString('es-MX')}
                      </td>
                      <td colSpan={3} className="px-2 py-2 text-center text-gray-500 text-xs">
                        {cobrosCorte.length} registros
                        {sinPaciente > 0 && <span className="ml-2 text-red-500">⚠️ {sinPaciente} sin paciente</span>}
                      </td>
                    </tr>
                    <tr className="bg-gray-800 text-white text-xs">
                      <td colSpan={5} className="px-3 py-2 text-right font-semibold uppercase">
                        INGRESOS COBRADOS
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-center">
                        <span className="text-purple-300">TOTAL TPV:</span>
                        <span className="ml-1 font-bold">${totalTPV.toLocaleString('es-MX')}</span>
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-center">
                        <span className="text-blue-300">TOTAL TRANSF:</span>
                        <span className="ml-1 font-bold">${totalTransf.toLocaleString('es-MX')}</span>
                      </td>
                      <td colSpan={4} className="px-3 py-2 text-center">
                        <span className="text-green-300">TOTAL EFECTIVO:</span>
                        <span className="ml-1 font-bold">${totalEfectivo.toLocaleString('es-MX')}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Firmas */}
              <div className="grid grid-cols-2 border-t border-gray-200 px-6 py-4">
                <div className="text-center">
                  <div className="border-b border-gray-400 w-40 mx-auto mb-1 mt-4" />
                  <p className="text-xs text-gray-500">RECEPCIÓN</p>
                </div>
                <div className="text-center">
                  <div className="border-b border-gray-400 w-40 mx-auto mb-1 mt-4" />
                  <p className="text-xs text-gray-500">{(tenant?.nombreDoctor ?? tenant?.nombre ?? 'DOCTOR').toUpperCase()}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ Tab: Seguimiento pacientes ══════════════════════ */}
      {tab === 'Seguimiento pacientes' && (
        <PacientesSinCita
          tenantId={tenantId}
          filtroMinDias={filtroMinDias}
          setFiltroMinDias={setFiltroMinDias}
        />
      )}

      {/* ══ Tab: KPIs ═════════════════════════════════════ */}
      {tab === 'Resumen KPIs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { titulo:'Total pacientes', valor: totalPacientes, icon:'👥', desc:'Total histórico en el tenant' },
            { titulo:'Primera vez', valor: kpiTipos.primeraVez, icon:'🆕', desc:'Pacientes nuevos' },
            { titulo:'Subsecuentes', valor: kpiTipos.subsecuente, icon:'🔄', desc:'Pacientes recurrentes' },
            { titulo:'Consultas este mes', valor: consultasFiltradas.length, icon:'🩺', desc:'Basado en rango seleccionado' },
            { titulo:'Ingresos cobrados', valor:`$${totalCobrado.toLocaleString('es-MX')}`, icon:'💰', desc:'Pagos confirmados' },
            { titulo:'Facturas emitidas', valor: facturas.filter(f=>f.estatus==='valid').length, icon:'🧾', desc:'CFDI vigentes' },
            { titulo:'Citas completadas', valor: citas.filter(c=>['finalizada','completada'].includes(c.estatus)).length, icon:'✅', desc:'Total histórico' },
            { titulo:'No-shows', valor: citas.filter(c=>c.estatus==='no_show').length, icon:'⏰', desc:'Total histórico' },
          ].map((k,i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{k.icon}</span>
                <p className="text-sm font-medium text-gray-700">{k.titulo}</p>
              </div>
              <p className="text-2xl font-bold text-gray-800">{k.valor}</p>
              <p className="text-xs text-gray-400 mt-1">{k.desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal Factura Global */}
      {modalFG && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalFG(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Generar factura global</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se incluirán <strong>{cobrosNoFacturados.length} cobros</strong> por un total de{' '}
              <strong className="text-teal-700">${totalNoFacturado.toLocaleString('es-MX')} MXN</strong>
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-700 font-medium mb-1">⚠️ Cobros que se incluirán:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {cobrosNoFacturados.slice(0,10).map(c => (
                  <div key={c.id} className="flex justify-between text-xs text-amber-800">
                    <span>{c.pacienteNombre ?? 'Paciente'} — {c.concepto ?? 'Consulta'}</span>
                    <span className="font-semibold">${Number(c.monto??0).toLocaleString('es-MX')}</span>
                  </div>
                ))}
                {cobrosNoFacturados.length > 10 && (
                  <p className="text-xs text-amber-600">... y {cobrosNoFacturados.length - 10} más</p>
                )}
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">RFC del receptor</label>
                <input type="text" value={rfcGlobal}
                  onChange={e => setRfcGlobal(e.target.value.toUpperCase())}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <p className="text-xs text-gray-400 mt-0.5">
                  XAXX010101000 = Público en general (sin RFC)
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Concepto de la factura global</label>
                <input type="text" value={conceptoGlobal}
                  onChange={e => setConceptoGlobal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={generarFacturaGlobal} disabled={generandoFG}
                className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-sm font-medium
                           hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {generandoFG ? 'Generando...' : 'Generar factura global'}
              </button>
              <button onClick={() => setModalFG(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
{/* ══ T-04: Tab Medicamentos / Procedimientos ══════════════ */}
      {tab === '💊 Medicamentos' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Dashboard de Medicamentos y Procedimientos</h3>
              <p className="text-xs text-gray-400">Últimos 90 días · Útil para negociar convenios con laboratorios</p>
            </div>
            <button
              onClick={() => {
                const rows = procedimientos.map(p =>
                  [p.fecha?.toDate?.().toLocaleDateString('es-MX') ?? '—',
                   p.tipo ?? '—', p.medicamento ?? p.descripcion ?? '—',
                   p.dosis ?? '—', p.lote ?? '—',
                   p.pacienteId ?? '—', `$${p.precio ?? 0}`].join(',')
                )
                const csv = ['Fecha,Tipo,Medicamento/Descripcion,Dosis,Lote,PacienteID,Precio', ...rows].join('\n')
                const a = document.createElement('a')
                a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
                a.download = 'procedimientos_novaryk.csv'
                a.click()
              }}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
              ⬇ Exportar CSV
            </button>
          </div>

          {/* Resumen por medicamento */}
          {(() => {
            const meds = {}
            procedimientos.filter(p => p.tipo === 'medicamento').forEach(p => {
              const nombre = p.medicamento === 'otro' ? (p.descripcion || 'Otro') : (p.medicamento || 'Sin nombre')
              if (!meds[nombre]) meds[nombre] = { total: 0, pacientes: new Set() }
              meds[nombre].total++
              if (p.pacienteId) meds[nombre].pacientes.add(p.pacienteId)
            })
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {Object.entries(meds).map(([nombre, data]) => (
                  <div key={nombre} className="bg-white rounded-xl border border-indigo-100 p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-1">💊 {nombre}</p>
                    <p className="text-2xl font-bold text-indigo-600">{data.total}</p>
                    <p className="text-xs text-gray-400">aplicaciones · {data.pacientes.size} pacientes únicos</p>
                  </div>
                ))}
                {Object.keys(meds).length === 0 && (
                  <div className="col-span-3 text-center py-8 text-gray-400 text-sm">
                    Sin procedimientos de medicamento en los últimos 90 días
                  </div>
                )}
              </div>
            )
          })()}

          {/* Tabla completa */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Fecha','Tipo','Medicamento / Detalle','Dosis','Lote','Precio'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {procedimientos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.fecha?.toDate?.().toLocaleDateString('es-MX') ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                        {p.tipo === 'medicamento' ? '💊' : p.tipo === 'biopsia' ? '🔬' : '📡'} {p.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {p.medicamento === 'otro' ? p.descripcion : (p.medicamento || p.descripcion || '—')}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.dosis || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.lote || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                      {p.precio > 0 ? `$${Number(p.precio).toLocaleString('es-MX')}` : '—'}
                    </td>
                  </tr>
                ))}
                {procedimientos.length === 0 && (
                  <tr><td colSpan="6" className="py-8 text-center text-gray-400 text-sm">
                    Sin procedimientos registrados
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}