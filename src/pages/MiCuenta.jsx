// src/pages/MiCuenta.jsx — Novaryk.Med v1
// Página del doctor: suscripción actual + pagar + usuarios del consultorio
import { useState, useEffect } from 'react'
import { collection, onSnapshot, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { getAuth, sendPasswordResetEmail } from 'firebase/auth'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { infoRol } from '../services/permisos'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const PLANES = {
  starter:    { label: 'Starter',    precio:  649, color: 'bg-gray-100 text-gray-700',     icon: '🌱' },
  basico:     { label: 'Básico',     precio:  999, color: 'bg-teal-100 text-teal-700',     icon: '⚡' },
  pro:        { label: 'Pro',        precio: 1899, color: 'bg-blue-100 text-blue-700',     icon: '🚀' },
  clinica:    { label: 'Clínica',    precio: 2800, color: 'bg-purple-100 text-purple-700', icon: '🏥' },
  enterprise: { label: 'Enterprise', precio: 6500, color: 'bg-amber-100 text-amber-700',   icon: '🏢' },
}

function fmtFecha(val) {
  if (!val) return '—'
  try { return format(val?.toDate ? val.toDate() : new Date(val), "d 'de' MMMM yyyy", { locale: es }) }
  catch { return '—' }
}

export default function MiCuenta() {
  const { tenantId, tenant, role } = useTenant()
  const [usuarios,    setUsuarios]    = useState([])
  const [planesConf,  setPlanesConf]  = useState([])
  const [modalPago,   setModalPago]   = useState(false)
  const [modalReset,  setModalReset]  = useState(null)

  const plan      = tenant?.plan ?? 'pro'
  const planInfo  = PLANES[plan] ?? PLANES.pro
  const montoBase = planInfo.precio
  const montoIVA  = Math.round(montoBase * 1.16)
  const activa    = tenant?.suscripcionActiva !== false
  const [showTransf, setShowTransf] = useState(false)  // T-06
  const [comprobante, setComprobante] = useState(null)   // T-06
  const [subiendoComp, setSubiendo]  = useState(false)  // T-06

  // Cargar usuarios del consultorio
  useEffect(() => {
    if (!tenantId) return
    return onSnapshot(
      collection(db, 'tenants', String(tenantId), 'usuarios'),
      snap => setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    )
  }, [tenantId])

  // Cargar payment links de planes
  useEffect(() => {
    getDoc(doc(db, 'configuracion', 'planes'))
      .then(snap => { if (snap.exists() && snap.data().lista) setPlanesConf(snap.data().lista) })
      .catch(() => {})
  }, [])

  // T-06: Subir comprobante de transferencia
const subirComprobante = async (archivo) => {
  if (!archivo) return
  setSubiendo(true)
  try {
    // Guardar referencia en Firestore (sin Storage por ahora — nombre del archivo)
    const { addDoc, collection: col, Timestamp: TS } = await import('firebase/firestore')
    const { db: fdb } = await import('../firebase')
    const mes = new Date().toISOString().slice(0,7)
    await addDoc(col(fdb, `tenants/${tenantId}/pagos_transferencia`), {
      tipo: 'transferencia',
      monto: montoBase,
      mesAplicar: mes,
      nombreArchivo: archivo.name,
      tamaño: archivo.size,
      estatus: 'pendiente',
      creadoEn: TS.now(),
      concepto: `NovMed-${tenantId}-${mes}`,
    })
    setComprobante(archivo.name)
    toast.success('Comprobante registrado. El equipo lo revisará en 24h ✓')
    setShowTransf(false)
  } catch(e) {
    toast.error('Error al registrar comprobante')
  } finally { setSubiendo(false) }
}

const pagarSuscripcion = () => {
    const planData = planesConf.find(p => p.id === plan)
    const link = planData?.paymentLink || null
    if (!link) {
      toast.error('El link de pago no está configurado. Contacta a soporte Novaryk.Med.')
      return
    }
    try {
      const url = new URL(link)
      if (tenant?.email) url.searchParams.set('prefilled_email', tenant.email)
      url.searchParams.set('client_reference_id', String(tenantId))
      const win = window.open(url.toString(), 'pago_docvias',
        'width=520,height=700,left=200,top=80,resizable=yes,scrollbars=yes')
      if (!win) toast.error('Activa los popups del navegador para pagar')
      else setModalPago(true)
    } catch { toast.error('Link de pago inválido. Contacta a soporte.') }
  }

  const resetPassword = async (usuario) => {
    try {
      const auth = getAuth()
      await sendPasswordResetEmail(auth, usuario.email)
      toast.success('✅ Email enviado a ' + usuario.email)
      setModalReset(null)
    } catch(e) {
      toast.error('Error: ' + (e.message ?? 'No se pudo enviar'))
    }
  }

  const toggleActivo = async (u) => {
    try {
      await updateDoc(doc(db, 'tenants', String(tenantId), 'usuarios', u.id), {
        activo: !u.activo, actualizadoEn: Timestamp.now()
      })
      toast.success(u.activo ? 'Usuario desactivado' : 'Usuario reactivado')
    } catch { toast.error('Error al actualizar') }
  }

  const proximoPago = tenant?.fechaProximoPago ? fmtFecha(tenant.fechaProximoPago) : '1° de cada mes'

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-gray-800">Mi cuenta</h2>
        <p className="text-sm text-gray-400">{tenant?.nombre ?? ''}</p>
      </div>

      {/* Alerta si suscripción inactiva */}
      {!activa && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Suscripción suspendida</p>
            <p className="text-xs text-red-600 mt-0.5">
              Realiza el pago para reactivar el acceso completo.
            </p>
            <button onClick={pagarSuscripcion}
              className="mt-3 px-4 py-2 bg-red-600 text-white text-sm font-medium
                         rounded-lg hover:bg-red-700 transition-colors">
              Pagar ahora
            </button>
          </div>
        </div>
      )}

      {/* ── Tarjeta de suscripción ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Plan activo</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{planInfo.icon}</span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${planInfo.color}`}>
                Plan {planInfo.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                ${activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {activa ? '● Activo' : '● Suspendido'}
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-800 mt-3">
              ${montoBase.toLocaleString('es-MX')}
              <span className="text-base font-normal text-gray-400"> MXN/mes</span>
            </p>
            <p className="text-xs text-gray-400">${montoIVA.toLocaleString('es-MX')} MXN con IVA</p>
          </div>
          <div className="text-right">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 min-w-[140px]">
              <p className="text-xs text-gray-400">Próximo pago</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">{proximoPago}</p>
              {tenant?.fechaVencimiento && (
                <>
                  <p className="text-xs text-gray-400 mt-2">Fecha límite</p>
                  <p className="text-sm font-semibold text-amber-600">
                    {fmtFecha(tenant.fechaVencimiento)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Botón pagar — Stripe o Transferencia */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <button onClick={pagarSuscripcion}
            className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold
                       hover:bg-teal-700 transition-colors flex items-center justify-center gap-2">
            💳 Pagar con tarjeta
          </button>
          <button onClick={() => setShowTransf(v => !v)}
            className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold
                       hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
            🏦 Transferencia bancaria
          </button>
        </div>

        {/* T-06: Panel de transferencia bancaria */}
        {showTransf && (
          <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-indigo-800 mb-3">📲 Datos para transferencia</p>
            <div className="space-y-2 text-sm text-gray-700 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Beneficiario</span>
                <span className="font-medium">Juan Felipe Chavez Bezares</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">CLABE</span>
                <span className="font-mono font-medium text-sm">072420011785155521</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Banco</span>
                <span className="font-medium">Banorte</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Monto</span>
                <span className="font-semibold text-teal-700">${montoBase.toLocaleString('es-MX')} MXN</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Concepto</span>
                <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border">
                  NovMed-{tenantId?.slice(-6)}-{new Date().toISOString().slice(0,7)}
                </span>
              </div>
            </div>
            <div className="border-t border-indigo-200 pt-3">
              <p className="text-xs text-gray-500 mb-2">Sube tu comprobante de pago (JPG, PNG o PDF):</p>
              <input type="file" accept="image/*,.pdf"
                onChange={e => subirComprobante(e.target.files?.[0])}
                disabled={subiendoComp}
                className="w-full text-sm text-gray-600
                  file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                  file:text-sm file:bg-indigo-600 file:text-white hover:file:bg-indigo-700
                  file:cursor-pointer" />
              {comprobante && (
                <p className="text-xs text-green-600 mt-1">✓ Registrado: {comprobante}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                El equipo Novaryk confirmará tu pago en menos de 24 horas hábiles.
              </p>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-2">
          Pago seguro · Sin guardar tarjeta · Soporte: soporte@novaryk.mx
        </p>
      </div>

      {/* ── Historial de facturas ── */}
      {tenant?.ultimoCFDIUrl && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">🧾 Última factura Novaryk.Med</p>
              <p className="text-xs text-gray-400 mt-0.5">CFDI disponible para descarga</p>
            </div>
            <a href={tenant.ultimoCFDIUrl} target="_blank" rel="noreferrer"
              className="text-xs px-3 py-1.5 border border-teal-200 text-teal-600
                         rounded-lg hover:bg-teal-50 transition-colors">
              Descargar PDF
            </a>
          </div>
        </div>
      )}

      {/* ── Usuarios del consultorio ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">👥 Usuarios del consultorio</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {usuarios.filter(u => u.activo !== false).length} activos · {usuarios.length} total
            </p>
          </div>
          {['doctor','dueno','superadmin','admin'].includes(role) && (
            <p className="text-xs text-gray-400">
              Para agregar usuarios: Super Admin → Usuarios
            </p>
          )}
        </div>

        {usuarios.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm">Sin usuarios registrados en este consultorio</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {usuarios.map(u => {
              const rolInfo = infoRol(u.rol)
              return (
                <div key={u.id}
                  className={`flex items-center justify-between px-5 py-3 ${!u.activo ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center
                                    justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                      {(u.nombre?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {u.nombre} {u.apellidos}
                        {!u.activo && <span className="ml-2 text-xs text-red-400">(inactivo)</span>}
                      </p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${rolInfo.color}`}>
                      {rolInfo.label}
                    </span>
                    {['doctor','dueno','superadmin','admin'].includes(role) && (
                      <div className="flex gap-1">
                        <button onClick={() => setModalReset(u)}
                          className="text-xs px-2 py-1 border border-blue-200 text-blue-600
                                     rounded hover:bg-blue-50 transition-colors">
                          🔑
                        </button>
                        <button onClick={() => toggleActivo(u)}
                          className={`text-xs px-2 py-1 border rounded transition-colors
                            ${u.activo
                              ? 'border-red-200 text-red-400 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                          {u.activo ? 'Off' : 'On'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal pago confirmado */}
      {modalPago && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalPago(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center"
            onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">💳</div>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Ventana de pago abierta</h3>
            <p className="text-sm text-gray-500 mb-2">
              Completa el pago de{' '}
              <strong>${montoIVA.toLocaleString('es-MX')} MXN</strong>{' '}
              en la ventana de Stripe.
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Sin guardar tarjeta · Plan {planInfo.label}
            </p>
            <button onClick={() => setModalPago(false)}
              className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium
                         hover:bg-teal-700 transition-colors">
              ✓ Ya realicé el pago
            </button>
          </div>
        </div>
      )}

      {/* Modal reset contraseña */}
      {modalReset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalReset(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Restablecer contraseña</h3>
            <p className="text-sm text-gray-500 mb-5">
              Se enviará un email de restablecimiento a{' '}
              <strong>{modalReset.email}</strong>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => resetPassword(modalReset)}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium
                           hover:bg-blue-700 transition-colors">
                Enviar email
              </button>
              <button onClick={() => setModalReset(null)}
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
