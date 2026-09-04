import makeState, { BATCH_CHANGE_EVENT_TYPE, CHANGE_EVENT_TYPE, DELETE, eventTargetRegistry } from './make-state.js';
import TrackedEventTarget from './vendor/tracked-event-target.js';

import test, { describe, mock } from 'node:test';
import assert from 'node:assert';

describe('make-state.test.js', async () => {
	test('pass smoke test', () => {
		assert.strictEqual(typeof makeState, 'function');
		assert.strictEqual(typeof DELETE, 'symbol');
		assert.ok(eventTargetRegistry instanceof WeakMap);
	});

	test('make undefined state', () => {
		const [proxy, eventTarget] = makeState();

		assert.deepStrictEqual(proxy, {});
		assert.ok(eventTarget instanceof TrackedEventTarget);
		assert.ok(eventTargetRegistry.has(proxy));
		assert.strictEqual(eventTargetRegistry.get(proxy), eventTarget);
	});

	describe('object state', async () => {
		test('make object state', async () => {
			const target = { name: 'Alice' };
			const [proxy] = makeState(target);

			assert.deepStrictEqual(proxy, { name: 'Alice' });
		});

		describe('change event', async () => {
			test('change object property', () => {
				const target = { name: 'Alice' };
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy.name = 'Bob';

				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.deepStrictEqual(result.detail.change, {
					target: { name: 'Bob' },
					property: 'name',
					oldValue: 'Alice',
					proxy,
					path: ['name'],
					keys: ['name'],
					dispatched: new Set([eventTarget])
				});
			});

			test('change object property as insertion', () => {
				const target = {};
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy.name = 'Alice';

				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.deepStrictEqual(result.detail.change, {
					target: { name: 'Alice' },
					property: 'name',
					oldValue: undefined,
					proxy,
					path: ['name'],
					keys: ['name'],
					dispatched: new Set([eventTarget])
				});
			});

			test('change object property as removal', () => {
				const target = { name: 'Alice' };
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				delete proxy.name;

				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.deepStrictEqual(result.detail.change, {
					target: {},
					property: 'name',
					oldValue: 'Alice',
					proxy,
					path: ['name'],
					keys: ['name'],
					dispatched: new Set([eventTarget])
				});
			});

			test('change object property twice', () => {
				const target = {};
				const [proxy, eventTarget] = makeState(target);

				let results = [];
				const listener = (event) => { results.push(event); };
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, listener);
				proxy.name = 'Alice';
				proxy.name = 'Bob';
				eventTarget.removeEventListener(CHANGE_EVENT_TYPE, listener);

				const expectedBase = {
					target: { name: 'Bob' },
					property: 'name',
					proxy,
					path: ['name'],
					keys: ['name'],
					dispatched: new Set([eventTarget])
				};
				assert.ok(results[0] instanceof CustomEvent);
				assert.ok('change' in results[0].detail);
				assert.deepStrictEqual(results[0].detail.change, {
					...expectedBase,
					oldValue: undefined
				});
				assert.ok(results[1] instanceof CustomEvent);
				assert.ok('change' in results[1].detail);
				assert.deepStrictEqual(results[1].detail.change, {
					...expectedBase,
					oldValue: 'Alice'
				});
			});
		});

		describe('batched change event', async () => {
			test('change object properties', async () => {
				const target = { name: 'Alice' };
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(BATCH_CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy.name = 'Bob';
				await Promise.resolve();

				const expectedRaw = [{
					target: { name: 'Bob' },
					property: 'name',
					oldValue: 'Alice',
					proxy,
					path: ['name'],
					keys: ['name'],
					dispatched: new Set([eventTarget])
				}];
				assert.ok(result instanceof CustomEvent);
				assert.ok('raw' in result.detail);
				assert.deepStrictEqual(result.detail.raw, expectedRaw);
				assert.ok('changes' in result.detail);
				assert.deepStrictEqual(result.detail.changes, new Map([['name', expectedRaw[0]]]));
			});

			test('change object properties multiple', async () => {
				const target = { name: 'Alice' };
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(BATCH_CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy.name = 'Bob';
				proxy.name = 'Charlie';
				proxy.age = 30;
				await Promise.resolve();

				const expectedBase = {
					target: { name: 'Charlie', age: 30 },
					proxy,
					dispatched: new Set([eventTarget])
				};
				const expectedRaw = [{
					...expectedBase,
					property: 'name',
					oldValue: 'Alice',
					path: ['name'],
					keys: ['name']
				}, {
					...expectedBase,
					property: 'name',
					oldValue: 'Bob',
					path: ['name'],
					keys: ['name']
				}, {
					...expectedBase,
					property: 'age',
					oldValue: undefined,
					path: ['age'],
					keys: ['age']
				}];
				assert.ok(result instanceof CustomEvent);
				assert.ok('raw' in result.detail);
				assert.deepStrictEqual(result.detail.raw, expectedRaw);
				assert.ok('changes' in result.detail);
				assert.deepStrictEqual(result.detail.changes, new Map([
					['name', expectedRaw[0]],
					['age', expectedRaw[2]]
				]));
			});
		});
	});

	describe('array state', () => {
		test('make array state', () => {
			const target = ['Alice'];
			const [proxy] = makeState(target);

			assert.deepStrictEqual(proxy, ['Alice']);
		});

		describe('change event', () => {
			test('change array element', () => {
				const target = ['Alice'];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy[0] = 'Bob';

				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.deepStrictEqual(result.detail.change, {
					target: ['Bob'],
					property: '0',
					oldValue: 'Alice',
					proxy,
					path: ['0'],
					keys: ['0'],
					dispatched: new Set([eventTarget])
				});
			});

			test('change array element as insertion', () => {
				const target = [];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; });
				proxy.push('Alice');

				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.deepStrictEqual(result.detail.change, {
					target: ['Alice'],
					property: '0',
					oldValue: undefined,
					proxy,
					path: ['0'],
					keys: ['0'],
					dispatched: new Set([eventTarget])
				});
			});

			test('change array element as removal', () => {
				const target = ['Alice'];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				let element = proxy.pop();

				assert.strictEqual(element, 'Alice');
				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.deepStrictEqual(result.detail.change, {
					target: [],
					property: '0',
					oldValue: 'Alice',
					proxy,
					path: ['0'],
					keys: ['0'],
					dispatched: new Set([eventTarget])
				});
			});

			test('change array element twice', () => {
				const target = [];
				const [proxy, eventTarget] = makeState(target);

				let results = [];
				const listener = (event) => { results.push(event); };

				eventTarget.addEventListener(CHANGE_EVENT_TYPE, listener);
				proxy.push('Alice');
				const element = proxy.pop();
				proxy.push('Bob');
				eventTarget.removeEventListener(CHANGE_EVENT_TYPE, listener);

				const expectedBase = {
					target: ['Bob'],
					proxy,
					dispatched: new Set([eventTarget])
				};
				assert.strictEqual(element, 'Alice');
				assert.ok(results[0] instanceof CustomEvent);
				assert.ok('change' in results[0].detail);
				assert.deepStrictEqual(results[0].detail.change, {
					...expectedBase,
					property: '0',
					oldValue: undefined,
					path: ['0'],
					keys: ['0']
				});
				assert.ok(results[1] instanceof CustomEvent);
				assert.ok('change' in results[1].detail);
				assert.deepStrictEqual(results[1].detail.change, {
					...expectedBase,
					property: '0',
					oldValue: 'Alice',
					path: ['0'],
					keys: ['0']
				});
				assert.ok(results[2] instanceof CustomEvent);
				assert.ok('change' in results[2].detail);
				assert.deepStrictEqual(results[2].detail.change, {
					...expectedBase,
					property: 'length',
					oldValue: 1,
					path: ['length'],
					keys: ['length']
				}); // javascript quirk - array pop makes length change visible for pop method
				assert.ok(results[3] instanceof CustomEvent);
				assert.ok('change' in results[3].detail);
				assert.deepStrictEqual(results[3].detail.change, {
					...expectedBase,
					property: '0',
					oldValue: undefined,
					path: ['0'],
					keys: ['0']
				});
			});
		});

		describe('batched change event', () => {
			test('change array element', async () => {
				const target = ['Alice'];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(BATCH_CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy[0] = 'Bob';
				await Promise.resolve();

				const expected = {
					target: ['Bob'],
					property: '0',
					oldValue: 'Alice',
					proxy,
					path: ['0'],
					keys: ['0'],
					dispatched: new Set([eventTarget])
				};
				assert.ok(result instanceof CustomEvent);
				assert.ok('raw' in result.detail);
				assert.deepStrictEqual(result.detail.raw, [expected]);
				assert.ok('changes' in result.detail);
				assert.deepStrictEqual(result.detail.changes, new Map([['0', expected]]));
			});
		});
	});

	describe('nested state', () => {
		test('make nested state', () => {
			const addressTarget = { city: 'Toronto' };
			const [addressProxy] = makeState(addressTarget);
			const personTarget = { name: 'Alice', address: addressProxy };
			const [personProxy] = makeState(personTarget);

			assert.strictEqual(typeof addressProxy, 'object');
			assert.ok(!Array.isArray(addressProxy));
			assert.deepStrictEqual(addressTarget, addressProxy);
			assert.ok(eventTargetRegistry.has(addressProxy));
			assert.strictEqual(typeof personProxy, 'object');
			assert.ok(!Array.isArray(personProxy));
			assert.deepStrictEqual(personTarget, personProxy);
			assert.ok(eventTargetRegistry.has(personProxy));
		});

		describe('change event', async () => {
			test('change nested property', () => {
				const addressTarget = { city: 'Toronto' };
				const [addressProxy] = makeState(addressTarget);
				const personTarget = { name: 'Alice', address: addressProxy };
				const [personProxy, eventTarget] = makeState(personTarget);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				personProxy.address.city = 'Vancouver';

				assert.ok(result instanceof CustomEvent);
				assert.ok('change' in result.detail);
				assert.strictEqual(result.detail.change.target, addressTarget);
				assert.strictEqual(result.detail.change.property, 'city');
				assert.strictEqual(result.detail.change.oldValue, 'Toronto');
				assert.strictEqual(result.detail.change.proxy, addressProxy);
				assert.ok(result.detail.change.path[0].has('address'));
				assert.strictEqual(result.detail.change.path[1], 'city');
				assert.ok(result.detail.change.dispatched instanceof Set);
				assert.ok(result.detail.change.dispatched.has(eventTarget));
			});

		});
	});
});
