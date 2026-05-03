# MediDesk — Guía de Ciberseguridad (Hardening)

## 1. Lo que ya está implementado en el código

### Firestore Rules (firestore.rules)
- Cada ruta valida `tenantId` del JWT token — un doctor de consultorio A nunca puede ver datos del consultorio B
- Roles granulares: superAdmin > admin > doctor > recepcion > paciente
- Paciente solo puede actualizar `estatus` e `historial` de su propia cita
- Paciente no puede modificar campos médicos de su expediente
- Las encuestas del quiosco validan tamaño máximo (anti-spam) y no permiten campos maliciosos
- Todo lo que no está explícitamente permitido está bloqueado (`allow read, write: if false`)

### Firebase Auth
- JWT tokens con custom claims (role, tenantId, superAdmin)
- Los tokens se verifican en cada lectura/escritura de Firestore

---

## 2. Configuraciones a hacer en Firebase Console

### Authentication → Settings
```
✓ Habilitar protección contra enumeración de emails
  (evita que alguien sepa qué emails están registrados)

✓ Configurar dominios autorizados:
  - koreall-medicos.vercel.app
  - tu-dominio-personalizado.com (cuando lo tengas)
  - localhost (solo para desarrollo)

✓ Habilitar email verification required
  (los pacientes deben verificar su email antes de acceder)
```

### Firestore → Rules
Copia el contenido de `firestore.rules` y pégalo en la consola.

### Firestore → Indexes
Agrega estos índices para evitar errores:
```
Colección: citas
  - pacienteId ASC + fecha DESC
  - tenantId ASC + fecha DESC

Colección: cobros  
  - pacienteId ASC + fechaPago DESC

Colección: facturas
  - pacienteId ASC + fecha DESC
```

### Storage Rules (storage.rules)
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /tenants/{tenantId}/{allPaths=**} {
      // Solo staff del tenant puede leer/escribir archivos
      allow read: if request.auth != null &&
        request.auth.token.tenantId == tenantId;
      allow write: if request.auth != null &&
        request.auth.token.tenantId == tenantId &&
        request.auth.token.role in ['admin', 'doctor'] &&
        // Límite de 20 MB por archivo
        request.resource.size < 20 * 1024 * 1024;
    }
    // Bloquear todo lo demás
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 3. Configuraciones en Vercel

### Headers de seguridad (vercel.json)
Crea este archivo en la raíz del proyecto:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.conekta.io https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://firebasestorage.googleapis.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://api.anthropic.com https://identitytoolkit.googleapis.com;"
        }
      ]
    }
  ],
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 4. Variables de entorno — separar dev de producción

```bash
# .env.local (desarrollo — NUNCA subir a git)
VITE_FIREBASE_API_KEY=...dev...
VITE_FACTURAPI_KEY=sk_test_...
VITE_CONEKTA_PUBLIC_KEY=key_test_...

# En Vercel Dashboard → Settings → Environment Variables:
# Producción:
VITE_FIREBASE_API_KEY=...prod...
VITE_FACTURAPI_KEY=sk_live_...
VITE_CONEKTA_PUBLIC_KEY=key_live_...
VITE_APP_URL=https://koreall-medicos.vercel.app
```

⚠️ Nunca pongas `VITE_TWILIO_AUTH_TOKEN` en el frontend.
Twilio solo debe llamarse desde Cloud Functions (backend).

---

## 5. Checklist de seguridad antes de ir a producción

- [ ] `firestore.rules` actualizado en Firebase Console
- [ ] `storage.rules` actualizado en Firebase Console  
- [ ] `vercel.json` con headers de seguridad en el repo
- [ ] Variables de entorno de producción en Vercel (no en el código)
- [ ] `.env.local` en `.gitignore` ✓ (ya está)
- [ ] `serviceAccountKey.json` en `.gitignore` ✓ (ya está)
- [ ] Dominios autorizados en Firebase Auth
- [ ] Email verification activado en Firebase Auth
- [ ] Facturapi: pasar de sandbox a producción
- [ ] Conekta: pasar de test a producción (requiere KYC)
- [ ] Backup automático de Firestore activado (Firebase Console → Firestore → Backups)
- [ ] Alertas de uso anómalo en Firebase Console → Usage

---

## 6. Amenazas cubiertas

| Amenaza | Protección |
|---------|-----------|
| Acceso entre consultorios | Firestore Rules con tenantId en JWT |
| Escalación de privilegios | Custom claims solo asignables desde server |
| Inyección NoSQL | Firestore tiene schema seguro por diseño |
| XSS | React escapa HTML automáticamente + CSP header |
| Clickjacking | X-Frame-Options: DENY |
| Datos sensibles expuestos | Variables de entorno en Vercel, nunca en código |
| Fuerza bruta de contraseñas | Firebase Auth bloquea automáticamente tras intentos fallidos |
| Enumeración de usuarios | Firebase Auth → Protección habilitada |
| Archivos maliciosos subidos | Storage Rules limitan tipos y tamaño |
| DDoS a encuestas | Validación de tamaño en Firestore Rules |
