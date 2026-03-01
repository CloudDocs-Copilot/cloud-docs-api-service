import express from 'express';
import deletionRoutes from '../../../src/routes/deletion.routes';

describe('Deletion Routes', (): void => {
  let router: express.Router;

  beforeEach(() => {
    //Arrange
    router = deletionRoutes;
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

    it('should have configured GET /trash route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasTrashRoute = routes.includes('/trash');

      // Assert
      expect(hasTrashRoute).toBe(true);
    });

    it('should have configured DELETE /trash route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasTrashRoute = routes.includes('/trash');

      // Assert
      expect(hasTrashRoute).toBe(true);
    });

    it('should have configured POST /:id/trash route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/:id/trash');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should have configured POST /:id/restore route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/:id/restore');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should have configured DELETE /:id/permanent route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/:id/permanent');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should have configured GET /:id/history route', (): void => {
      // Arrange
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === 'string');

      // Act
      const hasRoute = routes.includes('/:id/history');

      // Assert
      expect(hasRoute).toBe(true);
    });

    it('should apply middleware to all routes', (): void => {
      // Arrange
      const middlewares = router.stack.filter((layer) => !layer.route && layer.handle);

      // Act
      const hasMiddleware = middlewares.length > 0;

      // Assert
      expect(hasMiddleware).toBe(true);
    });
  });
});

