// src/hooks/useTenant.js
import { useState, useEffect } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'

const STORAGE_KEY = 'medidesk_active_tenant'

export function useTenant() {
  const [state, setState] = useState({
    user:         null,
    tenantId:     null,
    role:         null,
    tenant:       null,
    isSuperAdmin: false,
    isPaciente:   false,
    allTenants:   [],
    suscripcionActiva: true, // default true para no bloquear antes de cargar
    loading:      true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setState(s => ({ ...s, user: null, loading: false })); return }

      try {
        const token      = await getIdTokenResult(user, true)
        const role        = token.claims.role       ?? null
        const isSuperAdmin = token.claims.superAdmin === true
        const isPaciente  = role === 'paciente'

        let tenantId   = token.claims.tenantId ?? null
        let allTenants = []

        if (isSuperAdmin) {
          const snap = await getDocs(collection(db, 'tenants'))
          allTenants = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          const saved = localStorage.getItem(STORAGE_KEY)
          if (saved && allTenants.find(t => t.id === saved)) {
            tenantId = saved
          } else if (!tenantId && allTenants.length > 0) {
            tenantId = allTenants[0].id
          }
        }

        let tenant = null
        let suscripcionActiva = true

        if (tenantId) {
          const snap = await getDoc(doc(db, `tenants/${tenantId}`))
          if (snap.exists()) {
            tenant = { id: snap.id, ...snap.data() }

            // ── Verificar suscripción ──────────────────────
            // El superAdmin nunca se bloquea
            // El tenant debe tener activo:true Y suscripcionActiva:true
            if (!isSuperAdmin) {
              const estaActivo = tenant.activo !== false
              // Si el campo suscripcionActiva no existe, asumir true (no bloquear)
              const suscripcion = tenant.suscripcionActiva !== false
              suscripcionActiva = estaActivo && suscripcion
            }
          }
        }

        setState({
          user, tenantId, role, tenant,
          isSuperAdmin, isPaciente,
          allTenants, suscripcionActiva,
          loading: false,
        })
      } catch(e) {
        console.error('useTenant error:', e)
        setState(s => ({ ...s, user, loading: false }))
      }
    })
    return unsub
  }, [])

  const switchTenant = async (newTenantId) => {
    localStorage.setItem(STORAGE_KEY, newTenantId)
    const snap = await getDoc(doc(db, `tenants/${newTenantId}`))
    const tenant = snap.exists() ? { id: snap.id, ...snap.data() } : null
    const suscripcionActiva = tenant
      ? tenant.activo !== false && tenant.suscripcionActiva !== false
      : true
    setState(s => ({ ...s, tenantId: newTenantId, tenant, suscripcionActiva }))
  }

  return { ...state, switchTenant }
}
