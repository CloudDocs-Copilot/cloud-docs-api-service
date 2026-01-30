<div align="center">

# CloudDocs API Service

Multi-tenant REST API for cloud document management with organizations and subscription plans.

**Tech Stack:** Node.js · Express · TypeScript · MongoDB · Elasticsearch

[![Node](https://img.shields.io/badge/Node.js-20+-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

</div>

---

## ✨ Features

- **Multi-tenant Architecture** - Users belong to multiple organizations with role-based access
- **Document Management** - Upload, organize, and share documents with folder hierarchy
- **Full-text Search** - Elasticsearch-powered search across documents (optional)
- **Subscription Plans** - FREE, BASIC, PREMIUM, ENTERPRISE with storage quotas
- **Security** - JWT auth, CSRF protection, rate limiting, input sanitization

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker (for MongoDB)
- npm or yarn

### Local Development (5 minutes)

```bash
# 1. Clone and install
git clone <repository-url>
cd cloud-docs-api-service
npm install

# 2. Start MongoDB with Docker
docker run -d --name mongodb -p 27017:27017 mongo:6.0

# 3. Start the development server
npm run dev

# 4. (Optional) Load test data
npm run seed:dev
```

**That's it!** The API is now running at http://localhost:4000

> **Note:** The app automatically loads `.env.example` as defaults, so no manual `.env` setup is required for development.

### Test Accounts (after seeding)

| Email | Password | Role |
|-------|----------|------|
| admin@clouddocs.local | Test@1234 | Admin |
| john@clouddocs.local | Test@1234 | User |
| jane@clouddocs.local | Test@1234 | User |

See [docs/MOCK-DATA.md](docs/MOCK-DATA.md) for complete test data documentation.

### Using Docker Compose (Full Stack)

```bash
# From the workspace root (parent directory)
cp .env.example .env
docker-compose up -d

# API available at http://localhost:4000
# Frontend at http://localhost:3000
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design and code organization |
| [OpenAPI Spec](docs/openapi/openapi.json) | API specification (Swagger/OpenAPI 3.0) |
| [Mock Data](docs/MOCK-DATA.md) | Test data for local development |
| [Testing Guide](docs/ENDPOINTS-TESTING-GUIDE.md) | How to test API endpoints |
| [Contributing](CONTRIBUTING.md) | Development setup and guidelines |

### RFCs (Technical Design Documents)

| Document | Description |
|----------|-------------|
| [CSRF Protection](docs/rfc/CSRF-PROTECTION.md) | Security implementation details |
| [Multi-tenancy](docs/rfc/MULTITENANCY-MIGRATION.md) | Organization model explanation |
| [Password Validation](docs/rfc/PASSWORD-VALIDATION.md) | Password strength requirements |
| [Security Fixes](docs/rfc/SECURITY-FIXES.md) | Security improvements documentation |

## 🛠️ Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm test` | Run test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run seed:dev` | Load test data into database |
| `npm run format` | Format code with Prettier |

## 📁 Project Structure

```
├── docs/
│   ├── openapi/          # OpenAPI/Swagger specifications
│   └── rfc/              # Technical design documents
├── scripts/
│   └── seed-dev.ts       # Development data seeding
├── src/
│   ├── configurations/   # Database, CORS, Elasticsearch configs
│   ├── controllers/      # HTTP request handlers
│   ├── middlewares/      # Auth, CSRF, rate-limit, validation
│   ├── models/           # Mongoose schemas and TypeScript types
│   ├── routes/           # API route definitions
│   ├── services/         # Business logic layer
│   └── utils/            # Helper functions
└── tests/
    ├── integration/      # API integration tests
    └── unit/             # Unit tests
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed documentation.

## 🔐 Security Features

- JWT authentication with token invalidation
- CSRF protection (Double Submit Cookie)
- Password strength validation
- NoSQL injection prevention
- Path traversal protection
- Rate limiting per IP
- HTTP security headers (Helmet)

## 🌐 Environment Variables

Key variables (see [.env.example](.env.example) for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/clouddocs` |
| `JWT_SECRET` | Token signing key | - |
| `ELASTICSEARCH_ENABLED` | Enable search | `false` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:5173` |

## 🧪 Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

Tests use MongoDB Memory Server - no external database required.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**[Documentation](docs/)** · **[Report Bug](../../issues)** · **[Request Feature](../../issues)**

</div>
