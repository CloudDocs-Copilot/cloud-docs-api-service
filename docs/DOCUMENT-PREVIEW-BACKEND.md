# Document Preview - Backend Support

## 📋 Resumen de Cambios

Se ha agregado soporte backend para el sistema de preview de documentos, permitiendo visualizar archivos inline en el navegador sin forzar su descarga.

## 🔧 Endpoints Agregados

### GET `/api/documents/preview/:id`

Sirve un documento para visualización inline en el navegador.

**Diferencias con `/download/:id`:**

- **Preview**: `Content-Disposition: inline` → Abre en navegador
- **Download**: `Content-Disposition: attachment` → Fuerza descarga

**Autenticación:** Requerida (JWT)

**Autorización:** Owner o usuario con quien el documento está compartido

**Parámetros:**

- `id` (path) - ID del documento

**Respuesta Exitosa:**

- Status: `200 OK`
- Headers:
  - `Content-Type`: MIME type del archivo
  - `Content-Disposition`: `inline; filename="nombre.ext"`
- Body: Contenido binario del archivo

**Errores:**

- `401 Unauthorized` - Token JWT inválido o expirado
- `403 Forbidden` - Usuario sin acceso al documento
- `404 Not Found` - Documento no existe o archivo no encontrado

**Ejemplo:**

```bash
# Preview de PDF
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/documents/preview/507f1f77bcf86cd799439011

# Preview de imagen
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/documents/preview/507f1f77bcf86cd799439012
```

## 🔒 Seguridad

### Validaciones Implementadas

1. **Autenticación JWT**: Requiere token válido
2. **Verificación de Acceso**: Solo owner o usuarios compartidos
3. **Path Sanitization**: Prevención de Path Traversal
4. **MIME Type**: Validación del tipo de archivo
5. **CORS**: Configurado para permitir frontend autorizado

### Path Traversal Protection

El controlador utiliza `validateDownloadPath()` para:

- Sanitizar nombres de archivo
- Prevenir secuencias `../`
- Validar que el archivo esté en directorio permitido
- Verificar existencia del archivo

```typescript
// Busca primero en uploads, luego en storage
try {
  filePath = await validateDownloadPath(doc.filename || '', uploadsBase);
} catch (error) {
  filePath = await validateDownloadPath(doc.filename || '', storageBase);
}
```

## 🏗️ Arquitectura

### Flujo de Preview

```text
Frontend                    Backend
┌─────────────┐            ┌──────────────┐
│  Browser    │────────────▶│   Express    │
│             │  GET /preview/id  │              │
└─────────────┘            │  Controller  │
                           └──────────────┘
                                  │
                                  ▼
                           ┌──────────────┐
                           │   Service    │
                           │ findDocument │
                           └──────────────┘
                                  │
                                  ▼
                           ┌──────────────┐
                           │   MongoDB    │
                           │  (metadata)  │
                           └──────────────┘
                                  │
                                  ▼
                           ┌──────────────┐
                           │ Path Sanitizer│
                           │  (security)  │
                           └──────────────┘
                                  │
                                  ▼
                           ┌──────────────┐
                           │ File System  │
                           │  (binario)   │
                           └──────────────┘
                                  │
                                  ▼
                           ┌──────────────┐
                           │   Response   │
                           │    Inline    │
                           └──────────────┘
```

### Controlador

**Archivo**: `src/controllers/document.controller.ts`

```typescript
export async function preview(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
```

**Responsabilidades**:

1. Validar autenticación (middleware)
2. Verificar existencia del documento
3. Verificar permisos de acceso
4. Sanitizar path del archivo
5. Configurar headers de respuesta
6. Enviar archivo con `res.sendFile()`

### Headers de Respuesta

```http
Content-Type: application/pdf
Content-Disposition: inline; filename="report.pdf"
Content-Length: 1024000
Cache-Control: private, max-age=3600
```

**Diferencia clave**: `inline` vs `attachment`

## 🔗 Integración con Frontend

El frontend usa el endpoint de preview en:

**Archivo**: `src/services/preview.service.ts`

```typescript
getPreviewUrl(document: PreviewDocument): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  return `${baseUrl}/documents/preview/${document.id}`;
}
```

**Componentes que consumen**:

- `PDFViewer` - react-pdf carga desde URL
- `ImageViewer` - `<img src={previewUrl}>`
- `VideoPlayer` - `<video src={previewUrl}>`
- `TextViewer` - `fetch(previewUrl).then(r => r.text())`

## 📝 Tipos de Archivo Soportados

El backend sirve cualquier tipo de archivo con su MIME type correcto:

| Categoría    | MIME Types                                                            |
| ------------ | --------------------------------------------------------------------- |
| **PDF**      | `application/pdf`                                                     |
| **Imágenes** | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml` |
| **Videos**   | `video/mp4`, `video/webm`, `video/ogg`                                |
| **Audio**    | `audio/mpeg`, `audio/wav`, `audio/ogg`                                |
| **Texto**    | `text/plain`, `text/html`, `text/csv`                                 |
| **Código**   | `text/javascript`, `application/json`, `text/xml`                     |
| **Office**   | `application/msword`, `application/vnd.openxmlformats-*`              |

## 🧪 Testing

### Pruebas Manuales

```bash
# 1. Obtener token de autenticación
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234"}' \
  | jq -r '.token')

# 2. Subir documento de prueba
DOC_ID=$(curl -s -X POST http://localhost:4000/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "folderId=507f1f77bcf86cd799439011" \
  | jq -r '.document.id')

# 3. Preview del documento
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/documents/preview/$DOC_ID \
  --output preview.pdf

# 4. Verificar en navegador
open "http://localhost:4000/api/documents/preview/$DOC_ID"
```

### Pruebas de Seguridad

```bash
# Path Traversal - debe fallar
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/documents/preview/../../etc/passwd"
# Expected: 404 Not Found

# Sin autenticación - debe fallar
curl "http://localhost:4000/api/documents/preview/$DOC_ID"
# Expected: 401 Unauthorized

# Usuario sin acceso - debe fallar
curl -H "Authorization: Bearer $OTHER_USER_TOKEN" \
  "http://localhost:4000/api/documents/preview/$DOC_ID"
# Expected: 403 Forbidden
```

## 🚀 Performance

### Optimizaciones

1. **Cache Headers**: Configurable por tipo de archivo
2. **Streaming**: `res.sendFile()` usa streams
3. **Range Requests**: Soportado por Express (videos)
4. **GZIP**: Habilitado en middleware compression

### Métricas Objetivo

- Latencia < 100ms (metadata lookup)
- Tiempo de primera byte < 200ms
- Streaming para archivos >1MB
- Cache browser: 1 hora

## 📊 Monitoreo

### Logs

```typescript
// El controlador registra:
- Solicitudes de preview con user ID y document ID
- Errores de acceso (403)
- Archivos no encontrados (404)
- Errores de path sanitization
```

### Métricas Sugeridas

- Tasa de éxito de previews
- Tiempo promedio de respuesta
- Tipos de archivo más previsualizados
- Errores de seguridad (path traversal intentos)

## 🔮 Mejoras Futuras

### Backend

- [ ] Cache de archivos frecuentes (Redis)
- [ ] Conversión Office → PDF server-side
- [ ] OCR para documentos escaneados
- [ ] Miniaturas generadas automáticamente
- [ ] CDN para archivos estáticos
- [ ] Rate limiting específico para previews

### Seguridad

- [ ] Watermark en previews (opcional)
- [ ] Registro de accesos a documentos
- [ ] Expiración de URLs de preview
- [ ] Cifrado de archivos en reposo

## 📄 Referencias

- [Express sendFile Documentation](https://expressjs.com/en/api.html#res.sendFile)
- [MDN: Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)

---

**Implementado**: 2 de febrero de 2026  
**Version**: 1.0.0  
**Autor**: CloudDocs Team
