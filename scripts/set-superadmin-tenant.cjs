// scripts/set-superadmin-tenant.cjs
// Asigna superAdmin + tenantId al usuario principal
// Uso: node scripts/set-superadmin-tenant.cjs email@juan.com consultorio-piloto

const admin = require('firebase-admin')
const path  = require('path')

const [email, tenantId] = process.argv.slice(2)

if (!email || !tenantId) {
  console.error('❌  Uso: node scripts/set-superadmin-tenant.cjs email tenantId')
  console.error('   Ejemplo: node scripts/set-superadmin-tenant.cjs juan@gmail.com consultorio-piloto')
  process.exit(1)
}

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.auth()
  .getUserByEmail(email)
  .then(user => admin.auth().setCustomUserClaims(user.uid, {
    superAdmin: true,
    role:       'admin',
    tenantId,
  }))
  .then(() => {
    console.log(`✅  SuperAdmin + Tenant asignados:`)
    console.log(`   Email:    ${email}`)
    console.log(`   Tenant:   ${tenantId}`)
    console.log(`   Rol:      admin + superAdmin`)
    console.log('\n   Cierra sesión y vuelve a entrar.')
    process.exit(0)
  })
  .catch(err => { console.error('❌', err.message); process.exit(1) })
