#!/usr/bin/env node
// scripts/migrar-tenant.cjs
// Migra TODOS los datos de un tenant origen a un tenant destino
// Copia: pacientes, citas, consultas, cobros, facturas, recetas, encuestas
//
// USO:
//   node scripts/migrar-tenant.cjs <tenantOrigen> <tenantDestino>
//
// EJEMPLO:
//   node scripts/migrar-tenant.cjs consultorio-piloto drchavez-tampico
//
// ⚠️  IMPORTANTE: Este script COPIA los datos. No los borra del origen.
//     Verifica que todo esté correcto antes de borrar el tenant origen.

const admin = require('firebase-admin')
const path  = require('path')

const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
try {
  const sa = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(sa) })
} catch {
  console.error('❌ No se encontró serviceAccountKey.json')
  process.exit(1)
}

const db = admin.firestore()

const SUBCOLECCIONES = [
  'pacientes',
  'citas',
  'consultas',
  'cobros',
  'facturas',
  'recetas',
  'encuestas',
  'usuarios',
]

async function migrar(origen, destino) {
  console.log(`\n🚀 Migrando datos: ${origen} → ${destino}\n`)

  // Verificar que el tenant destino existe
  const destDoc = await db.collection('tenants').doc(destino).get()
  if (!destDoc.exists) {
    console.error(`❌ El tenant destino "${destino}" no existe en Firestore`)
    console.error('   Créalo primero con: node scripts/set-org-tenant.cjs ...')
    process.exit(1)
  }

  let totalCopiados = 0

  for (const coleccion of SUBCOLECCIONES) {
    const snap = await db
      .collection('tenants').doc(origen)
      .collection(coleccion)
      .get()

    if (snap.empty) {
      console.log(`   ⏭  ${coleccion}: vacío`)
      continue
    }

    let copiados = 0
    const batch_size = 400 // Firestore permite 500 por batch
    let batch = db.batch()
    let batchCount = 0

    for (const doc of snap.docs) {
      const data = {
        ...doc.data(),
        tenantId: destino,          // actualizar referencia al nuevo tenant
        _migradoDe: origen,         // conservar trazabilidad
        _migradoEn: admin.firestore.Timestamp.now(),
      }

      const destRef = db
        .collection('tenants').doc(destino)
        .collection(coleccion).doc(doc.id)

      batch.set(destRef, data)
      batchCount++
      copiados++

      if (batchCount >= batch_size) {
        await batch.commit()
        batch = db.batch()
        batchCount = 0
        process.stdout.write('.')
      }
    }

    if (batchCount > 0) await batch.commit()

    console.log(`   ✓  ${coleccion}: ${copiados} documentos copiados`)
    totalCopiados += copiados
  }

  // Copiar también los campos del tenant origen al destino (sitioWeb, etc.)
  const origenDoc = await db.collection('tenants').doc(origen).get()
  if (origenDoc.exists) {
    const origenData = origenDoc.data()
    const camposACopiar = {}

    // Solo copiar campos que NO existen ya en el destino
    const destData = destDoc.data()
    for (const [k, v] of Object.entries(origenData)) {
      if (['tenantId', 'orgId', 'creadoEn', 'activo', 'suscripcionActiva'].includes(k)) continue
      if (!destData[k]) {
        camposACopiar[k] = v
      }
    }

    if (Object.keys(camposACopiar).length > 0) {
      await db.collection('tenants').doc(destino).update(camposACopiar)
      console.log(`\n   ✓  Campos del tenant copiados: ${Object.keys(camposACopiar).join(', ')}`)
    }
  }

  console.log(`\n✅ Migración completada: ${totalCopiados} documentos totales`)
  console.log(`\n📋 Próximos pasos:`)
  console.log(`   1. Abre el sistema y verifica que los pacientes aparecen en ${destino}`)
  console.log(`   2. Prueba buscar "PAC-00001" en Pacientes`)
  console.log(`   3. Verifica que las citas y cobros también migraron`)
  console.log(`   4. Si todo está bien, puedes marcar el tenant origen como inactivo:`)
  console.log(`      Firebase Console → tenants/${origen} → activo = false`)
  console.log(`\n⚠️  El tenant origen NO fue borrado. Sus datos siguen ahí como respaldo.\n`)

  process.exit(0)
}

const [,, origen, destino] = process.argv

if (!origen || !destino) {
  console.log('\nUso: node scripts/migrar-tenant.cjs <tenantOrigen> <tenantDestino>')
  console.log('Ejemplo: node scripts/migrar-tenant.cjs consultorio-piloto drchavez-tampico\n')
  process.exit(1)
}

migrar(origen, destino).catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
