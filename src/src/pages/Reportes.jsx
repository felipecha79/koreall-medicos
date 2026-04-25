import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot, where, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import {
  format, startOfMonth, endOfMonth, subMonths,
  startOfWeek, endOfWeek, isSameMonth
} from 'date-fns'
import { es } from 'date-fns/locale'

export default function Reportes() {
  const { tenantId } = useTenant()
  const [cobros,   setCobros]   = useState([])
  const [citas,    setCitas]    = useState([])
  const [pacientes,setPacientes]= useState([])
  const [periodo,  setPeriodo]  = useState('mes') // mes | semana | año

  useEffect(() => {
    if (!tenantId) return
    const unC = onSnapshot(query(collection(db,`tenants/${tenantId}/cobros`),orderBy('fechaPago','desc')), s=>setCobros(s.docs.map(d=>({id:d.id,...d.data()}))))
    const unCi= onSnapshot(query(collection(db,`tenants/${tenantId}/citas`), orderBy('fecha','desc')), s=>setCitas(s.docs.map(d=>({id:d.id,...d.data()}))))
    const unP = onSnapshot(collection(db,`tenants/${tenantId}/pacientes`), s=>setPacientes(s.docs.map(d=>({id:d.id,...d.data()}))))
    return () => { unC(); unCi(); unP() }
  }, [tenantId])

  const ahora = new Date()
  const iniMes = startOfMonth(ahora)
  const finMes = endOfMonth(ahora)
  const mesPasado = subMonths(ahora, 1)
  const iniMesP = startOfMonth(mesPasado)
  const finMesP = endOfMonth(mesPasado)

  // ── Métricas de ingresos ─────────────────────────────
  const cobrosDelMes     = cobros.filter(c => { const f=c.fechaPago?.toDate?.(); return f&&f>=iniMes&&f<=finMes })
  const cobrosMesPasado  = cobros.filter(c => { const f=c.fechaPago?.toDate?.(); return f&&f>=iniMesP&&f<=finMesP })
  const ingresosMes      = cobrosDelMes.reduce((s,c) => s+Number(c.monto??0), 0)
  const ingresosMesPas   = cobrosMesPasado.reduce((s,c) => s+Number(c.monto??0), 0)
  const varIngresos      = ingresosMesPas > 0 ? ((ingresosMes-ingresosMesPas)/ingresosMesPas*100).toFixed(0) : null

  // ── Métricas de citas ────────────────────────────────
  const citasMes         = citas.filter(c => { const f=c.fecha?.toDate?.(); return f&&f>=iniMes&&f<=finMes })
  const completadas      = citasMes.filter(c => c.estatus==='completada').length
  const noShows          = citasMes.filter(c => c.estatus==='no_show').length
  const canceladas       = citasMes.filter(c => c.estatus==='cancelada').length
  const tasaAsistencia   = citasMes.length > 0
    ? Math.round(completadas/citasMes.length*100) : 0

  // ── Ingresos por mes (últimos 6) ─────────────────────
  const meses6 = Array.from({length:6}, (_,i) => subMonths(ahora, 5-i))
  const barras = meses6.map(m => {
    const ini = startOfMonth(m)
    const fin = endOfMonth(m)
    const total = cobros
      .filter(c => { const f=c.fechaPago?.toDate?.(); return f&&f>=ini&&f<=fin })
      .reduce((s,c) => s+Number(c.monto??0), 0)
    return { mes: format(m,'MMM',{locale:es}), total }
  })
  const maxBarra = Math.max(...barras.map(b => b.total), 1)

  // ── Diagnósticos más comunes ─────────────────────────
  // Se calcularía desde consultas — placeholder por ahora
  const metodoPago = Object.entries(
    cobrosDelMes.reduce((acc, c) => {
      acc[c.metodo] = (acc[c.metodo] ?? 0) + Number(c.monto??0)
      return acc
    }, {})
  ).sort((a,b) => b[1]-a[1])

  // ── Pacientes nuevos este mes ─────────────────────────
  const pacNuevos = pacientes.filter(p => {
    const f = p.creadoEn?.toDate?.()
    return f && f >= iniMes
  }).length

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Reportes</h2>
          <p className="text-sm text-gray-400">
            {format(ahora, "MMMM yyyy", {locale:es})}
          </p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="mes">Este mes</option>
          <option value="semana">Esta semana</option>
        </select>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Ingresos del mes',
            value: `$${ingresosMes.toLocaleString('es-MX')}`,
            sub: varIngresos !== null
              ? `${varIngresos >= 0 ? '+' : ''}${varIngresos}% vs mes anterior`
              : 'Primer mes de datos',
            color: ingresosMes >= ingresosMesPas ? 'text-green-600' : 'text-red-500',
            icon: '💰',
          },
          {
            label: 'Citas este mes',
            value: citasMes.length,
            sub: `${completadas} completadas`,
            color: 'text-teal-600',
            icon: '📅',
          },
          {
            label: 'Tasa de asistencia',
            value: `${tasaAsistencia}%`,
            sub: `${noShows} no-shows`,
            color: tasaAsistencia >= 80 ? 'text-green-600' : 'text-amber-500',
            icon: '✓',
          },
          {
            label: 'Pacientes nuevos',
            value: pacNuevos,
            sub: `${pacientes.length} total`,
            color: 'text-purple-600',
            icon: '👤',
          },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span>{kpi.icon}</span>
              <p className="text-xs text-gray-400">{kpi.label}</p>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Gráfica de ingresos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Ingresos últimos 6 meses
          </h3>
          <div className="flex items-end gap-2 h-32">
            {barras.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-xs text-gray-500 font-medium truncate">
                  {b.total > 0 ? `$${(b.total/1000).toFixed(0)}k` : ''}
                </p>
                <div className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max((b.total/maxBarra)*100, 4)}%`,
                    background: isSameMonth(meses6[i], ahora) ? '#028090' : '#C7EAEE',
                    minHeight: 4,
                  }} />
                <p className="text-xs text-gray-400 capitalize">{b.mes}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Estatus de citas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Citas este mes por estatus
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Completadas', val: completadas,   total: citasMes.length, color: 'bg-green-500' },
              { label: 'Canceladas',  val: canceladas,    total: citasMes.length, color: 'bg-red-400' },
              { label: 'No llegaron', val: noShows,       total: citasMes.length, color: 'bg-amber-400' },
              { label: 'Programadas', val: citasMes.filter(c=>c.estatus==='programada'||c.estatus==='confirmada').length,
                total: citasMes.length, color: 'bg-blue-400' },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="text-gray-800 font-medium">
                    {item.val} ({item.total > 0 ? Math.round(item.val/item.total*100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${item.color}`}
                    style={{ width: `${item.total > 0 ? item.val/item.total*100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Métodos de pago */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Ingresos por método de pago
          </h3>
          {metodoPago.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {metodoPago.map(([metodo, monto]) => (
                <div key={metodo} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {metodo === 'efectivo' ? '💵'
                        : metodo === 'tarjeta' ? '💳'
                        : metodo === 'transferencia' ? '🏦' : '💰'}
                    </span>
                    <span className="text-sm capitalize text-gray-700">{metodo}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">
                      ${monto.toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {ingresosMes > 0 ? Math.round(monto/ingresosMes*100) : 0}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen del mes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Resumen financiero
          </h3>
          <div className="space-y-3">
            {[
              ['Total cobrado', `$${ingresosMes.toLocaleString('es-MX')} MXN`, 'text-gray-800'],
              ['Promedio por consulta',
                cobrosDelMes.length > 0
                  ? `$${Math.round(ingresosMes/cobrosDelMes.length).toLocaleString('es-MX')} MXN`
                  : '—',
                'text-teal-600'],
              ['Cobros sin factura',
                cobrosDelMes.filter(c=>!c.facturado).length,
                'text-amber-500'],
              ['Facturas timbradas',
                cobrosDelMes.filter(c=>c.facturado).length,
                'text-green-600'],
              ['No-shows (ingreso perdido)',
                noShows > 0 && cobrosDelMes.length > 0
                  ? `~$${(noShows * Math.round(ingresosMes/(cobrosDelMes.length||1))).toLocaleString('es-MX')}`
                  : '$0',
                'text-red-400'],
            ].map(([label, val, color], i) => (
              <div key={i} className="flex justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className={`font-semibold ${color}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
