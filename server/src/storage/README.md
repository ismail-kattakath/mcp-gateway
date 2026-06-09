# Storage Layer v3.0

SQLite-based storage layer with field-level encryption for MCP Gateway.

## Overview

The storage layer replaces the JSON file-based storage (registry.json) with a SQLite database featuring:

- **Field-level AES-256-GCM encryption** for sensitive data (env vars, API keys, tokens)
- **Auto-migration** from v2.x registry.json
- **Type-safe models** for servers and settings
- **Transaction support** for atomic operations
- **Backup/restore** functionality
- **Multi-tenancy ready** (prepared for Epic #17)

## Architecture

```
storage/
├── schema.sql          # Database schema (6 tables)
├── database.ts         # SQLite connection + init
├── encryption.ts       # AES-256-GCM encryption
├── migration.ts        # Auto-migration from registry.json
├── models/
│   ├── servers.ts      # Server CRUD operations
│   └── settings.ts     # Settings CRUD operations
├── index.ts            # Public API
└── __tests__/          # Test suite (63 tests)
```

## Database Schema

### Tables

1. **servers** - MCP server configurations
2. **users** - User accounts (for auth)
3. **api_keys** - API key management
4. **settings** - Gateway settings
5. **audit_log** - Audit trail
6. **refresh_tokens** - JWT refresh tokens

See `schema.sql` for full schema with indexes.

## Encryption

### Algorithm

- **AES-256-GCM** (authenticated encryption)
- **Format**: `iv:authTag:ciphertext` (hex-encoded)
- **Key**: 256-bit (32 bytes), stored in environment variable

### Encrypted Fields

**servers.config**:

- `env` values (all environment variables)
- `headers` values (for RemoteServer)
- `build.args` values (for ContainerServer, args with `=`)

**settings.value** (when key matches):

- `*_secret`, `*_key`, `*_token`
- `password`, `passwd`

### Key Management

Set encryption key via environment variable:

```bash
# Generate key
export STORAGE_ENCRYPTION_KEY=$(node -e "console.log(crypto.randomBytes(32).toString('base64'))")

# Or use provided helper
npm run generate-encryption-key
```

## Usage

### Initialize Database

```typescript
import { initDatabase, getDatabase } from './storage/index.js';

// Initialize (creates tables if not exist)
initDatabase('/path/to/gateway.db');

// Get database instance
const db = getDatabase();
```

### Server CRUD

```typescript
import { serverModel } from './storage/index.js';

// Create server
await serverModel.create({
  name: 'github',
  source: 'pkg',
  config: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_TOKEN: 'ghp_secret123', // Will be encrypted
    },
  },
  lifecycle: 'on-demand',
  enabled: true,
});

// Get server
const server = await serverModel.getByName('github');

// List servers
const servers = await serverModel.list({ enabled: true });

// Update server
await serverModel.update('github', {
  enabled: false,
});

// Delete server
await serverModel.delete('github');
```

### Settings CRUD

```typescript
import { settingsModel } from './storage/index.js';

// Set setting (auto-encrypts if key matches pattern)
await settingsModel.set('server.port', { value: '3000' });
await settingsModel.set('auth.jwt_secret', { value: 'secret123' }); // Encrypted

// Get setting (auto-decrypts)
const setting = await settingsModel.get('auth.jwt_secret');
console.log(setting.value); // 'secret123' (decrypted)

// List settings by category
const authSettings = await settingsModel.getByCategory('auth');

// Delete setting
await settingsModel.delete('old.setting');
```

### Transactions

```typescript
import { transaction } from './storage/index.js';

// All operations are atomic
transaction(() => {
  db.prepare(`INSERT INTO settings ...`).run(...);
  db.prepare(`UPDATE servers ...`).run(...);
  // If any operation fails, all changes are rolled back
});
```

### Backup & Restore

```typescript
import { backupDatabase } from './storage/index.js';

// Create backup
await backupDatabase('/path/to/backup.db');

// Restore (just copy backup file and reinitialize)
// cp /path/to/backup.db /path/to/gateway.db
initDatabase('/path/to/gateway.db');
```

### Auto-Migration

```typescript
import { needsMigration, migrateFromRegistryJson } from './storage/index.js';

// Check if migration needed
if (needsMigration('/path/to/registry.json')) {
  // Migrate (automatic on first startup)
  const result = await migrateFromRegistryJson('/path/to/registry.json');

  console.log(`Migrated ${result.serversCount} servers`);
  console.log(`Migrated ${result.settingsCount} settings`);
  console.log(`Backup created: ${result.backupPath}`);
}
```

## Migration from v2.x

The migration is **automatic** on first startup:

1. Detects `registry.json` exists and database is empty
2. Creates backup: `registry.json.backup.<timestamp>`
3. Encrypts sensitive fields (env vars, secrets)
4. Inserts servers into `servers` table
5. Inserts gateway settings into `settings` table
6. Creates default admin user (username: `admin`, password: `changeme`)
7. Renames original file: `registry.json.migrated`

**Important**: Change the default admin password immediately!

## Performance

### Database Size Estimates

Typical deployment (50 servers, 10 users, 20 API keys):

- `servers`: 100 KB
- `users`: 5 KB
- `api_keys`: 10 KB
- `settings`: 15 KB
- `audit_log`: 5 MB (90 days retention)
- **Total**: ~5.13 MB (negligible)

### Indexes

All common query patterns are indexed:

- Lookup by name/username/key_hash (O(log n))
- Filter by status/enabled/source (O(log n))
- Range queries on timestamps (O(log n))

### Optimizations

- **WAL mode** (Write-Ahead Logging) for better concurrency
- **Synchronous = NORMAL** (balance safety vs performance)
- **Cache size = 10MB** (read-heavy workloads)
- **Foreign keys enabled** (referential integrity)

## Testing

### Run Tests

```bash
# All storage tests
npm test -- src/storage/__tests__

# Specific test file
npm test -- src/storage/__tests__/encryption.test.ts
npm test -- src/storage/__tests__/database.test.ts

# With coverage
npm run test:coverage -- src/storage/__tests__
```

### Test Coverage

- **63 tests** total
- **Encryption**: 41 tests (encrypt/decrypt, edge cases, security)
- **Database**: 22 tests (init, CRUD, transactions, backup, health)
- **Coverage**: 80%+ (target: 77%+)

## Security

### Encryption

- **NEVER log** plaintext secrets or encryption keys
- Use `sanitizeString()` from `logging/sanitizer.ts` for user input
- Keys stored in environment (Docker-friendly) or system keychain

### SQL Injection

- All queries use **parameterized statements**
- Never construct SQL strings with user input

### Key Rotation

To rotate encryption key:

1. Export all data to JSON (decrypt with old key)
2. Generate new key: `export STORAGE_ENCRYPTION_KEY=...`
3. Reimport data (encrypt with new key)
4. Update all instances with new key

## API Reference

### Database Functions

- `initDatabase(dbPath?)` - Initialize database
- `getDatabase()` - Get database instance
- `closeDatabase()` - Close connection
- `isDatabaseInitialized()` - Check if initialized
- `transaction(callback)` - Execute in transaction
- `backupDatabase(backupPath)` - Create backup
- `getDatabaseStats()` - Get stats (size, row counts)
- `optimizeDatabase()` - Vacuum + analyze
- `checkDatabaseHealth()` - Integrity check

### Encryption Functions

- `FieldEncryption` class - Encrypt/decrypt helper
- `getEncryptionKey()` - Get key from env or keychain
- `generateEncryptionKey()` - Generate random key
- `shouldEncryptSettingKey(key)` - Check if key should be encrypted
- `encryptServerConfig(config, encryptor)` - Encrypt server config
- `decryptServerConfig(config, encryptor)` - Decrypt server config

### Migration Functions

- `needsMigration(registryPath)` - Check if migration needed
- `migrateFromRegistryJson(registryPath, authConfigPath?)` - Run migration
- `getMigrationStatus(registryPath)` - Get migration status

### Models

- `serverModel` - Server CRUD operations
- `settingsModel` - Settings CRUD operations

See TypeScript types for full API documentation.

## Troubleshooting

### Migration Fails

- Check `registry.json` is valid JSON
- Ensure `STORAGE_ENCRYPTION_KEY` is set
- Check backup created: `registry.json.backup.<timestamp>`
- Check logs in `~/.mcp/logs/`

### Decryption Fails

- Wrong encryption key (check `STORAGE_ENCRYPTION_KEY`)
- Corrupted database (restore from backup)
- Key rotated but data not migrated

### Database Locked

- Check no other process is using the database
- WAL mode reduces lock contention
- Use transactions for atomic operations

### Performance Issues

- Run `optimizeDatabase()` to vacuum/analyze
- Check indexes exist: `PRAGMA index_list('servers')`
- Increase cache size: `PRAGMA cache_size = -20000` (20MB)

## Future Enhancements

- [ ] Database migrations framework (Epic #13, Issue #???)
- [ ] Query builder / ORM (Kysely, Drizzle, Prisma)
- [ ] Automatic key rotation
- [ ] Encrypted backups
- [ ] Audit log cleanup job (90 days retention)
- [ ] Read replicas for scaling

## Related Issues

- Epic #13: Storage Layer Migration
- Issue #34: Database Schema Design
- Issue #37: Field-level Encryption Helper
- Issue #44: SQL Query Builder (simplified as models)
- Issue #46: SQLite Integration
- Issue #61: Auto-Migration from registry.json

## References

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [AES-256-GCM Encryption](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
