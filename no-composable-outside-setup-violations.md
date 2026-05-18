# `no-composable-outside-setup` Violations

The ESLint rule detects three violation types:
- **outside-setup**: composable called outside any composable / `setup()`
- **not-hoisted**: composable called inside a nested function within a composable / `setup()` (runs at event time, not setup time)
- **in-store**: composable called inside a Pinia store definition (`defineStore()`)

Store calls (`use*Store`) are not considered composables and are allowed anywhere.

**Total: 244 violations across 81 files (49 outside-setup, 44 not-hoisted, 151 in-store)**

| Category | Violations | outside-setup | not-hoisted | in-store | Files |
|---|---|---|---|---|---|
| Stores | 151 | 0 | 0 | 151 | 44 |
| Other (utils, routes, init) | 61 | 42 | 19 | 0 | 18 |
| Composables | 28 | 3 | 25 | 0 | 17 |
| Test files | 4 | 4 | 0 | 0 | 2 |

## Stores — 151 violations, 44 files

All in-store (composable calls inside store actions/getters).

- **`app/stores/workflowDocument.store.ts`** (25 in-store)
- **`features/ai/assistant/builder.store.ts`** (11 in-store)
- **`features/shared/nodeCreator/nodeCreator.store.ts`** (6 in-store)
- **`features/workflows/readyToRun/stores/readyToRun.store.ts`** (6 in-store)
- **`app/stores/logs.store.ts`** (5 in-store)
- **`app/stores/ui.store.ts`** (5 in-store)
- **`features/ai/assistant/assistant.store.ts`** (5 in-store)
- **`features/ndv/shared/ndv.store.ts`** (5 in-store)
- **`app/stores/posthog.store.ts`** (4 in-store)
- **`app/stores/versions.store.ts`** (4 in-store)
- **`experiments/aiTemplatesStarterCollection/stores/aiTemplatesStarterCollection.store.ts`** (4 in-store)
- **`experiments/readyToRunWorkflows/stores/readyToRunWorkflows.store.ts`** (4 in-store)
- **`features/ai/instanceAi/instanceAi.store.ts`** (4 in-store)
- **`features/execution/insights/insights.store.ts`** (4 in-store)
- **`features/workflows/templates/setupTemplate.store.ts`** (4 in-store)
- **`app/stores/workflows.store.ts`** (3 in-store)
- **`experiments/credentialsAppSelection/stores/credentialsAppSelection.store.ts`** (3 in-store)
- **`experiments/emptyStateBuilderPrompt/stores/emptyStateBuilderPrompt.store.ts`** (3 in-store)
- **`experiments/personalizedTemplates/stores/personalizedTemplates.store.ts`** (3 in-store)
- **`experiments/resourceCenter/stores/resourceCenter.store.ts`** (3 in-store)
- **`features/ai/assistant/chatPanel.store.ts`** (3 in-store)
- **`features/ai/assistant/focusedNodes.store.ts`** (3 in-store)
- **`features/ai/chatHub/chat.store.ts`** (3 in-store)
- **`features/ai/chatHub/chatHubPanel.store.ts`** (3 in-store)
- **`app/stores/pushConnection.store.ts`** (2 in-store)
- **`experiments/personalizedTemplatesV3/stores/personalizedTemplatesV3.store.ts`** (2 in-store)
- **`experiments/templateRecoV2/stores/templateRecoV2.store.ts`** (2 in-store)
- **`features/ai/instanceAi/instanceAiDebug.store.ts`** (2 in-store)
- **`features/collaboration/collaboration/collaboration.store.ts`** (2 in-store)
- **`features/shared/nodeCreator/composables/useViewStacks.ts`** (2 in-store) — actually a `defineStore()`, not a composable
- **`features/setupPanel/setupPanel.store.ts`** (2 in-store)
- **`features/workflows/templates/recommendations/recommendedTemplates.store.ts`** (2 in-store)
- **`app/stores/canvas.store.ts`** (1 in-store)
- **`app/stores/favorites.store.ts`** (1 in-store)
- **`app/stores/focusPanel.store.ts`** (1 in-store)
- **`app/stores/nodeTypes.store.ts`** (1 in-store)
- **`app/stores/workflowState.store.ts`** (1 in-store)
- **`experiments/readyToRunWorkflowsV2/stores/readyToRunWorkflowsV2.store.ts`** (1 in-store)
- **`features/ai/instanceAi/instanceAiSettings.store.ts`** (1 in-store)
- **`features/collaboration/projects/projects.store.ts`** (1 in-store)
- **`features/core/folders/folders.store.ts`** (1 in-store)
- **`features/ndv/runData/schemaPreview.store.ts`** (1 in-store)
- **`features/settings/users/users.store.ts`** (1 in-store)
- **`features/workflows/canvas/experimental/experimentalNdv.store.ts`** (1 in-store)

## Other (utils, routes, init) — 61 violations, 18 files

- **`features/shared/editors/components/CodeNodeEditor/completer.ts`** (18 not-hoisted)
- **`app/router.ts`** (8 outside-setup)
- **`features/execution/insights/chartjs.utils.ts`** (8 outside-setup)
- **`app/init.ts`** (7 outside-setup)
- **`features/shared/nodeCreator/views/viewsData.ts`** (5 outside-setup)
- **`experiments/utils.ts`** (2 outside-setup)
- **`features/ai/assistant/builder.utils.ts`** (2 outside-setup)
- **`app/plugins/components.ts`** (1 outside-setup)
- **`app/plugins/telemetry/index.ts`** (1 outside-setup)
- **`features/ai/assistant/assistant.api.ts`** (1 outside-setup)
- **`features/ai/mcpAccess/module.descriptor.ts`** (1 outside-setup)
- **`features/core/dataTable/module.descriptor.ts`** (1 outside-setup)
- **`features/execution/insights/insights.utils.ts`** (1 outside-setup)
- **`features/integrations/sourceControl.ee/sourceControl.utils.ts`** (1 outside-setup)
- **`features/ndv/parameters/utils/buttonParameter.utils.ts`** (1 outside-setup)
- **`features/shared/editors/plugins/codemirror/typescript/client/useTypescript.ts`** (1 not-hoisted)
- **`features/workflows/workflowDiff/useWorkflowDiff.ts`** (1 outside-setup)
- **`features/workflows/workflowHistory/utils.ts`** (1 outside-setup)

## Composables — 28 violations, 17 files

- **`app/composables/useWorkflowActivate.ts`** (5 not-hoisted)
- **`app/composables/useCanvasOperations.ts`** (3 not-hoisted)
- **`app/composables/useN8nLocalStorage.ts`** (2 not-hoisted)
- **`app/composables/useRunWorkflow.ts`** (2 not-hoisted)
- **`app/composables/useWorkflowSaving.ts`** (2 not-hoisted)
- **`features/ai/assistant/composables/useBuilderStreamingGuard.ts`** (2 outside-setup)
- **`features/execution/logs/composables/useChatMessaging.ts`** (2 not-hoisted)
- **`app/composables/useGlobalEntityCreation.ts`** (1 not-hoisted)
- **`app/composables/useNodeHelpers.ts`** (1 not-hoisted)
- **`app/composables/useWorkflowState.ts`** (1 outside-setup)
- **`features/ai/assistant/composables/useAIAssistantHelpers.ts`** (1 not-hoisted)
- **`features/ai/assistant/composables/useCodeDiff.ts`** (1 not-hoisted)
- **`features/settings/sso/provisioning/composables/useUserRoleProvisioningForm.ts`** (1 not-hoisted)
- **`features/shared/contextMenu/composables/useContextMenuItems.ts`** (1 not-hoisted)
- **`features/shared/editors/composables/useCodeEditor.ts`** (1 not-hoisted)
- **`features/shared/editors/composables/useExpressionEditor.ts`** (1 not-hoisted)
- **`features/shared/nodeCreator/composables/useActions.ts`** (1 not-hoisted)

## Test files — 4 violations, 2 files

- **`features/ai/instanceAi/__tests__/createInstanceAiHarness.ts`** (3 outside-setup)
- **`__tests__/utils.ts`** (1 outside-setup)

## Migration guide

Before migrating each violation, follow this checklist:

### 1. Check if the function is actually used

Search for all references. If the function has zero callers (or is only referenced by its own tests), delete it and its tests instead of migrating.

### 2. If migration makes the function too trivial, inline it

After moving the composable call out, check whether the remaining function body is trivial (e.g. a single store property access, a one-liner wrapper) and adds no abstraction. If so, inline the logic at the call sites and delete the function entirely.

### 3. Fixing outside-setup violations

**Pattern A: Pass the dependency as a parameter**

Best for pure utility functions where only a specific value (not the whole store) is needed. Avoid passing entire stores — pass the narrowest dependency to reduce coupling. Use a dedicated interface (like `NodeTypeProvider`) or `ReturnType<typeof useX>` only when 3+ properties are needed.

```typescript
// Before
export function someUtil() {
  const store = useSomeStore();
  return transform(store.someValue);
}

// After — caller passes the specific value
export function someUtil(value: string) {
  return transform(value);
}

// If the function is now trivial (single property access), inline instead:
// const value = useSomeStore().someValue;
```

**Pattern B: Move the composable call into the caller**

Best when the utility is only a thin wrapper around a composable.

```typescript
// Before — utility file
export function getLabels() {
  const i18n = useI18n();
  return { foo: i18n.baseText('foo'), bar: i18n.baseText('bar') };
}

// After — inline in the Vue component / composable that calls it
const i18n = useI18n();
const labels = { foo: i18n.baseText('foo'), bar: i18n.baseText('bar') };
```

**Pattern C: Convert to a composable**

Best when the function manages reactive state or combines multiple composables, and is always called from setup context.

```typescript
// Before — plain function in utils.ts
export function getWorkflowData() {
  const workflowsStore = useWorkflowsStore();
  const uiStore = useUIStore();
  return { ... };
}

// After — composable in its own file
export function useWorkflowData() {
  const workflowsStore = useWorkflowsStore();
  const uiStore = useUIStore();
  return { ... };
}
```

### 4. Fixing not-hoisted violations

Applies to composables and `setup()` callbacks. Composable calls inside nested functions execute at call time, not setup time. Hoist them to the top-level body.

Dynamic Pinia stores (e.g. `useWorkflowDocumentStore(createWorkflowDocumentId(id))`) are the exception — they need runtime IDs and are safe to call anywhere.

```typescript
// Before — useToast() runs when handle() / someAction() is called
export function useHandler() {
  async function handle() {
    const toast = useToast();
    toast.showMessage({ ... });
  }
  return handle;
}

// After — useToast() runs at setup time
export function useHandler() {
  const toast = useToast();
  async function handle() {
    toast.showMessage({ ... });
  }
  return handle;
}
```

### 5. Fixing in-store violations

Composable calls inside `defineStore()` are forbidden. Extract the composable usage into a composable and pass the result to the store, or pass it as a parameter from the call site.

```typescript
// Before — composable called inside store action
export const useMyStore = defineStore('my-store', () => {
  async function fetchData() {
    const toast = useToast();
    toast.showMessage({ ... });
  }
  return { fetchData };
});

// After — caller provides the dependency
export const useMyStore = defineStore('my-store', () => {
  async function fetchData(toast: ReturnType<typeof useToast>) {
    toast.showMessage({ ... });
  }
  return { fetchData };
});

// Or extract into a composable that wraps the store
export function useMyStoreActions() {
  const toast = useToast();
  const store = useMyStore();

  async function fetchData() {
    await store.fetchData();
    toast.showMessage({ ... });
  }

  return { ...store, fetchData };
}
```
