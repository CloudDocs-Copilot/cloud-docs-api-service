/**
 * Utilidad para validación de contraseñas seguras
 * Implementa requisitos de seguridad estándar para contraseñas
 */

/**
 * Interfaz para el resultado de validación de contraseña
 */
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Configuración de requisitos de contraseña
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+\\-=\\[\\]{};:\'",.<>?/|`~',
};

/**
 * Valida que una contraseña cumpla con los requisitos de seguridad
 * 
 * Requisitos:
 * - Longitud mínima de 8 caracteres
 * - Longitud máxima de 128 caracteres
 * - Al menos una letra mayúscula
 * - Al menos una letra minúscula
 * - Al menos un número
 * - Al menos un carácter especial
 * - Sin espacios en blanco
 * 
 * @param password - Contraseña a validar
 * @returns Resultado de validación con errores si los hay
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Validar que existe la contraseña
  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  // Validar tipo de dato
  if (typeof password !== 'string') {
    errors.push('Password must be a string');
    return { isValid: false, errors };
  }

  // Validar longitud mínima
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
  }

  // Validar longitud máxima
  if (password.length > PASSWORD_REQUIREMENTS.maxLength) {
    errors.push(`Password must not exceed ${PASSWORD_REQUIREMENTS.maxLength} characters`);
  }

  // Validar que no contenga espacios en blanco
  if (/\s/.test(password)) {
    errors.push('Password must not contain whitespace characters');
  }

  // Validar letra mayúscula
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z)');
  }

  // Validar letra minúscula
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z)');
  }

  // Validar número
  if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number (0-9)');
  }

  // Validar carácter especial
  if (PASSWORD_REQUIREMENTS.requireSpecialChars) {
    const specialCharsRegex = new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars}]`);
    if (!specialCharsRegex.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>?/`~)');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Valida una contraseña y lanza una excepción si no es válida
 * Útil para usar en servicios donde se espera que falle con error
 * 
 * @param password - Contraseña a validar
 * @throws Error con mensaje descriptivo de validación
 */
export function validatePasswordOrThrow(password: string): void {
  const result = validatePassword(password);
  
  if (!result.isValid) {
    const errorMessage = result.errors.join('. ');
    throw new Error(`Password validation failed: ${errorMessage}`);
  }
}

/**
 * Genera un mensaje de requisitos de contraseña para mostrar al usuario
 * 
 * @returns String con los requisitos de contraseña
 */
export function getPasswordRequirementsMessage(): string {
  const requirements = [
    `At least ${PASSWORD_REQUIREMENTS.minLength} characters long`,
    'At least one uppercase letter (A-Z)',
    'At least one lowercase letter (a-z)',
    'At least one number (0-9)',
    'At least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>?/`~)',
    'No whitespace characters',
  ];

  return `Password requirements:\n- ${requirements.join('\n- ')}`;
}
