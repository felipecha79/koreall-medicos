// src/pages/GestionUsuarios.jsx — Novaryk.Med v23
// Administración de usuarios del consultorio
// Doctor y Dueño pueden gestionar usuarios de su tenant
// SuperAdmin puede gestionar usuarios de cualquier tenant
import { useState, useEffect, useCallback } from 'react'
import {
  collection, onSnapshot, doc,
  setDoc, updateDoc, Timestamp, getDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { ROLES, infoRol, puedeVer } from '../services/permisos'
import toast from 'react-hot-toast'

const FORM_VACIO = {
  nombre: '', apellidos: '', email: '',
  rol: 'recepcion', activo: true,
}

function BadgeRol({ rol }) {
  const info = infoRol(rol)
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`}>
      {info.label}
    </span>
  )
}

export default function GestionUsuarios() {
  const { tenantId, tenant, isSuperAdmin, role: rolActual } = useTenant()
  const [usuarios,  setUsuarios]  = useState([])
  const [modal,     setModal]     = useState(false)
  const [editando,  setEditando]  = useState(null)
  const [form,      setForm]      = useState(FORM_VACIO)
  const [saving,    setSaving]    = useState(false)
  const [busq,      setBusq]      = useState('')

  // Roles disponibles según el rol del usuario actual
  const rolesDisponibles = isSuperAdmin
    ? ROLES
    : ROLES.filter(r => !['superadmin'].includes(r.value))

  // Cargar usuarios del tenant
  useEffect(() => {
    if (!tenantId) return
    return onSnapshot(
      collection(db, 'tenants', String(tenantId), 'usuarios'),
      snap => setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('[GestionUsuarios]', err)
    )
  }, [tenantId])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(FORM_VACIO)
    setModal(true)
  }

  const abrirEdicion = (u) => {
    setEditando(u)
    setForm({
      nombre:    u.nombre    ?? '',
      apellidos: u.apellidos ?? '',
      email:     u.email     ?? '',
      rol:       u.rol       ?? 'recepcion',
      activo:    u.activo    ?? true,
    })
    setModal(true)
  }

  const cerrar = () => { setModal(false); setEditando(null); setForm(FORM_VACIO) }

  // Crear usuario vía API (backend crea el Auth user y envía email)
  const crearUsuario = async () => {
    if (!form.nombre || !form.email) { toast.error('Nombre y email son obligatorios'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     form.email.trim().toLowerCase(),
          nombre:    form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          rol:       form.rol,
          tenantId:  String(tenantId),
          tenantNombre: tenant?.nombre ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear usuario')
      toast.success(`✅ Usuario creado. Se envió email a ${form.email}`)
      cerrar()
    } catch(e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  // Actualizar usuario existente (solo rol y estado — email no se cambia)
  const actualizarUsuario = async () => {
    if (!editando?.id) return
    setSaving(true)
    try {
      await updateDoc(
        doc(db, 'tenants', String(tenantId), 'usuarios', editando.id),
        {
          nombre:       form.nombre.trim(),
          apellidos:    form.apellidos.trim(),
          rol:          form.rol,
          activo:       form.activo,
          actualizadoEn: Timestamp.now(),
        }
      )
      // Si cambia el rol, actualizar en la colección global de claims pendientes
      await setDoc(
        doc(db, 'claims_pendientes', editando.id),
        { rol: form.rol, tenantId: String(tenantId), procesado: false, ts: Timestamp.now() },
        { merge: true }
      )
      toast.success('Usuario actualizado ✓')
      cerrar()
    } catch(e) {
      toast.error('Error: ' + e.message)
    } finally { setSaving(false) }
  }

  const resetPassword = async (usuario) => {
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usuario.email }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      toast.success(`Email de restablecimiento enviado a ${usuario.email}`)
    } catch(e) {
      toast.error('Error: ' + e.message)
    }
  }

  const toggleActivo = async (usuario) => {
    try {
      await updateDoc(
        doc(db, 'tenants', String(tenantId), 'usuarios', usuario.id),
        { activo: !usuario.activo, actualizadoEn: Timestamp.now() }
      )
      toast.success(usuario.activo ? 'Usuario desactivado' : 'Usuario reactivado')
    } catch(e) { toast.error('Error') }
  }

  const filtrados = usuarios.filter(u =>
    `${u.nombre} ${u.apellidos} ${u.email} ${u.rol}`
      .toLowerCase().includes(busq.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Usuarios del consultorio</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {tenant?.nombre ?? ''} · {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={abrirNuevo}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Nuevo usuario
        </button>
      </div>

      {/* Info roles */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <p className="text-xs font-semibold text-blue-800 mb-2">Roles disponibles</p>
        <div className="flex flex-wrap gap-2">
          {rolesDisponibles.map(r => (
            <div key={r.value} className="flex items-center gap-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${r.color}`}>{r.label}</span>
              <span className="text-xs text-gray-400 hidden md:inline">— {r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Buscador */}
      <input type="text" placeholder="Buscar usuario..." value={busq}
        onChange={e => setBusq(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-400 mb-4" />

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <p className="text-4xl mb-2">👥</p>
            <p className="text-sm">Sin usuarios registrados</p>
            <p className="text-xs mt-1">Crea el primer usuario del consultorio</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Usuario','Email','Rol','Estado','Último acceso','Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                           text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center
                                        justify-center text-teal-700 font-semibold text-sm">
                          {(u.nombre?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {u.nombre} {u.apellidos}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                    <td className="px-4 py-3"><BadgeRol rol={u.rol} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {u.ultimoAcceso
                        ? new Date(u.ultimoAcceso?.toDate?.() ?? u.ultimoAcceso)
                            .toLocaleDateString('es-MX')
                        : 'Nunca'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => abrirEdicion(u)}
                          className="text-xs px-2 py-1 border border-gray-200 rounded
                                     hover:bg-gray-50 text-gray-600 transition-colors">
                          ✏️ Editar
                        </button>
                        <button onClick={() => resetPassword(u)}
                          className="text-xs px-2 py-1 border border-blue-200 rounded
                                     hover:bg-blue-50 text-blue-600 transition-colors whitespace-nowrap">
                          🔑 Reset
                        </button>
                        <button onClick={() => toggleActivo(u)}
                          className={`text-xs px-2 py-1 border rounded transition-colors
                            ${u.activo
                              ? 'border-red-200 text-red-500 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={cerrar}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">
              {editando ? 'Editar usuario' : 'Nuevo usuario'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[['nombre','Nombre *','Juan'],['apellidos','Apellidos','García']].map(([f,l,p]) => (
                  <div key={f}>
                    <label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type="text" value={form[f]}
                      onChange={e => setForm(x => ({ ...x, [f]: e.target.value }))}
                      placeholder={p}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Email * {editando && <span className="text-gray-400">(no se puede cambiar)</span>}
                </label>
                <input type="email" value={form.email} disabled={!!editando}
                  onChange={e => setForm(x => ({ ...x, email: e.target.value }))}
                  placeholder="doctor@consultorio.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400
                             disabled:bg-gray-50 disabled:text-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Rol *</label>
                <div className="grid grid-cols-2 gap-2">
                  {rolesDisponibles.filter(r => r.value !== 'superadmin').map(r => (
                    <button key={r.value} type="button"
                      onClick={() => setForm(x => ({ ...x, rol: r.value }))}
                      className={`text-left p-2.5 rounded-xl border-2 transition-colors
                        ${form.rol === r.value
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.color}`}>
                        {r.label}
                      </span>
                      <p className="text-xs text-gray-400 mt-1 leading-tight">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              {editando && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="activo" checked={form.activo}
                    onChange={e => setForm(x => ({ ...x, activo: e.target.checked }))}
                    className="rounded" />
                  <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
                </div>
              )}
            </div>

            {!editando && (
              <div className="mt-4 bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  📧 Se enviará un email automático con las instrucciones de acceso y contraseña temporal.
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={editando ? actualizarUsuario : crearUsuario}
                disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear usuario'}
              </button>
              <button onClick={cerrar}
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
