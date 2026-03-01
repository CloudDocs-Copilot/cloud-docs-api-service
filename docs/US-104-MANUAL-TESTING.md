# Pruebas Manuales US-104 - Búsqueda con Elasticsearch

## Backend - Pruebas con Postman/Thunder Client

### 1. Búsqueda Básica
```
GET http://localhost:4000/api/search?q=zonificacion
Headers:
  Authorization: Bearer <token>
  X-Organization-ID: <org-id>
```
**Resultado esperado:** Lista de documentos que contengan "zonificacion"

### 2. Búsqueda Case-Insensitive
```
GET http://localhost:4000/api/search?q=ZONIFICACION
GET http://localhost:4000/api/search?q=ZoNiFiCaCiOn
```
**Resultado esperado:** Mismos resultados que búsqueda básica

### 3. Búsqueda Parcial
```
GET http://localhost:4000/api/search?q=zonif
GET http://localhost:4000/api/search?q=cacion
```
**Resultado esperado:** Encuentra documentos con palabras que contengan el fragmento

### 4. Búsqueda con Caracteres Especiales
```
GET http://localhost:4000/api/search?q=2023
GET http://localhost:4000/api/search?q=123
GET http://localhost:4000/api/search?q=año
```
**Resultado esperado:** Encuentra documentos con números y acentos

### 5. Filtro por Tipo de Archivo
```
GET http://localhost:4000/api/search?q=test&mimeType=application/pdf
GET http://localhost:4000/api/search?q=test&mimeType=image/png
```
**Resultado esperado:** Solo documentos del tipo especificado

### 6. Filtro por Fecha
```
GET http://localhost:4000/api/search?q=test&fromDate=2024-01-01
GET http://localhost:4000/api/search?q=test&toDate=2024-12-31
GET http://localhost:4000/api/search?q=test&fromDate=2024-01-01&toDate=2024-12-31
```
**Resultado esperado:** Documentos dentro del rango de fechas

### 7. Paginación
```
GET http://localhost:4000/api/search?q=test&limit=5&offset=0
GET http://localhost:4000/api/search?q=test&limit=5&offset=5
```
**Resultado esperado:** Máximo 5 resultados por página

### 8. Autocompletado
```
GET http://localhost:4000/api/search/autocomplete?q=zon
GET http://localhost:4000/api/search/autocomplete?q=pred
GET http://localhost:4000/api/search/autocomplete?q=const
```
**Resultado esperado:** Lista de sugerencias basadas en documentos existentes

### 9. Búsqueda Sin Resultados
```
GET http://localhost:4000/api/search?q=palabrainexistenteabcxyz123
```
**Resultado esperado:** `{ success: true, data: [], total: 0 }`

### 10. Validación de Permisos
```
GET http://localhost:4000/api/search?q=test
# Sin token o con org-id incorrecta
```
**Resultado esperado:** Error 401 o solo documentos de la organización permitida

---

## Frontend - Pruebas de Interfaz

### 1. Búsqueda Básica
- [ ] Navegar a `/search`
- [ ] Escribir "zonificacion" en el buscador
- [ ] Presionar Enter o click en buscar
- [ ] **Verificar:** Aparecen documentos con "zonificacion"

### 2. Búsqueda en Tiempo Real
- [ ] Escribir texto en el buscador
- [ ] **Verificar:** Aparece dropdown con sugerencias (autocomplete)
- [ ] Click en una sugerencia
- [ ] **Verificar:** Se realiza la búsqueda automáticamente

### 3. Búsqueda Case-Insensitive
- [ ] Buscar "ZONIFICACION" (mayúsculas)
- [ ] Buscar "zonificacion" (minúsculas)
- [ ] Buscar "ZoNiFiCaCiOn" (mezclado)
- [ ] **Verificar:** Los 3 retornan los mismos resultados

### 4. Búsqueda Parcial
- [ ] Buscar "zonif" (palabra incompleta)
- [ ] **Verificar:** Encuentra documentos con "zonificacion"

### 5. Filtros
- [ ] Seleccionar tipo de archivo (PDF)
- [ ] **Verificar:** Solo muestra PDFs
- [ ] Seleccionar rango de fechas
- [ ] **Verificar:** Solo documentos en ese rango

### 6. Historial de Búsqueda
- [ ] Realizar 3 búsquedas diferentes
- [ ] **Verificar:** Aparece lista de búsquedas recientes
- [ ] Click en una búsqueda reciente
- [ ] **Verificar:** Se repite la búsqueda

### 7. Resultados Vacíos
- [ ] Buscar "palabrainexistente123"
- [ ] **Verificar:** Mensaje "No se encontraron documentos"

### 8. Rendimiento
- [ ] Buscar una palabra común
- [ ] **Verificar:** Resultados aparecen en < 1 segundo
- [ ] Verificar en consola el tiempo de respuesta (took)

### 9. Acciones sobre Resultados
- [ ] Realizar una búsqueda
- [ ] Click en "Ver" de un documento
- [ ] **Verificar:** Se abre el visor de documento
- [ ] Click en "Descargar"
- [ ] **Verificar:** Descarga el archivo

### 10. Responsive
- [ ] Probar búsqueda en mobile (DevTools)
- [ ] **Verificar:** Layout se adapta correctamente
- [ ] **Verificar:** Autocompletado funciona en mobile

---

## Pruebas de Rendimiento

### 1. Elasticsearch Health
```bash
curl http://localhost:9200/_cluster/health
```
**Resultado esperado:** `status: "green"` o `"yellow"`

### 2. Índice de Documentos
```bash
curl http://localhost:9200/documents/_count
```
**Resultado esperado:** Número de documentos indexados

### 3. Búsqueda Directa en Elasticsearch
```bash
curl -X GET "http://localhost:9200/documents/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "query_string": {
      "query": "*zonificacion*",
      "fields": ["filename", "originalname"]
    }
  }
}'
```
**Resultado esperado:** JSON con resultados y tiempo (took)

### 4. Verificar Mapping
```bash
curl http://localhost:9200/documents/_mapping
```
**Resultado esperado:** Mapping con `custom_analyzer` en filename y originalname

---

## Casos Edge y Seguridad

### 1. Caracteres Especiales
- [ ] Buscar: `test-file`
- [ ] Buscar: `test_file`
- [ ] Buscar: `test.file`
- [ ] Buscar: `test (copy)`

### 2. Caracteres Unicode
- [ ] Buscar: `señor`
- [ ] Buscar: `año`
- [ ] Buscar: `niño`
- [ ] **Verificar:** Encuentra con y sin acentos

### 3. SQL Injection / NoSQL Injection
- [ ] Buscar: `'; DROP TABLE documents; --`
- [ ] Buscar: `{ $ne: null }`
- [ ] **Verificar:** No afecta la base de datos

### 4. XSS
- [ ] Buscar: `<script>alert('XSS')</script>`
- [ ] **Verificar:** Se escapa correctamente en resultados

### 5. Límites
- [ ] Buscar con query muy largo (>1000 caracteres)
- [ ] **Verificar:** Se maneja sin crash

---

## Verificación Final

### Checklist de Funcionalidad
- [ ] ✅ Búsqueda parcial funciona
- [ ] ✅ Case-insensitive funciona
- [ ] ✅ Autocompletado funciona
- [ ] ✅ Filtros (fecha, tipo) funcionan
- [ ] ✅ Paginación funciona
- [ ] ✅ Historial funciona
- [ ] ✅ Permisos de organización se respetan
- [ ] ✅ Indexación automática al subir documento
- [ ] ✅ Eliminación de índice al borrar documento
- [ ] ✅ Logs en terminal confirmando uso de Elasticsearch

### Checklist de Rendimiento
- [ ] ✅ Búsqueda < 100ms
- [ ] ✅ Autocompletado < 50ms
- [ ] ✅ Sin fugas de memoria
- [ ] ✅ Elasticsearch cluster healthy

### Checklist de UX
- [ ] ✅ Feedback visual durante búsqueda (spinner)
- [ ] ✅ Mensajes de error claros
- [ ] ✅ Resultados destacan texto buscado
- [ ] ✅ Responsive en mobile
