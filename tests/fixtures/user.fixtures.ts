/**
 * User Fixtures
 * Datos de prueba predefinidos para usuarios
 */

export interface UserFixture {
  name: string;
  email: string;
  password: string;
}

/**
 * Usuario básico de prueba
 */
export const basicUser: UserFixture = {
  name: 'Usuario Test',
  email: 'test@example.com',
  password: 'Test@1234'
};

/**
 * Usuario para pruebas de autenticación
 */
export const authUser: UserFixture = {
  name: 'Auth User',
  email: 'auth@example.com',
  password: 'Auth@1234'
};

/**
 * Usuario para pruebas de documentos
 */
export const docUser: UserFixture = {
  name: 'Doc User',
  email: 'doc-test@example.com',
  password: 'DocTest@123'
};

/**
 * Usuario para pruebas de carpetas
 */
export const folderUser: UserFixture = {
  name: 'Folder User',
  email: 'folder-test@example.com',
  password: 'Folder@123'
};

/**
 * Usuario para pruebas de seguridad
 */
export const securityUser: UserFixture = {
  name: 'Security Test User',
  email: 'security@test.com',
  password: 'Secure@123'
};

/**
 * Segundo usuario para pruebas de compartir documentos
 */
export const secondUser: UserFixture = {
  name: 'Usuario 2',
  email: 'user2@example.com',
  password: 'User2@123'
};

/**
 * Array de usuarios con contraseñas débiles para validación
 */
export const weakPasswordUsers = [
  {
    name: 'Test User',
    email: 'test1@example.com',
    password: 'weakpass123!',
    expectedError: 'uppercase'
  },
  {
    name: 'Test User',
    email: 'test2@example.com',
    password: 'WEAKPASS123!',
    expectedError: 'lowercase'
  },
  {
    name: 'Test User',
    email: 'test3@example.com',
    password: 'WeakPass!',
    expectedError: 'number'
  },
  {
    name: 'Test User',
    email: 'test4@example.com',
    password: 'WeakPass123',
    expectedError: 'special character'
  },
  {
    name: 'Test User',
    email: 'test5@example.com',
    password: 'Wp1!',
    expectedError: 'at least 8 characters'
  },
  {
    name: 'Test User',
    email: 'test6@example.com',
    password: 'Weak Pass123!',
    expectedError: 'whitespace'
  }
];

/**
 * Usuario con contraseña fuerte
 */
export const strongPasswordUser: UserFixture = {
  name: 'Strong Pass User',
  email: 'strong@example.com',
  password: 'StrongP@ss123!'
};
