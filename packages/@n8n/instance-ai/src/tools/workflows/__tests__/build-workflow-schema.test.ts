import type { InstanceAiContext } from '../../../types';
import { buildWorkflowInputSchema, createBuildWorkflowTool } from '../build-workflow.tool';

describe('buildWorkflowInputSchema.patches coercion', () => {
	const patch = { old_str: 'foo', new_str: 'bar' };

	it('accepts a native array of patches', () => {
		const parsed = buildWorkflowInputSchema.parse({ patches: [patch] });
		expect(parsed.patches).toEqual([patch]);
	});

	it('accepts a JSON-stringified array of patches', () => {
		const parsed = buildWorkflowInputSchema.parse({ patches: JSON.stringify([patch]) });
		expect(parsed.patches).toEqual([patch]);
	});

	it('rejects a non-JSON string with a helpful array-expected error', () => {
		const result = buildWorkflowInputSchema.safeParse({ patches: 'not-json' });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toEqual(['patches']);
		}
	});

	it('rejects a stringified object (not an array)', () => {
		const result = buildWorkflowInputSchema.safeParse({ patches: JSON.stringify(patch) });
		expect(result.success).toBe(false);
	});

	it('leaves patches undefined when not provided', () => {
		const parsed = buildWorkflowInputSchema.parse({});
		expect(parsed.patches).toBeUndefined();
	});
});

describe('build-workflow approval flow', () => {
	type BuildWorkflowTool = ReturnType<typeof createBuildWorkflowTool>;
	type BuildWorkflowHandlerContext = Parameters<NonNullable<BuildWorkflowTool['handler']>>[1];
	type Permissions = NonNullable<InstanceAiContext['permissions']>;

	function makeContext(permissions: Partial<Permissions>): InstanceAiContext {
		return {
			userId: 'user-1',
			permissions: permissions as Permissions,
			workflowService: {},
			executionService: {},
			credentialService: {},
			nodeService: {},
			dataTableService: {},
		} as unknown as InstanceAiContext;
	}

	function makeToolContext(resumeData?: { approved: boolean }): {
		context: BuildWorkflowHandlerContext;
		suspend: jest.Mock;
	} {
		const suspend = jest.fn().mockResolvedValue(undefined);
		return {
			context: { resumeData, suspend } as BuildWorkflowHandlerContext,
			suspend,
		};
	}

	it('suspends for approval before creating a workflow', async () => {
		const tool = createBuildWorkflowTool(makeContext({}));
		const { context, suspend } = makeToolContext();

		await tool.handler?.({ code: 'invalid', name: 'Lead intake' }, context);

		expect(suspend).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Create workflow Lead intake',
				severity: 'info',
			}),
		);
	});

	it('suspends for approval before updating a workflow', async () => {
		const tool = createBuildWorkflowTool(makeContext({}));
		const { context, suspend } = makeToolContext();

		await tool.handler?.({ code: 'invalid', workflowId: 'wf-1', name: 'Lead intake' }, context);

		expect(suspend).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Update workflow Lead intake',
				severity: 'info',
			}),
		);
	});

	it('returns a denied result when the user denies approval', async () => {
		const tool = createBuildWorkflowTool(makeContext({}));
		const { context } = makeToolContext({ approved: false });

		const result = await tool.handler?.({ code: 'invalid', name: 'Lead intake' }, context);

		expect(result).toEqual({ success: false, errors: ['User denied the action'] });
	});

	it('returns a blocked result when admin policy blocks the mutation', async () => {
		const tool = createBuildWorkflowTool(makeContext({ createWorkflow: 'blocked' }));
		const { context } = makeToolContext();

		const result = await tool.handler?.({ code: 'invalid', name: 'Lead intake' }, context);

		expect(result).toEqual({ success: false, errors: ['Action blocked by admin'] });
	});

	it('does not suspend when the mutation is always allowed', async () => {
		const tool = createBuildWorkflowTool(makeContext({ createWorkflow: 'always_allow' }));
		const { context, suspend } = makeToolContext();

		await tool.handler?.({ code: 'invalid', name: 'Lead intake' }, context);

		expect(suspend).not.toHaveBeenCalled();
	});
});
