// scripts/set-admin.js
// Uso: node scripts/set-admin.js tu@email.com
//
// Prerequisito: descarga serviceAccountKey.json desde
// Firebase Console → Configuración → Cuentas de servicio → Generar clave privada
// y ponlo en la raíz del proyecto (ya está en .gitignore)

const admin = require('firebase-admin')
const path  = require('path')

const email = process.argv[2]
if (!email) {
  console.error('❌  Uso: node scripts/set-admin.js tu@email.com')
  process.exit(1)
}

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

admin.auth()
  .getUserByEmail(email)
  .then(user => {
    return admin.auth().setCustomUserClaims(user.uid, {
      superAdmin: true,
      role:       'superAdmin',
      tenantId:   null,
    })
  })
  .then(() => {
    console.log(`✅  SuperAdmin asignado a: ${email}`)
    console.log('   Cierra sesión en la app y vuelve a entrar para activar los claims.')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌  Error:', err.message)
    process.exit(1)
  })
