/**
 * Folder Builder
 * Constructor de carpetas de prueba con patrón builder
 */

interface FolderData {
  name: string;
  parent?: string;
  description?: string;
}

export class FolderBuilder {
  private folderData: FolderData = {
    name: 'Default Folder'
  };

  /**
   * Establece el nombre de la carpeta
   */
  withName(name: string): FolderBuilder {
    this.folderData.name = name;
    return this;
  }

  /**
   * Establece el ID de la carpeta padre
   */
  withParent(parentId: string): FolderBuilder {
    this.folderData.parent = parentId;
    return this;
  }

  /**
   * Establece una descripción
   */
  withDescription(description: string): FolderBuilder {
    this.folderData.description = description;
    return this;
  }

  /**
   * Genera un nombre único basado en timestamp
   */
  withUniqueName(prefix: string = 'folder'): FolderBuilder {
    const timestamp = Date.now();
    this.folderData.name = `${prefix}-${timestamp}`;
    return this;
  }

  /**
   * Crea una carpeta raíz (sin padre)
   */
  asRoot(): FolderBuilder {
    delete this.folderData.parent;
    return this;
  }

  /**
   * Crea una carpeta con nombre especial (espacios, caracteres)
   */
  withSpecialCharacters(): FolderBuilder {
    this.folderData.name = 'Carpeta con Espacios-123_test';
    return this;
  }

  /**
   * Crea una carpeta con emoji
   */
  withEmoji(): FolderBuilder {
    this.folderData.name = '📁 Carpeta Importante';
    return this;
  }

  /**
   * Construye y retorna el objeto carpeta
   */
  build(): FolderData {
    return { ...this.folderData };
  }

  /**
   * Retorna solo los datos necesarios para crear una carpeta
   */
  buildCreateData(): Pick<FolderData, 'name' | 'parent'> {
    const data: Pick<FolderData, 'name' | 'parent'> = {
      name: this.folderData.name
    };
    
    if (this.folderData.parent) {
      data.parent = this.folderData.parent;
    }
    
    return data;
  }

  /**
   * Crea múltiples carpetas
   */
  static buildMany(count: number, prefix: string = 'Carpeta'): FolderData[] {
    const folders: FolderData[] = [];
    for (let i = 0; i < count; i++) {
      folders.push(
        new FolderBuilder()
          .withName(`${prefix} ${i + 1}`)
          .build()
      );
    }
    return folders;
  }

  /**
   * Crea una jerarquía de carpetas (padre-hijo)
   */
  static buildHierarchy(levels: number, prefix: string = 'Level'): FolderData[] {
    const folders: FolderData[] = [];
    let previousId: string | undefined;

    for (let i = 0; i < levels; i++) {
      const builder = new FolderBuilder().withName(`${prefix} ${i + 1}`);
      
      if (previousId) {
        builder.withParent(previousId);
      }
      
      const folder = builder.build();
      folders.push(folder);
      
      // Simular ID para el siguiente nivel
      previousId = `folder-id-${i + 1}`;
    }

    return folders;
  }
}

/**
 * Función helper para crear una carpeta básica rápidamente
 */
export const createFolder = (overrides?: Partial<FolderData>): FolderData => {
  const builder = new FolderBuilder();
  
  if (overrides?.name) builder.withName(overrides.name);
  if (overrides?.parent) builder.withParent(overrides.parent);
  if (overrides?.description) builder.withDescription(overrides.description);
  
  return builder.build();
};
