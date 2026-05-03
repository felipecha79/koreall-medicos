import { useState, useRef } from 'react'
import {
  collection, addDoc, getDocs, query,
  where, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import toast from 'react-hot-toast'

// ── Columnas requeridas y opcionales ─────────────────────
const COLUMNAS_REQUERIDAS = ['nombre', 'apellidoPaterno', 'telefono']
const COLUMNAS_OPCIONALES = [
  'apellidoMaterno', 'fechaNacimiento', 'sexo', 'email',
  'curp', 'rfc', 'grupoSanguineo', 'alergias',
  'calle', 'colonia', 'ciudad', 'estado', 'cp',
  'estadoCivil', 'nacionalidad', 'ocupacion',
  'tipoPaciente', 'canalOrigen', 'notas',
  // Campos fiscales
  'rfcRazonSocial', 'regimenFiscal', 'usoCFDI', 'cpFiscal',
]
const TODAS_COLUMNAS = [...COLUMNAS_REQUERIDAS, ...COLUMNAS_OPCIONALES]

// ── Validaciones por campo ────────────────────────────────
const VALIDACIONES = {
  nombre:          { min: 2,  msg: 'Mínimo 2 caracteres' },
  apellidoPaterno: { min: 2,  msg: 'Mínimo 2 caracteres' },
  telefono:        { regex: /^\d{10}$/, msg: 'Debe ser exactamente 10 dígitos' },
  email:           { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'Email no válido', opcional: true },
  fechaNacimiento: { regex: /^\d{4}-\d{2}-\d{2}$/, msg: 'Formato YYYY-MM-DD (ej: 1990-05-15)', opcional: true },
  sexo:            { enum: ['M','F','O',''], msg: 'Solo M, F u O', opcional: true },
  curp:            { regex: /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/, msg: '18 caracteres, formato CURP', opcional: true },
  rfc:             { regex: /^[A-Z]{3,4}\d{6}[A-Z\d]{3}$/, msg: 'RFC no válido', opcional: true },
  tipoPaciente:    { enum: ['primera_vez', 'subsecuente', ''], msg: 'primera_vez o subsecuente', opcional: true },
  sexo_values:     ['M','F','O',''],
}

// ── Generar ID de paciente ────────────────────────────────
let contadorPacientes = null
async function siguientePacienteId(tenantId) {
  if (contadorPacientes === null) {
    const snap = await getDocs(collection(db, `tenants/${tenantId}/pacientes`))
    contadorPacientes = snap.size
  }
  contadorPacientes++
  return `PAC-${String(contadorPacientes).padStart(5, '0')}`
}

// ── Parsear CSV respetando comillas ───────────────────────
function parsearCSV(texto) {
  const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lineas.map(linea => {
    const cols = []
    let dentro = false
    let actual  = ''
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i]
      if (ch === '"') {
        dentro = !dentro
      } else if (ch === ',' && !dentro) {
        cols.push(actual.trim())
        actual = ''
      } else {
        actual += ch
      }
    }
    cols.push(actual.trim())
    return cols
  })
}

// ── Validar una fila ──────────────────────────────────────
function validarFila(fila, headers, numFila) {
  const errores = []
  const datos   = {}

  // Mapear columnas
  headers.forEach((h, i) => {
    datos[h.toLowerCase().trim()] = (fila[i] ?? '').trim()
  })

  // Validar requeridos
  for (const campo of COLUMNAS_REQUERIDAS) {
    if (!datos[campo]) {
      errores.push(`Fila ${numFila}: "${campo}" es obligatorio y está vacío`)
    }
  }

  // Validar formato de campos con valor
  for (const [campo, regla] of Object.entries(VALIDACIONES)) {
    if (campo === 'sexo_values') continue
    const valor = datos[campo]
    if (!valor) continue // vacío es OK si es opcional

    if (regla.min && valor.length < regla.min) {
      errores.push(`Fila ${numFila}: "${campo}" — ${regla.msg} (tiene "${valor}")`)
    }
    if (regla.regex && !regla.regex.test(valor)) {
      errores.push(`Fila ${numFila}: "${campo}" — ${regla.msg} (tiene "${valor}")`)
    }
    if (regla.enum && !regla.enum.includes(valor)) {
      errores.push(`Fila ${numFila}: "${campo}" — ${regla.msg} (tiene "${valor}")`)
    }
  }

  // Validar fecha plausible
  if (datos.fechaNacimiento) {
    const fecha = new Date(datos.fechaNacimiento)
    const hoy   = new Date()
    if (isNaN(fecha.getTime())) {
      errores.push(`Fila ${numFila}: "fechaNacimiento" no es una fecha válida`)
    } else if (fecha > hoy) {
      errores.push(`Fila ${numFila}: "fechaNacimiento" no puede ser en el futuro`)
    } else if (fecha.getFullYear() < 1900) {
      errores.push(`Fila ${numFila}: "fechaNacimiento" parece incorrecta (año < 1900)`)
    }
  }

  return { errores, datos }
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function ImportarPacientes() {
  const { tenantId } = useTenant()
  const fileRef      = useRef()

  const [etapa, setEtapa]           = useState('inicio') // inicio | revisando | errores | listo | subiendo | done
  const [archivo, setArchivo]       = useState(null)
  const [filas, setFilas]           = useState([])       // filas parseadas válidas
  const [errores, setErrores]       = useState([])       // errores de validación
  const [progreso, setProgreso]     = useState(0)
  const [resultados, setResultados] = useState({ ok: 0, error: 0, detalles: [] })
  const [previstaFilas, setPrev]    = useState([])       // primeras 5 filas para preview

  const procesarArchivo = async (file) => {
    setArchivo(file)
    setEtapa('revisando')
    setErrores([])

    const texto = await file.text()
    const lineas = parsearCSV(texto).filter(l => l.some(c => c.trim()))

    if (lineas.length < 2) {
      setErrores(['El archivo está vacío o solo tiene encabezados'])
      setEtapa('errores')
      return
    }

    const headers = lineas[0].map(h => h.toLowerCase().trim())

    // Verificar columnas requeridas
    const faltantes = COLUMNAS_REQUERIDAS.filter(c => !headers.includes(c))
    if (faltantes.length > 0) {
      setErrores([
        `Faltan columnas requeridas: ${faltantes.join(', ')}`,
        '',
        'Las columnas requeridas son: nombre, apellidoPaterno, telefono',
        'Asegúrate de que la primera fila sea el encabezado con exactamente esos nombres.',
      ])
      setEtapa('errores')
      return
    }

    // Validar todas las filas
    const todasFilas = []
    const todosErrores = []

    for (let i = 1; i < lineas.length; i++) {
      const { errores: errs, datos } = validarFila(lineas[i], headers, i + 1)
      if (errs.length > 0) {
        todosErrores.push(...errs)
      } else {
        todasFilas.push(datos)
      }
    }

    // Verificar emails duplicados dentro del archivo
    const emails = todasFilas.map(f => f.email).filter(Boolean)
    const emailsDups = emails.filter((e, i) => emails.indexOf(e) !== i)
    if (emailsDups.length > 0) {
      todosErrores.push(`Emails duplicados en el archivo: ${[...new Set(emailsDups)].join(', ')}`)
    }

    // Verificar teléfonos duplicados dentro del archivo
    const tels = todasFilas.map(f => f.telefono).filter(Boolean)
    const telsDups = tels.filter((t, i) => tels.indexOf(t) !== i)
    if (telsDups.length > 0) {
      todosErrores.push(`Teléfonos duplicados en el archivo: ${[...new Set(telsDups)].join(', ')}`)
    }

    if (todosErrores.length > 0) {
      setErrores(todosErrores)
      setEtapa('errores')
      return
    }

    setFilas(todasFilas)
    setPrev(todasFilas.slice(0, 5))
    setEtapa('listo')
  }

  const subirPacientes = async () => {
    if (!tenantId || filas.length === 0) return
    setEtapa('subiendo')
    setProgreso(0)

    // Resetear contador para este tenant
    contadorPacientes = null

    const ok      = []
    const errList = []

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      try {
        // Verificar si el email ya existe en Firestore
        if (f.email) {
          const existe = await getDocs(query(
            collection(db, `tenants/${tenantId}/pacientes`),
            where('email', '==', f.email)
          ))
          if (!existe.empty) {
            errList.push(`Fila ${i + 2}: Email ${f.email} ya existe en el sistema`)
            continue
          }
        }

        const pacienteId = await siguientePacienteId(tenantId)

        await addDoc(collection(db, `tenants/${tenantId}/pacientes`), {
          pacienteId,
          nombre:          f.nombre          ?? '',
          apellidoPaterno: f.apellidoPaterno  ?? '',
          apellidoMaterno: f.apellidoMaterno  ?? '',
          apellidos:       `${f.apellidoPaterno ?? ''} ${f.apellidoMaterno ?? ''}`.trim(),
          fechaNacimiento: f.fechaNacimiento  ?? '',
          sexo:            f.sexo             ?? '',
          email:           f.email            ?? '',
          telefono:        f.telefono         ?? '',
          curp:            f.curp             ?? '',
          rfc:             f.rfc              ?? '',
          grupoSanguineo:  f.grupoSanguineo   ?? '',
          alergias:        f.alergias         ?? '',
          calle:           f.calle            ?? '',
          colonia:         f.colonia          ?? '',
          ciudad:          f.ciudad           ?? '',
          estado:          f.estado           ?? '',
          cp:              f.cp               ?? '',
          estadoCivil:     f.estadoCivil      ?? '',
          nacionalidad:    f.nacionalidad     ?? 'Mexicana',
          ocupacion:       f.ocupacion        ?? '',
          rfcRazonSocial:  f.rfcRazonSocial   ?? '',
          regimenFiscal:   f.regimenFiscal    ?? '616',
          usoCFDI:         f.usoCFDI          ?? 'S01',
          cpFiscal:        f.cpFiscal         ?? f.cp ?? '',
          tipoPaciente:    f.tipoPaciente     || 'subsecuente',
          canalOrigen:     f.canalOrigen      ?? 'migracion',
          notas:           f.notas            ?? '',
          importado:       true,
          tenantId,
          activo:          true,
          creadoEn:        Timestamp.now(),
          actualizadoEn:   Timestamp.now(),
          totalConsultas:  0,
          ultimaConsulta:  null,
        })

        ok.push(`${f.nombre} ${f.apellidoPaterno} (${pacienteId})`)
      } catch(e) {
        errList.push(`Fila ${i + 2}: Error al subir "${f.nombre} ${f.apellidoPaterno}" — ${e.message}`)
      }

      setProgreso(Math.round(((i + 1) / filas.length) * 100))
    }

    setResultados({ ok: ok.length, error: errList.length, detalles: errList })
    setEtapa('done')

    if (errList.length === 0) {
      toast.success(`✓ ${ok.length} pacientes importados correctamente`)
    } else {
      toast.error(`${ok.length} importados, ${errList.length} con error`)
    }
  }

  const reiniciar = () => {
    setEtapa('inicio')
    setArchivo(null)
    setFilas([])
    setErrores([])
    setProgreso(0)
    setResultados({ ok: 0, error: 0, detalles: [] })
    if (fileRef.current) fileRef.current.value = ''
    contadorPacientes = null
  }

  // ── Descargar plantilla CSV ───────────────────────────
  const descargarPlantilla = () => {
    const encabezado = TODAS_COLUMNAS.join(',')
    const ejemplo1 = [
      'María','González','López','1985-03-20','F',
      'maria@email.com','8331234567','GOLM850320MTNNNR01','GOLM850320AB3',
      'O+','Penicilina',
      'Av. Hidalgo 123','Centro','Tampico','Tamaulipas','89000',
      'casado','Mexicana','Médico','subsecuente','recomendacion',
      'Paciente con historial previo',
      'María González López','605','D01','89000',
    ].join(',')
    const ejemplo2 = [
      'Juan','Pérez','Martínez','1990-07-15','M',
      'juan@email.com','8339876543','','',
      'A+','Ninguna',
      'Calle 5 de Mayo 456','Jardín','Tampico','Tamaulipas','89100',
      'soltero','Mexicana','Ingeniero','primera_vez','google',
      '',
      '','616','S01','89100',
    ].join(',')

    const csv = '\uFEFF' + [encabezado, ejemplo1, ejemplo2].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'MediDesk_Plantilla_Pacientes.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Plantilla descargada')
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Importar pacientes</h2>
          <p className="text-sm text-gray-400">Carga masiva desde archivo CSV</p>
        </div>
        <button onClick={descargarPlantilla}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg
                     hover:bg-gray-200 transition-colors flex items-center gap-2">
          📥 Descargar plantilla CSV
        </button>
      </div>

      {/* ── INICIO ─────────────────────────────────────── */}
      {etapa === 'inicio' && (
        <div className="space-y-4">
          {/* Instrucciones */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-blue-800 mb-3">
              📋 Instrucciones para la importación
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-blue-700">
              <div>
                <p className="font-semibold mb-1">Columnas REQUERIDAS (obligatorias):</p>
                {COLUMNAS_REQUERIDAS.map(c => (
                  <p key={c} className="font-mono bg-blue-100 px-2 py-0.5 rounded mb-1">• {c}</p>
                ))}
              </div>
              <div>
                <p className="font-semibold mb-1">Formato de datos:</p>
                <p>• <span className="font-mono">telefono</span>: 10 dígitos sin espacios</p>
                <p>• <span className="font-mono">fechaNacimiento</span>: YYYY-MM-DD</p>
                <p>• <span className="font-mono">sexo</span>: M, F u O</p>
                <p>• <span className="font-mono">tipoPaciente</span>: primera_vez o subsecuente</p>
                <p>• <span className="font-mono">email</span>: formato válido o vacío</p>
                <p className="mt-1 text-blue-600">
                  El sistema valida TODO antes de subir. Si hay un error en cualquier fila, te lo muestra para que corrijas.
                </p>
              </div>
            </div>
          </div>

          {/* Zona de carga */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center
                       cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-all"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f && f.name.endsWith('.csv')) procesarArchivo(f)
              else toast.error('Solo se aceptan archivos .csv')
            }}>
            <span className="text-5xl mb-4 block">📊</span>
            <p className="text-base font-medium text-gray-700 mb-1">
              Arrastra tu archivo CSV aquí
            </p>
            <p className="text-sm text-gray-400 mb-4">o haz clic para seleccionar</p>
            <span className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg">
              Seleccionar archivo
            </span>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => {
              const f = e.target.files[0]
              if (f) procesarArchivo(f)
            }} />
        </div>
      )}

      {/* ── REVISANDO ──────────────────────────────────── */}
      {etapa === 'revisando' && (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent
                          rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Validando el archivo...</p>
          <p className="text-sm text-gray-400 mt-1">Verificando formato y datos de cada fila</p>
        </div>
      )}

      {/* ── ERRORES ────────────────────────────────────── */}
      {etapa === 'errores' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">❌</span>
              <p className="font-semibold text-red-800">
                Se encontraron {errores.length} error{errores.length !== 1 ? 'es' : ''} — no se subió ningún registro
              </p>
            </div>
            <p className="text-xs text-red-700 mb-3">
              Corrige todos los errores en tu archivo CSV y vuelve a intentarlo.
              El sistema solo sube el archivo cuando esté 100% correcto.
            </p>
            <div className="bg-white rounded-xl border border-red-200 p-4 max-h-64 overflow-y-auto">
              {errores.map((e, i) => (
                <div key={i} className={`text-xs py-1.5 border-b border-red-100 last:border-0 
                  ${e === '' ? 'h-2' : 'text-red-700'}`}>
                  {e && <span className="font-mono">⚠ {e}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={reiniciar}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium
                         hover:bg-gray-200 transition-colors">
              ← Cargar otro archivo
            </button>
            <button onClick={descargarPlantilla}
              className="px-4 py-3 bg-teal-50 text-teal-700 rounded-xl text-sm border
                         border-teal-200 hover:bg-teal-100 transition-colors">
              Ver plantilla de ejemplo
            </button>
          </div>
        </div>
      )}

      {/* ── LISTO PARA SUBIR ───────────────────────────── */}
      {etapa === 'listo' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">✅</span>
              <p className="font-semibold text-green-800">
                Archivo validado — {filas.length} paciente{filas.length !== 1 ? 's' : ''} listo{filas.length !== 1 ? 's' : ''} para importar
              </p>
            </div>
            <p className="text-xs text-green-700">
              Todos los datos fueron validados correctamente. Revisa la vista previa y confirma la importación.
            </p>
          </div>

          {/* Vista previa */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between">
              <p className="text-sm font-medium text-gray-700">
                Vista previa — primeros {previstaFilas.length} de {filas.length} registros
              </p>
              {filas.length > 5 && (
                <p className="text-xs text-gray-400">... y {filas.length - 5} más</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['#','Nombre','Apellido paterno','Apellido materno','Teléfono','Email','Sexo','Fecha nac.','Tipo'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previstaFilas.map((f, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{f.nombre}</td>
                      <td className="px-3 py-2 text-gray-600">{f.apellidoPaterno}</td>
                      <td className="px-3 py-2 text-gray-600">{f.apellidoMaterno || '—'}</td>
                      <td className="px-3 py-2 font-mono">{f.telefono}</td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]">{f.email || '—'}</td>
                      <td className="px-3 py-2">{f.sexo || '—'}</td>
                      <td className="px-3 py-2 font-mono">{f.fechaNacimiento || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${f.tipoPaciente === 'primera_vez'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'}`}>
                          {f.tipoPaciente || 'subsecuente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reiniciar}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200">
              ← Cancelar
            </button>
            <button onClick={subirPacientes}
              className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-sm font-semibold
                         hover:bg-teal-700 transition-colors">
              ✓ Importar {filas.length} pacientes
            </button>
          </div>
        </div>
      )}

      {/* ── SUBIENDO ───────────────────────────────────── */}
      {etapa === 'subiendo' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="font-semibold text-gray-800 mb-1">Importando pacientes...</p>
          <p className="text-sm text-gray-400 mb-4">No cierres esta ventana</p>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
            <div className="h-3 bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-gray-500">
            {progreso}% — {Math.round((progreso / 100) * filas.length)} de {filas.length} pacientes
          </p>
        </div>
      )}

      {/* ── TERMINADO ──────────────────────────────────── */}
      {etapa === 'done' && (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-5
            ${resultados.error === 0
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{resultados.error === 0 ? '🎉' : '⚠️'}</span>
              <div>
                <p className={`font-semibold ${resultados.error === 0 ? 'text-green-800' : 'text-amber-800'}`}>
                  {resultados.error === 0
                    ? `¡Importación completada! ${resultados.ok} pacientes subidos`
                    : `Importación parcial: ${resultados.ok} ok, ${resultados.error} con error`}
                </p>
                <p className={`text-xs ${resultados.error === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  {resultados.error === 0
                    ? 'Todos los pacientes están disponibles en el sistema'
                    : 'Los registros con error no se subieron. Corrígelos y súbelos por separado.'}
                </p>
              </div>
            </div>

            {resultados.detalles.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 p-3 max-h-48 overflow-y-auto mt-2">
                <p className="text-xs font-semibold text-amber-700 mb-2">Errores durante la importación:</p>
                {resultados.detalles.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 font-mono py-0.5 border-b border-gray-100 last:border-0">
                    ⚠ {e}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={reiniciar}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium
                         hover:bg-gray-200 transition-colors">
              Importar otro archivo
            </button>
            <a href="/pacientes"
              className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-sm font-semibold
                         hover:bg-teal-700 transition-colors text-center">
              Ver pacientes importados →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
