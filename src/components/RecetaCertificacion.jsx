/**
 * RecetaCertificacion.jsx
 * Componente para certificación digital de recetas
 * SHA-256, JWT, QR, encriptación de certificados
 */

import { useState } from 'react'
import {
  generarCadenaDigital,
  generarJWTReceta,
  generarQRReceta,
  detectarMedicamentosRestringidos,
  encriptarCertificado,
} from '../services/recetaSeguridad'
import { ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase'
import toast from 'react-hot-toast'

export default function RecetaCertificacion({ receta, tenant, tenantId, onCertificar }) {
  const [step, setStep] = useState(1) // 1: Archivos, 2: Validación, 3: Confirmación
  const [keyFile, setKeyFile] = useState(null)
  const [cerFile, setCerFile] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [cadenaDigital, setCadenaDigital] = useState(null)
  const [jwtToken, setJwtToken] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [medicamentosAlerta, setMedicamentosAlerta] = useState([])

  // Paso 1: Cargar archivos .key y .cer
  const manejarArchivo = (e, tipo) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      if (tipo === 'key') setKeyFile({ name: file.name, contenido: evt.target.result })
      else setCerFile({ name: file.name, contenido: evt.target.result })
      toast.success(`${tipo.toUpperCase()} cargado ✓`)
    }
    reader.readAsText(file)
  }

  // Paso 2: Generar cadena digital y certificación
  const generarCertificacion = async () => {
    if (!keyFile && !cerFile) {
      toast.error('Carga al menos un archivo (.key o .cer)')
      return
    }

    setCargando(true)

    try {
      // 1. Generar SHA-256
      const cadena = await generarCadenaDigital(receta)
      setCadenaDigital(cadena)

      // 2. Generar JWT
      const { token } = generarJWTReceta(
        receta.id || receta.numero,
        receta.pacienteId,
        cadena.sha256Hash
      )
      setJwtToken(token)

      // 3. Generar QR
      const qr = await generarQRReceta(
        receta.id || receta.numero,
        token,
        window.location.origin
      )
      setQrCode(qr)

      // 4. Detectar medicamentos restringidos
      const alertas = detectarMedicamentosRestringidos(receta.medicamentos)
      setMedicamentosAlerta(alertas)

      // 5. Subir archivos encriptados a Firebase Storage
      if (keyFile) {
        const keyEncriptado = encriptarCertificado(keyFile.contenido, tenantId)
        const keyRef = ref(
          storage,
          `tenants/${tenantId}/recetas/${receta.id || receta.numero}/certificado.key.enc`
        )
        await uploadBytes(keyRef, new Blob([keyEncriptado]))
      }

      if (cerFile) {
        const cerEncriptado = encriptarCertificado(cerFile.contenido, tenantId)
        const cerRef = ref(
          storage,
          `tenants/${tenantId}/recetas/${receta.id || receta.numero}/certificado.cer.enc`
        )
        await uploadBytes(cerRef, new Blob([cerEncriptado]))
      }

      toast.success('Certificación generada ✓')
      setStep(2)
    } catch (err) {
      console.error('Error:', err)
      toast.error('Error generando certificación')
    } finally {
      setCargando(false)
    }
  }

  // Paso 3: Confirmar y guardar en Firestore
  const confirmarCertificacion = async () => {
    try {
      await onCertificar({
        sha256: cadenaDigital.sha256Hash,
        jwtToken,
        qrDataUrl: qrCode.qrDataUrl,
        validationUrl: qrCode.validationUrl,
        certificadosSubidos: {
          key: !!keyFile,
          cer: !!cerFile,
        },
      })

      toast.success('Receta certificada ✓')
      setStep(3)
    } catch (err) {
      console.error('Error:', err)
      toast.error('Error certificando receta')
    }
  }

  if (step === 3) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <p className="text-green-800 font-semibold mb-2">✓ Receta certificada digitalmente</p>
        <p className="text-sm text-green-700">
          La receta está lista para validación en farmacias
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {step === 1 && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>NOM-151:</strong> Carga los certificados digitales del doctor (opcional) para encriptación máxima.
            </p>
          </div>

          {medicamentosAlerta.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
              <p className="text-sm font-semibold text-yellow-800 mb-2">
                ⚠️ Medicamentos con restricción especial:
              </p>
              {medicamentosAlerta.map((alerta, i) => (
                <p key={i} className="text-sm text-yellow-700">
                  • {alerta.medicamento} — requiere validación especial en farmacia
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Certificado .KEY (privado)', tipo: 'key', archivo: keyFile },
              { label: 'Certificado .CER (público)', tipo: 'cer', archivo: cerFile },
            ].map(({ label, tipo, archivo }) => (
              <div key={tipo}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".key,.cer,.pem"
                    onChange={(e) => manejarArchivo(e, tipo)}
                    className="flex-1 text-sm"
                  />
                  {archivo && (
                    <span className="text-xs text-green-600 font-semibold">✓ {archivo.name}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={generarCertificacion}
            disabled={cargando}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400
                       text-white font-semibold py-2 rounded-lg transition"
          >
            {cargando ? 'Generando...' : '🔐 Generar Certificación Digital'}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="space-y-3">
            {/* SHA-256 */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 font-semibold mb-1">SHA-256 (NOM-151)</p>
              <p className="text-xs font-mono bg-white p-2 rounded border border-gray-200 break-all">
                {cadenaDigital.sha256Hash}
              </p>
            </div>

            {/* JWT Token */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 font-semibold mb-1">JWT Token (Validación)</p>
              <p className="text-xs font-mono bg-white p-2 rounded border border-gray-200 break-all">
                {jwtToken?.substring(0, 50)}...
              </p>
            </div>

            {/* QR Code */}
            {qrCode && (
              <div className="flex justify-center bg-gray-50 rounded-lg p-3 border border-gray-200">
                <img src={qrCode.qrDataUrl} alt="QR Receta" className="w-32 h-32" />
              </div>
            )}

            {/* URL de Validación */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 font-semibold mb-1">URL de Validación Pública</p>
              <p className="text-xs font-mono bg-white p-2 rounded border border-gray-200 break-all">
                {qrCode?.validationUrl}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800
                         font-semibold py-2 rounded-lg transition"
            >
              ← Volver
            </button>
            <button
              onClick={confirmarCertificacion}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white
                         font-semibold py-2 rounded-lg transition"
            >
              ✓ Confirmar Certificación
            </button>
          </div>
        </>
      )}
    </div>
  )
}
