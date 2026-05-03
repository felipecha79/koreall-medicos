#!/usr/bin/env node
// scripts/set-org-tenant.cjs
// Crea organización + tenant + asigna claims a un usuario
// 
// USO:
//   node scripts/set-org-tenant.cjs <email> <orgId> <tenantId> <role> [tipoOrg]
//
// EJEMPLOS:
//   # Consultorio independiente (crea org y tenant con el mismo ID)
//   node scripts/set-org-tenant.cjs dr@email.com drchavez-tampico drchavez-tampico admin
//
//   # Segundo doctor de una clínica existente
//   node scripts/set-org-tenant.cjs dr2@email.com clinica-san-jose hsj-pediatria doctor
//
//   # Recepcionista de un consultorio
//   node scripts/set-org-tenant.cjs rec@email.com drchavez-tampico drchavez-tampico recepcion

const admin = require('firebase-admin')
const path  = require('path')

const ROLES_VALIDOS = ['admin', 'doctor', 'recepcion', 'paciente']
const TIPOS_ORG     = ['consultorio', 'clinica', 'hospital', 'franquicia']

// ── Cargar Service Account ────────────────────────────────
const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
try {
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
} catch(e) {
  console.error('❌ No se encontró serviceAccountKey.json en la raíz del proyecto')
  console.error('   Descárgalo de Firebase Console → Configuración → Cuentas de servicio')
  process.exit(1)
}

const db   = admin.firestore()
const auth = admin.auth()

async function main() {
  const [email, orgId, tenantId, role, tipoOrg = 'consultorio'] = process.argv.slice(2)

  if (!email || !orgId || !tenantId || !role) {
    console.log('\nUso: node scripts/set-org-tenant.cjs <email> <orgId> <tenantId> <role> [tipoOrg]\n')
    console.log('Roles válidos: admin | doctor | recepcion | paciente')
    console.log('Tipos de org:  consultorio | clinica | hospital | franquicia\n')
    process.exit(1)
  }

  if (!ROLES_VALIDOS.includes(role)) {
    console.error(`❌ Rol inválido: ${role}. Usa: ${ROLES_VALIDOS.join(', ')}`)
    process.exit(1)
  }

  console.log(`\n🚀 Configurando MediDesk...`)
  console.log(`   Email:       ${email}`)
  console.log(`   Org ID:      ${orgId}`)
  console.log(`   Tenant ID:   ${tenantId}`)
  console.log(`   Rol:         ${role}`)
  console.log(`   Tipo org:    ${tipoOrg}\n`)

  // 1. Verificar que el usuario existe en Firebase Auth
  let userRecord
  try {
    userRecord = await auth.getUserByEmail(email)
    console.log(`✓ Usuario encontrado: ${userRecord.uid}`)
  } catch(e) {
    console.error(`❌ No se encontró usuario con email: ${email}`)
    console.error('   Crea el usuario primero en Firebase Auth o en el sistema')
    process.exit(1)
  }

  // 2. Crear/actualizar la organización en Firestore
  const orgRef  = db.collection('organizaciones').doc(orgId)
  const orgSnap = await orgRef.get()
  if (!orgSnap.exists) {
    await orgRef.set({
      nombre:          orgId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      orgId,
      tipo:            tipoOrg,
      plan:            'pro',
      mrr:             1800,
      activo:          true,
      suscripcionActiva: true,
      contactoEmail:   email,
      creadoEn:        admin.firestore.Timestamp.now(),
      actualizadoEn:   admin.firestore.Timestamp.now(),
    })
    console.log(`✓ Organización creada: organizaciones/${orgId}`)
  } else {
    console.log(`✓ Organización existente: organizaciones/${orgId}`)
  }

  // 3. Crear/actualizar el tenant en Firestore
  const tenantRef  = db.collection('tenants').doc(tenantId)
  const tenantSnap = await tenantRef.get()
  if (!tenantSnap.exists) {
    await tenantRef.set({
      nombre:            tenantId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      tenantId,
      orgId,                          // ← enlace a la organización
      activo:            true,
      suscripcionActiva: true,
      email,
      creadoEn:          admin.firestore.Timestamp.now(),
      actualizadoEn:     admin.firestore.Timestamp.now(),
    })
    console.log(`✓ Tenant creado: tenants/${tenantId}`)
  } else {
    // Asegurar que tiene el orgId correcto
    await tenantRef.update({ orgId, actualizadoEn: admin.firestore.Timestamp.now() })
    console.log(`✓ Tenant actualizado: tenants/${tenantId} (orgId=${orgId})`)
  }

  // 4. Asignar custom claims al usuario
  const claims = {
    role,
    tenantId,
    orgId,
  }
  await auth.setCustomUserClaims(userRecord.uid, claims)
  console.log(`✓ Claims asignados: ${JSON.stringify(claims)}`)

  // 5. Registrar el usuario en la sub-colección del tenant
  const usuarioRef = db
    .collection('tenants').doc(tenantId)
    .collection('usuarios').doc(userRecord.uid)
  await usuarioRef.set({
    uid:      userRecord.uid,
    email,
    rol:      role,
    tenantId,
    orgId,
    activo:   true,
    creadoEn: admin.firestore.Timestamp.now(),
  }, { merge: true })
  console.log(`✓ Usuario registrado en tenants/${tenantId}/usuarios/${userRecord.uid}`)

  console.log(`\n✅ Configuración completada exitosamente.`)
  console.log(`\n📋 El usuario debe cerrar sesión y volver a entrar para activar los claims.`)
  console.log(`   URL del sistema: https://koreall-medicos.vercel.app\n`)

  process.exit(0)
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
