import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '../hooks/useTenant'

export default function SuscripcionVencida({ tenant }) {
  const navigate = useNavigate()
  const { enGracia, diasRestantes } = useTenant()

  const irASuscripcion = () => navigate('/suscripcion')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">

        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">{enGracia ? '⏰' : '🔒'}</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {enGracia ? 'Pago pendiente' : 'Acceso suspendido'}
        </h1>
        <p className="text-gray-500 text-sm mb-6">{tenant?.nombre ?? 'Tu consultorio'}</p>

        {enGracia ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              ⚠️ {diasRestantes} día{diasRestantes !== 1 ? 's' : ''} para regularizar
            </p>
            <p className="text-sm text-amber-700">
              Tu suscripción DocVias está pendiente de pago.
              Tienes {diasRestantes} día{diasRestantes !== 1 ? 's' : ''} antes de que se suspenda el acceso.
            </p>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-red-800 mb-1">🔒 Acceso suspendido</p>
            <p className="text-sm text-red-700">
              El período de gracia venció. Realiza el pago para reactivar tu acceso inmediatamente.
            </p>
          </div>
        )}

        {/* Botón pagar */}
        <button onClick={irASuscripcion}
          className="w-full py-3 bg-teal-600 text-white rounded-xl text-sm font-semibold
                     hover:bg-teal-700 transition-colors mb-3">
          💳 Ir a pagar mi suscripción
        </button>

        {/* Contacto soporte */}
        <div className="border border-gray-200 rounded-xl p-4 mb-4 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            ¿Necesitas ayuda?
          </p>
          <div className="space-y-2">
            <a href="https://wa.me/528331234567?text=Hola,%20necesito%20reactivar%20mi%20cuenta%20DocVias"
               target="_blank" rel="noreferrer"
               className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200
                          hover:bg-green-100 transition-colors">
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-sm font-medium text-green-800">WhatsApp soporte</p>
                <p className="text-xs text-green-600">Respuesta en minutos</p>
              </div>
            </a>
          </div>
        </div>

        <button onClick={() => signOut(auth).then(() => window.location.href = '/')}
          className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm
                     hover:bg-gray-200 transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
