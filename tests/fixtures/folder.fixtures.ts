/**
 * Folder Fixtures
 * Datos de prueba predefinidos para carpetas
 */

export interface FolderFixture {
  name: string;
  parent?: string;
}

/**
 * Carpeta básica
 */
export const basicFolder: FolderFixture = {
  name: 'Mi Carpeta'
};

/**
 * Carpetas para pruebas de listado
 */
export const multipleFolders: FolderFixture[] = [
  { name: 'Carpeta 1' },
  { name: 'Carpeta 2' },
  { name: 'Carpeta 3' }
];

/**
 * Carpeta para pruebas de duplicación
 */
export const duplicateFolder: FolderFixture = {
  name: 'Duplicada'
};

/**
 * Carpetas con nombres especiales
 */
export const specialFolders: FolderFixture[] = [
  { name: 'Carpeta con espacios' },
  { name: 'Carpeta-con-guiones' },
  { name: 'Carpeta_con_guiones_bajos' },
  { name: 'Carpeta123' },
  { name: '📁 Carpeta con emoji' }
];

/**
 * Carpeta para renombrar
 */
export const renameableFolder: FolderFixture = {
  name: 'Carpeta Original'
};

/**
 * Nuevo nombre para carpeta
 */
export const renamedFolder: FolderFixture = {
  name: 'Carpeta Renombrada'
};
