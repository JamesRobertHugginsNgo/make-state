import makeState, { BATCH_CHANGE_EVENT_TYPE, CHANGE_EVENT_TYPE, DELETE, eventTargetRegistry } from './make-state.js';
import TrackedEventTarget from './tracked-event-target.js';

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

		assert.strictEqual(typeof proxy, 'object');
		assert.ok(!Array.isArray(proxy));
		assert.ok(eventTarget instanceof TrackedEventTarget);
		assert.ok(eventTargetRegistry.has(proxy));
		assert.strictEqual(eventTargetRegistry.get(proxy), eventTarget);
	});

	describe('object state', async () => {
		test('make object state', async () => {
			const target = { name: 'Alice' };
			const [proxy] = makeState(target);

			assert.strictEqual(typeof proxy, 'object');
			assert.ok(!Array.isArray(proxy));
			assert.deepEqual(target, proxy);
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
				assert.strictEqual(result.detail.change.target, target);
				assert.strictEqual(result.detail.change.property, 'name');
				assert.strictEqual(result.detail.change.oldValue, 'Alice');
				assert.strictEqual(result.detail.change.proxy, proxy);
				assert.ok(result.detail.change.dispatched instanceof Set);
				assert.ok(result.detail.change.dispatched.has(eventTarget));
			});

			test('change object property as insertion', () => {
				const target = {};
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy.name = 'Bob';

				assert.strictEqual(result.detail.change.property, 'name');
				assert.strictEqual(result.detail.change.oldValue, undefined);
			});

			test('change object property as removal', () => {
				const target = { name: 'Alice' };
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				delete proxy.name;

				assert.strictEqual(result.detail.change.property, 'name');
				assert.strictEqual(result.detail.change.oldValue, 'Alice');
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

				assert.strictEqual(results.length, 2);
				assert.strictEqual(results[0].detail.change.property, 'name');
				assert.strictEqual(results[0].detail.change.oldValue, undefined);
				assert.strictEqual(results[1].detail.change.property, 'name');
				assert.strictEqual(results[1].detail.change.oldValue, 'Alice');
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

				assert.ok(result instanceof CustomEvent);
				assert.ok('raw' in result.detail);
				assert.ok(Array.isArray(result.detail.raw));
				assert.strictEqual(result.detail.raw.length, 1);
				assert.ok('changes' in result.detail);
				assert.ok(result.detail.changes instanceof Map);
				assert.ok(result.detail.changes.has('name'));
			});
		});
	});

	describe('array state', () => {
		test('make array state', () => {
			const target = ['Alice'];
			const [proxy] = makeState(target);

			assert.strictEqual(typeof proxy, 'object');
			assert.ok(Array.isArray(proxy));
			assert.deepEqual(target, proxy);
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
				assert.strictEqual(result.detail.change.target, target);
				assert.strictEqual(result.detail.change.property, '0');
				assert.strictEqual(result.detail.change.oldValue, 'Alice');
				assert.strictEqual(result.detail.change.proxy, proxy);
				assert.ok(result.detail.change.dispatched instanceof Set);
				assert.ok(result.detail.change.dispatched.has(eventTarget));
			});

			test('change array element as insertion', () => {
				const target = [];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; });
				proxy.push('Alice');

				assert.strictEqual(result.detail.change.property, '0');
				assert.strictEqual(result.detail.change.oldValue, undefined);
			});

			test('change array element as removal', () => {
				const target = ['Alice'];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				let element = proxy.pop();

				assert.strictEqual(element, 'Alice');
				assert.strictEqual(result.detail.change.property, '0');
				assert.strictEqual(result.detail.change.oldValue, 'Alice');
			});

			test('change array element twice', () => {
				const target = [];
				const [proxy, eventTarget] = makeState(target);

				let results = [];
				const listener = (event) => { results.push(event); };
				eventTarget.addEventListener(CHANGE_EVENT_TYPE, listener);
				proxy.push('Alice');
				proxy.pop();
				proxy.push('Bob');
				eventTarget.removeEventListener(CHANGE_EVENT_TYPE, listener);

				assert.strictEqual(results.length, 4);
				assert.strictEqual(results[0].detail.change.property, '0');
				assert.strictEqual(results[0].detail.change.oldValue, undefined);
				assert.strictEqual(results[1].detail.change.property, '0');
				assert.strictEqual(results[1].detail.change.oldValue, 'Alice');
				assert.strictEqual(results[2].detail.change.property, 'length'); // array set trap quirk - change visible on pop but not push
				assert.strictEqual(results[0].detail.change.property, '0');
				assert.strictEqual(results[0].detail.change.oldValue, undefined);
			});
		});

		describe('batched change event', () => {
			test('change array element', async () => {
				const target = ['Alice'];
				const [proxy, eventTarget] = makeState(target);

				let result;
				eventTarget.addEventListener(BATCH_CHANGE_EVENT_TYPE, (event) => { result = event; }, { once: true });
				proxy.pop();
				proxy.push('Bob');
				await Promise.resolve();

				assert.ok(result instanceof CustomEvent);
				assert.ok('raw' in result.detail);
				assert.ok(Array.isArray(result.detail.raw));
				assert.strictEqual(result.detail.raw.length, 3);
				assert.ok('changes' in result.detail);
				assert.ok(result.detail.changes instanceof Map);
				assert.ok(result.detail.changes.has('0'));
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
			assert.deepEqual(addressTarget, addressProxy);
			assert.ok(eventTargetRegistry.has(addressProxy));
			assert.strictEqual(typeof personProxy, 'object');
			assert.ok(!Array.isArray(personProxy));
			assert.deepEqual(personTarget, personProxy);
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
				assert.strictEqual(result.detail.change.path[0], 'address');
				assert.strictEqual(result.detail.change.path[1], 'city');
				assert.ok(result.detail.change.dispatched instanceof Set);
				assert.ok(result.detail.change.dispatched.has(eventTarget));
			});
		});
	});
});
