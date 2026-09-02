import TrackedEventTarget from './tracked-event-target.js';

export const CHANGE_EVENT_TYPE = 'change';
export const BATCH_CHANGE_EVENT_TYPE = 'batchchanges';

export const DELETE = Symbol();

export const eventTargetRegistry = new WeakMap();

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
				let key;
				if (path.length === 1) {
					key = path[0];
				} else {
					const isNotAllString = path.some((element) => {
						return typeof element !== 'string';
					});
					if (isNotAllString) {
						continue;
					}
					key = path.join('/');
				}
				if (!changes.has(key)) {
					changes.set(key, change);
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
		if (listeners.has(property) && eventTargetRegistry.has(oldValue)) {
			const listener = listeners.get(property);
			listeners.delete(property);
			const valueEventTarget = eventTargetRegistry.get(oldValue);
			valueEventTarget.removeEventListener(CHANGE_EVENT_TYPE, listener);
		}
	};
	const setupNewValue = (property, newValue) => {
		if (newValue !== DELETE && eventTargetRegistry.has(newValue)) {
			const valueEventTarget = eventTargetRegistry.get(newValue);
			if (valueEventTarget !== eventTarget) {
				const listener = (event) => {
					const { change: detailChange } = event.detail;
					const { dispatched: detailChangeDispatched } = detailChange;
					const isDispatched = detailChangeDispatched.has(eventTarget);
					if (isDispatched) {
						return;
					}

					scheduleMicrotask();
					const { path: detailChangePath } = detailChange;
					const path = [property, ...detailChangePath];
					const dispatched = new Set([...detailChangeDispatched, eventTarget]);
					const change = { ...detailChange, path, dispatched };
					rawChanges.push(change);
					if (eventTarget.canDispatch(CHANGE_EVENT_TYPE)) {
						eventTarget.dispatchEvent(new CustomEvent(CHANGE_EVENT_TYPE, { detail: { change } }));
					}
				}
				listeners.set(property, listener);
				valueEventTarget.addEventListener(CHANGE_EVENT_TYPE, listener);
			}
		}
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
			const change = {
				target,
				property,
				oldValue,
				proxy,
				path: [property],
				dispatched: new Set([eventTarget])
			};
			rawChanges.push(change);
			if (eventTarget.canDispatch(CHANGE_EVENT_TYPE)) {
				eventTarget.dispatchEvent(new CustomEvent(CHANGE_EVENT_TYPE, { detail: { change } }));
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
