import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

export default function SuscripcionVencida({ tenant }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">

        {/* Ícono */}
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center
                        mx-auto mb-6">
          <span className="text-4xl">🔒</span>
        </div>

        {/* Título */}
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Acceso suspendido
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          {tenant?.nombre ?? 'Tu consultorio'}
        </p>

        {/* Mensaje */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            ⚠️ Suscripción inactiva
          </p>
          <p className="text-sm text-amber-700">
            El acceso a MediDesk está temporalmente suspendido.
            Para reactivar tu cuenta contacta a soporte.
          </p>
        </div>

        {/* Datos de contacto */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Contactar soporte
          </p>
          <div className="space-y-2">
            <a href="https://wa.me/528331234567?text=Hola,%20necesito%20reactivar%20mi%20cuenta%20MediDesk"
               target="_blank" rel="noreferrer"
               className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200
                          hover:bg-green-100 transition-colors">
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-sm font-medium text-green-800">WhatsApp</p>
                <p className="text-xs text-green-600">833 123 4567</p>
              </div>
            </a>
            <a href="mailto:soporte@medideskmx.com"
               className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-200
                          hover:bg-blue-100 transition-colors">
              <span className="text-2xl">✉️</span>
              <div>
                <p className="text-sm font-medium text-blue-800">Email</p>
                <p className="text-xs text-blue-600">soporte@medideskmx.com</p>
              </div>
            </a>
          </div>
        </div>

        {/* Planes */}
        <div className="border border-gray-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Planes disponibles
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Plan Básico</p>
              <p className="text-lg font-bold text-gray-800">$800</p>
              <p className="text-xs text-gray-400">MXN/mes</p>
            </div>
            <div className="bg-teal-50 rounded-lg p-3 text-center border border-teal-200">
              <p className="text-xs text-teal-600 font-medium">Plan Pro</p>
              <p className="text-lg font-bold text-teal-700">$1,200</p>
              <p className="text-xs text-teal-500">MXN/mes</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut(auth).then(() => window.location.href = '/')}
          className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm
                     hover:bg-gray-200 transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
