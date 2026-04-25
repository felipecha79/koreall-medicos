import { useState, useEffect } from 'react'
import {
  collection, addDoc, onSnapshot,
  doc, updateDoc, Timestamp
} from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth'
import { db, auth } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import toast from 'react-hot-toast'

const ROLES = [
  { value: 'admin',     label: 'Admin del consultorio',  desc: 'Acceso completo al consultorio' },
  { value: 'doctor',    label: 'Doctor',                 desc: 'Expedientes, recetas, agenda' },
  { value: 'recepcion', label: 'Recepcionista',          desc: 'Agenda, pacientes, cobros' },
]

const ROL_COLOR = {
  admin:      'bg-blue-100 text-blue-700 border-blue-200',
  doctor:     'bg-teal-100 text-teal-700 border-teal-200',
  recepcion:  'bg-green-100 text-green-700 border-green-200',
  superAdmin: 'bg-red-100 text-red-700 border-red-200',
}

export default function GestionUsuarios() {
  const { tenantId, tenant, isSuperAdmin } = useTenant()
  const [usuarios, setUsuarios] = useState([])
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: '', email: '', rol: 'recepcion', password: ''
  })

  useEffect(() => {
    if (!tenantId) return
    return onSnapshot(
      collection(db, `tenants/${tenantId}/usuarios`),
      snap => setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  const crearUsuario = async () => {
    if (!form.nombre || !form.email || !form.password) {
      toast.error('Nombre, email y contraseña son obligatorios'); return
    }
    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres'); return
    }
    setSaving(true)
    try {
      // 1. Crear usuario en Firebase Auth
      const cred = await createUserWithEmailAndPassword(
        auth, form.email, form.password
      )

      // 2. Guardar en Firestore del tenant
      await addDoc(collection(db, `tenants/${tenantId}/usuarios`), {
        uid:      cred.user.uid,
        nombre:   form.nombre,
        email:    form.email,
        rol:      form.rol,
        tenantId,
        activo:   true,
        creadoEn: Timestamp.now(),
      })

      // 3. Asignar claims via Cloud Function (si está configurada)
      // Por ahora guardamos en Firestore y el usuario debe correr el script
      // En producción esto se hace con una Cloud Function onWrite

      toast.success(
        `Usuario creado ✓\n` +
        `Importante: Para activar el acceso completo corre:\n` +
        `node scripts/set-tenant-user.cjs ${form.email} ${tenantId} ${form.rol}`
      , { duration: 8000 })

      // Mandar email de bienvenida con contraseña temporal
      // sendPasswordResetEmail(auth, form.email)

      setModal(false)
      setForm({ nombre: '', email: '', rol: 'recepcion', password: '' })
    } catch(e) {
      console.error(e)
      if (e.code === 'auth/email-already-in-use') {
        toast.error('Ese email ya tiene una cuenta en Firebase')
      } else {
        toast.error(`Error: ${e.message}`)
      }
    } finally { setSaving(false) }
  }

  const desactivar = async (usuario) => {
    await updateDoc(doc(db, `tenants/${tenantId}/usuarios/${usuario.id}`), {
      activo: !usuario.activo
    })
    toast.success(usuario.activo ? 'Usuario desactivado' : 'Usuario activado')
  }

  const enviarResetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email)
      toast.success(`Email de restablecimiento enviado a ${email}`)
    } catch(e) {
      toast.error('Error al enviar el email')
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Usuarios</h2>
          <p className="text-sm text-gray-400">
            {tenant?.nombre} — {usuarios.length} usuarios
          </p>
        </div>
        <button onClick={() => setModal(true)}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Nuevo usuario
        </button>
      </div>

      {/* Info sobre claims */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <p className="text-sm font-medium text-blue-800 mb-1">
          ℹ️ Sobre la asignación de permisos
        </p>
        <p className="text-xs text-blue-700">
          Al crear un usuario aquí, se registra en Firebase Auth y Firestore.
          Para que el usuario tenga acceso completo con su rol, necesitas correr el script de claims
          una vez. En la próxima versión esto será automático con Cloud Functions.
        </p>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {usuarios.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm">Sin usuarios registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Nombre','Email','Rol','Estado','Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                         text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium
                      ${ROL_COLOR[u.rol] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border
                      ${u.activo
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-red-100 text-red-600 border-red-200'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => enviarResetPassword(u.email)}
                        className="text-xs text-blue-500 hover:underline whitespace-nowrap">
                        Reset pwd
                      </button>
                      <button onClick={() => desactivar(u)}
                        className={`text-xs hover:underline whitespace-nowrap
                          ${u.activo ? 'text-red-400' : 'text-green-500'}`}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Script reference */}
      <div className="mt-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-600 mb-2">
          Scripts para activar claims (correr en terminal):
        </p>
        <div className="space-y-1">
          {ROLES.map(r => (
            <code key={r.value} className="block text-xs text-teal-700 bg-white px-3 py-1.5
                                           rounded border border-gray-200">
              node scripts/set-tenant-user.cjs email@usuario.com {tenantId} {r.value}
            </code>
          ))}
          <code className="block text-xs text-purple-700 bg-white px-3 py-1.5
                           rounded border border-gray-200">
            node scripts/set-paciente.cjs email@paciente.com {tenantId}
          </code>
        </div>
      </div>

      {/* Modal nuevo usuario */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nuevo usuario</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
                <input type="text" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email *</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Contraseña temporal *
                </label>
                <input type="text" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <p className="text-xs text-gray-400 mt-1">
                  Comparte esta contraseña con el usuario. Puede cambiarla después.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Rol *</label>
                <div className="space-y-2">
                  {ROLES.map(r => (
                    <label key={r.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer
                        transition-colors ${form.rol === r.value
                          ? 'border-teal-400 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="rol" value={r.value}
                        checked={form.rol === r.value}
                        onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                        className="mt-0.5 accent-teal-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{r.label}</p>
                        <p className="text-xs text-gray-500">{r.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={crearUsuario} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Creando...' : 'Crear usuario'}
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
