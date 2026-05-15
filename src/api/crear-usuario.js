// api/crear-usuario.js — DocVia v23
// Crea un usuario en Firebase Auth + guarda en Firestore + envía email de bienvenida
// Llamado desde GestionUsuarios.jsx
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

function getAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })})
  }
  return { auth: getAuth(), db: getFirestore() }
}

// Generar contraseña temporal segura
function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, nombre, apellidos, rol, tenantId, tenantNombre } = req.body
  if (!email || !nombre || !rol || !tenantId) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' })
  }

  const { auth, db } = getAdmin()
  const passwordTemporal = generarPassword()

  try {
    // 1. Crear usuario en Firebase Auth
    let uid
    try {
      const userRecord = await auth.createUser({
        email,
        password:    passwordTemporal,
        displayName: `${nombre} ${apellidos}`.trim(),
      })
      uid = userRecord.uid
    } catch(e) {
      if (e.code === 'auth/email-already-exists') {
        const existing = await auth.getUserByEmail(email)
        uid = existing.uid
      } else throw e
    }

    // 2. Asignar Custom Claims
    await auth.setCustomUserClaims(uid, {
      tenantId,
      role: rol,
      superAdmin: rol === 'superadmin',
    })

    // 3. Guardar en Firestore del tenant
    await db.doc(`tenants/${tenantId}/usuarios/${uid}`).set({
      uid,
      email,
      nombre,
      apellidos:   apellidos ?? '',
      rol,
      activo:      true,
      tenantId,
      creadoEn:    Timestamp.now(),
      ultimoAcceso: null,
    }, { merge: true })

    // 4. Marcar claims como aplicados (para sync si se cambia el rol)
    await db.doc(`claims_pendientes/${uid}`).set({
      rol, tenantId, procesado: true, ts: Timestamp.now()
    }, { merge: true })

    // 5. Enviar email de bienvenida con contraseña temporal
    // Usar Firebase Auth password reset link (más seguro que enviar contraseña)
    const resetLink = await auth.generatePasswordResetLink(email, {
      url: `${process.env.VITE_APP_URL ?? 'https://docvias.vercel.app'}/login`,
    })

    // Enviar vía Twilio SendGrid o simplemente retornar el link para Twilio WA
    const twSid   = process.env.VITE_TWILIO_ACCOUNT_SID
    const twToken = process.env.VITE_TWILIO_AUTH_TOKEN

    // Email de bienvenida via Twilio SendGrid si está configurado
    const sgKey = process.env.SENDGRID_API_KEY
    if (sgKey) {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email, name: nombre }] }],
          from: { email: 'juan.felipe.bezares@outlook.es', name: 'DocVia' },
          subject: `Bienvenido a DocVia — ${tenantNombre}`,
          content: [{
            type: 'text/html',
            value: `
              <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
                <div style="background:#1A2E42;padding:24px;border-radius:12px 12px 0 0">
                  <h1 style="color:#fff;font-size:20px;margin:0">DocVia 🦀</h1>
                  <p style="color:#4AAECC;font-size:13px;margin:4px 0 0">Ecosistema digital de salud</p>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
                  <h2 style="font-size:18px;color:#1A2E42">Hola, ${nombre} 👋</h2>
                  <p style="color:#6b7280;font-size:14px">
                    Has sido dado de alta en <strong>${tenantNombre}</strong> con el rol de
                    <strong>${rol}</strong>.
                  </p>
                  <p style="color:#6b7280;font-size:14px">
                    Da clic en el botón para configurar tu contraseña de acceso:
                  </p>
                  <a href="${resetLink}"
                     style="display:inline-block;background:#4AAECC;color:#fff;padding:12px 24px;
                            border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
                    Configurar mi contraseña →
                  </a>
                  <p style="color:#9ca3af;font-size:12px;margin-top:16px">
                    Este enlace expira en 24 horas. Si no solicitaste este acceso, ignora este mensaje.
                  </p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
                  <p style="color:#9ca3af;font-size:11px">
                    DocVia · Tampico, Tamaulipas 🦀
                  </p>
                </div>
              </div>
            `
          }]
        })
      })
    }

    return res.status(200).json({
      ok:  true,
      uid,
      msg: sgKey
        ? 'Usuario creado y email enviado'
        : 'Usuario creado. Configura SENDGRID_API_KEY para envío de email automático.',
      resetLink: sgKey ? undefined : resetLink, // devolver link si no hay sendgrid
    })
  } catch(e) {
    console.error('[crear-usuario]', e)
    return res.status(500).json({ error: e.message })
  }
}
