# AGENTS.md - Agentic Coding Rules

This document defines rules and guidelines for AI coding agents working on the CloudDocs API Service.

## Project Overview

- **Type:** REST API backend
- **Stack:** Node.js 20+, Express.js, TypeScript 5.x, MongoDB (Mongoose), Elasticsearch (optional)
- **Architecture:** Layered (Routes → Controllers → Services → Models)
- **Auth:** JWT tokens + CSRF protection

## Directory Structure

```schema
src/
├── configurations/     # External service configs (DB, CORS, ES)
├── controllers/        # HTTP request handlers - validate & delegate
├── middlewares/        # Auth, CSRF, rate-limit, validation
├── models/            # Mongoose schemas + TypeScript types
├── routes/            # Express route definitions
├── services/          # Business logic - data access, transactions
├── utils/             # Pure helper functions
├── mail/              # Email templates and service
└── docs/              # OpenAPI specification
```

## Code Patterns

### Controllers

Controllers handle HTTP concerns only - parsing requests and formatting responses:

```typescript
// ✅ Good - controller delegates to service
export const createDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, folderId } = req.body;
    const userId = req.user.id;

    const document = await documentService.create({ filename, folderId, userId });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
};

// ❌ Bad - business logic in controller
export const createDocument = async (req: Request, res: Response) => {
  const document = new Document(req.body);
  await document.save(); // Should be in service
  res.json(document);
};
```

### Services

Services contain business logic and data access:

```typescript
// ✅ Good - service handles business rules
export const documentService = {
  async create(data: CreateDocumentDto): Promise<IDocument> {
    // Validate business rules
    const folder = await Folder.findById(data.folderId);
    if (!folder) {
      throw new HttpError(404, 'Folder not found');
    }

    // Check quota
    const usage = await this.getStorageUsage(data.userId);
    if (usage >= MAX_STORAGE) {
      throw new HttpError(400, 'Storage quota exceeded');
    }

    // Create document
    return Document.create(data);
  }
};
```

### Models

Use Mongoose schemas with TypeScript interfaces:

```typescript
// models/document.model.ts
export interface IDocument extends mongoose.Document {
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  folder?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new mongoose.Schema<IDocument>(
  {
    filename: { type: String, required: true },
    mimeType: { type: String, required: true }
    // ...
  },
  { timestamps: true }
);

export const Document = mongoose.model<IDocument>('Document', documentSchema);
```

### Error Handling

Always use HttpError for API errors:

```typescript
import HttpError from '../models/error.model';

// Throw with status code and message
throw new HttpError(404, 'Document not found');
throw new HttpError(403, 'Access denied');
throw new HttpError(400, 'Invalid file type');

// Error middleware handles formatting response
```

### Middlewares

Chain middlewares in routes:

```typescript
// routes/document.routes.ts
router.post(
  '/',
  authenticate, // Verify JWT
  requireOrganization, // Ensure org context
  requireRole(['member', 'admin', 'owner']), // Check permissions
  uploadMiddleware.single('file'), // Handle file upload
  validateRequest(createDocumentSchema), // Validate body
  documentController.create
);
```

## Naming Conventions

| Type             | Convention            | Example                                 |
| ---------------- | --------------------- | --------------------------------------- |
| Files            | kebab-case            | `user.service.ts`, `auth.middleware.ts` |
| Classes          | PascalCase            | `UserService`, `HttpError`              |
| Interfaces       | PascalCase + I prefix | `IUser`, `IDocument`                    |
| Functions        | camelCase             | `getUserById`, `validatePassword`       |
| Constants        | SCREAMING_SNAKE_CASE  | `MAX_FILE_SIZE`, `JWT_EXPIRES_IN`       |
| Environment vars | SCREAMING_SNAKE_CASE  | `MONGO_URI`, `JWT_SECRET`               |

## Linting

**ESLint is configured to enforce code quality and TypeScript best practices.**

### Running ESLint

```bash
# Check for errors and warnings
npm run lint

# Auto-fix fixable issues
npm run lint:fix

# Check with zero warnings tolerance (for CI/CD)
npm run lint:check
```

### Critical Rules (configured as ERROR)

All uses of `any` are **PROHIBITED** and will cause linting to fail:

```typescript
// ❌ WRONG - Will fail linting
catch (error: any) { ... }
function process(data: any) { ... }
const items: any[] = [];

// ✅ CORRECT - Use specific types or unknown
catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}

interface ProcessData {
  id: string;
  name: string;
}
function process(data: ProcessData) { ... }

type Item = { id: string; value: number };
const items: Item[] = [];
```

### Before Committing

Always run `npm run lint` and fix all errors. The following will cause build failures:

- ❌ Using `any` type explicitly
- ❌ Unsafe assignments from `any` values
- ❌ Accessing members on `any` values
- ❌ Calling functions typed as `any`
- ❌ Unused variables (unless prefixed with `_`)

See [ESLINT-SETUP.md](ESLINT-SETUP.md) for complete configuration details.

## Testing

### Test Structure

```schema
tests/
├── unit/              # Isolated unit tests
│   ├── services/
│   └── utils/
├── integration/       # API endpoint tests
├── builders/          # Test data factories
├── fixtures/          # Static test data
└── helpers/           # Test utilities
```

### Test Patterns

```typescript
// Use builders for test data
const user = new UserBuilder()
  .withEmail('test@example.com')
  .withRole('admin')
  .build();

// Use descriptive test names
describe('DocumentService', () => {
  describe('create', () => {
    it('should create document when folder exists and quota not exceeded', async () => {
      // Arrange
      const folder = await FolderBuilder.create();

      // Act
      const doc = await documentService.create({ folderId: folder._id, ... });

      // Assert
      expect(doc).toBeDefined();
      expect(doc.folder).toEqual(folder._id);
    });

    it('should throw 404 when folder not found', async () => {
      await expect(documentService.create({ folderId: 'invalid' }))
        .rejects.toThrow('Folder not found');
    });
  });
});
```

## API Design Rules

1. **RESTful endpoints** - Use nouns, not verbs: `/api/documents`, not `/api/getDocuments`
2. **Consistent responses** - Always return `{ success: boolean, data?: T, error?: string }`
3. **Proper status codes** - 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found
4. **Pagination** - Use `?page=1&limit=20` for list endpoints
5. **Filtering** - Use query params: `?status=active&type=pdf`

## Security Rules

1. **Never trust user input** - Validate and sanitize everything
2. **Use parameterized queries** - Mongoose handles this, but be careful with `$where`
3. **Hash passwords** - Use bcrypt with sufficient rounds (10+)
4. **Protect routes** - Apply auth middleware to all protected endpoints
5. **Validate file uploads** - Check MIME type, size, and sanitize filename
6. **Sanitize paths** - Use path-sanitizer for file operations

## DO NOT

- ❌ Put business logic in controllers
- ❌ Use `any` type - use `unknown` and type guards
- ❌ Commit `.env` files or secrets
- ❌ Use `eval()` or `Function()` constructor
- ❌ Trust user-provided file paths
- ❌ Store sensitive data in JWT payload
- ❌ Skip error handling in async functions
- ❌ Use synchronous file operations in request handlers
- ❌ Merge code that breaks existing tests
- ❌ Add features without corresponding tests

## DO

- ✅ Use async/await with proper try-catch
- ✅ Validate request bodies with schemas
- ✅ Log errors with context (but not sensitive data)
- ✅ Use transactions for multi-document operations
- ✅ Write tests for new features
- ✅ Document API changes in OpenAPI spec
- ✅ Use environment variables for configuration
- ✅ Follow existing code patterns in the codebase
- ✅ Run all tests before committing (`npm test`)
- ✅ Maintain or increase test coverage

## Testing Requirements

### Mandatory Testing Rules

1. **All tests must pass before any code change is merged**

   ```bash
   npm test  # Must exit with code 0
   ```

2. **New features must include tests**
   - Unit tests for services and utilities
   - Integration tests for API endpoints
   - Coverage should not decrease

3. **Bug fixes must include regression tests**
   - Add test that would have caught the bug
   - Verify fix doesn't break existing functionality

4. **Test coverage requirements**

   ```bash
   npm run test:coverage
   ```

   - Minimum overall coverage: 70%
   - New code should have >80% coverage
   - Critical paths (auth, payments) require >90% coverage

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/unit/services/auth.service.test.ts

# Run tests in watch mode (development)
npm run test:watch
```

### Pre-commit Checklist

Before committing any code change:

- [ ] `npm run lint` passes (NO errors related to `any`)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Coverage has not decreased
- [ ] New features have tests
- [ ] OpenAPI spec updated (if API changed)
- [ ] No `any` types in code (use `unknown` or specific types)
