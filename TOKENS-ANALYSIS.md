# Análisis de Tokens en CloudDocs API

## Resumen

**SÍ, se generan 2 tipos de tokens independientes:**

1. **JWT Token** (Autenticación del usuario)
2. **CSRF Token** (Protección contra ataques CSRF)

Ambos están bien separados y tienen propósitos distintos.

---

## 1️⃣ JWT TOKEN (Autenticación)

### Generación
- **Función**: `signToken()` 
- **Archivo**: `src/services/jwt.service.ts` línea 33
- **Tipo**: JWT firmado con secreto
- **Expiración**: Variable, default 1 día (`JWT_EXPIRES_IN`)
- **Payload contiene**: `id`, `email`, `role`, `tokenVersion`, `tokenCreatedAt`, `iat`, `exp`

```typescript
// jwt.service.ts
export function signToken(payload: Partial<TokenPayload>, options: SignTokenOptions = {}): string {
  const expiresIn: string | number = options.expiresIn || JWT_EXPIRES_IN;
  return jwt.sign({ ...payload, tokenCreatedAt: new Date().toISOString() }, JWT_SECRET, {
    expiresIn
  });
}
```

### Almacenamiento
| Ubicación | Cookie | Header |
|-----------|--------|--------|
| **Seteo** | ✅ Cookie HttpOnly `token` | ❌ No |
| **Lectura** | ✅ `req.cookies['token']` | ✅ Fallback: `Authorization` header |

### Ubicaciones donde se setea la cookie JWT

| Archivo | Línea | Contexto |
|---------|-------|---------|
| [src/controllers/auth.controller.ts](src/controllers/auth.controller.ts#L91) | 91 | Login - setea token en cookie |
| [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts#L110) | 110 | Sliding session - refresca expiración en cada request |

### Ubicación donde se lee la cookie JWT

| Archivo | Línea | Contexto |
|---------|-------|---------|
| [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts#L18) | 18-25 | Lee de `req.cookies['token']` |

### Desactivación de la cookie JWT
- **Archivo**: [src/controllers/auth.controller.ts](src/controllers/auth.controller.ts#L130)
- **Método**: `logout`
- **Acción**: `res.clearCookie('token')`

---

## 2️⃣ CSRF TOKEN (Protección CSRF)

### Generación
- **Función**: `generateCsrfToken()` (de biblioteca `csrf-csrf`)
- **Archivo**: `src/middlewares/csrf.middleware.ts` línea 65
- **Tipo**: Token aleatorio de 64 bytes
- **Configuración**: Double Submit Cookie Pattern
  - Cookie name (prod): `__Host-psifi.x-csrf-token`
  - Cookie name (dev): `psifi.x-csrf-token`
  - Cookie options: `httpOnly: true`, `sameSite: 'lax'/'none'`, `secure: true (prod)`

```typescript
// csrf.middleware.ts
const csrfProtection = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    httpOnly: true
  },
  size: 64
});

export const generateCsrfToken = csrfProtection.generateCsrfToken;
```

### Almacenamiento

| Ubicación | Cookie | Header | Response Body |
|-----------|--------|--------|--|
| **Seteo** | ✅ `psifi.x-csrf-token` | ❌ No | ✅ En `GET /api/csrf-token` |
| **Lectura** | ✅ `req.cookies['psifi.x-csrf-token']` | ✅ `x-csrf-token` header | N/A |

### Ubicación de generación del token CSRF

| Archivo | Línea | Contexto | HTTP Method |
|---------|-------|---------|--|
| [src/app.ts](src/app.ts#L109) | 109 | Endpoint `/api/csrf-token` | **GET** |

```typescript
// app.ts línea 107-112
app.get('/api/csrf-token', (req: Request, res: Response) => {
  const token = generateCsrfToken(req, res);  // ← Genera token + setea cookie
  res.json({
    token,  // ← Envía token en response para que cliente lo use en header
    message: '...'
  });
});
```

### Validación del token CSRF

| Archivo | Línea | Contexto |
|---------|-------|---------|
| [src/middlewares/csrf.middleware.ts](src/middlewares/csrf.middleware.ts#L61) | 61 | Valida que cookie = header |

```typescript
// csrf.middleware.ts línea 59-64
export const csrfProtectionMiddleware = (req, res, next) => {
  if (CSRF_EXCLUDED_ROUTES.includes(req.path)) {
    return next();
  }
  // Valida que req.cookies['psifi.x-csrf-token'] === req.headers['x-csrf-token']
  return csrfProtection.doubleCsrfProtection(req, res, next);
};
```

### Rutas EXCLUIDAS de protección CSRF

```typescript
const CSRF_EXCLUDED_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/csrf-token',
  '/confirm/:token',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
];
```

---

## 🔍 Comparativa: JWT vs CSRF

| Aspecto | JWT | CSRF |
|--------|-----|------|
| **Propósito** | Autenticar usuario (quién eres) | Prevenir falsificación de requests |
| **Tipo** | JWT firmado con secreto | Token aleatorio |
| **Duración** | Variable (default 1 día) | Por sesión (igual vida que la sesión del browser) |
| **Storage de Cookie** | `token` | `psifi.x-csrf-token` o `__Host-psifi.x-csrf-token` |
| **Header para validación** | `Authorization: Bearer ...` (fallback) | `x-csrf-token` |
| **Generación** | `signToken()` en `jwt.service.ts` | `generateCsrfToken()` en `csrf.middleware.ts` |
| **Dónde se genera** | Login/registro | GET `/api/csrf-token` |
| **httpOnly** | ✅ Sí (seguro) | ✅ Sí (seguro) |
| **Accesible por JS** | ❌ No | ❌ No |
| **Renovación** | En cada request (sliding session) | Una vez por sesión |

---

## 📋 Flujo Completo de Autenticación

### 1. Cliente obtiene CSRF token
```
GET /api/csrf-token
↓
Backend genera token con generateCsrfToken(req, res)
↓
Setea automáticamente: Cookie psifi.x-csrf-token=XXX
↓
Devuelve: { token: "XXX" } en body
↓
Cliente guarda token en memoria para usarlo en header x-csrf-token
```

### 2. Cliente registra/login
```
POST /api/auth/register (CSRF excluido)
OR
POST /api/auth/login (CSRF excluido)
↓
Backend genera JWT con signToken({ id, email, role, ... })
↓
Setea cookie: token=JWT_VALUE (HttpOnly)
↓
Devuelve: { user: {...} }
↓
Cliente envía ambas cookies automáticamente en requests subsecuentes
```

### 3. Cliente hace request protegido (POST/PUT/DELETE)
```
POST /api/documents/upload
Headers: x-csrf-token: XXX
Cookies: [token=JWT_VALUE, psifi.x-csrf-token=XXX]
↓
1. csrfProtectionMiddleware valida: req.headers['x-csrf-token'] === req.cookies['psifi.x-csrf-token']
2. authenticateToken valida JWT desde cookie
↓
Request proceeds si ambos son válidos
```

---

## ✅ Conclusión

### Está bien implementado:
- ✅ Dos tokens independientes para dos propósitos distintos
- ✅ Ambos en cookies HttpOnly (seguro contra XSS)
- ✅ JWT se refresca en cada request (sliding session)
- ✅ CSRF se valida en todos los POST/PUT/DELETE/PATCH
- ✅ Rutas públicas (login/register) excluidas de CSRF
- ✅ Configuración diferente en dev vs prod

### Nota importante:
En los logs de auth.controller.ts aún hay algunos console.warn sobre JWT (AUTH-LOGIN-DIAGNOSTIC). Si quieres limpiarlos también, puedo eliminarlos.
