import { request, app } from '../setup';
import { mediumDelay, registerAndLogin, bodyOf } from '../helpers';
import { weakPasswordUsers, strongPasswordUser } from '../fixtures';
import { UserBuilder } from '../builders';

/**
 * Tests de validación de contraseñas
 * Prueba que las contraseñas cumplan con los requisitos de seguridad
 */
describe('Password Validation', (): void => {
  describe('POST /api/auth/register - Password Strength', (): void => {
    // Agregar delay entre cada test para evitar rate limiting
    afterEach(async () => {
      await mediumDelay();
    });

    // Tests dinámicos usando fixture de contraseñas débiles
    weakPasswordUsers.forEach(testCase => {
      it(`should reject password: ${testCase.expectedError}`, async (): Promise<void> => {
        const response = await request(app).post('/api/auth/register').send(testCase).expect(400);
        const body = bodyOf(response) as Record<string, unknown>;
        expect((body['error'] as string)).toContain(testCase.expectedError);
      });
    });

    it('should accept strong password', async (): Promise<void> => {
      // Crear organización de prueba primero
      const auth = await registerAndLogin();

      const user = new UserBuilder()
        .withUniqueEmail('strong')
        .withPassword(strongPasswordUser.password)
        .withOrganizationId(auth.organizationId!)
        .build();

      const response = await request(app).post('/api/auth/register').send(user).expect(201);
      const body = bodyOf(response) as Record<string, unknown>;
      expect(body['user']).toBeDefined();
      const userObj = body['user'] as Record<string, unknown>;
      expect(userObj['email']).toBe(user.email);
    });
  });

  describe('PATCH /api/users/:id/password - Change Password Validation', (): void => {
    it('should reject weak new password', async (): Promise<void> => {
      // Register and login user for this test
      const oldPassword = 'OldPass@123';
      const auth = await registerAndLogin({
        name: 'Test User 1',
        email: 'changepass1@example.com',
        password: oldPassword
      });

      const response = await request(app)
        .patch(`/api/users/${auth.userId}/password`)
        .set(
          'Cookie',
          auth.cookies.find((c: string) => c.startsWith('token='))?.split(';')[0] || ''
        )
        .send({
          currentPassword: oldPassword,
          newPassword: 'weak' // Contraseña débil
        })
        .expect(400);

      const body = bodyOf(response) as Record<string, unknown>;
      expect((body['error'] as string)).toContain('Password validation failed');
    });

    it('should reject new password without special character', async (): Promise<void> => {
      // Register and login user for this test
      const oldPassword = 'OldPass@123';
      const auth = await registerAndLogin({
        name: 'Test User 2',
        email: 'changepass2@example.com',
        password: oldPassword
      });

      const response = await request(app)
        .patch(`/api/users/${auth.userId}/password`)
        .set(
          'Cookie',
          auth.cookies.find((c: string) => c.startsWith('token='))?.split(';')[0] || ''
        )
        .send({
          currentPassword: oldPassword,
          newPassword: 'NewPassword123' // Sin carácter especial
        })
        .expect(400);

      const body = bodyOf(response) as Record<string, unknown>;
      expect((body['error'] as string)).toContain('special character');
    });

    it('should accept strong new password', async (): Promise<void> => {
      // Register and login user for this test
      const oldPassword = 'OldPass@123';
      const auth = await registerAndLogin({
        name: 'Test User 3',
        email: 'changepass3@example.com',
        password: oldPassword
      });

      const response = await request(app)
        .patch(`/api/users/${auth.userId}/password`)
        .set(
          'Cookie',
          auth.cookies.find((c: string) => c.startsWith('token='))?.split(';')[0] || ''
        )
        .send({
          currentPassword: oldPassword,
          newPassword: 'NewStrong@Pass456'
        })
        .expect(200);

      const body = bodyOf(response) as Record<string, unknown>;
      expect((body['message'] as string)).toBe('Password updated successfully');
    });
  });
});
