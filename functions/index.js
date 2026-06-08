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
    const { recetaId } = req.params
    const token = req.query.token

    if (!recetaId || !token) {
      res.status(400).json({ error: 'Falta recetaId o token' })
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

      // Buscar receta en Firestore (sin autenticación, cualquier tenant)
      // La receta debe estar marcada como certificacion.mode === 'CERTIFICADA'
      const recetasSnapshot = await db.collectionGroup('recetas')
        .where('numero', '==', recetaId)
        .where('certificacion.mode', '==', 'CERTIFICADA')
        .limit(1)
        .get()

      if (recetasSnapshot.empty) {
        res.status(404).json({ valido: false, error: 'Receta no encontrada o no certificada' })
        return
      }

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
