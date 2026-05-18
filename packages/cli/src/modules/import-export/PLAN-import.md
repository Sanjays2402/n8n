# LIGO-562 — Workflow import (basic) implementation plan

> Linear: https://linear.app/n8n/issue/LIGO-562
>
> Builds on the export work from `ligo-548-workflow-package-export-2`.
> This plan covers basic workflow import only — no credentials, no conflict
> handling, no node-type validation, no sub-workflows or variables. Those
> live in their own tickets.

## Locked-in decisions

| # | Decision |
|---|---|
| HTTP entry | **Public API only** — `POST /api/v1/workflows/import`. No internal controller route. Editor-ui integration is out of scope for this ticket. |
| Handler shape | Thin handler: API-key scope check + delegate to `ImportPipeline`. No business logic. |
| Upload | Raw body stream; `projectId` / `folderId` carried on the query string |
| Permission scope | `workflow:import` — editor-level, not admin-only |
| License flag | Reuse `feat:packageExport` for both directions |
| File naming | Dash convention (`workflow-importer.ts`, `workflow-serializer.ts`) |
| Spelling | American (`serializer`, `Serializer<TDb, TWire>`, `serialize()` / `deserialize()`) |

## Target layout after this ticket

```
packages/cli/src/modules/import-export/
├── io/
│   ├── package-writer.ts              [existing]
│   ├── package-reader.ts              [new] interface
│   ├── slug.utils.ts                  [existing]
│   └── tar/
│       ├── tar-package-writer.ts      [existing]
│       └── tar-package-reader.ts      [new]
├── engine/
│   ├── export-pipeline.ts             [extracted from service]
│   └── import-pipeline.ts             [new]
├── entities/
│   ├── entity-exporter.ts             [new] interface
│   ├── entity-importer.ts             [new] interface
│   ├── serializer.ts                  [new] Serializer<TDb, TWire>
│   └── workflow/
│       ├── workflow-exporter.ts       [renamed from .exporter.ts]
│       ├── workflow-importer.ts       [new]
│       └── workflow-serializer.ts     [renamed from .serializer.ts]
├── spec/
│   ├── constants.ts                   [existing]
│   ├── manifest.types.ts              [existing]
│   ├── manifest.schema.ts             [new] zod schema for inbound
│   └── serialized/
│       └── workflow.serialized.ts     [existing]
├── import-export.controller.ts        [existing; unchanged — no internal route added]
├── import-export.service.ts           [thin shell, delegates to engine/]
├── import-export.module.ts            [existing]
└── import-export.types.ts             [existing; gains ImportPackageRequest]
```

## Step 0 — Prep commit (rename + extract)

Pure rename / move; no behaviour change. Ship as its own commit so the
import diff stays clean.

- `entities/workflow/workflow.exporter.ts` → `workflow-exporter.ts`
- `entities/workflow/workflow.serializer.ts` → `workflow-serializer.ts`
- Class stays `WorkflowSerializer`; methods stay `serialize()` /
  `deserialize()` (existing American spelling is preserved).
- Test files renamed to match.
- Extract `ImportExportService.exportWorkflows()` body into
  `engine/export-pipeline.ts`. The service becomes a thin shell that
  delegates to the pipeline.
- Create empty `engine/` directory (the import-pipeline lands in step 7).

## Step 1 — Database: `sourceWorkflowId`

- `packages/@n8n/db/src/entities/workflow-entity.ts` — add nullable
  `sourceWorkflowId: string | null`.
- New migration in `packages/@n8n/db/src/migrations/<all dialects>/` —
  adds the column and a composite index on `(projectId, sourceWorkflowId)`
  ahead of `workflowUpdatePolicy` (separate ticket) needing the lookup.

Phase 1 does not query the column; only writes on insert.

## Step 2 — Permissions: `workflow:import`

Mirror what commit `b5ca06abaa` did for `workflow:export`, with these
role-list differences:

In `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts`:
- ✓ `REGULAR_PROJECT_ADMIN_SCOPES`
- ✓ `PROJECT_EDITOR_SCOPES`
- ✓ `PERSONAL_PROJECT_OWNER_SCOPES`
- ✗ `PROJECT_VIEWER_SCOPES` (read-only)

Other files to touch (same as export):
- `packages/@n8n/permissions/src/constants.ee.ts`
- `packages/@n8n/permissions/src/roles/scopes/global-scopes.ee.ts`
- `packages/@n8n/permissions/src/scope-information.ts`
- Regenerate `__snapshots__/scope-information.test.ts.snap`
- `packages/cli/src/controllers/e2e.controller.ts`
- `packages/frontend/editor-ui/src/features/project-roles/projectRoleScopes.ts`
- `packages/frontend/@n8n/i18n/src/locales/en.json`

Do **not** add to `workflow-sharing-scopes.ee.ts`. Import operates on a
project, not a specific shared workflow.

## Step 3 — Query schema

Public API handlers in this codebase parse query/body inline with zod,
so no `@n8n/api-types` DTO is needed for now. The public API handler
parses `projectId` / `folderId` directly:

```ts
const query = z.object({
  projectId: z.string().trim().min(1).optional(),
  folderId: z.string().trim().min(1).optional(),
}).parse(req.query);
```

When the internal editor-ui endpoint lands in a follow-up ticket, the
schema graduates to `@n8n/api-types` and is shared by both paths. For
now, keep it co-located with the public API handler.

## Step 4 — I/O: `PackageReader` + `TarPackageReader`

- `io/package-reader.ts` — interface:
  ```ts
  export interface PackageReader {
    readManifest(): Promise<PackageManifest>;
    readFile(path: string): Promise<Buffer>;
    listEntries(): Promise<string[]>;
  }
  ```
- `io/tar/tar-package-reader.ts` — streaming reader using the `tar` library.
  Requirements:
  - Reject if the first non-directory entry is not `manifest.json`
    (writer guarantees manifest-first).
  - Buffer entries in memory (≤100MB target, consistent with writer).
  - Reject entries with absolute paths or `..` segments (tar-slip guard).

Tests at `io/__tests__/tar-package-reader.test.ts`: round-trip through
`TarPackageWriter`, plus path-traversal rejection.

## Step 5 — Spec: manifest validation

New file: `spec/manifest.schema.ts` — zod schema for inbound manifests.

```ts
export const PackageManifestSchema = z.object({
  packageFormatVersion: z.literal(FORMAT_VERSION),
  exportedAt: z.string(),
  sourceN8nVersion: z.string(),
  sourceId: z.string(),
  workflows: z.array(ManifestEntrySchema).optional(),
});
```

Reject `packageFormatVersion` mismatch. Allow but ignore other entity
sections (`credentials`, `requirements`) for forward compatibility with
packages from future-version exporters.

Test at `spec/__tests__/manifest.schema.test.ts`.

## Step 6 — Entities: interfaces + workflow importer

**Generic interfaces at `entities/` root** (cheap insurance against drift
as other entity types arrive):

- `entities/entity-exporter.ts`:
  ```ts
  export interface EntityExporter<TEntity> {
    export(request: ExportContext<TEntity>): Promise<ManifestEntry[]>;
  }
  ```
- `entities/entity-importer.ts`:
  ```ts
  export interface EntityImporter<TEntity> {
    import(request: ImportContext): Promise<TEntity[]>;
  }
  ```
- `entities/serializer.ts`:
  ```ts
  export interface Serializer<TDb, TWire> {
    serialize(entity: TDb): TWire;
    deserialize(wire: TWire): Partial<TDb>;
  }
  ```

**Workflow-specific:**

- `entities/workflow/workflow-serializer.ts` — extend to implement
  `Serializer<WorkflowEntity, SerializedWorkflow>`. Adds `deserialize(wire)`
  returning a partial `WorkflowEntity` ready for insert (no `id`, no
  timestamps).
- `entities/workflow/workflow-importer.ts` (new) — implements
  `EntityImporter<WorkflowEntity>`. For each `workflows[]` entry in the
  manifest:
  - Read `<target>/workflow.json` via the reader.
  - Deserialize to a partial `WorkflowEntity`.
  - Set `sourceWorkflowId = serialized.id` (the package's id).
  - Set `projectId` and `parentFolderId` from the resolved target.
  - Persist via `WorkflowRepository`; repository assigns the fresh local `id`.

Tests:
- `workflow-serializer.test.ts` — round-trip (serialize → deserialize)
  yields a partial matching the original entity shape.
- `workflow-importer.test.ts` — mocked reader + target, asserts inserted
  shape (fresh `id`, `sourceWorkflowId` populated, correct placement).

## Step 7 — Engine: `import-pipeline.ts`

New file: `engine/import-pipeline.ts`. Mirror of `export-pipeline.ts`.

```ts
@Service()
export class ImportPipeline {
  constructor(
    private readonly workflowImporter: WorkflowImporter,
    private readonly dataSource: DataSource,
  ) {}

  async run(request: ImportPipelineRequest): Promise<ImportResult> {
    const reader = new TarPackageReader(request.tarStream);
    const manifest = PackageManifestSchema.parse(await reader.readManifest());

    const target = await this.resolveTarget(
      request.user,
      request.projectId,
      request.folderId,
    );

    return await this.dataSource.transaction(async (manager) => {
      const workflows = await this.workflowImporter.import({
        user: request.user,
        manifest,
        reader,
        target,
        manager,
      });
      return { workflows };
    });
  }

  private async resolveTarget(user, projectId, folderId): Promise<ImportTarget> {
    // Routing matrix — see table below.
  }
}
```

**Routing matrix in `resolveTarget`:**

| projectId | folderId | Behaviour |
|---|---|---|
| absent | absent | personal project root |
| absent | present | folder in personal project; error if not found |
| present | absent | project + `workflow:import` scope check; error otherwise |
| present | present | project + scope + folder-in-project; error on any failure |

All rejections throw `UserError` with a clear message; the controller
maps to HTTP 4xx.

The whole import runs in one DB transaction — atomic in Phase 1.

## Step 8 — Service shell

`import-export.service.ts` gains:

```ts
async importPackage(request: ImportPackageRequest): Promise<ImportResult> {
  return await this.importPipeline.run(request);
}
```

After step 0 this file is a thin shell that delegates to engine pipelines.

## Step 9 — (no internal controller in this ticket)

Skipped intentionally. The internal `import-export.controller.ts` keeps
its existing export endpoint and gains nothing for import in this
ticket. Editor-ui integration arrives in a follow-up ticket; it will
add an internal route that shares `ImportPipeline` with the public API.

## Step 10 — Upload wiring

Raw body stream:
- `Content-Type: application/gzip` (or `application/octet-stream`).
- Body is the tar file streamed directly into `TarPackageReader`.
- `projectId` / `folderId` carried on the query string.
- No `multer` dependency.

## Step 11 — Public API endpoint (the sole HTTP entry)

Import is exposed via the public API only in this ticket. The handler is
intentionally thin: it checks permission, parses the request, and
delegates to `ImportPipeline`. No business logic lives in the public API
layer.

Extend the existing workflows handler at
`packages/cli/src/public-api/v1/handlers/workflows/workflows.handler.ts`:

```ts
importWorkflow: [
  publicApiScope('workflow:import'),
  async (req, res) => {
    const query = z.object({
      projectId: z.string().trim().min(1).optional(),
      folderId: z.string().trim().min(1).optional(),
    }).parse(req.query);

    const result = await Container.get(ImportExportService).importPackage({
      user: req.user,
      projectId: query.projectId,
      folderId: query.folderId,
      tarStream: req,
    });

    return res.status(200).json(result);
  },
],
```

Route registration (in the workflows handler's route table) maps this to
`POST /workflows/import` under the `/api/v1` prefix.

**Files touched:**
- `public-api/v1/handlers/workflows/workflows.handler.ts` — add handler + route entry.
- `public-api/v1/handlers/workflows/spec/paths/workflows.import.yml` — new OpenAPI path (mirror the sibling paths in that directory).
- `public-api/v1/types.ts` (or local types file) — add `WorkflowRequest.Import` type for the typed handler signature.

**Authorization:** `publicApiScope('workflow:import')` enforces the API
key's global scope. The project-level scope check happens inside
`ImportPipeline.resolveTarget()`. No duplicated checks.

**Tests** at `public-api/v1/__tests__/workflows.test.ts` (extend
existing). Cases:
- Successful import with valid API key + sufficient scope.
- 401 when no API key.
- 403 when API key lacks `workflow:import`.
- 403 when API key's user lacks `workflow:import` on the target project.
- Full routing matrix (no project/folder, project only, folder only,
  both) exercised through the public API surface — there is no
  internal endpoint to test separately.
- Content-validation cases (manifest version mismatch, tar without
  manifest first, path-traversal) — same.

## Step 12 — Tests

**Unit** (covered per step above):
- `workflow-serializer.test.ts` — round-trip
- `workflow-importer.test.ts` — mocked reader + target
- `tar-package-reader.test.ts` — round-trip + path-traversal rejection
- `manifest.schema.test.ts` — accept/reject malformed manifests

**Pipeline integration** at
`modules/import-export/__tests__/import-export.integration.test.ts`
(extend existing). Exercises `ImportPipeline.run()` directly, hitting
a real database but skipping HTTP. Cases:

- Single workflow into personal project (no `projectId`/`folderId`)
- Single workflow into folder of personal project (`folderId` only)
- Single workflow into project root (`projectId` only)
- Single workflow into folder of specified project (both)
- Multi-workflow tar lands all into the same target
- Every imported workflow has a fresh local `id` ≠ package `id`
- Every imported workflow has `sourceWorkflowId = package id`
- Reject: `folderId` not in personal project
- Reject: `projectId` doesn't exist
- Reject: `projectId` exists but user lacks `workflow:import`
- Reject: `projectId` + `folderId` mismatch
- Reject: `packageFormatVersion` mismatch
- Reject: tar with path-traversal entries
- Reject: tar without `manifest.json` first
- Transactional rollback: simulate mid-batch failure; assert no
  workflows created

**Public API HTTP tests** at `public-api/v1/__tests__/workflows.test.ts`
(extend existing) — covered in Step 11. These confirm the thin-handler
delegation works end-to-end through API-key auth.

## Estimated change set

- New files: ~14 (reader interface, tar reader, importer, manifest schema,
  three entity interfaces, import-pipeline, public API OpenAPI spec,
  plus tests for each)
- Renamed: 2 (workflow exporter + serializer to dash convention)
- Moved: 1 (service body → export-pipeline)
- Modified: ~8 (entity, migrations, permissions, service shell, public
  API workflows handler, public API types, i18n, snapshot, e2e
  controller)
- LOC: ~1100 including tests

## Suggested commit sequence

1. Prep — renames + extract export-pipeline (step 0)
2. DB migration + entity column (step 1)
3. Permission scope `workflow:import` (step 2)
4. `PackageReader` interface + `TarPackageReader` + tests (step 4)
5. Manifest zod schema + tests (step 5)
6. Generic entity interfaces + workflow deserialize + workflow-importer
   + tests (step 6)
7. `ImportPipeline` engine + service shell wiring + pipeline integration
   tests (steps 7–8, 12)
8. Public API handler + OpenAPI spec + HTTP tests (step 11)
