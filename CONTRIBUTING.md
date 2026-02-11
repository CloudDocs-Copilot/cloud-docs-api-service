# Contributing to CloudDocs API Service

Thank you for your interest in contributing to CloudDocs! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Docker and Docker Compose (recommended)
- Git

### Development Setup

#### Option 1: Docker (Recommended)

The easiest way to get started is using Docker Compose from the project root:

```bash
# From the workspace root (parent of cloud-docs-api-service)
cp .env.example .env
docker-compose up -d

# Backend available at http://localhost:4000
# API docs at http://localhost:4000/api/docs
```

#### Option 2: Local Development

1. **Clone and install dependencies:**

   ```bash
   cd cloud-docs-api-service
   npm install
   ```

2. **Set up environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

3. **Start MongoDB (Docker):**

   ```bash
   docker run -d --name mongodb -p 27017:27017 mongo:6.0
   ```

4. **Start the development server:**

   ```bash
   npm run dev
   ```

5. **Verify it's running:**
   ```bash
   curl http://localhost:4000/api
   # Should return: {"message":"API running"}
   ```

### Project Structure

```
src/
├── index.ts          # Entry point
├── app.ts            # Express configuration
├── routes/           # API endpoints
├── controllers/      # Request handlers
├── services/         # Business logic
├── models/           # Database schemas
├── middlewares/      # Auth, validation, etc.
└── utils/            # Helper functions
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed documentation.

## Code Style

### TypeScript Guidelines

- **Strict mode enabled** - All code must pass strict type checking
- **No `any`** - Use `unknown` when type is truly unknown
- **Explicit return types** - Always type function returns
- **Interface over type** - Prefer `interface` for object shapes

### Naming Conventions

| Type       | Convention              | Example           |
| ---------- | ----------------------- | ----------------- |
| Files      | kebab-case              | `user.service.ts` |
| Classes    | PascalCase              | `UserService`     |
| Interfaces | PascalCase + `I` prefix | `IUser`           |
| Functions  | camelCase               | `getUserById`     |
| Constants  | SCREAMING_SNAKE_CASE    | `MAX_FILE_SIZE`   |
| Variables  | camelCase               | `userData`        |

### File Organization

```typescript
// 1. Imports (external first, then internal)
import express from 'express';
import mongoose from 'mongoose';

import { UserService } from '../services/user.service';
import type { IUser } from '../models/types/user.types';

// 2. Constants
const MAX_RETRIES = 3;

// 3. Types/Interfaces (if local to file)
interface RequestParams {
  id: string;
}

// 4. Main code
export class UserController {
  // ...
}
```

### Error Handling

Always use the `HttpError` class for API errors:

```typescript
import HttpError from '../models/error.model';

// In controllers/services
if (!user) {
  throw new HttpError(404, 'User not found');
}
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or fixing tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(auth): add password reset functionality
fix(documents): handle empty file upload error
docs(readme): update installation instructions
test(users): add unit tests for user service
```

## Pull Request Process

1. **Create a branch:**

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Write tests** for new functionality

4. **Run checks locally:**

   ```bash
   npm run format      # Format code
   npm test            # Run tests
   npm run build       # Verify TypeScript compiles
   ```

5. **Push and create PR:**

   ```bash
   git push origin feat/your-feature-name
   ```

6. **Fill out the PR template** with:
   - Description of changes
   - Related issue (if any)
   - Screenshots (for UI changes)
   - Checklist confirmation

### PR Requirements

- [ ] Tests pass (`npm test`)
- [ ] Code compiles (`npm run build`)
- [ ] Code is formatted (`npm run format`)
- [ ] New features have tests
- [ ] Documentation updated if needed

## Testing

### Running Tests

```bash
# All tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

### Writing Tests

We use Jest with the following structure:

```typescript
// tests/unit/services/user.service.test.ts
import { UserService } from '../../../src/services/user.service';
import { UserBuilder } from '../../builders/user.builder';

describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const user = new UserBuilder().build();

      // Act
      const result = await UserService.getUserById(user._id);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(user.email);
    });

    it('should throw error when user not found', async () => {
      // Act & Assert
      await expect(UserService.getUserById('invalid-id')).rejects.toThrow('User not found');
    });
  });
});
```

### Test Builders

Use builders from `tests/builders/` for test data:

```typescript
import { UserBuilder, OrganizationBuilder } from '../builders';

const user = new UserBuilder().withEmail('test@example.com').withRole('admin').build();

const org = new OrganizationBuilder().withPlan('PREMIUM').build();
```

## Questions?

- Check existing [documentation](docs/)
- Open an issue for bugs or feature requests
- Reach out to maintainers

Thank you for contributing! 🎉
