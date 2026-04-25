// src/hooks/useTenant.js
import { useState, useEffect } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'

// SuperAdmin puede cambiar de consultorio activo
const STORAGE_KEY = 'medidesk_active_tenant'

export function useTenant() {
  const [state, setState] = useState({
    user: null, tenantId: null, role: null,
    tenant: null, isSuperAdmin: false,
    isPaciente: false, allTenants: [],
    loading: true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setState(s => ({ ...s, user: null, loading: false })); return }

      try {
        const token = await getIdTokenResult(user, true)
        const role        = token.claims.role       ?? null
        const isSuperAdmin = token.claims.superAdmin === true
        const isPaciente  = role === 'paciente'

        // SuperAdmin: cargar todos los tenants y permitir selección
        let tenantId = token.claims.tenantId ?? null
        let allTenants = []

        if (isSuperAdmin) {
          const snap = await getDocs(collection(db, 'tenants'))
          allTenants = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          // Usar el tenant guardado en localStorage o el primero disponible
          const saved = localStorage.getItem(STORAGE_KEY)
          if (saved && allTenants.find(t => t.id === saved)) {
            tenantId = saved
          } else if (!tenantId && allTenants.length > 0) {
            tenantId = allTenants[0].id
          }
        }

        let tenant = null
        if (tenantId) {
          const snap = await getDoc(doc(db, `tenants/${tenantId}`))
          if (snap.exists()) tenant = { id: snap.id, ...snap.data() }
        }

        setState({ user, tenantId, role, tenant, isSuperAdmin,
                   isPaciente, allTenants, loading: false })
      } catch(e) {
        console.error('useTenant error:', e)
        setState(s => ({ ...s, user, loading: false }))
      }
    })
    return unsub
  }, [])

  // SuperAdmin: cambiar de consultorio activo
  const switchTenant = async (newTenantId) => {
    localStorage.setItem(STORAGE_KEY, newTenantId)
    const snap = await getDoc(doc(db, `tenants/${newTenantId}`))
    const tenant = snap.exists() ? { id: snap.id, ...snap.data() } : null
    setState(s => ({ ...s, tenantId: newTenantId, tenant }))
  }

  return { ...state, switchTenant }
}
