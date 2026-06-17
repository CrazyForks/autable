# codetable

codetable is a code-first alternative to multidimensional tables. The project is not a no-code or low-code builder: tables, forms, and workflows are stored as code-managed artifacts so AI-assisted development can work directly with the source of truth.

## Direction

- Go backend with SQLite for system/application data.
- LevelDB-compatible key/value storage for removable history/log data.
- TypeScript React frontend for table, workflow, and form surfaces.
- User-managed repository containing `config.yml`, table metadata, workflow JavaScript, and form JavaScript.

## Current Slice

This repository currently contains the backend core primitives:

- `config.yml` loading and validation, including OIDC settings.
- YAML metadata for databases and tables, including soft-deleted fields.
- Authenticated database/table creation that writes metadata YAML and grants database/table owner permissions.
- Hidden, auto-incrementing `record_id` handling.
- Per-metadata-database SQLite row persistence through GORM.
- Row create/update history written to LevelDB-compatible storage.
- Table views with composable `base_view`, filters, and sorts.
- Password registration/login with HttpOnly session cookies.
- OIDC provider listing plus authorization-code callback login with verified ID tokens and HttpOnly state/session cookies.
- Field-level permissions: none, read, write.
- Workflow and form resource permissions using their auto-incrementing IDs.
- User identity model with email fallback for password and OIDC accounts.
- History key generation and prefix scanning for row/workflow history.
- Stateless workflow node interface definitions.
- Workflow node metadata API and frontend node catalog for available stateless nodes and trigger nodes.
- Synchronous JavaScript workflow runs through registered stateless nodes, with each run persisted as `whistory_id_timestamp`.
- A `table.record.changed` trigger node that accepts an `rhistory_db_table_record_id_timestamp` key and exposes the decoded row change.
- Workflow JavaScript editing with JSON editors for GitHub Actions-style secrets and variables.
- Workflow and form JavaScript files saved to and read from `repository.path` for git-managed code artifacts.
- A form JavaScript runtime that requires `function render(api, root)` to render controls and return `{ table, fields }`.
- Form submissions send input JSON; the backend executes the form JavaScript to resolve the target table and input-to-field mapping before writing records.

## Development Rules

- This project is in active development; breaking changes are allowed.
- Do not preserve backward-compatible or legacy behavior unless explicitly requested.
- Data/schema upgrades do not get compatibility code or runtime migrations. During demo development, delete the old generated data manually, including individual SQLite files, the LevelDB directory, or the whole `data/` directory.
- When changing a contract, update callers, tests, and docs to the new contract and remove the old path.
- Use the ORM for database access; do not hand-write SQL in application code.
- All system timestamps are millisecond-precision 64-bit Unix timestamps.
- Table fields have no `required` concept; field types are immutable after creation.

## Development

```sh
go test ./...
```

Run the API server with git-managed config and metadata:

```sh
go run ./cmd/codetable -config examples/config.yml -metadata examples/metadata/main.yml
```

Run the frontend:

```sh
cd web
npm install
npm run dev
```

Frontend verification:

```sh
cd web
npm test
npm run build
npm run e2e
```

SQLite files and LevelDB directories must be backed up by users/operators. The project will keep generated data out of git while keeping user-authored metadata, workflows, forms, and config files in git.
