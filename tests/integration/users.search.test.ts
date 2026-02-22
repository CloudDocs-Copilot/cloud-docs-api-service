import { request, app } from '../setup';
import User from '../../src/models/user.model';
import { signToken } from '../../src/services/jwt.service';

describe('GET /api/users/search', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/users/search?email=test');
    expect(res.status).toBe(401);
  });

  it('returns 400 when email query missing or empty', async () => {
    const user = await User.create({
      name: 'Tester',
      email: 't@test.com',
      password: 'Password1!',
      role: 'user',
      active: true
    });
    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion
    });

    const res = await request(app).get('/api/users/search').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns matching users for authenticated request', async () => {
    // Crear usuarios de prueba
    const u1 = await User.create({
      name: 'María Pérez',
      email: 'maria.perez@example.com',
      password: 'Password1!',
      role: 'user',
      active: true
    });
    const u2 = await User.create({
      name: 'Juan López',
      email: 'juan.lopez@example.com',
      password: 'Password1!',
      role: 'user',
      active: true
    });

    // Autenticarse como u1 para buscar a u2
    const token = signToken({
      id: u1._id.toString(),
      email: u1.email,
      role: u1.role,
      tokenVersion: u1.tokenVersion
    });

    // Buscar por email completo de u2 (la búsqueda es coincidencia exacta, no parcial)
    // El usuario autenticado (u1) se excluye automáticamente de los resultados
    const res = await request(app)
      .get('/api/users/search')
      .query({ email: u2.email })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((x: any) => x.email === u2.email)).toBe(true);
  });
});
