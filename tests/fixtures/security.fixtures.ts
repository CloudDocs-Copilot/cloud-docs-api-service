/**
 * Security Fixtures
 * Datos de prueba para validaciones de seguridad
 */

/**
 * URLs privadas/maliciosas para pruebas SSRF
 */
export const ssrfUrls = [
  {
    url: 'http://127.0.0.1/admin',
    description: 'Localhost IPv4',
    shouldBeValid: false
  },
  {
    url: 'http://10.0.0.1/internal',
    description: 'Private network 10.x',
    shouldBeValid: false
  },
  {
    url: 'http://192.168.1.1/router',
    description: 'Private network 192.168.x',
    shouldBeValid: false
  },
  {
    url: 'http://169.254.169.254/latest/meta-data/',
    description: 'AWS metadata endpoint',
    shouldBeValid: false
  },
  {
    url: 'http://[::1]/admin',
    description: 'IPv6 localhost',
    shouldBeValid: false
  },
  {
    url: 'http://[fe80::1]/internal',
    description: 'IPv6 link-local',
    shouldBeValid: false
  }
];

/**
 * URLs públicas válidas
 */
export const validPublicUrls = [
  {
    url: 'https://example.com',
    description: 'Valid HTTPS URL',
    shouldBeValid: true
  },
  {
    url: 'http://google.com/search',
    description: 'Valid HTTP URL',
    shouldBeValid: true
  },
  {
    url: 'https://github.com/user/repo',
    description: 'GitHub repository',
    shouldBeValid: true
  },
  {
    url: 'https://api.example.com/v1/endpoint',
    description: 'API endpoint',
    shouldBeValid: true
  }
];

/**
 * URLs con puertos bloqueados
 */
export const blockedPortUrls = [
  {
    url: 'http://example.com:22/ssh',
    port: 22,
    description: 'SSH port',
    shouldBeValid: false
  },
  {
    url: 'http://example.com:3306/mysql',
    port: 3306,
    description: 'MySQL port',
    shouldBeValid: false
  },
  {
    url: 'http://example.com:27017/mongo',
    port: 27017,
    description: 'MongoDB port',
    shouldBeValid: false
  },
  {
    url: 'http://example.com:6379/redis',
    port: 6379,
    description: 'Redis port',
    shouldBeValid: false
  }
];

/**
 * URLs con protocolos inválidos
 */
export const invalidProtocolUrls = [
  {
    url: 'file:///etc/passwd',
    protocol: 'file',
    description: 'File protocol',
    shouldBeValid: false
  },
  {
    url: 'ftp://ftp.example.com/files',
    protocol: 'ftp',
    description: 'FTP protocol',
    shouldBeValid: false
  },
  {
    url: 'javascript:alert(1)',
    protocol: 'javascript',
    description: 'JavaScript protocol',
    shouldBeValid: false
  },
  {
    url: 'data:text/html,<script>alert(1)</script>',
    protocol: 'data',
    description: 'Data protocol',
    shouldBeValid: false
  }
];

/**
 * Whitelist de dominios para pruebas
 */
export const domainWhitelist = ['example.com', 'trusted-site.com', 'api.service.com'];

/**
 * Patrones de path traversal
 */
export const pathTraversalPatterns = [
  {
    pattern: '../../../etc/passwd',
    description: 'Unix path traversal',
    shouldBeValid: false
  },
  {
    pattern: '..\\..\\..\\windows\\system32',
    description: 'Windows path traversal',
    shouldBeValid: false
  },
  {
    pattern: '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    description: 'URL encoded traversal',
    shouldBeValid: false
  },
  {
    pattern: '..%252f..%252f..%252fetc%252fpasswd',
    description: 'Double URL encoded',
    shouldBeValid: false
  },
  {
    pattern: 'normal/path/file.txt',
    description: 'Normal valid path',
    shouldBeValid: true
  }
];

/**
 * Caracteres peligrosos en paths
 */
export const dangerousPathCharacters = [
  {
    path: 'file<test>.txt',
    character: '<>',
    description: 'Angle brackets',
    shouldBeValid: false
  },
  {
    path: 'file|command.txt',
    character: '|',
    description: 'Pipe character',
    shouldBeValid: false
  },
  {
    path: 'file:stream.txt',
    character: ':',
    description: 'Colon (NTFS stream)',
    shouldBeValid: false
  },
  {
    path: 'file?.txt',
    character: '?',
    description: 'Question mark',
    shouldBeValid: false
  },
  {
    path: 'file*.txt',
    character: '*',
    description: 'Asterisk wildcard',
    shouldBeValid: false
  },
  {
    path: 'normal-file_123.txt',
    character: 'none',
    description: 'Safe characters only',
    shouldBeValid: true
  }
];

/**
 * Directorios base para pruebas
 */
export const baseDirectories = {
  uploads: 'uploads',
  storage: 'storage',
  temp: 'temp'
};
