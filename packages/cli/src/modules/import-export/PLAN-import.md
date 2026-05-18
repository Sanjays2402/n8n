# LIGO-562 — Workflow import (basic) implementation plan

> Linear: https://linear.app/n8n/issue/LIGO-562
>
> Builds on the export work from `ligo-548-workflow-package-export-2`.
> This plan covers basic workflow import only — no credentials, no conflict
> handling, no node-type validation, no sub-workflows or variables. Those
> live in their own tickets.

## Prerequisite

**Merge or rebase `ligo-548-workflow-package-export-2`** (export commit
`b5ca06abaa` and follow-ups) before starting implementation. The current
`ligo-562` branch only contains this plan; all export module files, permissions,
and `feat:packageExport` wiring live on the export branch.

## Locked-in decisions

`readRawBody` chosen over `multer` (verified codebase patterns: `multer` is used in
`modules/data-table/multer-upload-middleware.ts` for multipart CSV uploads;
`readRawBody` is the global middleware appropriate for raw binary bodies like a
gzip-compressed tar). Verify the global `bodyParser` `endpoints.payloadSizeMax`
cap covers expected package sizes before shipping.

| # | Decision |
|---|---|
| HTTP entry | **Public API only** — `POST /api/v1/workflows/import`. No internal controller route. Editor-ui integration is out of scope for this ticket. |
| Handler shape | Thin handler: license check + API-key scope + `readRawBody` + delegate to `ImportPipeline`. No business logic. |
| Upload | Gzip-compressed tar (same as export). Body buffered via global `readRawBody` into `req.rawBody`; `projectId` / `folderId` on query string. No `multer`. Handler rejects any `Content-Type` other than `application/gzip` / `application/octet-stream`. |
| Permission scope | `workflow:import` — editor-level, not admin-only (use `/protect-endpoints` when adding scopes); **not** on `PROJECT_VIEWER_SCOPES` or `workflow-sharing-scopes.ee.ts` (import is project-scoped, not per shared workflow). |
| License flag | Reuse `feat:packageExport` for both directions (`isLicensed` on public API handler; module `licenseFlag` unchanged). |
| File naming | **Dot convention** — match export branch (`workflow.exporter.ts`, `workflow.serializer.ts`, `workflow.importer.ts`). |
| Spelling | American (`serializer`, `Serializer<TDb, TWire>`, `serialize()` / `deserialize()`) |
| Persistence | **Dedicated `WorkflowImporter` insert path** — writes directly through `WorkflowRepository` + `SharedWorkflowRepository` inside the pipeline's outer transaction. Does **not** use `WorkflowCreationService` (its credential-permission check, `workflow:create` scope check, and inner transaction are wrong shape for import). Extract shared helpers from `WorkflowCreationService` for `redactionPolicy` stripping, node-id assignment, webhook-id resolution, and pin-data size validation. |
| Transactions | **Per-package atomic** — single outer `dataSource.transaction` owned by `ImportPipeline`; every per-workflow insert reuses the same `EntityManager`. Failure anywhere → no workflows created. |
| Events | After the outer transaction commits, emit one `workflow-created` event per imported workflow with `source: 'import'` (extend `WorkflowActionSource` union) plus one package-level `workflows-imported` event with `{ user, projectId, workflowIds, packageSourceId, packageVersion }`. External hooks (`workflow.afterCreate`) fire per-workflow. |
| `dryRun` | **Deferred** to a follow-up ticket once policy fields land. When implemented, lands on the same endpoint as `?dryRun=true` — no separate `/preview` route. |
| Export code | **Out of scope** — do not refactor or modify export paths (`exportWorkflows`, `WorkflowExporter`, controller export route, integration export tests). |

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
│   └── import-pipeline.ts             [new]
├── entities/
│   ├── entity-importer.ts             [new] interface
│   ├── serializer.ts                  [new] Serializer<TDb, TWire>
│   └── workflow/
│       ├── workflow.exporter.ts       [existing; unchanged]
│       ├── workflow.importer.ts       [new]
│       └── workflow.serializer.ts     [existing; gains deserialize only]
├── spec/
│   ├── constants.ts                   [existing]
│   ├── manifest.types.ts            [existing]
│   ├── manifest.schema.ts           [new] zod schema for inbound
│   └── serialized/
│       └── workflow.serialized.ts     [existing]
├── import-export.controller.ts        [existing; unchanged — no internal route added]
├── import-export.service.ts           [existing export; gains importPackage only]
├── import-export.module.ts            [existing]
└── import-export.types.ts             [existing; gains ImportPackageRequest, ImportResult]
```

## Step 1 — Database: `sourceWorkflowId`

- `packages/@n8n/db/src/entities/workflow-entity.ts` — add optional
  `sourceWorkflowId?: string`.
- New migration in `packages/@n8n/db/src/migrations/common/` — adds the column
  and a **non-unique index on `sourceWorkflowId`** for future conflict /
  update-policy lookups.

Do **not** index `(projectId, sourceWorkflowId)` on `workflow_entity` —
`projectId` lives on `SharedWorkflow`, not `WorkflowEntity`. Phase 1 only
writes `sourceWorkflowId` on insert; it does not query the column.

## Step 2 — Permissions: `workflow:import`

Use `/protect-endpoints` skill when adding `workflow:import` scope.

Mirror what commit `b5ca06abaa` did for `workflow:export`, with these
role-list differences:

In `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts`:
- ✓ `REGULAR_PROJECT_ADMIN_SCOPES`
- ✓ `PROJECT_EDITOR_SCOPES`
- ✓ `PERSONAL_PROJECT_OWNER_SCOPES`
- ✗ `PROJECT_VIEWER_SCOPES` (read-only)

Other files to touch (same as export):
- `packages/@n8n/permissions/src/constants.ee.ts` — resource action + API-key scope
- `packages/@n8n/permissions/src/roles/scopes/global-scopes.ee.ts`
- `packages/@n8n/permissions/src/scope-information.ts`
- Regenerate `__snapshots__/scope-information.test.ts.snap`
- `packages/cli/src/controllers/e2e.controller.ts`
- `packages/frontend/editor-ui/src/features/project-roles/projectRoleScopes.ts`
- `packages/frontend/@n8n/i18n/src/locales/en.json`

Do **not** add to `workflow-sharing-scopes.ee.ts`. Import operates on a
project, not a specific shared workflow.

**Note:** Export added `workflow:export` to viewers and sharing scopes; import
intentionally does not.

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

Use https://www.npmjs.com/package/tar (same dependency as `TarPackageWriter`).

- `io/package-reader.ts` — interface:
  ```ts
  export interface PackageReader {
    readManifest(): Promise<PackageManifest>;
    readFile(path: string): Promise<Buffer>;
    listEntries(): Promise<string[]>;
  }
  ```
- `io/tar/tar-package-reader.ts` — reader constructed from `Buffer` (or
  `Readable`). Requirements:
  - Accept gzip-wrapped tar bytes (writer uses `Pack({ gzip: true })`). If
    `Content-Encoding: gzip` was applied by `readRawBody`, the buffer is
    already gunzipped — detect or accept both.
  - Reject if there is no `manifest.json` at the root.
  - Further security hardening (tar-slip, size caps, manifest-first ordering,
    etc.) is tracked in **LIGO-568** — out of scope for this ticket.

Tests at `io/__tests__/tar-package-reader.test.ts`: round-trip through
`TarPackageWriter`.

## Step 5 — Spec: manifest validation

New file: `spec/manifest.schema.ts` — zod schema for inbound manifests.

```ts
export const PackageManifestSchema = z
  .object({
    packageFormatVersion: z.literal(FORMAT_VERSION),
    exportedAt: z.string(),
    sourceN8nVersion: z.string(),
    sourceId: z.string(),
    workflows: z.array(ManifestEntrySchema).optional(),
  })
  .superRefine((manifest, ctx) => {
    if (!manifest.workflows) return;
    const seen = new Set<string>();
    for (const entry of manifest.workflows) {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate workflow id in manifest: ${entry.id}`,
        });
      }
      seen.add(entry.id);
    }
  });
```

- Reject `packageFormatVersion` mismatch.
- Reject duplicate `workflows[].id` entries (zod refinement above).
- Allow but ignore other entity sections (`credentials`, `requirements`) for
  forward compatibility with packages from future-version exporters.

Test at `spec/__tests__/manifest.schema.test.ts`.

## Step 6 — Entities: interfaces + workflow importer

**Generic interfaces at `entities/` root:**

- `entities/entity-importer.ts` — `EntityImporter<TEntity>`
- `entities/serializer.ts` — `Serializer<TDb, TWire>`

**Shared helpers extracted from `WorkflowCreationService`** (new location: a
helpers module under `@/workflows/` or similar; both `WorkflowCreationService`
and `WorkflowImporter` call into them):

- `stripRedactionPolicyIfUnlicensedOrUnauthorized(workflow, user, projectId)` —
  drops `settings.redactionPolicy` when the license is missing or the user lacks
  `workflow:updateRedactionSetting` on the project. Mirror of the inline logic
  at `workflow-creation.service.ts:159-178`.
- `addNodeIds(workflow)` — currently `WorkflowHelpers.addNodeIds`. Already a
  free function; just reuse.
- `resolveNodeWebhookIds(workflow, nodeTypes)` — same.
- `validateWorkflowStructure(workflow)` — same.
- `validatePinDataSize(workflow)` — same.

These are reused by both the create-via-UI path (unchanged) and the import path.

**Workflow-specific:**

- `entities/workflow/workflow.serializer.ts` — implement
  `Serializer<WorkflowEntity, SerializedWorkflow>`. Add `deserialize(wire)`
  returning a partial `WorkflowEntity` for insert. Field handling on incoming
  workflows:

  | Field | Treatment |
  |---|---|
  | `id` | strip — target assigns a fresh local id |
  | `versionId` | strip — `WorkflowImporter` assigns a fresh `uuid()` |
  | `parentFolderId` | strip — caller (importer) sets from resolved target |
  | `active` | strip — always force `false` on import (Phase 1) |
  | timestamps (`createdAt`, `updatedAt`) | strip — DB assigns |
  | `pinData` | **strip** — pin data can carry secrets; don't propagate across instances |
  | `tags` | **strip** — tag import is out of scope for Phase 1 |
  | `isArchived` | **preserve** — honour source state (archived → archived) |
  | `nodes`, `connections`, `settings`, `meta`, `staticData` | preserve |

- `entities/workflow/workflow.importer.ts` (new) — implements
  `EntityImporter<WorkflowEntity>`. Accepts the outer `EntityManager` so all
  writes share the pipeline transaction. For each `workflows[]` entry in the
  manifest:

  1. Look up `<target>/workflow.json` via the reader. If missing, abort the
     entire import (`UserError` — manifest declared a file that isn't in the
     tar; strict by design, per Q7).
  2. `deserialize(wire)` to a partial `WorkflowEntity` (field handling above).
  3. Run the shared helpers: `addNodeIds`, `resolveNodeWebhookIds`,
     `validateWorkflowStructure`, `validatePinDataSize`,
     `stripRedactionPolicyIfUnlicensedOrUnauthorized(user, target.projectId)`.
  4. Force `active = false`; assign `versionId = uuid()`; set
     `sourceWorkflowId` to the package workflow id; set
     `parentFolderId = target.folderId ?? null`.
  5. `entityManager.save(WorkflowEntity, ...)` to insert.
  6. Create a `SharedWorkflow` row linking the workflow to `target.projectId`
     with `role: 'workflow:owner'`.
  7. Write the initial workflow-history version via
     `WorkflowHistoryService.saveVersion(user, workflow, workflow.id, false, entityManager)`.

  The importer extends the tar entries it reads but **does not** enumerate
  unlisted entries — only manifest-listed workflows are imported (Q7: lenient
  on tar extras). No `workflow:create` check (the pipeline already gated on
  `workflow:import`).

  Returns the inserted `WorkflowEntity` rows so the pipeline can build the
  rich `ImportResult` (see Step 7).

Tests (dot names, matching export):
- `entities/workflow/__tests__/workflow.serializer.test.ts` — round-trip,
  asserts every stripped field is absent in the deserialized output and every
  preserved field is intact.
- `entities/workflow/__tests__/workflow.importer.test.ts` — mocked reader +
  target + entityManager; asserts `sourceWorkflowId` set, fresh `id`,
  `parentFolderId` assigned, `SharedWorkflow` row created, missing tar entry
  triggers abort.

## Step 7 — Engine: `import-pipeline.ts`

New file: `engine/import-pipeline.ts`. Orchestrates read → validate manifest →
resolve target → atomic per-package transaction → events.

```ts
export type ImportResult = {
  package: {
    sourceN8nVersion: string;
    sourceId: string;
    exportedAt: string;
  };
  workflows: Array<{
    sourceId: string;       // sourceWorkflowId from the package
    localId: string;        // newly minted target id
    name: string;
    projectId: string;
    parentFolderId: string | null;
    active: boolean;        // always false in Phase 1
  }>;
};

@Service()
export class ImportPipeline {
  constructor(
    private readonly workflowImporter: WorkflowImporter,
    private readonly dataSource: DataSource,
    private readonly eventService: EventService,
    private readonly externalHooks: ExternalHooks,
  ) {}

  async run(request: ImportPipelineRequest): Promise<ImportResult> {
    const reader = new TarPackageReader(request.packageBuffer);
    const manifest = PackageManifestSchema.parse(await reader.readManifest());

    const target = await this.resolveTarget(
      request.user,
      request.projectId,
      request.folderId,
    );

    // Per-package atomic: a single outer transaction wraps every workflow
    // insert. Failure anywhere → entire import rolls back.
    const workflows = await this.dataSource.transaction(async (manager) => {
      return await this.workflowImporter.import({
        user: request.user,
        manifest,
        reader,
        target,
        manager,
      });
    });

    // Events fire only after the transaction has committed.
    for (const workflow of workflows) {
      await this.externalHooks.run('workflow.afterCreate', [workflow]);
      this.eventService.emit('workflow-created', {
        user: request.user,
        workflow,
        publicApi: true,
        projectId: target.projectId,
        projectType: target.projectType,
        source: 'import',
      });
    }

    this.eventService.emit('workflows-imported', {
      user: request.user,
      projectId: target.projectId,
      workflowIds: workflows.map((w) => w.id),
      packageSourceId: manifest.sourceId,
      packageVersion: manifest.packageFormatVersion,
    });

    return {
      package: {
        sourceN8nVersion: manifest.sourceN8nVersion,
        sourceId: manifest.sourceId,
        exportedAt: manifest.exportedAt,
      },
      workflows: workflows.map((w) => ({
        sourceId: w.sourceWorkflowId!,
        localId: w.id,
        name: w.name,
        projectId: target.projectId,
        parentFolderId: w.parentFolder?.id ?? null,
        active: w.active,
      })),
    };
  }

  private async resolveTarget(
    user: User,
    projectId?: string,
    folderId?: string,
  ): Promise<ImportTarget> {
    // Use ProjectRepository, ProjectService, FolderService — see routing matrix.
  }
}
```

**Routing matrix in `resolveTarget`:**

| projectId | folderId | Behaviour |
|---|---|---|
| absent | absent | `getPersonalProjectForUserOrFail` → project root |
| absent | present | personal project + `findFolderInProjectOrFail` |
| present | absent | `getProjectWithScope(user, projectId, ['workflow:import'])` |
| present | present | project scope check + `findFolderInProjectOrFail` |

Implementation helpers (existing services):
- No `projectId` → `projectRepository.getPersonalProjectForUserOrFail(user.id)`
- With `projectId` → `projectService.getProjectWithScope(user, projectId, ['workflow:import'])`; `NotFoundError` / `ForbiddenError` on failure
- With `folderId` → `folderService.findFolderInProjectOrFail(folderId, effectiveProjectId)`

Rejections use `NotFoundError` / `ForbiddenError` (same as `WorkflowCreationService`
for public API) so HTTP status codes stay consistent.

**Transactions:** `ImportPipeline` owns the single outer transaction. Every
`WorkflowImporter.import()` call uses the passed `EntityManager`; no nested
transactions. Multi-workflow packages are all-or-nothing.

**Events:** Emitted **after** the transaction commits to avoid firing on
rollback. Per-workflow `workflow-created` events carry `source: 'import'`; one
package-level `workflows-imported` event summarises the batch. External hooks
(`workflow.afterCreate`) fire per workflow.

**`WorkflowActionSource` union:** extend to include `'import'`. Search the codebase
for the current literal list — likely a small union type emitted in `relay.event-map.ts`.

## Step 8 — Service shell

`import-export.types.ts` gains:

```ts
export type ImportPackageRequest = {
  user: User;
  projectId?: string;
  folderId?: string;
  packageBuffer: Buffer;
};
```

`import-export.service.ts` — **append only**; leave `exportWorkflows()` unchanged:

```ts
async importPackage(request: ImportPackageRequest): Promise<ImportResult> {
  return await this.importPipeline.run(request);
}
```

Inject `ImportPipeline` in the constructor alongside existing export dependencies.

## Step 9 — (no internal controller in this ticket)

Skipped intentionally. The internal `import-export.controller.ts` keeps
its existing export endpoint and gains nothing for import in this
ticket. Editor-ui integration arrives in a follow-up ticket; it will
add an internal route that shares `ImportPipeline` with the public API.

## Step 10 — Upload wiring

The global middleware stack runs `rawBodyReader` then `bodyParser`, which
buffers the body into `req.rawBody` (limit: `endpoints.payloadSizeMax`).
There is no true streaming through `req` for this route today.

- **Accepted `Content-Type`:** `application/gzip` or `application/octet-stream`.
  Handler **rejects** other types with `BadRequestError` before calling
  `readRawBody` (single guard clause at the top of the handler).
- **Footgun:** `bodyParser` runs the default branch for `application/gzip` and
  converts the body to a UTF-8 string in `req.body`, corrupting binary bytes.
  The handler must read `req.rawBody` (the original `Buffer`), never `req.body`.
- Handler calls `await req.readRawBody()` then passes `req.rawBody` to the pipeline.
- `projectId` / `folderId` on the query string.
- No `multer`. Document in OpenAPI that the body is binary gzip-compressed tar
  (`.n8np` is a filename convention on export, not a separate MIME type).
- **Pre-ship check:** verify the global `endpoints.payloadSizeMax` cap is at
  least as large as the largest Phase 1 package we expect (~30 MB worst case).
  Bump it (or add a per-route override) if not.

## Step 11 — Public API endpoint (the sole HTTP entry)

Import is exposed via the public API only in this ticket. The handler is
intentionally thin: license + API-key scope, parse query, read body, delegate.

Extend `packages/cli/src/public-api/v1/handlers/workflows/workflows.handler.ts`:

```ts
const ACCEPTED_CONTENT_TYPES = new Set(['application/gzip', 'application/octet-stream']);

importWorkflow: [
  isLicensed('feat:packageExport'),
  publicApiScope('workflow:import'),
  async (req, res) => {
    const contentType = req.contentType?.toLowerCase();
    if (!contentType || !ACCEPTED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestError(
        'Content-Type must be application/gzip or application/octet-stream',
      );
    }

    const query = z.object({
      projectId: z.string().trim().min(1).optional(),
      folderId: z.string().trim().min(1).optional(),
    }).parse(req.query);

    await req.readRawBody();
    if (!req.rawBody?.length) {
      throw new BadRequestError('Request body is required');
    }

    const result = await Container.get(ImportExportService).importPackage({
      user: req.user,
      projectId: query.projectId,
      folderId: query.folderId,
      packageBuffer: req.rawBody,
    });

    return res.status(200).json(result);
  },
],
```

Route: `POST /workflows/import` under `/api/v1`.

**Files touched:**
- `public-api/v1/handlers/workflows/workflows.handler.ts` — handler + route
- `public-api/v1/handlers/workflows/spec/paths/workflows.import.yml` — OpenAPI
  (binary request body + `ImportResult` response schema)
- `public-api/types.ts` — `WorkflowRequest.Import`

**Authorization:** `publicApiScope('workflow:import')` checks the API key's global
scope. `ImportPipeline.resolveTarget()` checks the user's project-level
`workflow:import`. No duplicated project checks in the handler.

**Tests** at `public-api/v1/__tests__/workflows.test.ts` (extend existing):
- 200 with valid key + scope + body; asserts the rich `ImportResult` shape
- 400 on unsupported `Content-Type`
- 400 on empty body
- 401 without API key
- 403 without `workflow:import` on key
- 403 without project-level `workflow:import`
- 403 without `feat:packageExport` license
- Routing matrix via query params (no/yes project, no/yes folder)
- Manifest version mismatch, missing `manifest.json`, duplicate workflow id

## Step 12 — Tests

**Unit** (covered per step above):
- `entities/workflow/__tests__/workflow.serializer.test.ts` — round-trip; every
  stripped field absent in deserialized output (`id`, `versionId`,
  `parentFolderId`, `active`, timestamps, `pinData`, `tags`); preserved fields
  intact (`isArchived`, `nodes`, `connections`, `settings`, `meta`,
  `staticData`).
- `entities/workflow/__tests__/workflow.importer.test.ts` — mocked reader +
  target + `EntityManager`; asserts `sourceWorkflowId` set, fresh `id`,
  fresh `versionId`, `parentFolderId` from target, `SharedWorkflow` row
  created, missing tar entry aborts.
- `io/__tests__/tar-package-reader.test.ts` — round-trip.
- `spec/__tests__/manifest.schema.test.ts` — accept/reject malformed
  manifests; duplicate `id` rejection.

**Pipeline integration** at
`modules/import-export/__tests__/import-pipeline.integration.test.ts` (new file;
do not extend export integration tests). Exercises `ImportPipeline.run()` with
real DB, no HTTP:

- Single workflow into personal project (no `projectId`/`folderId`)
- Single workflow into folder of personal project (`folderId` only)
- Single workflow into project root (`projectId` only)
- Single workflow into folder of specified project (both)
- Multi-workflow tar lands all into the same target
- Fresh local `id` ≠ package `id`; `sourceWorkflowId` = package `id`
- `SharedWorkflow` row links workflow to target project with
  `role: 'workflow:owner'`
- `active = false` regardless of package value
- `isArchived` preserved from package
- `pinData` absent in stored workflow even when present in package
- Workflows with tags in package are imported tag-less
- `redactionPolicy` stripped when user lacks
  `workflow:updateRedactionSetting` on target project
- Per-workflow `workflow-created` events emitted with `source: 'import'`
- One `workflows-imported` event emitted with the full workflow id list
- Events fire only after transaction commits (no events on rollback)
- **Atomicity:** simulate a mid-batch insert failure; assert zero workflows
  created, zero events emitted
- Reject: `folderId` not in personal project
- Reject: `projectId` doesn't exist
- Reject: user lacks `workflow:import` on project
- Reject: `projectId` + `folderId` mismatch
- Reject: `packageFormatVersion` mismatch
- Reject: tar without `manifest.json` at root
- Reject: manifest declares workflow X but tar has no matching entry
- Reject: manifest declares duplicate workflow ids

**Public API HTTP tests** — covered in Step 11.

## Estimated change set

- New files: ~14 (reader, tar reader, importer, manifest schema, entity interfaces,
  import-pipeline, shared workflow-helpers module, import integration tests,
  OpenAPI path, unit tests)
- Modified: ~11 (DB entity + migration, permissions, event map +
  `WorkflowActionSource` union, `import-export.service.ts` import method
  only, `workflow.serializer.ts`, `WorkflowCreationService` to call shared
  helpers, public API handler/types, i18n, snapshot, e2e controller)
- Export files: **unchanged** (`workflow.exporter.ts`, export controller route,
  export integration tests)
- LOC: ~1200 including tests

## Suggested commit sequence

1. Prerequisite: merge `ligo-548-workflow-package-export-2`
2. DB migration + `sourceWorkflowId` column (step 1)
3. Permission scope `workflow:import` (step 2)
4. Extract shared workflow helpers from `WorkflowCreationService`
   (redaction-policy strip, node-id/webhook-id resolution, structure +
   pin-data validation) — pure refactor, behaviour unchanged (step 6 helpers)
5. `PackageReader` + `TarPackageReader` + tests (step 4)
6. Manifest zod schema + tests (step 5)
7. Entity interfaces + `deserialize` + `workflow.importer` + tests (step 6)
8. `WorkflowActionSource` union extension + `workflows-imported` event map
   addition (step 7 prep)
9. `ImportPipeline` + `importPackage` on service + integration tests (steps 7–8, 12)
10. Public API handler + OpenAPI + HTTP tests (step 11)
