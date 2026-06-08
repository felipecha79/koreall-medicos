/**
 * ValidarReceta.jsx
 * Página pública sin autenticación para validación de recetas
 * Accesible por farmacias a través de QR code
 * Ruta: /validar-receta/{recetaId}?token={jwtToken}
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function ValidarReceta() {
  const { recetaId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [estado, setEstado] = useState('cargando') // cargando, valida, inválida
  const [receta, setReceta] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const validar = async () => {
      if (!recetaId || !token) {
        setEstado('inválida')
        setError('Faltan parámetros (recetaId o token)')
        return
      }

      try {
        // Llamar a la Cloud Function
        const response = await fetch(
          `/api/validar-receta/${recetaId}?token=${encodeURIComponent(token)}`,
          { method: 'GET' }
        )

        const data = await response.json()

        if (response.ok && data.valido) {
          setReceta(data.receta)
          setEstado('valida')
        } else {
          setEstado('inválida')
          setError(data.error || 'Receta no válida')
        }
      } catch (err) {
        console.error('Error validando:', err)
        setEstado('inválida')
        setError(err.message)
      }
    }

    validar()
  }, [recetaId, token])

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Validando receta...</p>
        </div>
      </div>
    )
  }

  if (estado === 'inválida') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center border-l-4 border-red-500">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-800 mb-2">Receta no válida</h1>
          <p className="text-gray-600 mb-4">
            {error || 'No se pudo validar la receta. Contacte al médico o farmacia.'}
          </p>
          <p className="text-xs text-gray-500 font-mono break-all mt-4">
            ID: {recetaId}
          </p>
        </div>
      </div>
    )
  }

  // Válida
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 mt-4">
          <div className="inline-block bg-green-100 rounded-full p-3 mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">✓ Receta Válida</h1>
          <p className="text-gray-600">
            Certificada por {receta?.certificacion?.cedulaProfesional}
          </p>
        </div>

        {/* Receta */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-t-4 border-green-500">
          {/* Paciente y Doctor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pb-4 border-b border-gray-200">
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Paciente</p>
              <p className="text-lg font-bold text-gray-800">{receta?.paciente}</p>
            </div>
            <div className="text-right sm:text-left">
              <p className="text-xs text-gray-500 font-semibold uppercase">Doctor</p>
              <p className="text-lg font-bold text-teal-700">{receta?.doctor}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Fecha</p>
              <p className="text-sm text-gray-800">
                {format(new Date(receta?.fecha), "d 'de' MMMM 'de' yyyy", { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">No. Receta</p>
              <p className="font-mono text-sm text-gray-800">{receta?.numero}</p>
            </div>
          </div>

          {/* Diagnóstico */}
          {receta?.diagnostico && (
            <div className="mb-6 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
              <p className="text-xs text-blue-600 font-semibold uppercase mb-1">Diagnóstico</p>
              <p className="text-gray-800">{receta.diagnostico}</p>
            </div>
          )}

          {/* Medicamentos */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 uppercase mb-3">Prescripción Médica</p>
            <div className="space-y-2">
              {receta?.medicamentos?.map((med, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 border-l-4 border-teal-400">
                  <p className="font-bold text-gray-800">{i + 1}. {med.nombre}</p>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                    {med.dosis && <span><strong>Dosis:</strong> {med.dosis}</span>}
                    {med.via && <span><strong>Vía:</strong> {med.via}</span>}
                    {med.frecuencia && <span><strong>Frecuencia:</strong> {med.frecuencia}</span>}
                    {med.duracion && <span><strong>Duración:</strong> {med.duracion}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Certificación */}
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-xs text-green-700 font-semibold uppercase mb-2">
              ✓ Certificación Digital NOM-151
            </p>
            <p className="text-xs text-gray-600 mb-2">
              Certificada por: <strong>{receta?.certificacion?.cedulaProfesional}</strong>
            </p>
            <p className="text-xs text-gray-600">
              Fecha: {format(new Date(receta?.certificacion?.fechaCertificacion), "d/MM/yyyy HH:mm")}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-600 mb-4">
          <p className="mb-2">
            Esta receta ha sido validada exitosamente. La farmacia puede proceder con el despacho.
          </p>
          <p className="text-xs text-gray-500 font-mono break-all">
            Validación: {recetaId}
          </p>
        </div>

        {/* Branding */}
        <div className="flex justify-center mb-4">
          <svg width="24" height="22" viewBox="0 0 56 52" fill="none">
            <path d="M6 46 Q28 6 50 46" stroke="#0D9488" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M16 46 Q28 18 40 46" stroke="#0D9488" strokeWidth="2.8" strokeLinecap="round" />
            <circle cx="28" cy="13" r="5.5" fill="#0D9488" />
          </svg>
        </div>
        <p className="text-center text-xs text-gray-500">
          Sistema de recetas digitales seguras • Novaryk.Med
        </p>
      </div>
    </div>
  )
}
