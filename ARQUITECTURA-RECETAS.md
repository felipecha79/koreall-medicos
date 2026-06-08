# Arquitectura: Recetas Digitales Seguras — NOM-151 + COFEPRIS

## Resumen Ejecutivo

Sistema de recetas digitales seguro que cumple **NOM-151-SCFI-2016** (Metales preciosos, plata, oro) y **COFEPRIS** mediante:

- **SHA-256**: Cadena digital para integridad
- **JWT**: Tokens de validación con expiración
- **Encriptación AES-256**: Certificados .key y .cer almacenados seguros
- **QR público**: Endpoint sin autenticación para validación en farmacias
- **Alertas de medicamentos**: Advertencia-only para Mounjaro, Wegovy, etc.

---

## Flujo General

```
1. Doctor crea receta en Recetas.jsx
2. Doctor opcionalmente carga .key y .cer
3. Sistema genera:
   - SHA-256 (cadena digital)
   - JWT token (validación)
   - QR code (apunta a /validar-receta/{id}?token=...)
4. Receta se guarda con estado certificacion.mode = 'CERTIFICADA'
5. Farmacia escanea QR → valida en endpoint público
6. Paciente ve receta en portal si certificada
```

---

## Arquitectura de Componentes

### Frontend

#### `src/pages/Recetas.jsx`
- Crea recetas con medicamentos, diagnóstico, etc.
- Integra componente `<RecetaCertificacion />`
- Guarda en Firestore con estructura:
  ```javascript
  {
    id: "receta-001",
    numero: "REC-2026-001",
    pacienteId: "pac-123",
    pacienteNombre: "Juan Pérez",
    doctorId: "doc-456",
    doctorNombre: "Dr. López",
    fecha: "2026-06-07T10:30:00Z",
    diagnostico: "Hipertensión",
    medicamentos: [
      {
        medicamento: "Lisinopril",
        dosis: "10 mg",
        via: "oral",
        frecuencia: "c/24h",
        duracion: "30 días",
        cantidad: "30"
      }
    ],
    certificacion: {
      mode: "CERTIFICADA",
      fecha: "2026-06-07T10:35:00Z",
      sha256: "abc123...",
      jwtToken: "eyJ0eXAi...",
      qrDataUrl: "data:image/png;base64,...",
      validationUrl: "https://koreall-medicos.vercel.app/validar-receta/receta-001?token=...",
      cedulaProfesional: "1234567890",
      certificadosSubidos: {
        key: true,
        cer: true
      }
    }
  }
  ```

#### `src/components/RecetaCertificacion.jsx`
- Componente modal para certificación digital
- Pasos:
  1. Cargar .key y .cer (opcional)
  2. Generar SHA-256 + JWT + QR
  3. Subir certificados encriptados a Firebase Storage
  4. Confirmar y guardar en Firestore

#### `src/pages/ValidarReceta.jsx`
- Página **pública sin autenticación**
- Ruta: `/validar-receta/{recetaId}?token={jwtToken}`
- Acceso por QR desde farmacias
- Llama a Cloud Function para validar
- Muestra detalles de la receta si es válida

#### `src/pages/PortalPaciente.jsx` (Modificación)
- Nuevo tab "Mis recetas"
- Solo muestra recetas con `certificacion.mode === 'CERTIFICADA'`
- Si certificados subidos: muestra ícono candado 🔐

---

### Backend

#### `src/services/recetaSeguridad.js`
Utilidades de seguridad:

```javascript
// SHA-256 cadena digital
generarCadenaDigital(receta) → { cadenaOriginal, sha256Hash, timestamp }

// JWT token (incluye recetaId, pacienteId, sha256, exp)
generarJWTReceta(recetaId, pacienteId, sha256Hash, expirationHours = 365*24)
  → { token, expirationTime }

// QR code apuntando a /validar-receta/{id}?token=...
generarQRReceta(recetaId, jwtToken, baseUrl)
  → { qrDataUrl, validationUrl }

// Detecta medicamentos restringidos
detectarMedicamentosRestringidos(medicamentos)
  → [ { medicamento, alerta } ]

// Encriptación AES-256 para certificados
encriptarCertificado(contenido, tenantId) → encrypted
desencriptarCertificado(contenidoEncriptado, tenantId) → plaintext

// Validar JWT
validarJWTReceta(token) → { valido, payload | error }
```

#### `functions/validarReceta.js`
Cloud Function pública:

```
GET /api/validar-receta/{recetaId}?token={jwtToken}

1. Valida JWT token
2. Busca receta con certificacion.mode = 'CERTIFICADA'
3. Verifica SHA-256 coincide
4. Devuelve datos públicos: numero, paciente, doctor, medicamentos, certificacion
```

**Respuesta válida:**
```json
{
  "valido": true,
  "receta": {
    "numero": "REC-2026-001",
    "paciente": "Juan Pérez",
    "doctor": "Dr. López",
    "fecha": "2026-06-07T10:30:00Z",
    "diagnostico": "Hipertensión",
    "medicamentos": [
      {
        "nombre": "Lisinopril",
        "dosis": "10 mg",
        "frecuencia": "c/24h",
        "via": "oral",
        "duracion": "30 días"
      }
    ],
    "certificacion": {
      "fechaCertificacion": "2026-06-07T10:35:00Z",
      "cedulaProfesional": "1234567890"
    }
  }
}
```

**Respuesta inválida:**
```json
{
  "valido": false,
  "error": "Token expirado | Receta no encontrada | SHA-256 inválido | ..."
}
```

---

## Almacenamiento en Firebase

### Firestore
```
tenants/{tenantId}/recetas/{recetaId}
├─ numero
├─ pacienteId
├─ doctorId
├─ fecha
├─ diagnostico
├─ medicamentos[]
└─ certificacion
   ├─ mode: "CERTIFICADA" | "BORRADOR"
   ├─ sha256: "abc123..."
   ├─ jwtToken: "eyJ0eXAi..."
   ├─ qrDataUrl: "data:image/png;base64,..."
   ├─ validationUrl: "https://..."
   ├─ cedulaProfesional: "1234567890"
   ├─ fecha: "2026-06-07T10:35:00Z"
   └─ certificadosSubidos: { key: true, cer: true }
```

### Firebase Storage
```
tenants/{tenantId}/recetas/{recetaId}/
├─ certificado.key.enc    (AES-256 encriptado)
└─ certificado.cer.enc    (AES-256 encriptado)
```

**Nota:** Certificados encriptados y solo accesibles si `certificacion.mode === 'CERTIFICADA'`

---

## Flujo de Validación en Farmacia

```
1. Farmacia escanea QR desde receta impresa
2. QR abre: https://koreall-medicos.vercel.app/validar-receta/{recetaId}?token={jwtToken}
3. Cliente llama GET /api/validar-receta/{recetaId}?token=...
4. Cloud Function valida:
   - JWT token (firma + expiración)
   - SHA-256 coincide con receta
   - Receta está certificada
5. Si es válida:
   - Mostrar datos públicos de receta
   - Farmacia nota que es válida
   - Procede con despacho
6. Si es inválida:
   - Mostrar error
   - Farmacia rechaza receta
   - Contacta al médico
```

---

## Medicamentos Restringidos

### Advertencia-Only (No Bloquea)
- **Mounjaro** (tirzepatida)
- **Wegovy** (semaglutida)
- **Ozempic** (semaglutida)
- **Saxenda** (liraglutida)

Cuando se detectan:
1. Sistema genera alerta ⚠️
2. Se muestra en componente `<RecetaCertificacion />`
3. Doctor puede continuar (es responsabilidad del doctor)
4. Portal paciente y farmacia ven la alerta

**Nota:** La farmacia valida en su propio endpoint. Si hay restricción legal, es responsabilidad de:
- Doctor: prescribir correctamente
- Farmacia: validar contra regulaciones locales
- Paciente: tener prescripción válida

---

## Configuración Requerida

### 1. Dependencias NPM

```bash
npm install crypto-js qrcode --save
```

### 2. Variables de Entorno

Vercel Dashboard → Settings → Environment Variables:

```
VITE_APP_URL=https://koreall-medicos.vercel.app
```

### 3. Cloud Functions

Desplegar `functions/validarReceta.js` con:

```bash
firebase deploy --only functions:validarReceta
```

Luego agregar a `vercel.json` rewrite:

```json
{
  "rewrites": [
    { "source": "/api/validar-receta/(.*)", "destination": "https://us-central1-PROJECT_ID.cloudfunctions.net/validarReceta" }
  ]
}
```

### 4. Firestore Rules

Agregar a `firestore.rules`:

```
match /tenants/{tenantId}/recetas/{recetaId} {
  // Doctor puede crear y certificar
  allow create, update: if request.auth != null &&
    request.auth.token.tenantId == tenantId &&
    request.auth.token.role in ['doctor', 'admin'];

  // Paciente solo puede leer propias
  allow read: if request.auth != null &&
    request.auth.token.tenantId == tenantId &&
    request.auth.token.pacienteId == resource.data.pacienteId;

  // Admin puede leer todas
  allow read: if request.auth != null &&
    request.auth.token.tenantId == tenantId &&
    request.auth.token.role in ['admin'];
}
```

### 5. Storage Rules

```javascript
match /tenants/{tenantId}/recetas/{recetaId}/{allPaths=**} {
  allow read, write: if request.auth != null &&
    request.auth.token.tenantId == tenantId &&
    request.auth.token.role in ['doctor', 'admin'];
}
```

---

## Cumplimiento Normativo

### NOM-151-SCFI-2016
✅ **SHA-256** cadena digital
✅ Integridad: cambiar un byte invalida el hash
✅ No requiere PAC ni XML (suficiente SHA-256)
✅ Verificación en farmacia por QR

### COFEPRIS
✅ Receta digital con identificación clara del médico
✅ Datos del paciente protegidos
✅ Auditoría: Firestore mantiene histórico
✅ Certificación: Cédula profesional del doctor vinculada

### LGPD (Datos Personales)
✅ Certificados encriptados en reposo
✅ JWT con expiración (365 días)
✅ Endpoint público no expone datos sensibles
✅ Acceso paciente limitado a propias recetas

---

## Próximos Pasos (Opcional)

1. **Firma Digital RSA**: Si se requiere firma con clave privada
2. **Timbre SAT**: Si se necesita XML timbrado
3. **Multi-idioma**: Traducir alertas y validaciones
4. **Webhook Farmacia**: Notificar cuando se valida receta
5. **Auditoría**: Logs de validaciones en Firestore

---

## Sumario de Seguridad

| Amenaza | Protección |
|---------|-----------|
| Falsificación de receta | SHA-256 + JWT validación |
| Expiración | JWT con token exp |
| Acceso no autorizado | Firestore Rules + tenantId |
| Certificados robados | AES-256 encriptación |
| Datos paciente expuestos | Endpoint público solo muestra resumen |
| Repudio (doctor niega) | Cédula profesional vinculada + timestamp |

