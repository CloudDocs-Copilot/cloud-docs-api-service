import express from 'express';
import membershipRoutes from '../../../src/routes/membership.routes';

describe('Membership Routes', (): void => {
  let router: express.Router;

  beforeEach(() => {
    // Arrange
    router = membershipRoutes;
  });

  describe('Route Configuration', (): void => {
    it('should export an Express router', (): void => {
      // Arrange
      // (router already assigned in beforeEach)

      // Act
      const isRouter = router && typeof router === 'function';

      // Assert
      expect(isRouter).toBe(true);
      expect(router.stack).toBeDefined();
    });

    it('should have configured GET /pending-invitations route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/pending-invitations');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should have configured POST /invitations/:membershipId/accept route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/invitations/:membershipId/accept');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should have configured GET /my-organizations route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/my-organizations');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should apply middleware to routes', (): void => {
      // Arrange
      const middlewares = router.stack.filter((layer) => !layer.route && layer.handle);

      // Act
      const hasMiddleware = middlewares.length > 0;

      // Assert
      expect(hasMiddleware).toBe(true);
    });
  });
});
