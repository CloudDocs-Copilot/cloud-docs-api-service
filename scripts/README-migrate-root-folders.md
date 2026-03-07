# Migración: Actualizar displayName de rootFolders

## 📋 Problema

Los rootFolders creados **antes** de la implementación del cambio tienen `displayName: 'root'` en lugar del nombre de la organización.

Los rootFolders creados **después** del cambio sí tienen el `displayName` correcto con el nombre de la organización.

Esto causa inconsistencia en la UI donde algunos usuarios ven el nombre de su organización en el rootFolder y otros ven "root".

## ✨ Solución

Este script de migración actualiza todos los rootFolders existentes para que su `displayName` sea igual al nombre de su organización (`org.name`).

## 🚀 Uso

### 1. Preview (Dry-run)

Ver qué cambios se harían **sin ejecutarlos**:

```bash
npm run migrate:root-folders
```

o directamente:

```bash
ts-node scripts/migrate-root-folder-names.ts
```

### 2. Ejecutar migración

Para aplicar los cambios realmente:

```bash
npm run migrate:root-folders -- --execute
```

o directamente:

```bash
ts-node scripts/migrate-root-folder-names.ts --execute
```

## 📊 Output esperado

### Dry-run:
```
╔════════════════════════════════════════════════════════════╗
║   Migración: Actualizar displayName de rootFolders        ║
╚════════════════════════════════════════════════════════════╝

🔍 MODO DRY-RUN (preview)
   No se harán cambios en la base de datos
   Para ejecutar: npm run migrate:root-folders -- --execute

🔌 Conectando a MongoDB...
✅ Conectado a MongoDB

🔍 Buscando rootFolders...

📊 Encontrados 5 rootFolders

📝 Folder 507f1f77bcf86cd799439011:
   Organización: Acme Corp
   displayName actual: "root"
   displayName nuevo:  "Acme Corp"
   🔍 [DRY-RUN] No se ejecutó

⏭️  Folder 507f191e810c19729de860ea: displayName ya es correcto ("TechStart")

╔════════════════════════════════════════════════════════════╗
║                    RESULTADOS                              ║
╚════════════════════════════════════════════════════════════╝
✅ Éxitos:   4
⏭️  Omitidos: 1
❌ Errores:  0

💡 Para aplicar los cambios, ejecuta:
   npm run migrate:root-folders -- --execute
```

### Ejecución real:
```
╔════════════════════════════════════════════════════════════╗
║   Migración: Actualizar displayName de rootFolders        ║
╚════════════════════════════════════════════════════════════╝

⚠️  MODO EJECUCIÓN
   Se actualizarán los rootFolders en la base de datos

🔌 Conectando a MongoDB...
✅ Conectado a MongoDB

🔍 Buscando rootFolders...

📊 Encontrados 5 rootFolders

📝 Folder 507f1f77bcf86cd799439011:
   Organización: Acme Corp
   displayName actual: "root"
   displayName nuevo:  "Acme Corp"
   ✅ Actualizado

╔════════════════════════════════════════════════════════════╗
║                    RESULTADOS                              ║
╚════════════════════════════════════════════════════════════╝
✅ Éxitos:   4
⏭️  Omitidos: 1
❌ Errores:  0

🔌 Desconectado de MongoDB
```

## 🔍 Qué hace el script

1. Busca todos los folders con `type: 'root'` y `parent: null`
2. Para cada rootFolder:
   - Obtiene su organización
   - Compara `displayName` actual con `org.name`
   - Si son diferentes, actualiza `displayName = org.name`
   - Si ya son iguales, lo omite
3. Muestra un resumen de éxitos, omitidos y errores

## ⚠️ Consideraciones

- **Seguro**: El script incluye modo dry-run por defecto
- **Idempotente**: Se puede ejecutar múltiples veces sin problema
- **No destructivo**: Solo actualiza `displayName`, no toca otros campos
- **Reversible**: Si es necesario revertir, se puede hacer manualmente

## 🧪 Testing

Antes de ejecutar en producción:

1. Ejecutar en ambiente de desarrollo con dry-run
2. Verificar el output
3. Ejecutar con `--execute` en desarrollo
4. Verificar que los cambios son correctos en la UI
5. Solo entonces ejecutar en producción

## 📝 Código relacionado

- **Creación de rootFolder**: [src/services/folder.service.ts:155](../src/services/folder.service.ts#L155)
  ```typescript
  const rootFolder = await Folder.create({
    name: 'root',
    displayName: org.name, // ✅ Nuevo comportamiento
    type: 'root',
    // ...
  });
  ```

- **Restricción de renombrado**: [src/services/folder.service.ts:688](../src/services/folder.service.ts#L688)
  ```typescript
  if (folder.type === 'root') {
    throw new HttpError(400, 'No se puede renombrar la carpeta ROOT');
  }
  ```

## 🐛 Troubleshooting

### Error: "Cannot find module"
```bash
npm install
npm run build
```

### Error: "MONGO_URI not defined"
Asegúrate de tener el archivo `.env` con:
```env
MONGO_URI=mongodb://localhost:27017/clouddocs
```

### Quiero revertir los cambios
Puedes crear un script similar o hacerlo manualmente:
```javascript
await Folder.updateMany(
  { type: 'root' },
  { $set: { displayName: 'root' } }
);
```

## 📚 Referencias

- Issue: Usuarios owner creados antes del cambio no ven el nombre de la organización
- Commit: feat: agregar soporte para archivos .ppt en plan FREE
- PR: #[número]
