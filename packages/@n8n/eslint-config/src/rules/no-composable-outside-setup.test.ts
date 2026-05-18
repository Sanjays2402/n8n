import { RuleTester } from '@typescript-eslint/rule-tester';
import { NoComposableOutsideSetupRule } from './no-composable-outside-setup.js';

const ruleTester = new RuleTester({
	languageOptions: {
		parser: require('@typescript-eslint/parser'),
		parserOptions: {
			ecmaVersion: 2020,
			sourceType: 'module',
		},
	},
});

ruleTester.run('no-composable-outside-setup', NoComposableOutsideSetupRule, {
	valid: [
		{
			name: 'inside another composable (function declaration)',
			code: `
				export function useToast() {
					const store = useSettingsStore();
					return { store };
				}
			`,
			filename: '/test/useToast.ts',
		},
		{
			name: 'inside another composable (arrow function)',
			code: `
				export const useToast = () => {
					const store = useSettingsStore();
					return { store };
				};
			`,
			filename: '/test/useToast.ts',
		},
		{
			name: 'inside setup() method',
			code: `
				export default defineComponent({
					setup() {
						const toast = useToast();
						return { toast };
					},
				});
			`,
			filename: '/test/MyComponent.ts',
		},
		{
			name: 'store call inside defineStore callback',
			code: `
				export const useMyStore = defineStore('my-store', () => {
					const other = useOtherStore();
					return { other };
				});
			`,
			filename: '/test/myStore.ts',
		},
		{
			name: 'store call at module top level in .ts file',
			code: `
				const settings = useSettingsStore();
			`,
			filename: '/test/utils.ts',
		},
		{
			name: 'store call inside a regular function',
			code: `
				function handleClick() {
					const settings = useSettingsStore();
				}
			`,
			filename: '/test/handlers.ts',
		},
		{
			name: 'inside a .vue file (script setup)',
			code: `
				const toast = useToast();
			`,
			filename: '/test/MyComponent.vue',
		},
		{
			name: 'non-composable function call at top level',
			code: `
				const result = fetchData();
			`,
			filename: '/test/utils.ts',
		},
		{
			name: 'method call with use prefix is ignored',
			code: `
				obj.useSomething();
			`,
			filename: '/test/utils.ts',
		},
	],
	invalid: [
		{
			name: 'composable at module top level in .ts file',
			code: `
				const toast = useToast();
			`,
			filename: '/test/utils.ts',
			errors: [{ messageId: 'noComposableOutsideSetup', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a regular function',
			code: `
				function handleClick() {
					const toast = useToast();
				}
			`,
			filename: '/test/handlers.ts',
			errors: [{ messageId: 'noComposableOutsideSetup', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a regular arrow function',
			code: `
				const handleClick = () => {
					const toast = useToast();
				};
			`,
			filename: '/test/handlers.ts',
			errors: [{ messageId: 'noComposableOutsideSetup', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a class method',
			code: `
				class MyClass {
					init() {
						const toast = useToast();
					}
				}
			`,
			filename: '/test/MyClass.ts',
			errors: [{ messageId: 'noComposableOutsideSetup', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a callback in a regular function',
			code: `
				function init() {
					onMounted(() => {
						const toast = useToast();
					});
				}
			`,
			filename: '/test/init.ts',
			errors: [{ messageId: 'noComposableOutsideSetup', data: { name: 'useToast' } }],
		},
		{
			name: 'multiple composable violations',
			code: `
				const toast = useToast();
				const route = useRoute();
			`,
			filename: '/test/utils.ts',
			errors: [
				{ messageId: 'noComposableOutsideSetup', data: { name: 'useToast' } },
				{ messageId: 'noComposableOutsideSetup', data: { name: 'useRoute' } },
			],
		},
		{
			name: 'composable inside a nested function within a composable',
			code: `
				export function useHandler() {
					async function handle() {
						const toast = useToast();
					}
				}
			`,
			filename: '/test/useHandler.ts',
			errors: [{ messageId: 'composableNotHoisted', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a callback within a composable',
			code: `
				export function useToast() {
					onMounted(() => {
						const route = useRoute();
					});
				}
			`,
			filename: '/test/useToast.ts',
			errors: [{ messageId: 'composableNotHoisted', data: { name: 'useRoute' } }],
		},
		{
			name: 'composable inside an arrow function within a composable',
			code: `
				export const useHandler = () => {
					const handle = () => {
						const i18n = useI18n();
					};
				};
			`,
			filename: '/test/useHandler.ts',
			errors: [{ messageId: 'composableNotHoisted', data: { name: 'useI18n' } }],
		},
		{
			name: 'composable inside a nested function within setup()',
			code: `
				export default defineComponent({
					setup() {
						function onClick() {
							const toast = useToast();
						}
					},
				});
			`,
			filename: '/test/MyComponent.ts',
			errors: [{ messageId: 'composableNotHoisted', data: { name: 'useToast' } }],
		},
		{
			name: 'composable directly inside defineStore()',
			code: `
				export const useMyStore = defineStore('my-store', () => {
					const toast = useToast();
					return { toast };
				});
			`,
			filename: '/test/myStore.ts',
			errors: [{ messageId: 'noComposableInStore', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a nested function within defineStore()',
			code: `
				export const useMyStore = defineStore('my-store', () => {
					function someAction() {
						const toast = useToast();
					}
					return { someAction };
				});
			`,
			filename: '/test/myStore.ts',
			errors: [{ messageId: 'noComposableInStore', data: { name: 'useToast' } }],
		},
		{
			name: 'composable inside a store action (arrow function)',
			code: `
				export const useMyStore = defineStore('my-store', () => {
					const fetchData = async () => {
						const toast = useToast();
						toast.showMessage('done');
					};
					return { fetchData };
				});
			`,
			filename: '/test/myStore.ts',
			errors: [{ messageId: 'noComposableInStore', data: { name: 'useToast' } }],
		},
	],
});
