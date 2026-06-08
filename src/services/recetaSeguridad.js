/**
 * Servicios de seguridad para recetas digitales
 * Cumple NOM-151-SCFI-2016 con SHA-256
 */

import CryptoJS from 'crypto-js'
import QRCode from 'qrcode'

/**
 * Genera SHA-256 de la cadena digital (NOM-151)
 * Incluye: doctor, paciente, medicamentos, fecha, diagnóstico
 */
export async function generarCadenaDigital(receta) {
  const datos = {
    doctorId: receta.doctorId,
    pacienteId: receta.pacienteId,
    numero: receta.numero,
    fecha: receta.fecha,
    diagnostico: receta.diagnostico || '',
    medicamentos: receta.medicamentos.map(m => ({
      nombre: m.medicamento,
      dosis: m.dosis,
      frecuencia: m.frecuencia,
    })),
  }

  const stringData = JSON.stringify(datos)
  const sha256 = CryptoJS.SHA256(stringData).toString()

  return {
    cadenaOriginal: stringData,
    sha256Hash: sha256,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Genera JWT token para validación de receta
 * Token contiene: recetaId, pacienteId, sha256, exp
 */
export function generarJWTReceta(recetaId, pacienteId, sha256Hash, expirationHours = 365 * 24) {
  // Simulación de JWT (en producción usar librería jwt-encode)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const expirationTime = new Date()
  expirationTime.setHours(expirationTime.getHours() + expirationHours)

  const payload = btoa(JSON.stringify({
    recetaId,
    pacienteId,
    sha256: sha256Hash,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expirationTime.getTime() / 1000),
  }))

  const signature = btoa(CryptoJS.HmacSHA256(`${header}.${payload}`, 'novaryk-med-secret').toString())
  const token = `${header}.${payload}.${signature}`

  return { token, expirationTime }
}

/**
 * Genera QR code apuntando a endpoint de validación pública
 * URL: /api/validar-receta/{recetaId}?token={jwtToken}
 */
export async function generarQRReceta(recetaId, jwtToken, baseUrl = window.location.origin) {
  const validationUrl = `${baseUrl}/api/validar-receta/${recetaId}?token=${jwtToken}`

  try {
    const qrDataUrl = await QRCode.toDataURL(validationUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
      color: {
        dark: '#0D9488',
        light: '#FFFFFF',
      },
    })

    return { qrDataUrl, validationUrl }
  } catch (err) {
    console.error('Error generando QR:', err)
    throw err
  }
}

/**
 * Detecta medicamentos restringidos (advertencia-only)
 * Mounjaro, Wegovy, etc.
 */
export function detectarMedicamentosRestringidos(medicamentos) {
  const medicamentosAlerta = ['mounjaro', 'wegovy', 'ozempic', 'saxenda']
  const encontrados = []

  medicamentos.forEach(med => {
    const nombre = med.medicamento.toLowerCase()
    medicamentosAlerta.forEach(alerta => {
      if (nombre.includes(alerta)) {
        encontrados.push({
          medicamento: med.medicamento,
          alerta: `⚠️ ${med.medicamento.toUpperCase()} requiere validación especial`,
        })
      }
    })
  })

  return encontrados
}

/**
 * Encripta contenido del certificado (.key o .cer) con AES-256
 * Almacenar en Firebase Storage, mostrar en portal solo si certificación = CERTIFICADA
 */
export function encriptarCertificado(contenido, tenantId) {
  const secretKey = `novaryk-${tenantId}-cert-secret`
  const encrypted = CryptoJS.AES.encrypt(contenido, secretKey).toString()
  return encrypted
}

export function desencriptarCertificado(contenidoEncriptado, tenantId) {
  const secretKey = `novaryk-${tenantId}-cert-secret`
  const decrypted = CryptoJS.AES.decrypt(contenidoEncriptado, secretKey)
  return decrypted.toString(CryptoJS.enc.Utf8)
}

/**
 * Valida si un JWT receta es válido
 */
export function validarJWTReceta(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { valido: false, error: 'Token inválido' }

    const payload = JSON.parse(atob(parts[1]))
    const ahora = Math.floor(Date.now() / 1000)

    if (payload.exp < ahora) {
      return { valido: false, error: 'Token expirado' }
    }

    return { valido: true, payload }
  } catch (err) {
    return { valido: false, error: err.message }
  }
}
