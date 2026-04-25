// scripts/set-tenant-user.js
// Asigna tenantId y rol a un usuario para que pueda usar la app
//
// Uso: node scripts/set-tenant-user.js email@ejemplo.com consultorio-piloto admin
//
// Roles disponibles: admin | doctor | recepcion

const admin = require('firebase-admin')
const path  = require('path')

const [email, tenantId, role] = process.argv.slice(2)

if (!email || !tenantId || !role) {
  console.error('❌  Uso: node scripts/set-tenant-user.js email tenantId rol')
  console.error('   Ejemplo: node scripts/set-tenant-user.js dr@gmail.com consultorio-piloto admin')
  process.exit(1)
}

const validRoles = ['admin', 'doctor', 'recepcion', 'soporte']
if (!validRoles.includes(role)) {
  console.error(`❌  Rol inválido. Usa: ${validRoles.join(' | ')}`)
  process.exit(1)
}

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.auth()
  .getUserByEmail(email)
  .then(user => {
    return admin.auth().setCustomUserClaims(user.uid, {
      tenantId,
      role,
      superAdmin: false,
    })
  })
  .then(() => {
    console.log(`✅  Usuario configurado:`)
    console.log(`   Email:    ${email}`)
    console.log(`   Tenant:   ${tenantId}`)
    console.log(`   Rol:      ${role}`)
    console.log('')
    console.log('   Cierra sesión en la app y vuelve a entrar.')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌  Error:', err.message)
    process.exit(1)
  })
