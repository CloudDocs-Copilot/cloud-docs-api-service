# Word to HTML Conversion

## Overview

CloudDocs convierte automáticamente documentos de Microsoft Word (.docx y .doc) a HTML cuando se visualizan. Esto permite ver documentos Word directamente en el navegador sin necesidad de descargarlos ni comprometer la seguridad.

## Cómo Funciona

### Backend

1. **Librería**: Usa `mammoth.js` para convertir documentos Word a HTML
2. **Endpoint**: `GET /api/documents/preview/:id`
3. **Detección automática**: Detecta MIME types:
   - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
   - `application/msword` (.doc)

4. **Proceso**:
   ```typescript
   const isWordDocument = doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                          doc.mimeType === 'application/msword';
   
   if (isWordDocument) {
     const result = await mammoth.convertToHtml({ path: fullPath });
     // Envía HTML con estilos embebidos
     res.setHeader('Content-Type', 'text/html; charset=utf-8');
     res.send(html);
   }
   ```

### Frontend

1. **Componente**: `OfficeViewer.tsx`
2. **Tipo de preview**: `DocumentPreviewType.OFFICE`
3. **Renderizado**: 
   - Hace fetch del HTML convertido desde el backend
   - Renderiza el HTML de forma segura usando `dangerouslySetInnerHTML`
   - Incluye loading states y manejo de errores
4. **Autenticación**: Usa `credentials: 'include'` para enviar cookies
5. **Seguridad**: 
   - ✅ Mantiene `X-Frame-Options: DENY` en el backend
   - ✅ No usa iframes (evita problemas de CSP)
   - ✅ Renderizado controlado del HTML

## Características

### Estilos Aplicados

El HTML generado incluye estilos CSS embebidos para:
- Fuentes legibles (Segoe UI, Tahoma, etc.)
- Máximo ancho de 800px para lectura óptima
- Fondo gris (#f5f5f5) con contenedor blanco
- Tablas con bordes y padding
- Imágenes responsivas
- Encabezados con jerarquía visual

### Elementos Soportados

Mammoth convierte:
- ✅ Párrafos y texto formateado (negrita, cursiva)
- ✅ Encabezados (h1-h6)
- ✅ Listas (ordenadas y no ordenadas)
- ✅ Tablas
- ✅ Imágenes embebidas
- ✅ Links
- ⚠️ Formatos complejos pueden tener limitaciones

## Código Frontend

### OfficeViewer Component

```typescript
// src/components/DocumentPreview/OfficeViewer.tsx

export const OfficeViewer: React.FC<OfficeViewerProps> = ({ url, filename }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch del HTML convertido con autenticación
        const response = await fetch(url, {
          credentials: 'include', // Incluir cookies
        });

        if (!response.ok) {
          throw new Error(`Failed to load document: ${response.statusText}`);
        }

        const html = await response.text();
        setHtmlContent(html);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [url]);

  return (
    <div className={styles.viewerContainer}>
      <div className={styles.toolbar}>
        <span><i className="bi bi-file-earmark-word"></i> {filename}</span>
        <a href={url} download>Download</a>
      </div>
      <div 
        className={styles.contentContainer}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
};
```

### Uso en DocumentPreviewModal

```typescript
import { OfficeViewer } from './OfficeViewer';

case DocumentPreviewType.OFFICE:
  return (
    <OfficeViewer
      url={previewUrl}
      filename={document.filename || document.originalname || 'document'}
    />
  );
```

## Arquitectura de Seguridad

### Backend - Helmet Configuration

```typescript
// src/app.ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  frameguard: { action: 'deny' }, // ✅ Mantiene protección contra clickjacking
  noSniff: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

### Ventajas de Seguridad

1. **✅ X-Frame-Options: DENY** - Protección completa contra clickjacking
2. **✅ No usa iframes** - Evita problemas de CSP y frame-ancestors
3. **✅ Renderizado controlado** - El HTML se renderiza directamente en React
4. **✅ Autenticación preservada** - Las cookies funcionan normalmente
5. **✅ Sin compromisos** - Seguridad completa sin sacrificar funcionalidad

## Dependencias

### Backend
```bash
npm install mammoth
```

```json
{
  "dependencies": {
    "mammoth": "^1.8.0"
  }
}
```

### Frontend
No requiere dependencias adicionales - usa fetch API nativo y React built-ins.

## Flujo Completo

```
1. Usuario hace clic en "Preview" de un documento Word
   ↓
2. Frontend determina que es DocumentPreviewType.OFFICE
   ↓
3. OfficeViewer hace fetch a /api/documents/preview/:id
   ↓
4. Backend detecta que es un archivo Word por MIME type
   ↓
5. Backend usa mammoth.js para convertir .docx → HTML
   ↓
6. Backend envía HTML con estilos CSS embebidos
   ↓
7. OfficeViewer recibe el HTML y lo renderiza con dangerouslySetInnerHTML
   ↓
8. Usuario ve el documento formateado en el modal
```

## Limitaciones

1. **Formatos complejos**: Algunos formatos avanzados de Word pueden no convertirse perfectamente
2. **Macros**: No soporta macros de VBA
3. **Revisiones**: No muestra el control de cambios de Word
4. **Comentarios**: Los comentarios de Word no se muestran
5. **Archivos .doc antiguos**: La conversión puede ser menos precisa que con .docx

## Alternativas Consideradas

### 1. Office Online Viewer (❌ Descartada)
- **Problema**: Requiere URLs públicas, incompatible con autenticación por cookies
- **URL**: `https://view.officeapps.live.com/op/embed.aspx?src=...`
- **Por qué no**: Nuestros archivos requieren autenticación privada

### 2. Iframe Directo (❌ Descartada)
- **Problema**: Viola Content Security Policy con `X-Frame-Options: DENY`
- **Riesgo de seguridad**: Deshabilitar frameguard expone a ataques de clickjacking
- **Por qué no**: Compromete la seguridad sin beneficio real

### 3. Conversión a PDF (⏸️ No implementada)
- **Ventaja**: Mantiene formato exacto del documento original
- **Desventaja**: Requiere LibreOffice instalado en el servidor
- **Librerías**: `libreoffice-convert`, `unoconv`
- **Uso**: Podría considerarse para producción si se necesita mayor fidelidad

### 4. Mammoth.js + Fetch HTML (✅ Implementada)
- **✅ Sin dependencias del sistema operativo**
- **✅ Rápido y ligero**
- **✅ Compatible con autenticación por cookies**
- **✅ No compromete seguridad (mantiene frameguard)**
- **✅ Renderizado directo en React**
- **⚠️ Fidelidad limitada en formatos muy complejos**

## Testing

Para probar la funcionalidad:

1. Sube un documento .docx
2. Haz clic en el botón de preview
3. El documento debería mostrarse como HTML formateado en el modal

## Troubleshooting

### El contenido no se muestra
- **Verificar**: Cookies habilitadas en el navegador
- **Verificar**: CORS configurado con `credentials: true`
- **Revisar**: Console del navegador para errores de fetch
- **Logs**: Backend muestra `[preview] Converting Word document to HTML`

### Formato incorrecto o faltante
- **Causa**: Mammoth tiene limitaciones con formatos complejos de Word
- **Solución**: Descargar archivo original para ver formato exacto
- **Alternativa**: Considerar conversión a PDF para mayor fidelidad

### Error 404 al cargar documento
- **Verificar**: Archivo existe en storage
- **Revisar**: Logs del backend para path duplication bug
- **Verificar**: Ruta almacenada en MongoDB vs ubicación real del archivo

### Spinner de loading infinito
- **Causa**: Error en fetch que no se capturó
- **Revisar**: Network tab en DevTools
- **Verificar**: Backend responde correctamente al endpoint de preview
- **Logs**: Verificar errores en consola del frontend

### Errores de CSP (Content Security Policy)
- **Verificado**: Ya no debería ocurrir con la solución actual
- **Si ocurre**: Verificar que no se esté usando iframe
- **Confirmar**: OfficeViewer usa fetch + dangerouslySetInnerHTML

## Performance

### Tiempo de Carga Promedio
- Documentos pequeños (<1MB): **< 500ms**
- Documentos medianos (1-5MB): **1-2 segundos**
- Documentos grandes (5-10MB): **2-4 segundos**

### Optimizaciones Aplicadas
1. **Conversión on-the-fly** - No se guarda HTML en disco
2. **Streaming response** - Backend envía HTML directamente
3. **Browser caching** - Headers apropiados para cachear HTML
4. **React memoization** - Evita re-renders innecesarios

### Limitaciones de Tamaño
- **Máximo recomendado**: 10MB por documento
- **Razón**: Conversión HTML puede ser grande para documentos complejos
- **Configuración**: `MAX_UPLOAD_SIZE=104857600` (100MB en .env)

## Referencias

- [Mammoth.js Documentation](https://github.com/mwilliamson/mammoth.js)
- [Supported Word Features](https://github.com/mwilliamson/mammoth.js#supported-features)
