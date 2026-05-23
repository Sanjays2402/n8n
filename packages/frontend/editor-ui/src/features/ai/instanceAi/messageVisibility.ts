import type { InstanceAiMessage } from '@n8n/api-types';

/**
 * True when the message would produce visible output in the message list.
 */
export function messageHasVisibleContent(message: InstanceAiMessage): boolean {
	if (message.role === 'user') return true;
	if (message.content) return true;

	const tree = message.agentTree;
	if (!tree) {
		return message.isStreaming;
	}

	if (tree.reasoning) return true;
	if (tree.statusMessage) return true;
	if (tree.status === 'error' && tree.error) return true;
	if (!message.isStreaming && tree.children.some((child) => child.status === 'active')) {
		return true;
	}

	return tree.timeline.length > 0;
}
