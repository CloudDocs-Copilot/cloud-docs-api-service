# Architecture

This document describes the architecture and code organization of the CloudDocs API Service.

## Overview

CloudDocs API is a multi-tenant document management REST API built with:

- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Language:** TypeScript 5.x
- **Database:** MongoDB 6.0 (Mongoose ODM)
- **Search:** Elasticsearch 8.x (optional)
- **Authentication:** JWT + CSRF protection

## Directory Structure

```
cloud-docs-api-service/
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md             # This file
│   ├── ENDPOINTS-TESTING-GUIDE.md  # API testing guide
│   ├── MOCK-DATA.md                # Development test data docs
│   ├── openapi/                    # API specifications
│   │   └── openapi.json            # OpenAPI 3.0 spec
│   └── rfc/                        # Technical design documents
│       ├── CSRF-PROTECTION.md
│       ├── MULTITENANCY-MIGRATION.md
│       ├── PASSWORD-VALIDATION.md
│       └── SECURITY-FIXES.md
│
├── scripts/                        # Utility scripts
│   └── seed-dev.ts                 # Development data seeding
│
├── src/
│   ├── index.ts                    # Application entry point
│   ├── app.ts                      # Express app configuration
│   │
│   ├── configurations/             # External service configs
│   │   ├── database-config/        # MongoDB connection
│   │   ├── cors-config.ts          # CORS policy
│   │   ├── elasticsearch-config.ts # Search engine client
│   │   └── env-config.ts           # Environment variables loader
│   │
│   ├── routes/                     # HTTP route definitions
│   │   ├── auth.routes.ts          # /api/auth/*
│   │   ├── organization.routes.ts  # /api/organizations/*
│   │   ├── membership.routes.ts    # /api/memberships/*
│   │   ├── document.routes.ts      # /api/documents/*
│   │   ├── folder.routes.ts        # /api/folders/*
│   │   ├── user.routes.ts          # /api/users/*
│   │   └── search.routes.ts        # /api/search/*
│   │
│   ├── controllers/                # Request handlers
│   │   └── *.controller.ts         # Validate input, call services, format response
│   │
│   ├── services/                   # Business logic layer
│   │   └── *.service.ts            # Data access, business rules
│   │
│   ├── models/                     # Mongoose schemas
│   │   ├── user.model.ts
│   │   ├── organization.model.ts
│   │   ├── membership.model.ts
│   │   ├── document.model.ts
│   │   ├── folder.model.ts
│   │   └── types/                  # TypeScript types
│   │
│   ├── middlewares/                # Express middlewares
│   │   ├── auth.middleware.ts      # JWT verification
│   │   ├── csrf.middleware.ts      # CSRF protection
│   │   ├── organization.middleware.ts
│   │   ├── role.middleware.ts      # Role-based access control
│   │   ├── rate-limit.middleware.ts
│   │   ├── upload.middleware.ts    # File upload handling
│   │   └── error.middleware.ts     # Global error handler
│   │
│   ├── utils/                      # Utility functions
│   │   ├── password-validator.ts
│   │   ├── path-sanitizer.ts
│   │   └── url-validator.ts
│   │
│   └── mail/                       # Email templates and service
│       ├── emailService.ts
│       └── confirmationTemplate.html
│
├── tests/                          # Test suite
│   ├── setup.ts                    # Test configuration
│   ├── integration/                # API integration tests
│   ├── unit/                       # Unit tests
│   ├── builders/                   # Test data builders
│   ├── fixtures/                   # Static test data
│   └── helpers/                    # Test utilities
│
├── storage/                        # File storage (per organization)
│   └── {org-slug}/{userId}/
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md             # This file
│   ├── CSRF-PROTECTION.md
│   ├── MULTITENANCY-MIGRATION.md
│   ├── PASSWORD-VALIDATION.md
│   ├── SECURITY-FIXES.md
│   └── ENDPOINTS-TESTING-GUIDE.md
│
└── uploads/                        # Temporary upload directory
```

## Layered Architecture

The application follows a layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                        HTTP Request                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Middlewares                             │
│  (auth, csrf, rate-limit, validation, organization)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Routes                                │
│           (Define endpoints, wire middlewares)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Controllers                             │
│    (Parse request, validate, call services, format response) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Services                               │
│          (Business logic, data access, transactions)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Models                                │
│              (Mongoose schemas, validations)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       MongoDB                                │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Tenant Model

The application supports multiple organizations with the following structure:

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│    User      │────▶│   Membership   │◀────│   Organization   │
│              │ N:N │                │ N:1 │                  │
│ - email      │     │ - role         │     │ - name           │
│ - password   │     │ - isActive     │     │ - slug           │
│ - name       │     │ - joinedAt     │     │ - plan           │
└──────────────┘     └────────────────┘     └──────────────────┘
                                                     │
                                                     │ 1:N
                                                     ▼
                     ┌────────────────┐     ┌──────────────────┐
                     │    Folder      │────▶│    Document      │
                     │                │ 1:N │                  │
                     │ - name         │     │ - filename       │
                     │ - parent       │     │ - mimeType       │
                     │ - organization │     │ - size           │
                     └────────────────┘     └──────────────────┘
```

### Roles

| Role    | Permissions                                    |
|---------|------------------------------------------------|
| owner   | Full access, can delete organization           |
| admin   | Manage members, documents, folders             |
| member  | Create/edit own documents and folders          |
| viewer  | Read-only access to shared documents           |

### Subscription Plans

| Plan       | Users | Storage/User | Max File | File Types       |
|------------|-------|--------------|----------|------------------|
| FREE       | 3     | 1 GB         | 10 MB    | Limited          |
| BASIC      | 10    | 5 GB         | 50 MB    | Common           |
| PREMIUM    | 50    | 10 GB        | 100 MB   | Extended         |
| ENTERPRISE | ∞     | 50 GB        | 500 MB   | All              |

## Security

### Authentication Flow

1. User registers/logs in → receives JWT token
2. Token stored in httpOnly cookie
3. Each request validated by `auth.middleware.ts`
4. Token contains: userId, email, organizationId

### CSRF Protection

Using Double Submit Cookie pattern with `csrf-csrf` package:
- Token generated via `/api/csrf-token`
- Frontend sends token in `x-csrf-token` header
- Cookie validated against header on state-changing requests

See [CSRF-PROTECTION.md](./CSRF-PROTECTION.md) for details.

### Input Validation

- MongoDB query sanitization (`express-mongo-sanitize`)
- Path traversal prevention (`path-sanitizer.ts`)
- Password strength validation (`password-validator.ts`)
- URL validation for redirects (`url-validator.ts`)

## API Documentation

OpenAPI/Swagger documentation available at:
- **Swagger UI:** `http://localhost:4000/api/docs`
- **OpenAPI JSON:** `http://localhost:4000/api/docs.json`

## Testing Strategy

```
tests/
├── unit/           # Isolated function tests
├── integration/    # API endpoint tests with real DB
├── builders/       # Test data factories (Builder pattern)
├── fixtures/       # Static test data
└── helpers/        # Test utilities
```

Run tests:
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

## Environment Variables

The application uses a cascading environment configuration that loads files in order (later files override earlier):

1. `.env.example` - Defaults and documentation (lowest priority)
2. `.env` - Base configuration
3. `.env.local` - Local overrides (not committed)
4. `.env.{NODE_ENV}` - Environment-specific (e.g., `.env.production`)
5. `.env.{NODE_ENV}.local` - Environment-specific local overrides (highest priority)

See [.env.example](../.env.example) for all configuration options.

Key variables:
- `PORT` - Server port (default: 4000)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Token signing key
- `ELASTICSEARCH_ENABLED` - Enable search (true/false)

## Related Documentation

- [CSRF Protection](./CSRF-PROTECTION.md)
- [Multi-tenancy Migration](./MULTITENANCY-MIGRATION.md)
- [Password Validation](./PASSWORD-VALIDATION.md)
- [Security Fixes](./SECURITY-FIXES.md)
- [Endpoints Testing Guide](./ENDPOINTS-TESTING-GUIDE.md)
