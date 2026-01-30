# 📋 Guía de Testing - Endpoints API CloudDocs

Esta guía contiene los endpoints principales para probar el sistema multi-tenant con membresías y planes de suscripción.

---

## 🔐 1. Autenticación (Sin Organización Requerida)

### Registrar Usuario
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "password": "SecurePassword123!",
  "role": "user"
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "697008fa7bdfacca3aa23687",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "role": "user"
  }
}
```

**⚠️ Nota:** El usuario NO tiene organización ni rootFolder en este punto.

---

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "juan@example.com",
  "password": "SecurePassword123!"
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "697008fa7bdfacca3aa23687",
    "name": "Juan Pérez",
    "email": "juan@example.com"
  }
}
```

**💾 Guardar el token:** El token JWT se envía automáticamente en las cookies (`Cookie: token=<token>`) tras el login. No es necesario enviarlo en el header Authorization.

---

## 🏢 2. Crear Organización (FREE Plan por defecto)

### Crear Primera Organización
```http
POST /api/organizations
Cookie: token=<token>
Content-Type: application/json

{
  "name": "Mi Empresa Tech",
  "plan": 0
}
```

**Plan Values:**
- `0` = FREE (3 usuarios, 1GB/usuario, 10MB max archivo, solo pdf/txt/doc/docx)
- `1` = BASIC (10 usuarios, 5GB/usuario, 50MB max archivo)
- `2` = PREMIUM (50 usuarios, 10GB/usuario, 100MB max archivo)
- `3` = ENTERPRISE (ilimitados usuarios, 50GB/usuario, 500MB max archivo)

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Organization created successfully",
  "organization": {
    "_id": "697005c7327fe390b912bc98",
    "name": "Mi Empresa Tech",
    "slug": "mi-empresa-tech-1768949190760",
    "owner": "697008fa7bdfacca3aa23687",
    "plan": 0,
    "settings": {
      "maxUsers": 3,
      "maxStoragePerUser": 1073741824,
      "maxStorageTotal": 3221225472,
      "maxFileSize": 10485760,
      "allowedFileTypes": ["pdf", "txt", "doc", "docx"]
    },
    "members": ["697008fa7bdfacca3aa23687"]
  }
}
```

**✅ Automático:** 
- Se crea una `Membership` con role `OWNER` para el usuario
- Se crea el `rootFolder` en `storage/mi-empresa-tech-1768949190760/697008fa7bdfacca3aa23687/`

---

## 👥 3. Gestión de Membresías

### Ver Mis Organizaciones
```http
GET /api/memberships/my-organizations
Cookie: token=<token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "6970123abc...",
      "user": "697008fa7bdfacca3aa23687",
      "organization": {
        "_id": "697005c7327fe390b912bc98",
        "name": "Mi Empresa Tech",
        "slug": "mi-empresa-tech-1768949190760",
        "plan": 0
      },
      "role": "owner",
      "status": "active",
      "rootFolder": "697005c8327fe390b912bce0",
      "joinedAt": "2025-01-22T10:30:00.000Z"
    }
  ]
}
```

---

### Ver Organización Activa
```http
GET /api/memberships/active-organization
Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "organizationId": "697005c7327fe390b912bc98"
}
```

---

### Ver Miembros de mi Organización
```http
GET /api/memberships/organization/697005c7327fe390b912bc98/members
Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "6970123abc...",
      "user": {
        "_id": "697008fa7bdfacca3aa23687",
        "name": "Juan Pérez",
        "email": "juan@example.com"
      },
      "organization": "697005c7327fe390b912bc98",
      "role": "owner",
      "status": "active",
      "joinedAt": "2025-01-22T10:30:00.000Z"
    }
  ]
}
```

---

## 📤 4. Subir Documento (Con Validaciones de Plan)

### Upload - Plan FREE (Máximo 10MB, solo pdf/txt/doc/docx)
```http
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <archivo.pdf>,
  "folderId": "697005c8327fe390b912bce0" (opcional - usa rootFolder si no se especifica)
}
```

**Validaciones automáticas:**
- ❌ Archivo > 10MB → Error: "File size exceeds plan limit"
- ❌ Archivo .xlsx → Error: "File type not allowed in your plan"
- ❌ Usuario sin organización → Error: "User must belong to an active organization"
- ❌ Storage total org > 3GB → Error: "Organization storage limit exceeded"

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "document": {
    "_id": "6970456def...",
    "name": "reporte-2025.pdf",
    "originalName": "reporte-2025.pdf",
    "mimeType": "application/pdf",
    "size": 5242880,
    "path": "storage/mi-empresa-tech-1768949190760/697008fa7bdfacca3aa23687/reporte-2025.pdf",
    "organization": "697005c7327fe390b912bc98",
    "uploadedBy": "697008fa7bdfacca3aa23687",
    "folder": "697005c8327fe390b912bce0"
  }
}
```

---

## 🧪 5. Tests de Límites del Plan FREE

### Test 1: Intentar subir archivo > 10MB
```http
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <archivo-grande-15MB.pdf>
}
```

**Respuesta esperada:**
```json
{
  "success": false,
  "message": "File size exceeds plan limit of 10 MB"
}
```

---

### Test 2: Intentar subir tipo no permitido (.xlsx)
```http
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <datos.xlsx>
}
```

**Respuesta esperada:**
```json
{
  "success": false,
  "message": "File type 'xlsx' is not allowed. Allowed types: pdf, txt, doc, docx"
}
```

---

### Test 3: Intentar agregar 4º usuario (Plan FREE permite máx 3)

**Paso 1:** Registrar 3 nuevos usuarios (usuario2, usuario3, usuario4)

**Paso 2:** Como owner, invitar usuario2 (debe funcionar)
```http
POST /api/organizations/697005c7327fe390b912bc98/members
Cookie: token=<token-owner>
Content-Type: application/json

{
  "userId": "697009ab7bdfacca3aa23688"
}
```
✅ **Debe funcionar** (2º usuario)

**Paso 3:** Invitar usuario3 (debe funcionar)
```http
POST /api/organizations/697005c7327fe390b912bc98/members
Cookie: token=<token-owner>
Content-Type: application/json

{
  "userId": "697009cd7bdfacca3aa23689"
}
```
✅ **Debe funcionar** (3º usuario - límite alcanzado)

**Paso 4:** Intentar invitar usuario4 (debe fallar)
```http
POST /api/organizations/697005c7327fe390b912bc98/members
Cookie: token=<token-owner>
Content-Type: application/json

{
  "userId": "697009ef7bdfacca3aa2368a"
}
```

**Respuesta esperada:**
```json
{
  "success": false,
  "message": "Organization has reached maximum number of users (3) for FREE plan"
}
```

---

## 🔄 6. Multi-Organización (Usuario en 2 Orgs)

### Crear Segunda Organización
```http
POST /api/organizations
Cookie: token=<token>
Content-Type: application/json

{
  "name": "Proyecto Personal",
  "plan": 0
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "organization": {
    "_id": "697010ab327fe390b912bcf0",
    "name": "Proyecto Personal",
    "slug": "proyecto-personal-1768950000000"
  }
}
```

---

### Verificar que tengo 2 Organizaciones
```http
GET /api/memberships/my-organizations
Cookie: token=<token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "organization": { "name": "Mi Empresa Tech" },
      "role": "owner",
      "status": "active"
    },
    {
      "organization": { "name": "Proyecto Personal" },
      "role": "owner",
      "status": "active"
    }
  ]
}
```

---

### Cambiar Organización Activa
```http
POST /api/memberships/switch/697010ab327fe390b912bcf0
Cookie: token=<token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Active organization switched successfully",
  "organizationId": "697010ab327fe390b912bcf0"
}
```

**✅ Verificar:** Los próximos uploads irán a `Proyecto Personal`, no a `Mi Empresa Tech`

---

### Subir Documento en Nueva Org Activa
```http
POST /api/documents/upload
Cookie: token=<token>
Content-Type: multipart/form-data

{
  "file": <notas.txt>
}
```

**Verificar:** El archivo se guardará en `storage/proyecto-personal-1768950000000/697008fa7bdfacca3aa23687/`

---

## 📊 7. Ver Documentos Recientes (Solo de Org Activa)

### Obtener Documentos
```http
GET /api/documents/recent
Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "count": 1,
  "documents": [
    {
      "_id": "6970789abc...",
      "name": "notas.txt",
      "organization": "697010ab327fe390b912bcf0",
      "uploadedBy": "697008fa7bdfacca3aa23687",
      "createdAt": "2025-01-22T12:00:00.000Z"
    }
  ]
}
```

**⚠️ Importante:** Solo verás documentos de "Proyecto Personal" (org activa actual). Los de "Mi Empresa Tech" NO aparecen aquí.

---

## 🚪 8. Abandonar Organización

### Usuario Abandona Org (No Owner)
```http
DELETE /api/memberships/697005c7327fe390b912bc98/leave
Cookie: token=<token-miembro>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "You have left the organization successfully"
}
```

**✅ Automático:**
- Se elimina la `Membership` (soft delete)
- Se elimina el `rootFolder` del usuario en esa org
- Se eliminan archivos físicos del usuario en `storage/{org-slug}/{userId}/`

**❌ Owner NO puede abandonar:** Debe transferir ownership primero.

---

## 📋 9. Resumen de Testing - Orden Recomendado

1. ✅ **Registrar Usuario 1** → Sin organización
2. ✅ **Login Usuario 1** → Obtener token
3. ✅ **Crear Org 1** (FREE plan) → Se crea Membership + rootFolder
4. ✅ **Ver Mis Organizaciones** → Confirmar que aparece Org 1
5. ✅ **Subir archivo PDF 5MB** → Debe funcionar
6. ✅ **Intentar subir archivo 15MB** → Error: límite excedido
7. ✅ **Intentar subir .xlsx** → Error: tipo no permitido
8. ✅ **Registrar Usuario 2, 3, 4**
9. ✅ **Invitar Usuario 2** → Funciona (2/3 usuarios)
10. ✅ **Invitar Usuario 3** → Funciona (3/3 usuarios)
11. ✅ **Intentar invitar Usuario 4** → Error: límite de usuarios
12. ✅ **Crear Org 2** (con Usuario 1) → Multi-org
13. ✅ **Cambiar org activa a Org 2**
14. ✅ **Subir archivo en Org 2** → Verifica aislamiento de storage
15. ✅ **Ver documentos recientes** → Solo de Org 2
16. ✅ **Cambiar a Org 1** → Ver documentos de Org 1

---

## 🔗 Variables de Entorno Necesarias

Asegurar que `.env` tiene:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/clouddocs
JWT_SECRET=your-secret-key-here
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:4200
```

---

## 🛠️ Comandos Útiles

### Iniciar servidor
```bash
npm run dev
```

### Ver logs de storage
```bash
ls -la storage/
```

### Ver organizaciones en MongoDB
```bash
mongosh
use clouddocs
db.organizations.find().pretty()
db.memberships.find().pretty()
```

---

## 📝 Notas Finales

- **Storage físico:** Archivos se guardan en `storage/{org-slug}/{userId}/`
- **Plan FREE:** 3 usuarios máx, 1GB/usuario, 10MB/archivo, tipos: pdf/txt/doc/docx
- **Multi-org:** Un usuario puede estar en múltiples orgs, pero solo 1 activa a la vez
- **Aislamiento:** Documentos/folders se filtran por organización activa
- **Membership roles:** `owner` > `admin` > `member` > `viewer`

---

**✅ Con estos tests validarás:**
1. Registro sin organización requerida
2. Creación de organizaciones con planes
3. Validaciones de límites de plan (FREE)
4. Multi-tenancy (aislamiento entre orgs)
5. Gestión de membresías (invitar, cambiar org, abandonar)

