// src/hooks/useTenant.js
// Hook central — expone usuario, tenantId, rol y datos del consultorio
import { useState, useEffect } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

export function useTenant() {
  const [state, setState] = useState({
    user:         null,
    tenantId:     null,
    role:         null,
    tenant:       null,
    isSuperAdmin: false,
    isPaciente:   false,
    loading:      true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) {
        setState(s => ({ ...s, user: null, loading: false }))
        return
      }

      // Claims del JWT (asignados por Cloud Function o script admin)
      const token        = await getIdTokenResult(user, true)
      const tenantId     = token.claims.tenantId   ?? null
      const role         = token.claims.role        ?? null
      const isSuperAdmin = token.claims.superAdmin  === true

      // Cargar datos del consultorio si tiene tenantId
      let tenant = null
      if (tenantId) {
        const snap = await getDoc(doc(db, `tenants/${tenantId}`))
        if (snap.exists()) tenant = { id: snap.id, ...snap.data() }
      }

      setState({ user, tenantId, role, tenant, isSuperAdmin,
                 isPaciente: role === 'paciente',
                 loading: false })
    })
    return unsub
  }, [])

  return state
}
