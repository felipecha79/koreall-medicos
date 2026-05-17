// api/crear-usuario.js — DocVia v26 — CommonJS para Vercel Serverless
const admin = require('firebase-admin')

function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  return { auth: admin.auth(), db: admin.firestore() }
}

function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({
      error: 'Variables de entorno de Firebase Admin no configuradas: ' +
        [
          !process.env.FIREBASE_PROJECT_ID    && 'FIREBASE_PROJECT_ID',
          !process.env.FIREBASE_CLIENT_EMAIL  && 'FIREBASE_CLIENT_EMAIL',
          !process.env.FIREBASE_PRIVATE_KEY   && 'FIREBASE_PRIVATE_KEY',
        ].filter(Boolean).join(', ')
    })
  }

  const { email, nombre, apellidos, rol, tenantId, tenantNombre } = req.body || {}

  if (!email || !nombre || !rol || !tenantId) {
    return res.status(400).json({ error: 'Faltan campos: email, nombre, rol y tenantId son obligatorios' })
  }

  let auth, db
  try {
    const a = getAdmin()
    auth = a.auth
    db   = a.db
  } catch(e) {
    return res.status(500).json({ error: 'Error Firebase Admin init: ' + e.message })
  }

  try {
    // 1. Crear o reutilizar usuario en Firebase Auth
    let uid
    try {
      const userRecord = await auth.createUser({
        email,
        password:    generarPassword(),
        displayName: `${nombre} ${apellidos || ''}`.trim(),
      })
      uid = userRecord.uid
    } catch(e) {
      if (e.code === 'auth/email-already-exists') {
        const existing = await auth.getUserByEmail(email)
        uid = existing.uid
      } else throw e
    }

    // 2. Custom Claims
    await auth.setCustomUserClaims(uid, {
      tenantId: String(tenantId),
      role:     rol,
      superAdmin: rol === 'superadmin',
    })

    // 3. Guardar en Firestore
    await db.doc(`tenants/${tenantId}/usuarios/${uid}`).set({
      uid,
      email,
      nombre,
      apellidos: apellidos || '',
      rol,
      activo:    true,
      tenantId:  String(tenantId),
      creadoEn:  admin.firestore.Timestamp.now(),
      ultimoAcceso: null,
    }, { merge: true })

    // 4. Claims pendientes
    await db.doc(`claims_pendientes/${uid}`).set({
      rol, tenantId: String(tenantId), procesado: true,
      ts: admin.firestore.Timestamp.now()
    }, { merge: true })

    // 5. Link de reset para que el usuario configure su contraseña
    let resetLink = null
    try {
      resetLink = await auth.generatePasswordResetLink(email, {
        url: `${process.env.VITE_APP_URL || 'https://docvias.vercel.app'}/login`,
      })
    } catch(e) {
      console.warn('[crear-usuario] No se pudo generar reset link:', e.message)
    }

    // 6. Email via SendGrid si está configurado
    const sgKey = process.env.SENDGRID_API_KEY
    if (sgKey && resetLink) {
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email, name: nombre }] }],
            from: { email: 'juan.felipe.bezares@outlook.es', name: 'DocVia' },
            subject: `Bienvenido a DocVia — ${tenantNombre || ''}`,
            content: [{
              type: 'text/html',
              value: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
                <div style="background:#1A2E42;padding:24px;border-radius:12px 12px 0 0">
                  <h1 style="color:#fff;font-size:20px;margin:0">DocVia 🦀</h1>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
                  <h2 style="font-size:18px;color:#1A2E42">Hola, ${nombre} 👋</h2>
                  <p style="color:#6b7280;font-size:14px">
                    Has sido dado de alta en <strong>${tenantNombre}</strong> con el rol de <strong>${rol}</strong>.
                  </p>
                  <a href="${resetLink}"
                     style="display:inline-block;background:#4AAECC;color:#fff;padding:12px 24px;
                            border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
                    Configurar mi contraseña →
                  </a>
                  <p style="color:#9ca3af;font-size:12px;margin-top:16px">
                    Este enlace expira en 24 horas.
                  </p>
                </div>
              </div>`
            }]
          })
        })
      } catch(emailErr) {
        console.warn('[crear-usuario] Email error:', emailErr.message)
      }
    }

    return res.status(200).json({
      ok: true,
      uid,
      msg: sgKey
        ? `Usuario creado. Email enviado a ${email}`
        : `Usuario creado. Sin SendGrid — link de acceso: ${resetLink}`,
      resetLink: sgKey ? undefined : resetLink,
    })

  } catch(e) {
    console.error('[crear-usuario]', e)
    return res.status(500).json({ error: e.message || 'Error interno' })
  }
}
