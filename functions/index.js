/**
 * Cloud Function: Validar receta digital
 * Endpoint público: GET /validar-receta/{recetaId}?token={jwtToken}
 *
 * Permite que farmacias validen recetas sin autenticación
 * Las farmacias validan en su propio endpoint
 */

const functions = require('firebase-functions')
const admin = require('firebase-admin')

// Inicializar Firebase Admin
admin.initializeApp()

const db = admin.firestore()

exports.validarReceta = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).send('')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  try {
    // Extraer recetaId del path: /validarReceta/ID?token=...
    let recetaId = req.params.recetaId || req.query.recetaId
    const token = req.query.token

    // Si viene del rewrite de Vercel: /ID?token=...
    if (!recetaId && req.path) {
      const pathMatch = req.path.match(/^\/([^/?]+)/)
      if (pathMatch) recetaId = pathMatch[1]
    }

    if (!recetaId || !token) {
      res.status(400).json({ error: 'Falta recetaId o token. Path: ' + req.path })
      return
    }

    // Validar JWT token
    const partes = token.split('.')
    if (partes.length !== 3) {
      res.status(401).json({ valido: false, error: 'Token inválido' })
      return
    }

    try {
      const payload = JSON.parse(Buffer.from(partes[1], 'base64').toString())
      const ahora = Math.floor(Date.now() / 1000)

      if (payload.exp < ahora) {
        res.status(401).json({ valido: false, error: 'Token expirado' })
        return
      }

      // Buscar receta en Firestore por ID o número
      // Primero intenta por ID del documento (más probable)
      const allTenants = await db.collectionGroup('recetas')
        .where('certificacion.mode', '==', 'CERTIFICADA')
        .get()

      let recetasSnapshot = []
      for (const doc of allTenants.docs) {
        if (doc.id === recetaId || doc.data().numero === recetaId) {
          recetasSnapshot.push(doc)
          break
        }
      }

      if (recetasSnapshot.length === 0) {
        res.status(404).json({ valido: false, error: 'Receta no encontrada o no certificada' })
        return
      }

      const receta = recetasSnapshot[0].data()

      const receta = recetasSnapshot.docs[0].data()

      // Verificar que el JWT corresponda a esta receta y paciente
      if (payload.recetaId !== recetaId || payload.pacienteId !== receta.pacienteId) {
        res.status(401).json({ valido: false, error: 'Token no corresponde a esta receta' })
        return
      }

      // Verificar SHA-256
      if (payload.sha256 !== receta.certificacion.sha256) {
        res.status(401).json({ valido: false, error: 'Verificación SHA-256 fallida' })
        return
      }

      // Respuesta con datos públicos de la receta
      res.status(200).json({
        valido: true,
        receta: {
          numero: receta.numero,
          paciente: receta.pacienteNombre,
          doctor: receta.doctorNombre,
          fecha: receta.fecha,
          diagnostico: receta.diagnostico,
          medicamentos: receta.medicamentos.map(m => ({
            nombre: m.medicamento,
            dosis: m.dosis,
            frecuencia: m.frecuencia,
            via: m.via,
            duracion: m.duracion,
          })),
          certificacion: {
            fechaCertificacion: receta.certificacion.fecha,
            cedulaProfesional: receta.certificacion.cedulaProfesional,
          },
        },
      })
    } catch (err) {
      console.error('Error validando token:', err)
      res.status(401).json({ valido: false, error: 'Token inválido' })
    }
  } catch (error) {
    console.error('Error en validarReceta:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})
