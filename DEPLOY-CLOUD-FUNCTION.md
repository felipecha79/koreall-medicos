# Desplegar Cloud Function: validarReceta

Guía paso a paso para desplegar la Cloud Function de validación de recetas.

---

## Paso 1: Obtener PROJECT_ID de Firebase

1. Ve a **Firebase Console**: https://console.firebase.google.com
2. Selecciona tu proyecto **koreall-medicos**
3. Click en **⚙️ Project Settings** (esquina superior derecha)
4. En la pestaña **General**, busca **Project ID**
5. Copia el ID (ej: `koreall-medicos-12345`)

---

## Paso 2: Actualizar vercel.json con PROJECT_ID

Ya hice el cambio, pero necesitas reemplazar `PROJECT_ID` por tu ID real.

**Archivo:** `vercel.json`

Busca esta línea:
```json
"destination": "https://us-central1-PROJECT_ID.cloudfunctions.net/validarReceta"
```

Reemplaza `PROJECT_ID` por tu ID. Ejemplo:
```json
"destination": "https://us-central1-koreall-medicos-12345.cloudfunctions.net/validarReceta"
```

**Guardar y hacer commit:**
```bash
git add vercel.json
git commit -m "Config: Cloud Function endpoint en vercel.json"
git push
```

---

## Paso 3: Preparar Cloud Function

La función está en `functions/validarReceta.js`. Asegúrate de que:

1. **Existe el archivo:** `functions/validarReceta.js` ✓
2. **Existe firebase.json con config de funciones**

Si NO existe `firebase.json`, créalo:

```bash
firebase init functions
```

Selecciona:
- Language: **JavaScript**
- Eslint: **N** (no)
- Install dependencies: **Y** (yes)

---

## Paso 4: Desplegar Cloud Function

### Opción A: Desde Terminal (Recomendado)

```bash
# 1. Asegúrate de tener Firebase CLI
npm install -g firebase-tools

# 2. Login en Firebase
firebase login

# 3. Selecciona proyecto
firebase use koreall-medicos

# 4. Desplegar solo la función validarReceta
firebase deploy --only functions:validarReceta
```

**Output esperado:**
```
functions[us-central1-validarReceta]: http trigger (validarReceta)
✓  Function URL: https://us-central1-PROJECT_ID.cloudfunctions.net/validarReceta
```

### Opción B: Desde Firebase Console (Alternativa)

1. Firebase Console → Tu proyecto
2. Build → **Functions** (menú izquierdo)
3. Click **"Create Function"**
4. Nombre: `validarReceta`
5. Runtime: **Node.js 20**
6. Trigger: **HTTPS**
7. Pegar código de `functions/validarReceta.js`
8. Deploy

---

## Paso 5: Verificar Despliegue

```bash
# Ver funciones desplegadas
firebase functions:list

# Ver logs en tiempo real
firebase functions:log
```

Deberías ver:
```
✓ validarReceta (http)
  Region: us-central1
  Trigger: https://us-central1-PROJECT_ID.cloudfunctions.net/validarReceta
```

---

## Paso 6: Test de la Función (Opcional)

Prueba el endpoint manualmente:

```bash
curl "https://us-central1-PROJECT_ID.cloudfunctions.net/validarReceta?recetaId=test&token=eyJ0eXAi..."
```

**Respuesta esperada** (sin token válido):
```json
{
  "valido": false,
  "error": "Token inválido"
}
```

---

## Paso 7: Verificar CSP Header en vercel.json

La Cloud Function necesita estar en el CSP `connect-src`. Verifica que tu `vercel.json` tenga:

```json
"connect-src": "'self' https://*.googleapis.com https://*.firebaseio.com https://us-central1-PROJECT_ID.cloudfunctions.net"
```

**Nota:** Vercel hace el rewrite, así que desde el navegador la URL es `/api/validar-receta/...` pero internamente se enruta a la Cloud Function.

---

## Troubleshooting

### Error: "Function not found"
- Verifica que `firebase deploy --only functions:validarReceta` se ejecutó sin errores
- Espera 2-3 minutos, las funciones pueden tardar en propagarse

### Error: "CORS blocked"
- La función tiene `res.set('Access-Control-Allow-Origin', '*')`
- Si falla, verifica que el header esté en `validarReceta.js` línea 11

### Error: "PROJECT_ID not found in vercel.json"
- Reemplaza `PROJECT_ID` con tu ID real de Firebase
- No uses `{PROJECT_ID}`, escribe el valor directo

### Error: "collectGroup not supported"
- Firebase debe tener Firestore configurado
- La función busca en `collectionGroup('recetas')`
- Asegúrate que las recetas estén en `tenants/{tenantId}/recetas/{recetaId}`

---

## Confirmación Final

Después del deploy:

✅ vercel.json actualizado con PROJECT_ID real  
✅ Cloud Function desplegada (`firebase deploy --only functions:validarReceta`)  
✅ URL de la función visible en Firebase Console  
✅ Commit hecho a GitHub  

Luego:
```bash
git push
```

Vercel automáticamente redesplegará con la nueva config.

---

## URLs Finales

**URL de validación (pública):**
```
https://koreall-medicos.vercel.app/validar-receta/{recetaId}?token={jwtToken}
```

**Cloud Function (detrás del rewrite):**
```
https://us-central1-PROJECT_ID.cloudfunctions.net/validarReceta
```

Vercel hace el rewrite automáticamente.
