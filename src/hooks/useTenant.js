// src/hooks/useTenant.js  — v2 con jerarquía organizaciones
import { useState, useEffect } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from '../firebase'

const STORAGE_KEY_TENANT = 'medidesk_active_tenant'
const STORAGE_KEY_ORG    = 'medidesk_active_org'

export function useTenant() {
  const [state, setState] = useState({
    user:              null,
    tenantId:          null,
    role:              null,
    tenant:            null,
    orgId:             null,
    org:               null,
    orgTenants:        [],
    isSuperAdmin:      false,
    allTenants:        [],
    allOrgs:           [],
    isPaciente:        false,
    suscripcionActiva: true,
    enGracia:          false,
    diasRestantes:     0,
    loading:           true,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setState(s => ({ ...s, user: null, loading: false })); return }
      try {
        const token        = await getIdTokenResult(user, true)
        let   role         = token.claims.role       ?? null
        const isSuperAdmin = token.claims.superAdmin === true
        const isPaciente   = role === 'paciente'

        // Verificar si hay un cambio de rol pendiente en Firestore
        // (cuando Dulce cambia el rol desde GestionUsuarios sin cerrar sesión)
        if (!isSuperAdmin && user.uid) {
          try {
            const claimSnap = await getDoc(doc(db, 'claims_pendientes', user.uid))
            if (claimSnap.exists()) {
              const claimData = claimSnap.data()
              if (!claimData.procesado && claimData.rol) {
                role = claimData.rol  // usar rol actualizado de Firestore
              }
            }
          } catch(e) { /* ignorar si no existe la colección */ }
        }

        let tenantId = token.claims.tenantId ?? null
        let orgId    = token.claims.orgId    ?? null
        let allTenants = [], allOrgs = []

        if (isSuperAdmin) {
          // Cargar orgs y tenants — tolerante a colección organizaciones vacía
          const [orgsSnap, tenantsSnap] = await Promise.all([
            getDocs(collection(db, 'organizaciones')).catch(() => ({ docs: [] })),
            getDocs(collection(db, 'tenants')).catch(() => ({ docs: [] })),
          ])
          allOrgs    = orgsSnap.docs.map(d   => ({ id: d.id, ...d.data() }))
          allTenants = tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

          const savedTenant = localStorage.getItem(STORAGE_KEY_TENANT)
          const savedOrg    = localStorage.getItem(STORAGE_KEY_ORG)

          if (savedTenant && allTenants.find(t => t.id === savedTenant)) tenantId = savedTenant
          else if (!tenantId && allTenants.length > 0) tenantId = allTenants[0].id

          if (savedOrg && allOrgs.find(o => o.id === savedOrg)) orgId = savedOrg
          else if (!orgId && allOrgs.length > 0) orgId = allOrgs[0].id
          // Si no hay orgs todavía, usar el tenantId como orgId (retrocompatibilidad)
          else if (!orgId && tenantId) orgId = tenantId
        }

        // Actualizar ultimoAcceso en Firestore para el usuario actual
        if (!isSuperAdmin && tenantId && user.uid) {
          try {
            const { updateDoc: upd, doc: fsdoc, serverTimestamp } = await import('firebase/firestore')
            // No bloquear — fire and forget
            import('firebase/firestore').then(({ updateDoc, doc: d, Timestamp: T }) => {
              updateDoc(d(db, `tenants/${tenantId}/usuarios/${user.uid}`),
                { ultimoAcceso: T.now() }).catch(() => {})
            })
          } catch(e) { /* ignorar */ }
        }

        let tenant = null, suscripcionActiva = true, enGracia = false, diasRestantes = 0
        if (tenantId) {
          const snap = await getDoc(doc(db, `tenants/${tenantId}`))
          if (snap.exists()) {
            tenant = { id: snap.id, ...snap.data() }
            if (!isSuperAdmin) {
              suscripcionActiva = tenant.activo !== false && tenant.suscripcionActiva !== false
              // Calcular si está en periodo de gracia
              const fechaVenc   = tenant.fechaVencimiento?.toDate?.() ?? null
              const diasGracia  = tenant.diasGracia ?? 10
              const hoyMed      = new Date(); hoyMed.setHours(0,0,0,0)
              const diasVenc    = fechaVenc ? Math.floor((hoyMed - fechaVenc)/(1000*60*60*24)) : 0
              enGracia          = !suscripcionActiva && diasVenc > 0 && diasVenc <= diasGracia
              diasRestantes     = Math.max(0, diasGracia - diasVenc)
            }
            if (!orgId) orgId = tenant.orgId ?? tenantId
          }
        }

        let org = null, orgTenants = []
        if (orgId) {
          try {
            const orgSnap = await getDoc(doc(db, `organizaciones/${orgId}`))
            if (orgSnap.exists()) org = { id: orgSnap.id, ...orgSnap.data() }
          } catch(e) { /* org collection may not exist yet */ }

          if (isSuperAdmin) {
            orgTenants = allTenants.filter(t => t.orgId === orgId || t.id === orgId)
            // Fallback: si no hay tenants con orgId, mostrar todos
            if (orgTenants.length === 0) orgTenants = allTenants
          } else {
            try {
              const snap = await getDocs(query(collection(db, 'tenants'), where('orgId', '==', orgId)))
              orgTenants = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            } catch(e) { orgTenants = [] }
          }
        }

        setState({ user, tenantId, role, tenant, orgId, org, orgTenants,
          isSuperAdmin, isPaciente, allTenants, allOrgs,
          suscripcionActiva, enGracia, diasRestantes, loading: false })
      } catch(e) {
        console.error('useTenant error:', e)
        setState(s => ({ ...s, user, loading: false }))
      }
    })
    return unsub
  }, [])

  const switchTenant = async (newTenantId) => {
    localStorage.setItem(STORAGE_KEY_TENANT, newTenantId)
    const snap = await getDoc(doc(db, `tenants/${newTenantId}`))
    const tenant = snap.exists() ? { id: snap.id, ...snap.data() } : null
    const suscripcionActiva = tenant
      ? tenant.activo !== false && tenant.suscripcionActiva !== false : true
    const newOrgId = tenant?.orgId ?? newTenantId
    setState(s => ({ ...s, tenantId: newTenantId, tenant, suscripcionActiva, orgId: newOrgId }))
  }

  const switchOrg = async (newOrgId) => {
    localStorage.setItem(STORAGE_KEY_ORG, newOrgId)
    const orgSnap = await getDoc(doc(db, `organizaciones/${newOrgId}`))
    const org = orgSnap.exists() ? { id: orgSnap.id, ...orgSnap.data() } : null
    setState(s => {
      const orgTenants = s.allTenants.filter(t => t.orgId === newOrgId || t.id === newOrgId)
      const first = orgTenants[0] ?? null
      if (first) localStorage.setItem(STORAGE_KEY_TENANT, first.id)
      return { ...s, orgId: newOrgId, org, orgTenants,
        tenantId: first?.id ?? s.tenantId, tenant: first ?? s.tenant }
    })
  }

  return { ...state, switchTenant, switchOrg }
}
