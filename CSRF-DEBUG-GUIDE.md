# Análisis: Por qué fallaría la validación CSRF

## ❌ NO hay confusión de tokens en el servidor

La validación en el servidor es **clara y separada**:

### JWT (Autenticación)
```typescript
// auth.middleware.ts
const token = getTokenFromCookies(req);  // Lee de: req.cookies['token']
const decoded = verifyToken(token);      // Valida con JWT secret
```

### CSRF (Protección contra falsificación)
```typescript
// csrf.middleware.ts
csrfProtection.doubleCsrfProtection(req, res, next);
// Internamente valida:
// req.cookies['psifi.x-csrf-token'] === req.headers['x-csrf-token']
```

**NO se mezclan:** JWT valida contra `token`, CSRF valida contra `psifi.x-csrf-token`

---

## ✅ Escenarios donde **SÍ** fallaría el CSRF (desde el cliente):

### 1️⃣ **Cliente envía el JWT en el header `x-csrf-token`**
```
SI HACE:
GET /api/csrf-token → recibe { token: "CSRF_ABC123" }

PERO LUEGO HACE:
POST /api/documents
Headers: { "x-csrf-token": "JWT_XYZ789" }  ❌ MALO (está enviando JWT, no CSRF)
Cookies: { "psifi.x-csrf-token": "CSRF_ABC123" }

RESULTADO: No matchean porque:
- Header tiene JWT_XYZ789
- Cookie tiene CSRF_ABC123
- 403 Forbidden: Invalid CSRF token
```

### 2️⃣ **Cliente no envía la cookie automáticamente**
```
SI HACE:
GET /api/csrf-token
→ Servidor setea cookie automáticamente en respuesta
→ Cliente guarda { token: "CSRF_ABC123" } en variable

PERO LUEGO HACE:
POST /api/documents
Headers: { "x-csrf-token": "CSRF_ABC123" }
Cookies: {} ❌ VACIO (no envía la cookie)

RESULTADO: No matchean porque:
- Header tiene: CSRF_ABC123
- Cookie tiene: undefined/falta
- 403 Forbidden: Invalid CSRF token
```

### 3️⃣ **El cliente genera un NUEVO token pero no lo usa**
```
SI HACE:
GET /api/csrf-token → { token: "CSRF_ABC123" }  
→ Servidor setea cookie "CSRF_ABC123"

LUEGO:
GET /api/csrf-token OTRA VEZ → { token: "CSRF_XYZ999" }
→ Servidor REEMPLAZA la cookie por "CSRF_XYZ999"

PERO LUEGO:
POST /api/documents
Headers: { "x-csrf-token": "CSRF_ABC123" }  ❌ Token viejo
Cookies: { "psifi.x-csrf-token": "CSRF_XYZ999" }  ← Token nuevo

RESULTADO: No matchean
```

### 4️⃣ **CORS bloqueando cookies**
```
SI PASA:
El navegador NO envía las cookies porque:
- CORS no tiene credentials: true (PERO esto SÍ está configurado en cors-config.ts)
- sameSite=Strict y cross-origin (PERO en dev es lax, en prod es none)
- Certificado TLS inválido en producción

RESULTADO: Cookie NO se envía, solo header
```

---

## 🔍 Cómo verificar el problema en el cliente

### Para debuggear en el navegador:

```javascript
// 1. Obtener token CSRF
const csrfResponse = await fetch('http://localhost:3000/api/csrf-token');
const { token } = await csrfResponse.json();
console.log('CSRF Token:', token);
console.log('En cookies:', document.cookie);  // Debería tener psifi.x-csrf-token

// 2. Hacer un POST
const uploadResponse = await fetch('http://localhost:3000/api/documents/upload', {
  method: 'POST',
  credentials: 'include',  // ✅ IMPORTANTE: debe estar aquí
  headers: {
    'Content-Type': 'multipart/form-data',
    'x-csrf-token': token  // ✅ DEBE ser el token de GET /api/csrf-token
  },
  body: formData
});
```

### En el servidor (para debuggear):

Agregué un log temporal en `csrf.middleware.ts` línea 113-120:

```typescript
export const csrfProtectionMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (CSRF_EXCLUDED_ROUTES.includes(req.path)) {
    return next();
  }

  // DEBUG
  if (process.env.NODE_ENV !== 'test') {
    console.log('[CSRF-DEBUG]', {
      path: req.path,
      cookie: req.cookies['psifi.x-csrf-token'],
      header: req.headers['x-csrf-token'],
      match: req.cookies['psifi.x-csrf-token'] === req.headers['x-csrf-token']
    });
  }

  return csrfProtection.doubleCsrfProtection(req, res, next);
};
```

---

## 📋 Checklist para verificar CSRF

- [ ] El cliente llama a `GET /api/csrf-token`
- [ ] El cliente obtiene el token del response JSON (NO de la cookie, que es httpOnly)
- [ ] El cliente envía ese token en el header `x-csrf-token` en POST/PUT/DELETE
- [ ] El cliente usa `credentials: 'include'` en fetch para enviar todas las cookies
- [ ] El servidor recibe ambos:
  - Cookie `psifi.x-csrf-token` (automática del navegador)
  - Header `x-csrf-token` (enviado por cliente)
- [ ] Ambos deben ser idénticos

---

## ⚠️ Conclusión

**El backend está correcto.** Si falla CSRF probablemente es:

1. **Cliente no está usando el token de `GET /api/csrf-token`** → está usando JWT o token viejo
2. **Cookie no se está enviando** → falta `credentials: 'include'` en fetch
3. **Token fue regenerado** → cliente nunca llamó de nuevo a `GET /api/csrf-token` antes del POST
4. **CORS bloqueando cookies** → imposible en localhost, pero posible en producción

NO es confusión de tokens porque JWT y CSRF están completamente separados en el código.
