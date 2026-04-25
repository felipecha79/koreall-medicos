import { useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function Login() {
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, pass)
      navigate('/agenda')
    } catch {
      toast.error('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (!email) { toast.error('Escribe tu email primero'); return }
    await sendPasswordResetEmail(auth, email)
    toast.success('Revisa tu correo para recuperar tu contraseña')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-teal-900
                    flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">MediDesk</h1>
          <p className="text-sm text-gray-400 mt-1">Sistema de gestión médica</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" value={email} autoFocus required
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5
                         text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Contraseña</label>
            <input type="password" value={pass} required
              onChange={e => setPass(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5
                         text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium
                       text-sm hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <button onClick={handleReset}
          className="w-full mt-3 text-xs text-gray-400 hover:text-teal-600 text-center transition-colors">
          Olvidé mi contraseña
        </button>
      </div>
    </div>
  )
}
