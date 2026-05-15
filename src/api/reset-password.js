// api/reset-password.js — DocVia v23
// Envía email de restablecimiento de contraseña
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function getAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })})
  }
  return getAuth()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email requerido' })

  try {
    const auth = getAdmin()
    const link = await auth.generatePasswordResetLink(email, {
      url: `${process.env.VITE_APP_URL ?? 'https://docvias.vercel.app'}/login`,
    })

    const sgKey = process.env.SENDGRID_API_KEY
    if (sgKey) {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: 'juan.felipe.bezares@outlook.es', name: 'DocVia' },
          subject: 'Restablecer contraseña — DocVia',
          content: [{
            type: 'text/html',
            value: `
              <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
                <div style="background:#1A2E42;padding:20px;border-radius:12px 12px 0 0">
                  <h1 style="color:#fff;font-size:18px;margin:0">DocVia</h1>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
                  <h2 style="font-size:16px;color:#1A2E42">Restablece tu contraseña</h2>
                  <p style="color:#6b7280;font-size:14px">
                    Se solicitó un restablecimiento de contraseña para tu cuenta.
                  </p>
                  <a href="${link}"
                     style="display:inline-block;background:#E8623A;color:#fff;padding:12px 24px;
                            border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
                    Restablecer contraseña →
                  </a>
                  <p style="color:#9ca3af;font-size:12px">
                    Expira en 1 hora. Si no solicitaste esto, ignora este mensaje.
                  </p>
                </div>
              </div>
            `
          }]
        })
      })
      return res.status(200).json({ ok: true })
    } else {
      // Sin SendGrid — Firebase envía el email por defecto
      const adminAuth = getAdmin()
      // Firebase Admin no envía directamente — usar client SDK
      // Retornamos el link para que el admin lo comparta
      return res.status(200).json({ ok: true, link, warning: 'Sin SENDGRID_API_KEY — comparte el link manualmente' })
    }
  } catch(e) {
    console.error('[reset-password]', e)
    return res.status(500).json({ error: e.message })
  }
}
