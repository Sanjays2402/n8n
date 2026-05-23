---
name: workflow-builder
description: >-
  Builds and edits n8n workflows directly with the workflow SDK and the
  build-workflow tool. Use for workflow creation, workflow edits, fixes,
  node rewiring, credential-preserving patches, and workflow validation
  retries.
recommended_tools:
  - build-workflow
  - workflows
  - credentials
  - nodes
  - data-tables
  - parse-file
  - ask-user
platforms:
  - daytona
---

# Workflow Builder

Use this skill to build, patch, fix, and update n8n workflows in the current
main-agent turn. Do not delegate, spawn a workflow-builder sub-agent, or call a
workflow-builder background tool. Workflow building is direct tool use:
discover context, write SDK code, call `build-workflow`, patch errors, and
finish with a concise result.

## Default Procedure

1. Classify the request: new workflow, edit existing workflow, patch after an
   error, credential/resource setup, or verification follow-up.
2. Inspect existing state before editing. Use `workflows(action="get-as-code")`
   when a `workflowId` is available and patches need exact source strings.
3. Discover node schemas before configuring nodes. Use
   `nodes(action="suggested")` for known workflow categories and
   `nodes(action="search")` plus `nodes(action="type-definition")` for
   integration-specific nodes. Treat `@builderHint` annotations as the source
   of truth.
4. Check credentials with `credentials(action="list")`. Preserve explicit
   user-selected credentials. If one matching credential exists, wire it. If
   multiple matching credentials exist and the user did not name one, ask once.
5. Generate TypeScript SDK code using `@n8n/workflow-sdk`, then call
   `build-workflow`. For small fixes, prefer `patches` over resending the full
   workflow code.
6. If `build-workflow` returns validation errors, patch and retry in the same
   turn. Stop only after a successful save or a concrete blocker.

## SDK Rules

- Do not specify node positions. The layout engine handles positions.
- Use `expr('{{ $json.field }}')` for n8n expressions. Variables must be inside
  `{{ }}`.
- Do not use TypeScript-only syntax that the workflow parser cannot consume,
  especially `as const`.
- Use string literals directly for discriminator fields such as `resource` and
  `operation`.
- When editing round-tripped workflow code, remove `position` arrays and replace
  raw credential objects with `newCredential(...)`.
- Use `newCredential('Name', 'id')` only for an explicit existing credential.
  Use `newCredential('Suggested Name')` when no exact credential is selected;
  `build-workflow` will preserve valid credentials and mock unresolved ones.
- Never invent credential IDs, API tokens, resource IDs, Slack channels,
  Telegram chat IDs, email addresses, bearer tokens, or sample user data.
  Use `placeholder()` for user-provided values that must be collected later.
- The credential-selection guidance above applies to outbound service calls. For inbound triggers such as Webhook or Form Trigger, keep authentication at its default `none` unless the user explicitly asks to authenticate inbound traffic.
- Resource IDs with more than one candidate: If `explore-resources` returns more than one match and the user did not name a specific one, use `placeholder('Select <resource>')`.

## Node Configuration Safety Rules

- Fetch `nodes(action="type-definition")` before configuring nodes. Generated
  definitions and `@builderHint` annotations are the source of truth.
- Use live `nodes(action="explore-resources")` for resource locator, list, and
  model fields when credentials are available.
- If a configuration is unclear after reading the definition, ask for
  clarification or use placeholders. Do not guess.

## Workflow Design Rules

- Describe and implement the user's goal, integrations, data flow, and table
  requirements. Do not overfit to guessed node parameter names.
- Parameter precedence is: user value > live resource/tool result >
  node `@builderHint` / default. If the user gave a concrete value, preserve it.
  Otherwise resolve it with tools or leave it as a placeholder.
- For IF, Switch, and Merge nodes, trace every branch before declaring success.
  Confirm IF outputs use `.onTrue()` / `.onFalse()`, Switch outputs use
  zero-based `.onCase(index, target)`, and Merge mode matches the data shape.
- For empty item lists, let the workflow emit zero items. Do not add
  `alwaysOutputData: true` or redundant IF gates just to keep downstream nodes
  alive.
- Use `executeOnce: true` when one node should run once for many input items,
  such as sending a summary notification or generating a report.
- Pick the right control-flow primitive: `filter` for dropping items, `IF` for
  two real branches, `switch` for many keyed branches, and `splitInBatches` for
  per-item side effects.
- Name AI tools by the action they perform. Set explicit concise snake_case
  tool names such as `get_email`, `add_labels`, or `mark_as_read`.

## Existing Workflow Edits

- Prefer `build-workflow` patch mode for small edits:
  `{ workflowId, patches: [{ old_str, new_str }] }`.
- Fetch current code with `workflows(action="get-as-code")` when you need exact
  patch anchors or need to understand existing wiring.
- Preserve existing credentials unless the user asks to change them.
- Preserve webhook paths and resource references unless the edit requires a
  change.
- Unresolved credentials and placeholders are handled in the inline setup card in the AI Assistant panel after the workflow is saved.

## Planned Build Follow-Ups

When the input contains `<planned-task-follow-up type="build-workflow">`, use
the `buildTask` payload as the source of truth. Load this skill, perform that
one build task, call `build-workflow`, patch validation errors if needed, and
then stop. The successful tool call records the planned task outcome for later
checkpoint verification.

## Completion

Stay silent while working unless blocked. On normal user-facing turns, finish
with one concise sentence naming the saved workflow and any setup/testing next
step. In planned build follow-up turns, do not write a user-facing completion
message after the successful `build-workflow` call.
