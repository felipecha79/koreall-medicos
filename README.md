# MediDesk — KoreAll Medicos

Sistema de gestión para consultorios médicos. Multi-tenant, React + Firebase.

---

## Arranque rápido (Oscar — leer primero)

### Paso 1 — Instalar dependencias

```bash
npm install
```

### Paso 2 — Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com) → Proyecto **KoreAllMedicos**
2. Configuración del proyecto (ícono ⚙️) → Tu app web → SDK setup
3. Copia el objeto `firebaseConfig`
4. Crea el archivo `.env.local` en la raíz (copia `.env.local.example` y renómbralo)
5. Pega los valores reales en `.env.local`

```
VITE_FIREBASE_API_KEY=tu_valor_real
VITE_FIREBASE_AUTH_DOMAIN=koreallmedicos.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=koreallmedicos
...
```

> ⚠️ `.env.local` NO se sube a GitHub — ya está en `.gitignore`

### Paso 3 — Publicar reglas de Firestore

Ve a Firebase Console → Firestore → Rules → pega el contenido de `firestore.rules` → Publish

### Paso 4 — Levantar la app

```bash
npm run dev
```

Abrir http://localhost:5173

---

## Crear el primer usuario superAdmin

Necesitas el archivo `serviceAccountKey.json` de Firebase:
Firebase Console → Configuración → Cuentas de servicio → Generar nueva clave privada

```bash
node scripts/set-admin.js tu@email.com
```

Después de correrlo, cierra sesión y vuelve a entrar para que los claims se apliquen.

---

## Estructura del proyecto

```
src/
├── firebase.js          ← Conexión a Firebase (usa .env.local)
├── App.jsx              ← Router + Layout + rutas protegidas
├── main.jsx             ← Punto de entrada
├── hooks/
│   └── useTenant.js     ← Hook central: user, tenantId, role, tenant
└── pages/
    ├── Login.jsx        ← Pantalla de acceso
    ├── Agenda.jsx        ← Calendario semanal de citas ✓
    ├── Pacientes.jsx     ← Lista y registro de pacientes ✓
    ├── Expediente.jsx    ← Historial clínico por paciente ✓
    ├── Cobros.jsx        ← Registro de pagos y métricas ✓
    └── Admin.jsx         ← Panel superAdmin (Juan) ✓
```

---

## Firestore — estructura de colecciones

```
tenants/{tenantId}                  ← Datos del consultorio
tenants/{tenantId}/pacientes/       ← Pacientes del consultorio
tenants/{tenantId}/citas/           ← Citas agendadas
tenants/{tenantId}/cobros/          ← Cobros y pagos
tenants/{tenantId}/consultas/       ← Expediente / notas clínicas
```

Cada usuario tiene `tenantId` y `role` en su JWT. Firestore valida ambos antes de permitir lectura/escritura.

---

## Próximos módulos (Semana 7+)

- [ ] `src/services/facturapi.js` — integración CFDI con Facturapi
- [ ] `src/pages/CFDI.jsx` — emisión de facturas desde cobros
- [ ] N8N workflow — recordatorios WhatsApp automáticos
- [ ] `src/pages/Reportes.jsx` — ingresos y métricas

---

## Comandos útiles

```bash
npm run dev          # Desarrollo local
npm run build        # Build para producción
firebase deploy      # Deploy a Firebase Hosting (si se configura)
```
