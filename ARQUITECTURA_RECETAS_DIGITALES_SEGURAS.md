# ARQUITECTURA: Recetas Digitales Seguras con SAT
## Cumplimiento NOM-151-SCFI-2016 + NOM-024-SSA3-2010 + Reforma 2026 COFEPRIS

**Versión:** 1.0 | **Fecha:** Junio 2026 | **Estado:** Arquitectura Base (Pre-implementación)

---

## 1. RESUMEN EJECUTIVO

Novaryk.Med implementará un sistema de recetas digitales con dos modos:

### Modo 1: Receta Ordinaria (Sin Certificación)
- Doctor SIN e-firma SAT válida
- Receta generada pero marcada como **"No es receta digital"** (leyenda obligatoria)
- No incluye cadena digital ni QR verificable
- No se muestra en Portal Paciente

### Modo 2: Receta Electrónica Certificada (Con e-firma)
- Doctor CON certificado SAT válido (.key + .cer)
- Receta firmada digitalmente con SHA-256 (cadena digital)
- Incluye QR único con UUID + JWT (verificable públicamente)
- Se muestra en Portal Paciente
- Cumple NOM-151-SCFI-2016 + NOM-024-SSA3-2010

**Restricciones especiales:** Mounjaro y Wegovy (medicamentos controlados) → **Solo advertencia visual** (no bloqueo)

---

## 2. MARCO LEGAL Y VALIDACIÓN

### Normativa Aplicable en México (2026)

| Norma | Aplica a | Requisitos |
|-------|----------|-----------|
| **NOM-024-SSA3-2010** | Sistemas electrónicos salud | Datos mínimos receta: cédula, especialidad, paciente, medicamento, dosis, firma |
| **NOM-151-SCFI-2016** | Preservación datos digitales | Integridad SHA-256, no repudiación, trazabilidad |
| **Reforma DOF 15/01/2026** | Digitalización atención médica | Recetas digitales legalmente válidas, firma electrónica = firma autógrafa |
| **COFEPRIS** | Medicamentos controlados | Mounjaro/Wegovy requieren validación médica, no hay bloqueo sistem |

### Conclusión Legal

✅ **SHA-256 es suficiente** para cumplir NOM-151 (cadena digital mínima)  
✅ **NO se requiere PAC** (PAC es para CFDI/facturas, no para recetas)  
✅ **NO se requiere timbrado XML** (ese es concepto CFDI)  
✅ **Recetas digitales son legalmente válidas** desde el 16/01/2026  
⚠️ **Responsabilidad del doctor** validar que tiene e-firma SAT vigente  

---

## 3. ARQUITECTURA DE BASE DE DATOS

### 3.1 Colección: `tenants/{tenantId}/doctores/{doctorId}`

```javascript
// NUEVO CAMPO: e-firma SAT
{
  uid: "...",
  nombre: "Dr. Juan Felipe",
  cedula: "123456",
  email: "juan@dr.com",
  especialidad: "Medicina General",
  
  // ✅ NUEVO: Estado de e-firma
  e_firma: {
    activa: true,                    // true si doctor tiene certificado SAT válido
    fecha_validacion: "2026-06-07",  // cuándo se validó que tiene e-firma
    certificado_id: "RFC_CERT_001",  // referencia al certificado en Storage
    validado_por: "admin@novaryk.com" // quién validó en Admin
  },
  
  // Medicamentos que está autorizado a recetar
  medicamentos_permitidos: [...],
  
  // Sistema de alertas
  medicamentos_con_restriccion: ["Mounjaro", "Wegovy"]
}
```

### 3.2 Colección: `tenants/{tenantId}/recetas/{recetaId}`

```javascript
{
  // DATOS BÁSICOS
  pacienteId: "...",
  pacienteNombre: "Dulce Pérez García",
  pacienteCedula: "PAC-00002",
  
  doctorId: "...",
  doctorNombre: "Dr. Juan Felipe",
  doctorCedula: "123456",
  doctorEspecialidad: "Medicina General",
  
  // MEDICAMENTOS
  medicamentos: [
    {
      nombre: "Penicilina",
      dosis: "500mg",
      frecuencia: "3 cada 8 horas",
      duracion: "7 días",
      cantidad: "21"
    },
    {
      nombre: "Mounjaro",  // ⚠️ MEDICAMENTO CONTROLADO
      dosis: "2.5mg",
      frecuencia: "semanal",
      duracion: "4 semanas",
      cantidad: "4",
      es_controlado: true,
      advertencia_mostrada: true  // El doctor vio la advertencia
    }
  ],
  
  diagnostico: "Diabetes tipo 2",
  indicaciones: "Tomar con alimentos",
  fecha_emision: "2026-06-07T14:30:00Z",
  
  // ✅ CERTIFICACIÓN DIGITAL (si doctor tiene e-firma)
  certificacion: {
    mode: "CERTIFICADA" | "ORDINARIA",
    
    // Si CERTIFICADA:
    cadena_digital: {
      hash_sha256: "a1b2c3d4e5f6...",  // SHA-256 del contenido JSON
      algoritmo: "SHA-256",
      timestamp: "2026-06-07T14:30:00Z",
      firma_base64: "MIIBIjANBg..."  // Firma digital (RSA-2048)
    },
    
    // QR único verificable
    qr_code: {
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      url_validacion: "https://koreall-medicos.vercel.app/validar-receta/550e8400...",
      vigencia_dias: 30,
      fecha_expira: "2026-07-07T14:30:00Z"
    },
    
    // Si ORDINARIA:
    leyenda_ordinaria: "Esta es una receta ordinaria. No es documento electrónico certificado."
  },
  
  // AUDITORÍA
  creada_en: "2026-06-07T14:30:00Z",
  modificada_en: "2026-06-07T14:30:00Z",
  estado: "activa" | "surtida" | "cancelada" | "expirada",
  historial_cambios: [...]
}
```

### 3.3 Colección: `tenants/{tenantId}/certificados_sat/{certificadoId}`

```javascript
// ALMACENAMIENTO SEGURO DE CERTIFICADOS
{
  doctorId: "...",
  rfc: "XAXX010203ABC",
  
  // Referencias a Firebase Storage
  storage_path_key: "certificados_sat/XAXX010203ABC.key",
  storage_path_cer: "certificados_sat/XAXX010203ABC.cer",
  
  // NUNCA guardar contraseña en Firestore
  // La contraseña debe ingresarla el doctor cada vez
  // Se valida en el cliente contra el archivo .key
  
  fecha_carga: "2026-06-07T12:00:00Z",
  fecha_vencimiento: "2027-06-07",
  estado: "activo" | "vencido" | "revocado",
  
  // Validación de integridad
  hash_cer: "sha256:...",
  validado: true,
  validado_en: "2026-06-07T12:05:00Z",
  
  // Auditoría
  accesos_recientes: [
    { fecha: "...", receta_id: "...", exitoso: true }
  ]
}
```

---

## 4. ALMACENAMIENTO SEGURO DE CERTIFICADOS SAT

### 4.1 ¿Dónde guardar .key y .cer?

**RECOMENDACIÓN: Firebase Storage (Encrypted)**

```
gs://koreallmedicos.appspot.com/
├── certificados_sat/
│   ├── XAXX010203ABC.key          (Firebase Storage, encrypted)
│   ├── XAXX010203ABC.cer          (Firebase Storage, encrypted)
│   └── XAXX010203ABC/
│       ├── metadata.json          (Firestore)
│       └── validacion.json        (Firestore)
```

### 4.2 Seguridad de Certificados

```javascript
// PROCEDIMIENTO DE CARGA EN ADMIN.JSX

const cargarCertificadoSAT = async (doctorId, archivoKey, archivoCer, contrasena) => {
  // 1. Validar que los archivos son válidos
  const esValido = await validarCertificadoSAT(archivoKey, archivoCer, contrasena)
  if (!esValido) throw new Error('Certificado inválido o contraseña incorrecta')
  
  // 2. Subir a Firebase Storage (ENCRYPTED automáticamente)
  const refKey = ref(storage, `certificados_sat/${rfc}.key`)
  const refCer = ref(storage, `certificados_sat/${rfc}.cer`)
  
  await uploadBytes(refKey, archivoKey)
  await uploadBytes(refCer, archivoCer)
  
  // 3. Guardar METADATA en Firestore (NO la contraseña)
  await setDoc(doc(db, 'tenants', tenantId, 'certificados_sat', certificadoId), {
    doctorId,
    rfc,
    storage_path_key: `certificados_sat/${rfc}.key`,
    storage_path_cer: `certificados_sat/${rfc}.cer`,
    hash_cer: await SHA256(archivoCer),  // hash para validación
    fecha_carga: new Date(),
    estado: 'activo',
    validado: true
  })
  
  // 4. Actualizar doctor.e_firma.activa = true
  await updateDoc(doc(db, 'tenants', tenantId, 'doctores', doctorId), {
    'e_firma.activa': true,
    'e_firma.certificado_id': certificadoId,
    'e_firma.fecha_validacion': new Date()
  })
  
  // 5. NUNCA guardar la contraseña
  // El doctor la ingresa de nuevo cada vez que firma una receta
}
```

### 4.3 Restricciones de Acceso (Firestore Rules)

```firestore
// Certificados SAT: Solo el doctor y SuperAdmin
match /certificados_sat/{certificadoId} {
  allow read:   if request.auth.uid == resource.data.doctorId || isSuperAdmin()
  allow create, update, delete: if isSuperAdmin()
}

// Solo Firestore, Firebase Storage tiene sus propias rules
match /certificados_sat/{certificadoId} {
  allow read:   if request.auth.uid == resource.data.doctorId || isSuperAdmin()
}
```

**Firebase Storage Rules:**
```
service firebase.storage {
  match /b/{bucket}/o {
    match /certificados_sat/{rfc}.{ext=.*} {
      // Solo SuperAdmin puede acceder
      allow read, write: if request.auth.customClaims.superAdmin == true
    }
  }
}
```

---

## 5. FLUJO DE FIRMA DIGITAL (SHA-256)

### 5.1 Generar Cadena Digital

```javascript
// EN RECETAS.JSX O CREAR RECETA

const generarCadenaDigital = async (recetaData, archivokeyBase64, contrasena) => {
  // 1. CREAR JSON CANÓNICO DE LA RECETA
  const datosReceta = {
    pacienteId: recetaData.pacienteId,
    doctorId: recetaData.doctorId,
    medicamentos: recetaData.medicamentos,
    diagnostico: recetaData.diagnostico,
    fecha: new Date().toISOString()
  }
  
  // 2. CONVERTIR A STRING JSON (orden consistente)
  const jsonCanonico = JSON.stringify(datosReceta, Object.keys(datosReceta).sort())
  
  // 3. GENERAR SHA-256 DEL JSON
  const hashSHA256 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jsonCanonico))
  const hashHex = Array.from(new Uint8Array(hashSHA256))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  // 4. FIRMAR EL HASH CON LA LLAVE PRIVADA DEL DOCTOR
  // Usar librería como jsrsasign para RSA-2048
  const firmaBin = await firmarConCertificadoSAT(hashHex, archivoKeyBase64, contrasena)
  const firmaBase64 = btoa(firmaBin)
  
  // 5. RETORNAR CADENA DIGITAL
  return {
    hash_sha256: hashHex,
    algoritmo: 'SHA-256',
    timestamp: new Date().toISOString(),
    firma_base64: firmaBase64,
    metodo: 'RSA-2048'
  }
}
```

### 5.2 Validar Cadena Digital (Verificación)

```javascript
// ENDPOINT PÚBLICO: /validar-receta/:id
// La farmacia puede verificar sin credenciales

export const validarRecetaCadenaDigital = async (recetaId) => {
  const receta = await getDoc(doc(db, 'recetas', recetaId))
  const data = receta.data()
  
  if (!data.certificacion.cadena_digital) {
    return { valida: false, razon: 'No es receta certificada' }
  }
  
  const { hash_sha256, firma_base64 } = data.certificacion.cadena_digital
  
  // 1. RECALCULAR SHA-256
  const datosReceta = {
    pacienteId: data.pacienteId,
    doctorId: data.doctorId,
    medicamentos: data.medicamentos,
    diagnostico: data.diagnostico,
    fecha: data.fecha_emision
  }
  
  const jsonCanonico = JSON.stringify(datosReceta, Object.keys(datosReceta).sort())
  const hashNuevo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jsonCanonico))
  
  // 2. COMPARAR HASHES
  const hashCoincide = hashNuevo === hash_sha256
  
  if (!hashCoincide) {
    return { valida: false, razon: 'Documento ha sido modificado (hash no coincide)' }
  }
  
  // 3. VERIFICAR FIRMA CON CERTIFICADO PÚBLICO DEL DOCTOR
  const esValida = await verificarFirmaRSA(hash_sha256, firma_base64, certificadoPublico)
  
  return {
    valida: esValida,
    razon: esValida ? 'Receta auténtica y sin modificar' : 'Firma inválida',
    doctor: data.doctorNombre,
    fecha_emision: data.fecha_emision,
    medicamentos: data.medicamentos.map(m => m.nombre)
  }
}
```

---

## 6. CÓDIGO QR ÚNICO Y VALIDACIÓN PÚBLICA

### 6.1 Generar QR con UUID + JWT

```javascript
const generarQRReceta = async (recetaId, doctorId) => {
  // 1. CREAR UUID ÚNICO
  const uuidReceta = crypto.randomUUID()
  
  // 2. CREAR JWT FIRMADO (válido 30 días)
  const payload = {
    recetaId,
    uuid: uuidReceta,
    doctorId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
  }
  
  const jwtToken = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' })
  
  // 3. CREAR URL DE VALIDACIÓN
  const urlValidacion = `https://koreall-medicos.vercel.app/validar-receta/${uuidReceta}?token=${jwtToken}`
  
  // 4. GENERAR QR CODE
  const qrCode = await QRCode.toDataURL(urlValidacion)
  
  // 5. GUARDAR EN RECETA
  await updateDoc(doc(db, 'recetas', recetaId), {
    'certificacion.qr_code': {
      uuid: uuidReceta,
      jwt: jwtToken,
      url_validacion: urlValidacion,
      vigencia_dias: 30,
      fecha_expira: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  })
  
  return qrCode
}
```

### 6.2 Endpoint Público de Validación

```javascript
// VERCEL: /api/validar-receta/[id].js
// ACCESO PÚBLICO (sin autenticación)

export default async function handler(req, res) {
  const { id } = req.query
  const { token } = req.query
  
  try {
    // 1. DECODIFICAR JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    if (decoded.uuid !== id) {
      return res.status(400).json({ valida: false, razon: 'UUID no coincide' })
    }
    
    // 2. VERIFICAR VIGENCIA
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ valida: false, razon: 'Receta expirada' })
    }
    
    // 3. OBTENER RECETA
    const receta = await getDoc(doc(db, 'recetas', decoded.recetaId))
    
    if (!receta.exists()) {
      return res.status(404).json({ valida: false, razon: 'Receta no encontrada' })
    }
    
    // 4. VERIFICAR CADENA DIGITAL
    const validacionCadena = await validarRecetaCadenaDigital(decoded.recetaId)
    
    // 5. VERIFICAR ESTADO
    const estado = receta.data().estado
    if (estado === 'surtida') {
      return res.status(400).json({ 
        valida: false, 
        razon: 'Receta ya ha sido surtida',
        surtida_en: receta.data().fecha_surtida
      })
    }
    
    // 6. RETORNAR DATOS
    return res.status(200).json({
      valida: validacionCadena.valida,
      razon: validacionCadena.razon,
      doctor: receta.data().doctorNombre,
      especialidad: receta.data().doctorEspecialidad,
      medicamentos: receta.data().medicamentos,
      diagnostico: receta.data().diagnostico,
      fecha_emision: receta.data().fecha_emision,
      vigencia_hasta: decoded.exp * 1000
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
```

---

## 7. RESTRICCIONES PARA MEDICAMENTOS CONTROLADOS

### 7.1 Lista de Medicamentos Controlados (Mounjaro, Wegovy)

```javascript
// EN src/data/medicamentosControlados.js

export const MEDICAMENTOS_CONTROLADOS = [
  {
    nombre: 'Mounjaro',
    principioActivo: 'Tirzepatida',
    categoria: 'Diabetes tipo 2 / Obesidad',
    requiere_advertencia: true,
    tipo_advertencia: 'warning'
  },
  {
    nombre: 'Wegovy',
    principioActivo: 'Semaglutida',
    categoria: 'Obesidad',
    requiere_advertencia: true,
    tipo_advertencia: 'warning'
  }
  // ... más medicamentos si es necesario
]

export const esControlado = (nombreMedicamento) => {
  return MEDICAMENTOS_CONTROLADOS.some(m => m.nombre.toLowerCase() === nombreMedicamento.toLowerCase())
}
```

### 7.2 UI: Advertencia Visual en Recetas.jsx

```jsx
const AgregarMedicamento = ({ medicamento, onAdd }) => {
  const esControla = esControlado(medicamento.nombre)
  
  const agregarMedicamento = () => {
    if (esControlado) {
      // Mostrar modal de advertencia
      showAlert({
        titulo: '⚠️ MEDICAMENTO CONTROLADO',
        mensaje: `${medicamento.nombre} es un medicamento controlado. Asegúrate de haber validado que el paciente:
          1. Tiene diagnóstico de diabetes tipo 2 o criterios de obesidad
          2. Ha sido evaluado clínicamente
          3. Está bajo supervisión médica continua`,
        tipo: 'warning',
        botones: [
          { texto: 'Entiendo los riesgos, continuar', onClick: () => onAdd({ ...medicamento, es_controlado: true, advertencia_mostrada: true }) },
          { texto: 'Cancelar', onClick: () => {} }
        ]
      })
    } else {
      onAdd(medicamento)
    }
  }
  
  return (
    <div>
      <input value={medicamento.nombre} />
      {esControlado && <span className="badge-warning">⚠️ CONTROLADO</span>}
      <button onClick={agregarMedicamento}>Agregar</button>
    </div>
  )
}
```

---

## 8. FLUJO COMPLETO: DOCTORSÍN E-FIRMA vs CON E-FIRMA

### 8.1 Doctor SIN e-firma (Receta Ordinaria)

```
Doctor escribe receta
    ↓
Verifica doctor.e_firma.activa = false
    ↓
Muestra toggle: "Esta receta será ORDINARIA (no digital)"
    ↓
Doctor confirma y GUARDA
    ↓
Receta se crea con:
  - certificacion.mode = "ORDINARIA"
  - certificacion.leyenda_ordinaria = "Esta es una receta ordinaria. No es documento electrónico certificado."
  - NO incluye cadena digital ni QR
    ↓
NO aparece en Portal Paciente (visible solo en doctor)
    ↓
Portal muestra: "No hay recetas certificadas digitales"
```

### 8.2 Doctor CON e-firma válida (Receta Certificada)

```
Doctor escribe receta
    ↓
Verifica doctor.e_firma.activa = true
    ↓
Sistema pregunta: "¿Deseas firmar esta receta digitalmente?"
    ↓
Doctor ingresa CONTRASEÑA de su certificado SAT
    ↓
Sistema:
  1. Obtiene archivos .key/.cer de Firebase Storage
  2. Genera cadena digital (SHA-256 + RSA-2048)
  3. Genera UUID único
  4. Crea JWT vigencia 30 días
  5. Genera código QR
    ↓
Receta se crea con:
  - certificacion.mode = "CERTIFICADA"
  - certificacion.cadena_digital = { hash_sha256, firma_base64, timestamp }
  - certificacion.qr_code = { uuid, jwt, url_validacion }
    ↓
✅ Aparece en Portal Paciente
    ↓
Portal muestra:
  - Medicamentos
  - Diagnóstico
  - QR para farmacia
  - Badge verde: "Receta certificada digitalmente"
```

---

## 9. INTEGRACIÓN CON PORTAL PACIENTE

### 9.1 PortalPaciente.jsx — Mostrar Histórico de Consultas

```jsx
export default function PortalPaciente() {
  const [consultas, setConsultas] = useState([])
  const [recetas, setRecetas] = useState([])
  const pacienteId = usePaciente().id
  const tenantId = useTenant().tenantId
  
  useEffect(() => {
    // 1. CONSULTAS COMPLETADAS
    const unsubConsultas = onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/consultas`),
        where('pacienteId', '==', pacienteId),
        orderBy('fecha', 'desc')
      ),
      (snap) => {
        const consultas = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setConsultas(consultas)
      }
    )
    
    // 2. RECETAS DIGITALMENTE CERTIFICADAS
    const unsubRecetas = onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/recetas`),
        where('pacienteId', '==', pacienteId),
        where('certificacion.mode', '==', 'CERTIFICADA'),
        orderBy('fecha_emision', 'desc')
      ),
      (snap) => {
        const recetas = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setRecetas(recetas)
      }
    )
    
    return () => {
      unsubConsultas()
      unsubRecetas()
    }
  }, [pacienteId, tenantId])
  
  return (
    <div className="portal-paciente">
      {/* TAB 1: CONSULTAS REALIZADAS */}
      <Tab titulo="Mis Consultas">
        {consultas.length === 0 ? (
          <p>No hay consultas registradas</p>
        ) : (
          consultas.map(consulta => (
            <div key={consulta.id} className="consulta-card">
              <h4>{new Date(consulta.fecha).toLocaleDateString('es-MX')}</h4>
              <p><strong>Motivo:</strong> {consulta.motivoConsulta}</p>
              <p><strong>Diagnóstico:</strong> {consulta.diagnostico}</p>
              <p><strong>Médico:</strong> {consulta.doctorNombre} ({consulta.doctorEspecialidad})</p>
              
              {/* SIGNOS VITALES */}
              <div className="vitales">
                <small>Peso: {consulta.peso}kg | FC: {consulta.fc} | TA: {consulta.ta}</small>
              </div>
              
              {/* EXPLORACIÓN FÍSICA */}
              {consulta.exploracionFisica && (
                <p><em>{consulta.exploracionFisica}</em></p>
              )}
              
              {/* TRATAMIENTO */}
              {consulta.tratamiento && (
                <p><strong>Tratamiento:</strong> {consulta.tratamiento}</p>
              )}
            </div>
          ))
        )}
      </Tab>
      
      {/* TAB 2: RECETAS DIGITALES CERTIFICADAS */}
      <Tab titulo="Mis Recetas Digitales">
        {recetas.length === 0 ? (
          <p>No hay recetas digitalmente certificadas</p>
        ) : (
          recetas.map(receta => (
            <div key={receta.id} className="receta-card certified">
              <h4>✅ Receta Certificada - {new Date(receta.fecha_emision).toLocaleDateString('es-MX')}</h4>
              <p><strong>Médico:</strong> Dr. {receta.doctorNombre}</p>
              <p><strong>Diagnóstico:</strong> {receta.diagnostico}</p>
              
              {/* MEDICAMENTOS */}
              <div className="medicamentos">
                <strong>Medicamentos:</strong>
                <ul>
                  {receta.medicamentos.map((med, idx) => (
                    <li key={idx}>
                      {med.es_controlado && <span className="badge-warning">⚠️</span>}
                      {med.nombre} - {med.dosis}, {med.frecuencia}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* QR VERIFICABLE */}
              <div className="qr-section">
                <p><small>Muestra este código QR en la farmacia para verificación:</small></p>
                <img src={generarQR(receta.certificacion.qr_code.url_validacion)} alt="QR" />
                <p><small>Válida hasta: {new Date(receta.certificacion.qr_code.fecha_expira).toLocaleDateString()}</small></p>
              </div>
              
              {/* BOTÓN DESCARGAR PDF */}
              <button onClick={() => descargarPDFReceta(receta)}>
                📄 Descargar PDF
              </button>
            </div>
          ))
        )}
      </Tab>
    </div>
  )
}
```

---

## 10. PANEL DE ADMIN — VALIDAR E-FIRMA DE DOCTORES

### 10.1 Gestión de Certificados en Admin.jsx

```jsx
const GestionCertificadosSAT = () => {
  const [doctores, setDoctores] = useState([])
  const [certificadoFile, setCertificadoFile] = useState(null)
  const [selectedDoctor, setSelectedDoctor] = useState(null)
  
  const cargarCertificado = async (doctorId, fileKey, fileCer, contrasena) => {
    try {
      // 1. VALIDAR ARCHIVOS
      const esValido = await validarCertificadoSAT(fileKey, fileCer, contrasena)
      if (!esValido) {
        throw new Error('Certificado inválido o contraseña incorrecta')
      }
      
      // 2. SUBIR A FIREBASE STORAGE
      const doctor = doctores.find(d => d.id === doctorId)
      const rfc = doctor.rfc || doctor.cedula
      
      const refKey = ref(storage, `certificados_sat/${rfc}.key`)
      const refCer = ref(storage, `certificados_sat/${rfc}.cer`)
      
      await uploadBytes(refKey, fileKey)
      await uploadBytes(refCer, fileCer)
      
      // 3. GUARDAR METADATA EN FIRESTORE
      const certificadoId = `${rfc}_${new Date().getTime()}`
      await setDoc(
        doc(db, `tenants/${tenantId}/certificados_sat/${certificadoId}`),
        {
          doctorId,
          rfc,
          storage_path_key: `certificados_sat/${rfc}.key`,
          storage_path_cer: `certificados_sat/${rfc}.cer`,
          fecha_carga: new Date(),
          estado: 'activo',
          validado: true,
          validado_por: currentUser.email
        }
      )
      
      // 4. ACTUALIZAR ESTADO DEL DOCTOR
      await updateDoc(
        doc(db, `tenants/${tenantId}/doctores/${doctorId}`),
        {
          'e_firma.activa': true,
          'e_firma.certificado_id': certificadoId,
          'e_firma.fecha_validacion': new Date()
        }
      )
      
      showAlert({
        titulo: '✅ Certificado Cargado',
        mensaje: `E-firma de ${doctor.nombre} validada correctamente`
      })
      
    } catch (err) {
      showAlert({
        titulo: '❌ Error',
        mensaje: err.message,
        tipo: 'error'
      })
    }
  }
  
  return (
    <div className="admin-certificados">
      <h2>Gestión de Certificados SAT</h2>
      
      <div className="tabla-doctores">
        <table>
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Estado E-firma</th>
              <th>Fecha Validación</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {doctores.map(doctor => (
              <tr key={doctor.id}>
                <td>{doctor.nombre}</td>
                <td>
                  {doctor.e_firma?.activa ? (
                    <span className="badge-success">✅ Activa</span>
                  ) : (
                    <span className="badge-warning">⏳ Pendiente</span>
                  )}
                </td>
                <td>{doctor.e_firma?.fecha_validacion?.toLocaleDateString()}</td>
                <td>
                  {!doctor.e_firma?.activa && (
                    <button onClick={() => setSelectedDoctor(doctor.id)}>
                      Cargar Certificado
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {selectedDoctor && (
        <div className="formulario-certificado">
          <h3>Cargar Certificado SAT</h3>
          <input type="file" accept=".key" onChange={(e) => setCertificadoFile({...certificadoFile, key: e.target.files[0]})} />
          <input type="file" accept=".cer" onChange={(e) => setCertificadoFile({...certificadoFile, cer: e.target.files[0]})} />
          <input type="password" placeholder="Contraseña del certificado" onChange={(e) => setCertificadoFile({...certificadoFile, contrasena: e.target.value})} />
          <button onClick={() => cargarCertificado(selectedDoctor, certificadoFile.key, certificadoFile.cer, certificadoFile.contrasena)}>
            Validar y Cargar
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## 11. CHECKLIST DE IMPLEMENTACIÓN

- [ ] **1. Base de Datos:**
  - [ ] Agregar campo `e_firma` a `doctores`
  - [ ] Agregar campo `certificacion` a `recetas`
  - [ ] Crear colección `certificados_sat`

- [ ] **2. Almacenamiento Seguro:**
  - [ ] Configurar Firebase Storage con encriptación
  - [ ] Implementar Firestore Rules para certificados

- [ ] **3. Firma Digital:**
  - [ ] Implementar SHA-256 + RSA-2048
  - [ ] Generar cadena digital en recetas
  - [ ] Crear validación de firma

- [ ] **4. QR y Validación:**
  - [ ] Generar UUID único por receta
  - [ ] Crear JWT con vigencia 30 días
  - [ ] Crear endpoint `/validar-receta/{id}` público
  - [ ] Generar QR code

- [ ] **5. Restricciones Medicamentos:**
  - [ ] Crear lista de medicamentos controlados
  - [ ] Implementar alertas visuales
  - [ ] Auditar que doctor vio advertencia

- [ ] **6. Portal Paciente:**
  - [ ] Mostrar histórico consultas con vitales
  - [ ] Mostrar recetas certificadas SOLO
  - [ ] Mostrar QR validable

- [ ] **7. Admin Panel:**
  - [ ] Interfaz carga de certificados
  - [ ] Validar e-firma de doctores
  - [ ] Auditoría de accesos

- [ ] **8. Testing + Auditoría:**
  - [ ] Test firma digital (receta modificada debe fallar validación)
  - [ ] Test expiración QR
  - [ ] Test medicamentos controlados
  - [ ] Revisión COFEPRIS-ready

---

## 12. REFERENCIAS LEGALES

- **NOM-151-SCFI-2016:** Preservación de datos mensajes digitales
- **NOM-024-SSA3-2010:** Sistemas información registro electrónico salud
- **Reforma DOF 15/01/2026:** Digitalización atención médica México
- **Prescrypto:** Plataforma referencia, usa blockchain RexChain (opcional para Novaryk)

---

## 13. SIGUIENTE PASOS

1. **Semana 1-2:** Implementar BD + almacenamiento seguro certificados
2. **Semana 2-3:** Firma digital SHA-256 + QR + JWT
3. **Semana 3-4:** Portal Paciente + histórico consultas
4. **Semana 4:** Admin panel + gestión certificados
5. **Semana 5:** Testing + auditoría COFEPRIS

**Fecha Meta:** Fin de Junio 2026

---

**Documentado por:** Arquitecto de Software & Auditor COFEPRIS  
**Revisión Legal:** Pendiente aprobación  
**Estado:** Pre-implementación
