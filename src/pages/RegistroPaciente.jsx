import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth'
import {
  collection, addDoc, getDocs, query,
  where, Timestamp, doc, getDoc, limit
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import toast from 'react-hot-toast'
import OCRConstanciaSAT from '../components/OCRConstanciaSAT'

// ── Paleta del consultorio (carga dinámica) ──────────────
const TEAL = '#0A8076'

// ── OCR de INE via Claude Vision ──────────────────────────
// Usamos el endpoint de Anthropic directamente desde el cliente
// Solo extrae nombre, apellidos, fecha de nacimiento, sexo y CURP
// NO almacenamos la imagen de la INE — solo los datos extraídos
async function extraerDatosINE(imagenBase64, mimeType) {
  const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

  // Si no hay API key configurada, saltar OCR y llenar manualmente
  if (!ANTHROPIC_KEY) {
    console.warn('[OCR] VITE_ANTHROPIC_API_KEY no configurada — llenado manual')
    throw new Error('OCR_NO_KEY')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imagenBase64 }
          },
          {
            type: 'text',
            text: `Esta es una INE/credencial de elector mexicana. 
Extrae exactamente los siguientes campos y devuelve SOLO un JSON válido sin explicaciones:
{
  "nombre": "solo el nombre(s), sin apellidos",
  "apellidoPaterno": "primer apellido",
  "apellidoMaterno": "segundo apellido",
  "fechaNacimiento": "YYYY-MM-DD",
  "sexo": "M o F",
  "curp": "CURP completa si es visible",
  "calle": "calle y número si aparece en el domicilio",
  "colonia": "colonia si aparece",
  "municipio": "municipio o ciudad",
  "estado": "estado de la república",
  "cp": "código postal si aparece"
}
Si algún campo no es legible devuelve cadena vacía "". 
No incluyas nada más en tu respuesta, solo el JSON.`
          }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error('Error en la API de OCR')
  const data = await response.json()
  const texto = data.content?.[0]?.text ?? '{}'
  // Limpiar posibles backticks de markdown
  const limpio = texto.replace(/```json|```/g, '').trim()
  return JSON.parse(limpio)
}

// ── Generar ID de paciente ────────────────────────────────
async function generarPacienteId(tenantId) {
  const snap = await getDocs(collection(db, `tenants/${tenantId}/pacientes`))
  return `PAC-${String(snap.size + 1).padStart(5, '0')}`
}

// ── Pasos del registro ────────────────────────────────────
const PASOS = ['INE', 'Tus datos', 'Cuenta', 'Listo']

export default function RegistroPaciente() {
  const navigate       = useNavigate()
  const [params]       = useSearchParams()
  const tenantParam    = params.get('t') // ?t=consultorio-piloto
  const fileRef        = useRef()

  const [paso, setPaso]         = useState(0) // 0=INE, 1=datos, 2=cuenta, 3=listo
  const [escaneando, setEsc]    = useState(false)
  const [saving, setSaving]     = useState(false)
  const [preview, setPreview]   = useState(null)
  const [tenantId, setTenantId] = useState(tenantParam ?? null)
  const [tenantNombre, setTenantNombre] = useState('')
  const [tenants, setTenants]   = useState([])
  const [tenantSeleccionado, setTenantSel] = useState(tenantParam ?? '')

  // Datos del formulario
  const [form, setForm] = useState({
    nombre: '', apellidos: '', apellidoPaterno: '', apellidoMaterno: '',
    fechaNacimiento: '', sexo: '', curp: '',
    calle: '', colonia: '', ciudad: '', estado: '', cp: '',
    telefono: '', email: '', password: '', confirmar: '',
    aceptaTerminos: false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Cargar lista de tenants (consultorios disponibles)
  // Fix: useEffect (no useState) para cargar tenants — funciona en iOS Safari
  useEffect(() => {
    getDocs(query(collection(db, 'tenants'), where('activo', '!=', false))).then(snap => {
      const lista = snap.docs
        .map(d => ({ id: d.id, nombre: d.data().nombre }))
        .filter(t => t.nombre)
      setTenants(lista)
      // Si hay un solo tenant, seleccionarlo automáticamente
      if (lista.length === 1 && !tenantParam) {
        setTenantSel(lista[0].id)
        setTenantNombre(lista[0].nombre)
      }
      if (tenantParam) {
        const t = lista.find(x => x.id === tenantParam)
        if (t) setTenantNombre(t.nombre)
      }
    }).catch(() => {})
  }, [])

  // ── Procesar imagen de INE ────────────────────────────
  const procesarINE = async (archivo) => {
    if (!archivo) return
    if (archivo.size > 10 * 1024 * 1024) { toast.error('La imagen debe ser menor a 10 MB'); return }

    // Preview
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(archivo)

    setEsc(true)
    try {
      // Convertir a base64
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(archivo)
      })

      const mimeType = archivo.type || 'image/jpeg'
      const datos = await extraerDatosINE(base64, mimeType)

      // Poblar el formulario con los datos extraídos
      setForm(f => ({
        ...f,
        nombre:          datos.nombre        ?? f.nombre,
        apellidoPaterno: datos.apellidoPaterno ?? '',
        apellidoMaterno: datos.apellidoMaterno ?? '',
        apellidos:       `${datos.apellidoPaterno ?? ''} ${datos.apellidoMaterno ?? ''}`.trim(),
        fechaNacimiento: datos.fechaNacimiento ?? f.fechaNacimiento,
        sexo:            datos.sexo           ?? f.sexo,
        curp:            datos.curp           ?? f.curp,
        calle:           datos.calle          ?? f.calle,
        colonia:         datos.colonia        ?? f.colonia,
        ciudad:          datos.municipio      ?? f.ciudad,
        estado:          datos.estado         ?? f.estado,
        cp:              datos.cp             ?? f.cp,
      }))

      toast.success('✓ INE leída correctamente — verifica tus datos')
      setPaso(1)
    } catch(e) {
      console.error('OCR error:', e)
      if (e.message === 'OCR_NO_KEY') {
        toast('Sin OCR configurado — ingresa tus datos manualmente', { icon: 'ℹ️' })
      } else {
        toast.error('No se pudo leer la INE. Ingresa tus datos manualmente.')
      }
      setPaso(1) // Avanzar de todas formas al formulario manual
    } finally { setEsc(false) }
  }

  // ── Validar y crear cuenta ────────────────────────────
  const crearCuenta = async () => {
    if (!form.email)    { toast.error('El email es obligatorio'); return }
    if (!form.password) { toast.error('La contraseña es obligatoria'); return }
    if (form.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return }
    if (form.password !== form.confirmar) { toast.error('Las contraseñas no coinciden'); return }
    if (!form.aceptaTerminos) { toast.error('Debes aceptar los términos de uso'); return }

    const tid = tenantSeleccionado || tenantId
    if (!tid) { toast.error('Selecciona el consultorio'); return }

    setSaving(true)
    try {
      // 1. Verificar que el email no esté ya registrado como paciente
      const existe = await getDocs(query(
        collection(db, `tenants/${tid}/pacientes`),
        where('email', '==', form.email), limit(1)
      ))
      if (!existe.empty) {
        toast.error('Ya existe una cuenta con ese email en este consultorio')
        setSaving(false); return
      }

      // 2. Crear usuario en Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)

      // 3. Enviar verificación de email
      await sendEmailVerification(cred.user)

      // 4. Registrar paciente en Firestore
      const pacienteId = await generarPacienteId(tid)
      await addDoc(collection(db, `tenants/${tid}/pacientes`), {
        pacienteId,
        uid:             cred.user.uid,
        nombre:          form.nombre,
        apellidos:       form.apellidos,
        apellidoPaterno: form.apellidoPaterno,
        apellidoMaterno: form.apellidoMaterno,
        fechaNacimiento: form.fechaNacimiento,
        sexo:            form.sexo,
        curp:            form.curp,
        email:           form.email,
        telefono:        form.telefono,
        calle:           form.calle,
        colonia:         form.colonia,
        ciudad:          form.ciudad,
        estado:          form.estado,
        cp:              form.cp,
        tipoPaciente:    'primera_vez',
        idioma:          'es',
        registradoOnline: true,
        tenantId:        tid,
        activo:          true,
        creadoEn:        Timestamp.now(),
        actualizadoEn:   Timestamp.now(),
        totalConsultas:  0,
        ultimaConsulta:  null,
      })

      toast.success(`¡Cuenta creada! Revisa tu email para verificarla.`)
      setPaso(3)
    } catch(e) {
      console.error(e)
      if (e.code === 'auth/email-already-in-use') {
        toast.error('Ese email ya tiene una cuenta. ¿Quieres iniciar sesión?')
      } else {
        toast.error(`Error: ${e.message}`)
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0D1F35 0%, #083030 100%)' }}>

      {/* Logo / Nombre */}
      <div className="text-center mb-6">
        <p className="text-white text-xl font-light"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          {tenantNombre || 'MediDesk'}
        </p>
        <p className="text-white text-sm mt-1" style={{ opacity: 0.5 }}>
          Portal del paciente — Registro
        </p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Stepper */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            {PASOS.map((p, i) => (
              <div key={p} className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs
                  font-semibold transition-all
                  ${i < paso ? 'bg-teal-600 text-white'
                    : i === paso ? 'bg-teal-600 text-white ring-4 ring-teal-100'
                    : 'bg-gray-100 text-gray-400'}`}>
                  {i < paso ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block
                  ${i === paso ? 'text-teal-600' : 'text-gray-400'}`}>
                  {p}
                </span>
                {i < PASOS.length - 1 && (
                  <div className={`hidden sm:block h-px w-8 mx-1
                    ${i < paso ? 'bg-teal-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">

          {/* ── PASO 0: Escanear INE ─────────────────────── */}
          {paso === 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                Escanea tu INE
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Toma una foto de tu credencial de elector y llenaremos tus datos automáticamente.
              </p>

              {/* Seleccionar consultorio si no viene por URL */}
              {tenants.length > 0 && !tenantParam && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">
                    ¿En qué consultorio quieres registrarte?
                  </label>
                  <select
                    value={tenantSeleccionado}
                    onChange={e => {
                      setTenantSel(e.target.value)
                      const t = tenants.find(x => x.id === e.target.value)
                      if (t) setTenantNombre(t.nombre)
                    }}
                    style={{ fontSize: '16px' }}
                    className="w-full border-2 border-teal-400 rounded-xl px-3 py-3 text-sm
                               bg-white focus:outline-none focus:ring-2 focus:ring-teal-500
                               appearance-none cursor-pointer">
                    <option value="">— Seleccionar consultorio —</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  <p className="text-xs text-teal-600 mt-1">
                    {tenantSeleccionado
                      ? `✓ Consultorio seleccionado: ${tenantNombre}`
                      : 'Toca para seleccionar tu consultorio'}
                  </p>
                </div>
              )}

              {/* Zona de carga de imagen */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) procesarINE(f)
                }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
                  transition-all hover:border-teal-400 hover:bg-teal-50
                  ${escaneando ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}`}>

                {preview ? (
                  <div>
                    <img src={preview} alt="INE" className="w-full max-h-40 object-contain rounded-xl mb-3" />
                    {escaneando && (
                      <div className="flex items-center justify-center gap-2 text-teal-600 text-sm font-medium">
                        <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                        Leyendo datos de tu INE...
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="text-5xl mb-3 block">🪪</span>
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      {escaneando ? 'Procesando...' : 'Sube una foto de tu INE'}
                    </p>
                    <p className="text-xs text-gray-400">
                      JPG, PNG hasta 10 MB · Cara frontal de la credencial
                    </p>
                  </div>
                )}

                {escaneando && !preview && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-teal-600 text-sm">
                    <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    Leyendo INE...
                  </div>
                )}
              </div>

              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files[0]; if (f) procesarINE(f) }} />

              {/* Botones */}
              <div className="flex gap-3 mt-4">
                <button onClick={() => fileRef.current?.click()} disabled={escaneando}
                  className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-sm font-medium
                             hover:bg-teal-700 disabled:opacity-50 transition-colors">
                  {escaneando ? 'Procesando...' : '📷 Tomar foto / Subir INE'}
                </button>
                <button onClick={() => setPaso(1)}
                  className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm
                             hover:bg-gray-200 transition-colors whitespace-nowrap">
                  Sin INE →
                </button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-700 text-center">
                  🔒 Tu INE solo se usa para leer tus datos — no se almacena la imagen
                </p>
              </div>
            </div>
          )}

          {/* ── PASO 1: Verificar datos ──────────────────── */}
          {paso === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                Verifica tus datos
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Revisa que todo esté correcto y completa lo que falte.
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nombre(s) *</label>
                    <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Apellido paterno *</label>
                    <input type="text" value={form.apellidoPaterno}
                      onChange={e => {
                        set('apellidoPaterno', e.target.value)
                        setForm(f => ({ ...f, apellidoPaterno: e.target.value,
                          apellidos: `${e.target.value} ${f.apellidoMaterno}`.trim() }))
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Apellido materno</label>
                    <input type="text" value={form.apellidoMaterno}
                      onChange={e => {
                        setForm(f => ({ ...f, apellidoMaterno: e.target.value,
                          apellidos: `${f.apellidoPaterno} ${e.target.value}`.trim() }))
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fecha de nacimiento</label>
                    <input type="date" value={form.fechaNacimiento}
                      onChange={e => set('fechaNacimiento', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sexo</label>
                    <select value={form.sexo} onChange={e => set('sexo', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400">
                      <option value="">—</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CURP</label>
                    <input type="text" value={form.curp} onChange={e => set('curp', e.target.value.toUpperCase())}
                      placeholder="18 caracteres"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Teléfono celular *</label>
                  <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                    placeholder="10 dígitos"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>

                {/* Dirección (pre-llenada desde INE) */}
                {(form.calle || form.colonia) && (
                  <div className="bg-teal-50 rounded-xl p-3 border border-teal-100">
                    <p className="text-xs font-medium text-teal-700 mb-1">📍 Dirección leída de la INE:</p>
                    <p className="text-xs text-teal-600">
                      {[form.calle, form.colonia, form.ciudad, form.estado, form.cp]
                        .filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setPaso(0)}
                  className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">
                  ← Atrás
                </button>
                <button
                  onClick={() => {
                    if (!form.nombre || !form.apellidoPaterno) {
                      toast.error('Nombre y apellido paterno son obligatorios'); return
                    }
                    if (!form.telefono) { toast.error('El teléfono es obligatorio'); return }
                    setPaso(2)
                  }}
                  className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-sm font-medium
                             hover:bg-teal-700 transition-colors">
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 2: Crear cuenta ─────────────────────── */}
          {paso === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                Crea tu cuenta
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Con este email y contraseña podrás acceder a tu portal de paciente.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Contraseña *</label>
                  <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Confirmar contraseña *</label>
                  <input type="password" value={form.confirmar} onChange={e => set('confirmar', e.target.value)}
                    placeholder="Repite tu contraseña"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>

                <label className="flex items-start gap-2 cursor-pointer mt-2">
                  <input type="checkbox" checked={form.aceptaTerminos}
                    onChange={e => set('aceptaTerminos', e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-teal-600" />
                  <span className="text-xs text-gray-600">
                    Acepto el{' '}
                    <a href="#" className="text-teal-600 hover:underline">aviso de privacidad</a>
                    {' '}y{' '}
                    <a href="#" className="text-teal-600 hover:underline">términos de uso</a>
                    {' '}de MediDesk.
                  </span>
                </label>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setPaso(1)}
                  className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">
                  ← Atrás
                </button>
                <button onClick={crearCuenta} disabled={saving}
                  className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-sm font-medium
                             hover:bg-teal-700 disabled:opacity-50 transition-colors">
                  {saving ? '⏳ Creando cuenta...' : '✓ Crear mi cuenta'}
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 3: Listo ────────────────────────────── */}
          {paso === 3 && (
            <div className="text-center py-4">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                ¡Bienvenido, {form.nombre}!
              </h2>
              <p className="text-sm text-gray-500 mb-2">
                Tu cuenta fue creada exitosamente.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-left">
                <p className="text-xs text-amber-700 font-medium mb-1">📧 Verifica tu email</p>
                <p className="text-xs text-amber-600">
                  Te enviamos un correo a <strong>{form.email}</strong> para confirmar tu cuenta.
                  Revisa también tu carpeta de spam.
                </p>
              </div>
              <button
                onClick={() => navigate('/portal-paciente')}
                className="w-full py-3 bg-teal-600 text-white rounded-xl text-sm font-medium
                           hover:bg-teal-700 transition-colors">
                Ir a mi portal →
              </button>
              <p className="text-xs text-gray-400 mt-3">
                El consultorio revisará tu registro y activará tu acceso completo.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* Link de login */}
      <p className="text-white text-sm mt-5" style={{ opacity: 0.5 }}>
        ¿Ya tienes cuenta?{' '}
        <a href="/" className="underline hover:opacity-80">Inicia sesión</a>
      </p>
    </div>
  )
}
