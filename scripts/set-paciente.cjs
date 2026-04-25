// scripts/set-paciente.cjs
// Asigna el rol 'paciente' a un usuario de Firebase Auth
// El sistema lo redirigirá automáticamente al portal del paciente
//
// Uso: node scripts/set-paciente.cjs email@paciente.com consultorio-piloto
//
// Prerequisito: serviceAccountKey.json en la raíz del proyecto

const admin = require('firebase-admin')
const path  = require('path')

const [email, tenantId] = process.argv.slice(2)

if (!email || !tenantId) {
  console.error('❌  Uso: node scripts/set-paciente.cjs email@paciente.com tenantId')
  console.error('   Ejemplo: node scripts/set-paciente.cjs dulce@gmail.com consultorio-piloto')
  process.exit(1)
}

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.auth()
  .getUserByEmail(email)
  .then(user => {
    return admin.auth().setCustomUserClaims(user.uid, {
      tenantId,
      role:       'paciente',
      superAdmin: false,
    })
  })
  .then(() => {
    console.log(`✅  Rol paciente asignado:`)
    console.log(`   Email:    ${email}`)
    console.log(`   Tenant:   ${tenantId}`)
    console.log(`   Rol:      paciente`)
    console.log('')
    console.log('   El usuario verá el portal del paciente al iniciar sesión.')
    console.log('   Cierra sesión y vuelve a entrar para activar.')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌  Error:', err.message)
    process.exit(1)
  })
