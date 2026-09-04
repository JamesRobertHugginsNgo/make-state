import TrackedEventTarget from './vendor/tracked-event-target.js';

export const CHANGE_EVENT_TYPE = 'change';
export const BATCH_CHANGE_EVENT_TYPE = 'batchchanges';

export const DELETE = Symbol();

export const eventTargetRegistry = new WeakMap();

export function makePaths(path) {
	return path.reduce((acc, curr) => {
		if (curr instanceof Set) {
			curr = Array.from(curr);
		}
		if (!Array.isArray(curr)) {
			curr = [curr];
		}
		return acc.flatMap((combo) => {
			return curr.map((item) => { return [...combo, item]; });
		});
	}, [[]]);
}

export function makeKeys(path) {
	const paths = makePaths(path);

	return paths
		.filter((path) => {
			if (path.length === 1) {
				return true; // path with single segment can be string or symbol and is a valid key
			}
			return path.every((segments) => {
				return typeof segments === 'string';
			});
		})
		.map((path) => {
			if (path.length === 1) {
				return path[0]; // path with single segment can be string or symbol and is a valid key
			}
			return path.join('.'); // path with multiple segments is joined by dots
		});
}

function identityFn(value) {
	return value;
};
export default function makeState(targetObj = {}, format = identityFn) {
	const eventTarget = new TrackedEventTarget();

	let rawChanges = [];
	const scheduleMicrotask = () => {
		const isFirstScheduled = rawChanges.length === 0;
		if (!isFirstScheduled) {
			return;
		}

		queueMicrotask(() => {
			if (rawChanges.length === 0) {
				return;
			}

			if (!eventTarget.canDispatch(BATCH_CHANGE_EVENT_TYPE)) {
				rawChanges = [];
				return;
			}

			const raw = rawChanges;
			rawChanges = [];

			const changes = new Map();
			for (const change of raw) {
				const { path } = change;

				const keys = makeKeys(path);
				for (const key of keys) {
					if (!changes.has(key)) {
						changes.set(key, change);
					}
				}
			}
			for (const [key, change] of changes) {
				const { target, property, oldValue } = change;
				if (target[property] === oldValue) {
					changes.delete(key);
				}
			}

			eventTarget.dispatchEvent(new CustomEvent(BATCH_CHANGE_EVENT_TYPE, { detail: { raw, changes } }));
		});
	};

	const listeners = new Map();
	const cleanupOldValue = (property, oldValue) => {
		if (!listeners.has(oldValue) || !eventTargetRegistry.has(oldValue)) {
			return;
		}

		const { listener, properties } = listeners.get(oldValue);
		properties.delete(property);
		if (properties.size > 0) {
			return;
		}

		listeners.delete(oldValue);
		const valueEventTarget = eventTargetRegistry.get(oldValue);
		valueEventTarget.removeEventListener(CHANGE_EVENT_TYPE, listener);
	};
	const setupNewValue = (property, newValue) => {
		if (newValue === DELETE || !eventTargetRegistry.has(newValue) || eventTargetRegistry.get(newValue) === eventTarget) {
			return;
		}

		if (listeners.has(newValue)) {
			const { properties } = listeners.get(newValue);
			properties.add(property);
			return;
		}

		const valueEventTarget = eventTargetRegistry.get(newValue);

		const properties = new Set([property]);
		const listener = (event) => {
			const { change: detailChange } = event.detail;
			const { dispatched } = detailChange;
			const isDispatched = dispatched.has(eventTarget);
			if (isDispatched) {
				return;
			}

			scheduleMicrotask();
			dispatched.add(eventTarget);
			const { path: detailChangePath } = detailChange;
			const path = [properties, ...detailChangePath];
			const change = { ...detailChange, path };
			rawChanges.push(change);
			if (eventTarget.canDispatch(CHANGE_EVENT_TYPE)) {
				const keys = makeKeys(path);
				eventTarget.dispatchEvent(new CustomEvent(CHANGE_EVENT_TYPE, { detail: { change, keys } }));
			}
		}
		listeners.set(property, { listener, properties });
		valueEventTarget.addEventListener(CHANGE_EVENT_TYPE, listener);
	};
	if (Array.isArray(targetObj)) {
		for (const [index, value] of targetObj.entries()) {
			setupNewValue(String(index), value);
		}
	} else {
		for (const [property, value] of Object.entries(targetObj)) {
			setupNewValue(property, value);
		}
	}

	const setProperty = (target, property, value) => {
		const oldValue = target[property];
		value = format(value, property, target, proxy, eventTarget);
		if (value === oldValue) {
			return true; // same value changes are ignored, along with array method length changes
		}

		cleanupOldValue(property, oldValue);
		setupNewValue(property, value);

		const result = value === DELETE
			? Reflect.deleteProperty(target, property)
			: Reflect.set(target, property, value);

		if (result) {
			scheduleMicrotask();
			const path = [property];
			const dispatched = new Set([eventTarget])
			const change = { target, property, oldValue, proxy, path, dispatched };
			rawChanges.push(change);
			if (eventTarget.canDispatch(CHANGE_EVENT_TYPE)) {
				const keys = makeKeys(path);
				eventTarget.dispatchEvent(new CustomEvent(CHANGE_EVENT_TYPE, { detail: { change, keys } }));
			}
		}

		return result;
	};

	const proxy = new Proxy(targetObj, {
		deleteProperty: (target, property) => {
			return setProperty(target, property, DELETE);
		},
		set: (target, property, value) => {
			return setProperty(target, property, value);
		}
	});

	eventTargetRegistry.set(proxy, eventTarget);
	return [proxy, eventTarget];
}
