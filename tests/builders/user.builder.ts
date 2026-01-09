/**
 * User Builder
 * Constructor de usuarios de prueba con patrón builder
 */

interface UserData {
  name: string;
  email: string;
  password: string;
  organizationId?: string;
}

export class UserBuilder {
  private userData: UserData = {
    name: 'Default User',
    email: 'default@example.com',
    password: 'Default@123',
    organizationId: 'test-org-default'
  };

  /**
   * Establece el nombre del usuario
   */
  withName(name: string): UserBuilder {
    this.userData.name = name;
    return this;
  }

  /**
   * Establece el email del usuario
   */
  withEmail(email: string): UserBuilder {
    this.userData.email = email;
    return this;
  }

  /**
   * Establece la contraseña del usuario
   */
  withPassword(password: string): UserBuilder {
    this.userData.password = password;
    return this;
  }

  /**
   * Establece el organizationId del usuario
   */
  withOrganizationId(organizationId: string): UserBuilder {
    this.userData.organizationId = organizationId;
    return this;
  }

  /**
   * Genera un email único basado en timestamp
   */
  withUniqueEmail(prefix: string = 'user'): UserBuilder {
    const timestamp = Date.now();
    this.userData.email = `${prefix}-${timestamp}@example.com`;
    this.userData.organizationId = `test-org-${timestamp}`;
    return this;
  }

  /**
   * Crea un usuario con contraseña débil (sin mayúsculas)
   */
  withWeakPassword(): UserBuilder {
    this.userData.password = 'weakpass123!';
    return this;
  }

  /**
   * Crea un usuario con contraseña fuerte
   */
  withStrongPassword(): UserBuilder {
    this.userData.password = 'StrongP@ss123!';
    return this;
  }

  /**
   * Crea un usuario administrador
   */
  asAdmin(): UserBuilder {
    this.userData.name = 'Admin User';
    this.userData.email = 'admin@example.com';
    return this;
  }

  /**
   * Construye y retorna el objeto usuario
   */
  build(): UserData {
    return { ...this.userData };
  }

  /**
   * Retorna solo los datos de registro (sin campos adicionales)
   */
  buildRegistrationData(): UserData {
    return {
      name: this.userData.name,
      email: this.userData.email,
      password: this.userData.password,
      organizationId: this.userData.organizationId
    };
  }

  /**
   * Retorna solo los datos de login
   */
  buildLoginData(): Pick<UserData, 'email' | 'password'> {
    return {
      email: this.userData.email,
      password: this.userData.password
    };
  }

  /**
   * Crea múltiples usuarios con emails únicos
   */
  static buildMany(count: number, prefix: string = 'user'): UserData[] {
    const users: UserData[] = [];
    for (let i = 0; i < count; i++) {
      users.push(
        new UserBuilder()
          .withName(`${prefix} ${i + 1}`)
          .withEmail(`${prefix}${i + 1}@example.com`)
          .withStrongPassword()
          .build()
      );
    }
    return users;
  }
}

/**
 * Función helper para crear un usuario básico rápidamente
 */
export const createUser = (overrides?: Partial<UserData>): UserData => {
  const builder = new UserBuilder();
  
  if (overrides?.name) builder.withName(overrides.name);
  if (overrides?.email) builder.withEmail(overrides.email);
  if (overrides?.password) builder.withPassword(overrides.password);
  if (overrides?.organizationId) builder.withOrganizationId(overrides.organizationId);
  
  return builder.build();
};
