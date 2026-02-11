# Development Mock Data

This document describes the test data inserted by the seed script for local development.

## Quick Start

```bash
# Ensure MongoDB is running
docker-compose up -d mongodb

# Run seed script
npm run seed:dev
```

## Test Accounts

All test accounts use the same password: `Test@1234`

| Email                      | Name           | Role  | Status   |
| -------------------------- | -------------- | ----- | -------- |
| `admin@clouddocs.local`    | Admin User     | admin | Active   |
| `john@clouddocs.local`     | John Developer | user  | Active   |
| `jane@clouddocs.local`     | Jane Designer  | user  | Active   |
| `inactive@clouddocs.local` | Inactive User  | user  | Inactive |

## Organizations

| Name             | Plan    | Storage Limit | Max Members |
| ---------------- | ------- | ------------- | ----------- |
| Acme Corporation | premium | 10 GB         | 50          |
| Startup Inc      | basic   | 1 GB          | 10          |
| Free Tier Org    | free    | 100 MB        | 3           |

## Membership Matrix

| User                  | Acme Corporation | Startup Inc | Free Tier Org |
| --------------------- | ---------------- | ----------- | ------------- |
| admin@clouddocs.local | Owner            | -           | -             |
| john@clouddocs.local  | Admin            | Owner       | Owner         |
| jane@clouddocs.local  | Member           | Member      | -             |

## Folder Structure (Acme Corporation)

```
/
├── Documents/
│   ├── Reports/
│   ├── Contracts/
│   └── Templates/
├── Images/
│   ├── Logos/
│   └── Screenshots/
└── Projects/
    ├── 2024/
    └── 2025/
```

## Sample Documents

| Title                | Filename          | Type | Size   | Owner                 |
| -------------------- | ----------------- | ---- | ------ | --------------------- |
| Company Handbook     | handbook.pdf      | PDF  | 500 KB | admin@clouddocs.local |
| Project Roadmap 2025 | roadmap-2025.pdf  | PDF  | 200 KB | john@clouddocs.local  |
| Meeting Notes        | meeting-notes.txt | Text | 10 KB  | admin@clouddocs.local |

## Testing Scenarios

### Authentication Testing

1. **Valid login**: Use `john@clouddocs.local` / `Test@1234`
2. **Inactive account**: Try `inactive@clouddocs.local` to test account status check
3. **Admin access**: Use `admin@clouddocs.local` for admin-only endpoints

### Multi-tenancy Testing

1. **Organization switching**: `john@clouddocs.local` belongs to all 3 organizations
2. **Role-based access**: Test different permissions:
   - Owner (john → Startup Inc)
   - Admin (john → Acme Corporation)
   - Member (jane → Acme Corporation)

### Subscription Plan Testing

1. **Premium features**: Test with Acme Corporation
2. **Storage limits**: Test upload limits with Free Tier Org (100 MB limit)
3. **Member limits**: Test invitations with different plan limits

## Resetting Data

To reset all data and re-seed:

```bash
npm run seed:dev
```

The seed script automatically clears all existing data before inserting new records.

## Custom Seeds

To add custom data, modify `scripts/seed-dev.ts`:

- `TEST_USERS` - Add/modify test users
- `TEST_ORGANIZATIONS` - Add/modify organizations
- `FOLDER_STRUCTURE` - Modify folder hierarchy
- Add new sample documents in `createSampleDocuments()`
