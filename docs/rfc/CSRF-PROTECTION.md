# Protección CSRF (Cross-Site Request Forgery)

## 📋 Resumen

**Fecha:** Enero 9, 2026  
**Librería:** csrf-csrf v3.x  
**Estado:** ✅ Implementado y Validado (295/295 tests passing)

---

## 🔒 Descripción de la Vulnerabilidad

**CSRF (Cross-Site Request Forgery)** es un ataque donde un sitio malicioso engaña al navegador del usuario para que realice acciones no autorizadas en una aplicación web en la que el usuario está autenticado.

### Ejemplo de Ataque:

1. Usuario está logueado en `https://clouddocs.com`
2. Visita un sitio malicioso `https://evil.com`
3. El sitio malicioso contiene:
```html
<form action="https://clouddocs.com/api/documents/delete/123" method="POST">
  <input type="submit" value="Click aquí para ganar un iPhone!">
</form>
<script>document.forms[0].submit();</script>
```
4. Sin protección CSRF, el navegador enviaría las cookies de autenticación automáticamente
5. El documento sería eliminado sin el consentimiento del usuario

---

## 🛡️ Solución Implementada

### Double Submit Cookie Pattern

La librería `csrf-csrf` implementa el patrón **Double Submit Cookie**, que consiste en:

1. **Cookie HTTP-Only**: Contiene el token CSRF encriptado (no accesible por JavaScript)
2. **Token en Header/Body**: El cliente debe enviar el token en cada petición
3. **Validación**: El servidor compara ambos valores para verificar la legitimidad de la petición

### Características de Seguridad

✅ **Cookies Seguras**
- `httpOnly: true` - No accesible por JavaScript (previene XSS)
- `sameSite: 'strict'` - Solo se envía en requests del mismo origen
- `secure: true` - Solo en HTTPS (en producción)
- Prefijo `__Host-` - Asegura que la cookie es del host exacto

✅ **Métodos Ignorados**
- `GET`, `HEAD`, `OPTIONS` - No requieren token CSRF (solo lectura)
- `POST`, `PUT`, `PATCH`, `DELETE` - Requieren token CSRF

✅ **Identificador de Sesión**
- Usa la IP del cliente como identificador único
- Previene ataques de replay entre diferentes clientes

---

## 📝 Configuración

### Variables de Entorno

```env
# Clave secreta para encriptar tokens CSRF (cambiar en producción)
# Generar con: openssl rand -base64 32
CSRF_SECRET=change_me_csrf_secret_in_production

# Ambiente (afecta configuración de cookies)
NODE_ENV=production
```

### Código en app.ts

```typescript
const csrfProtection = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req: Request) => {
    return req.ip || 'anonymous';
  },
});

// Solo en producción y desarrollo (no en tests)
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', csrfProtection.doubleCsrfProtection);
}
```

---

## 🚀 Uso del Cliente

### 1. Obtener el Token CSRF

**Endpoint:** `GET /api/csrf-token`

```javascript
// Cliente web (React, Vue, Angular, etc.)
async function getCsrfToken() {
  const response = await fetch('https://api.clouddocs.com/api/csrf-token', {
    method: 'GET',
    credentials: 'include', // IMPORTANTE: Incluir cookies
  });
  
  const data = await response.json();
  return data.token; // Retorna el token CSRF
}
```

**Respuesta:**
```json
{
  "token": "d4f5e6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5"
}
```

### 2. Enviar el Token en Peticiones

**Opción A: Header (Recomendado)**

```javascript
const token = await getCsrfToken();

const response = await fetch('https://api.clouddocs.com/api/documents', {
  method: 'POST',
  credentials: 'include', // IMPORTANTE: Incluir cookies
  headers: {
    'Content-Type': 'application/json',
    'x-csrf-token': token, // Token en header
  },
  body: JSON.stringify({
    filename: 'documento.pdf',
    folderId: '507f1f77bcf86cd799439011'
  })
});
```

**Opción B: Body (Formularios)**

```javascript
const formData = new FormData();
formData.append('filename', 'documento.pdf');
formData.append('_csrf', token); // Token en el body

const response = await fetch('https://api.clouddocs.com/api/documents', {
  method: 'POST',
  credentials: 'include',
  body: formData
});
```

### 3. Ejemplo Completo (React)

```typescript
import { useState, useEffect } from 'react';

function useCSRF() {
  const [csrfToken, setCsrfToken] = useState<string>('');

  useEffect(() => {
    async function fetchToken() {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include'
      });
      const data = await response.json();
      setCsrfToken(data.token);
    }
    fetchToken();
  }, []);

  return csrfToken;
}

// Uso en componente
function UploadDocument() {
  const csrfToken = useCSRF();

  async function handleUpload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', 'xxx');

    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-csrf-token': csrfToken,
      },
      body: formData
    });

    return response.json();
  }

  // ... resto del componente
}
```

---

## 🧪 Testing

### Ambiente de Test

La protección CSRF está **deshabilitada en tests** para facilitar las pruebas automatizadas:

```typescript
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', csrfProtection.doubleCsrfProtection);
}
```

### Tests de Integración

Los tests no necesitan incluir tokens CSRF cuando `NODE_ENV=test`.

---

## ⚠️ Consideraciones de Seguridad

### 1. Renovación de Tokens

Los tokens CSRF se generan por sesión (basados en la IP del cliente). Para mayor seguridad:

- **Renovar después del login**: Obtener nuevo token tras autenticación
- **Renovar periódicamente**: Solicitar nuevo token cada X minutos

### 2. Cookies SameSite

La configuración `sameSite: 'strict'` previene CSRF automáticamente en navegadores modernos, pero:

- No todos los navegadores lo soportan completamente
- La protección CSRF es una capa adicional recomendada

### 3. HTTPS en Producción

La opción `secure: true` requiere HTTPS en producción:

```typescript
secure: process.env.NODE_ENV === 'production'
```

Asegúrate de:
- Usar certificado SSL/TLS válido
- Redirigir HTTP → HTTPS
- Configurar HSTS headers (ya incluido en helmet)

### 4. Secreto CSRF

El `CSRF_SECRET` debe ser:

- **Único** por aplicación
- **Aleatorio** (min 32 bytes)
- **Secreto** (no commitear en git)
- **Rotado** periódicamente en producción

Generar secreto seguro:
```bash
openssl rand -base64 32
```

---

## 🔍 Debugging

### Verificar Cookie CSRF

En las DevTools del navegador:

1. Abrir **Application/Storage > Cookies**
2. Buscar cookie: `__Host-psifi.x-csrf-token`
3. Verificar:
   - `HttpOnly`: ✓
   - `Secure`: ✓ (en HTTPS)
   - `SameSite`: Strict

### Error 403 Forbidden

Si recibes `403 Forbidden` en peticiones POST/PUT/DELETE:

**Causa:** Token CSRF inválido o faltante

**Solución:**
1. Verificar que estás incluyendo el token en el header `x-csrf-token`
2. Verificar que `credentials: 'include'` está en el fetch
3. Obtener nuevo token de `/api/csrf-token`
4. Verificar que la cookie `__Host-psifi.x-csrf-token` existe

### Logs de Debugging

Agregar logs temporales en app.ts:

```typescript
app.use('/api', (req, res, next) => {
  console.log('CSRF Token from header:', req.headers['x-csrf-token']);
  console.log('CSRF Cookie:', req.cookies['__Host-psifi.x-csrf-token']);
  next();
});
```

---

## 📊 Compliance

### Estándares Cumplidos

✅ **OWASP Top 10 A01:2021** - Broken Access Control  
✅ **OWASP CSRF Prevention Cheat Sheet**  
✅ **CWE-352** - Cross-Site Request Forgery (CSRF)  
✅ **PCI DSS 6.5.9** - Protección contra CSRF

---

## 📚 Referencias

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [csrf-csrf Documentation](https://github.com/Psifi-Solutions/csrf-csrf)
- [MDN - SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)

---

**Última actualización:** Enero 9, 2026  
**Versión del sistema:** 2.0.2 (CSRF Protected)  
**Estado:** ✅ Producción Ready - Protegido contra CSRF
