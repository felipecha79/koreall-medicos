// src/pages/Suscripciones.jsx — DocVia v22
// Portal de suscripción del doctor — ver plan, facturas, pagar, configurar modo de cobro
import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { getStripe } from '../services/stripe'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const PLANES = {
  starter:    { label: 'Starter',    precio:  649, color: 'bg-gray-100 text-gray-600',   icon: '🌱' },
  basico:     { label: 'Básico',     precio:  999, color: 'bg-teal-100 text-teal-700',   icon: '⚡' },
  pro:        { label: 'Pro',        precio: 1899, color: 'bg-blue-100 text-blue-700',   icon: '🚀' },
  clinica:    { label: 'Clínica',    precio: 2800, color: 'bg-purple-100 text-purple-700', icon: '🏥' },
  enterprise: { label: 'Enterprise', precio: 6500, color: 'bg-amber-100 text-amber-700', icon: '🏢' },
}

function fmtFecha(val) {
  if (!val) return '—'
  try {
    const d = val?.toDate ? val.toDate() : new Date(val)
    return format(d, "d 'de' MMMM yyyy", { locale: es })
  } catch { return '—' }
}

function EstadoBadge({ activa, enGracia }) {
  if (activa && !enGracia) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                     bg-green-100 text-green-700 px-3 py-1 rounded-full">
      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
      Activa
    </span>
  )
  if (enGracia) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                     bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
      ⚠️ En periodo de gracia
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                     bg-red-100 text-red-700 px-3 py-1 rounded-full">
      🔒 Suspendida
    </span>
  )
}

export default function Suscripciones() {
  const { tenantId, tenant } = useTenant()
  const [facturas,     setFacturas]     = useState([])
  const [config,       setConfig]       = useState(null)
  const [modalModo,    setModalModo]    = useState(false)
  const [modalPago,    setModalPago]    = useState(false)
  const [cargandoSub,  setCargandoSub]  = useState(false)
  const [facturaAbierta, setFacturaAbierta] = useState(null)

  const plan       = tenant?.plan ?? 'pro'
  const planInfo   = PLANES[plan] ?? PLANES.pro
  const montoBase  = planInfo.precio
  const montoTotal = Math.round(montoBase * 1.16)  // con IVA 16%
  const modoPago   = tenant?.modoPago ?? 'manual'

  // Calcular estado de suscripción
  const fechaVenc    = tenant?.fechaVencimiento?.toDate?.() ?? null
  const hoy          = new Date()
  const diasVencido  = fechaVenc ? Math.floor((hoy - fechaVenc) / (1000*60*60*24)) : 0
  const diasGracia   = tenant?.diasGracia ?? 10
  const enGracia     = diasVencido > 0 && diasVencido <= diasGracia
  const diasRestantes = Math.max(0, diasGracia - diasVencido)

  // Cargar historial de facturas DocVia
  useEffect(() => {
    if (!tenantId) return
    const q = query(
      collection(db, 'tenants', String(tenantId), 'facturas_docvias'),
      orderBy('creadoEn', 'desc')
    )
    return onSnapshot(q,
      snap => setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setFacturas([])
    )
  }, [tenantId])

  // Cargar config DocVia (para mostrar datos de contacto/soporte)
  useEffect(() => {
    getDoc(doc(db, 'configuracion', 'docvias'))
      .then(snap => { if (snap.exists()) setConfig(snap.data()) })
      .catch(() => {})
    // Cargar también los planes para obtener el paymentLink del plan del doctor
    getDoc(doc(db, 'configuracion', 'planes'))
      .then(snap => {
        if (snap.exists() && snap.data().lista) {
          setConfig(prev => ({ ...prev, _planes: snap.data().lista }))
        }
      })
      .catch(() => {})
  }, [])

  // ── Pago único con Stripe Checkout ────────────────────────────────────────
  const pagarAhora = async () => {
    // Buscar el payment link del plan actual desde configuracion/planes
    const planesLista = config?._planes ?? []
    const planData    = planesLista.find(p => p.id === plan)
    const link        = planData?.paymentLink || config?.stripePaymentLinkDocVias || null
    if (!link) {
      toast.error(
        'El Payment Link para el plan ' + plan.toUpperCase() + ' no está configurado. ' +
        'Ve a Admin → Sistema → Planes y Precios y agrega el link de Stripe.'
      )
      return
    }
    try {
      const url = new URL(link)
      if (tenant?.email) url.searchParams.set('prefilled_email', tenant.email)
      url.searchParams.set('client_reference_id', String(tenantId))
      const win = window.open(url.toString(), 'pago_docvias',
        'width=520,height=700,left=200,top=80,resizable=yes,scrollbars=yes')
      if (!win) toast.error('Activa los popups para pagar en tu navegador')
      else setModalPago(true)
    } catch {
      toast.error('El Payment Link configurado no es válido. Verifica la URL en Planes y Precios.')
    }
  }

  // ── Activar suscripción automática con Stripe ─────────────────────────────
  const activarSuscripcionAuto = async () => {
    const priceId = config?.stripePriceId?.[plan]
    if (!priceId) {
      toast.error('Configura los Price IDs de Stripe en Admin → Sistema → Configuración DocVia')
      return
    }
    setCargandoSub(true)
    try {
      const stripe = await getStripe()
      // Crear checkout session de suscripción via API
      const res = await fetch('/api/crear-suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, plan, priceId, email: tenant?.email }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al crear suscripción')
      }
      const { sessionId } = await res.json()
      await stripe.redirectToCheckout({ sessionId })
    } catch(e) {
      toast.error(e.message)
    } finally { setCargandoSub(false) }
  }

  const proximoPago = tenant?.fechaProximoPago ? fmtFecha(tenant.fechaProximoPago) : '1° de cada mes'
  const facturaActual = facturas.find(f => !f.pagado)

  return (
    <div className="p-4 md:p-6 max-w-3xl">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Mi suscripción</h2>
        <p className="text-sm text-gray-400 mt-0.5">DocVia · {tenant?.nombre ?? ''}</p>
      </div>

      {/* Alerta periodo de gracia */}
      {enGracia && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-5 flex items-start gap-3">
          <span className="text-2xl mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              Tienes {diasRestantes} día{diasRestantes !== 1 ? 's' : ''} para regularizar tu pago
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Tu suscripción vence el {fmtFecha(tenant?.fechaVencimiento)}.
              Después de ese plazo, el acceso se suspende automáticamente.
            </p>
            <button onClick={pagarAhora}
              className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm font-medium
                         rounded-lg hover:bg-amber-700 transition-colors">
              Pagar ahora — ${montoTotal.toLocaleString('es-MX')} MXN
            </button>
          </div>
        </div>
      )}

      {/* Tarjeta plan actual */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{planInfo.icon}</span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${planInfo.color}`}>
                Plan {planInfo.label}
              </span>
              <EstadoBadge activa={tenant?.suscripcionActiva !== false} enGracia={enGracia} />
            </div>
            <p className="text-4xl font-bold text-gray-800 mt-1">
              ${montoBase.toLocaleString('es-MX')}
              <span className="text-lg font-normal text-gray-400"> MXN/mes</span>
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              ${montoTotal.toLocaleString('es-MX')} MXN con IVA 16% incluido
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Consultorio: <strong className="text-gray-600">{tenant?.nombre ?? '—'}</strong>
              {tenant?.rfc && <span className="ml-2 font-mono">RFC: {tenant.rfc}</span>}
            </p>
          </div>
          <div className="text-right ml-4">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs text-gray-400">Próximo cobro</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">{proximoPago}</p>
              <p className="text-xs text-gray-400 mt-2">Modo de pago</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">
                {modoPago === 'automatico' ? '💳 Automático' : '📋 Manual'}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 mt-4 pt-3 flex justify-end">
          <button onClick={() => setModalModo(true)}
            className="text-xs px-4 py-1.5 border border-gray-200 rounded-lg
                       hover:bg-gray-50 text-gray-600 transition-colors">
            ⚙️ Cambiar modo de pago
          </button>
        </div>
      </div>

      {/* Factura pendiente */}
      {facturaActual && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-800">🧾 Factura pendiente</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                {facturaActual.mes} · ${Number(facturaActual.total ?? montoTotal).toLocaleString('es-MX')} MXN
              </p>
            </div>
            <div className="flex gap-2">
              {facturaActual.pdfUrl && (
                <a href={facturaActual.pdfUrl} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-700
                             rounded-lg hover:bg-indigo-100 transition-colors">
                  PDF
                </a>
              )}
              <button onClick={pagarAhora}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg
                           hover:bg-indigo-700 transition-colors">
                💳 Pagar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Historial de pagos</p>
          <span className="text-xs text-gray-400">{facturas.length} registros</span>
        </div>
        {facturas.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">Sin historial de pagos aún</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {facturas.map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {f.mes ? `${f.mes}` : fmtFecha(f.creadoEn)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {f.stripeInvoiceId ? 'Stripe' : 'CFDI'} ·{' '}
                    Plan {f.plan?.toUpperCase() ?? 'PRO'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-gray-800">
                    ${Number(f.total ?? 0).toLocaleString('es-MX')} MXN
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${f.pagado
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'}`}>
                    {f.pagado ? '✓ Pagado' : 'Pendiente'}
                  </span>
                  {f.pdfUrl && (
                    <a href={f.pdfUrl} target="_blank" rel="noreferrer"
                      className="text-xs text-teal-600 hover:underline">PDF</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Datos fiscales */}
      {config?.rfc && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Datos fiscales de DocVia (emisor)
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div><span className="text-gray-400">RFC: </span>{config.rfc}</div>
            <div><span className="text-gray-400">Régimen: </span>{config.regimen}</div>
            <div className="col-span-2"><span className="text-gray-400">Razón social: </span>{config.nombreLegal}</div>
          </div>
        </div>
      )}

      {/* ── Modal: Cambiar modo de pago ── */}
      {modalModo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalModo(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1 text-gray-800">Modo de cobro</h3>
            <p className="text-sm text-gray-500 mb-5">
              Elige cómo quieres pagar tu suscripción DocVia cada mes.
            </p>

            {/* Opción Manual */}
            <div className={`border-2 rounded-xl p-4 mb-3 cursor-pointer transition-colors
              ${modoPago === 'manual' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}
              onClick={() => setModalModo(false)}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">📋</span>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Pago manual</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    El día 1 de cada mes recibirás tu factura por WhatsApp y email.
                    Entras al portal y pagas cuando quieras antes del vencimiento.
                  </p>
                  <p className="text-xs text-teal-600 font-medium mt-1.5">
                    ✓ Actualmente configurado
                  </p>
                </div>
              </div>
            </div>

            {/* Opción Automática */}
            <div className={`border-2 rounded-xl p-4 mb-5 cursor-pointer transition-colors
              ${modoPago === 'automatico' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
              onClick={activarSuscripcionAuto}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">💳</span>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">
                    Cobro automático
                    {cargandoSub && <span className="ml-2 text-xs text-indigo-500">Cargando...</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Guarda tu tarjeta de crédito y se cobra automáticamente el día 1.
                    Nunca perderás el acceso por olvido de pago.
                  </p>
                  <p className="text-xs text-indigo-600 font-medium mt-1.5">
                    → Se abrirá Stripe para guardar tu tarjeta de forma segura
                  </p>
                </div>
              </div>
            </div>

            <button onClick={() => setModalModo(false)}
              className="w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm
                         hover:bg-gray-200 transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmación de pago ── */}
      {modalPago && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalPago(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center"
            onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">💳</div>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Página de pago abierta</h3>
            <p className="text-sm text-gray-500 mb-2">
              Completa el pago de{' '}
              <strong>${montoTotal.toLocaleString('es-MX')} MXN</strong>{' '}
              en la ventana de Stripe.
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Plan {planInfo.label} · Con IVA incluido · Sin guardar tarjeta
            </p>
            <button onClick={() => setModalPago(false)}
              className="w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm
                         hover:bg-gray-200 transition-colors">
              Listo, ya pagué
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
