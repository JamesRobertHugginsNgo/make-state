// source: https://github.com/JamesRobertHugginsNgo/event-listener-tracker/blob/1.0.1/src/event-listener-tracker.js

// ls-remote repository: https://github.com/JamesRobertHugginsNgo/event-listener-tracker.git
// ls-remote branch: refs/heads/1x
// ls-remote branch sha: d19ad5dc855afadfc826af8102eff5cbb88e9b45

function normalizeOptions(options) {
	return options === null
		? {}
		: typeof options === 'object'
			? options
			: { capture: options };
}

export default class EventListenerTracker {
	_map = new Map(); // [type][listener][capture] = { listener, signal, signalListener }

	set(type, listener, options) {
		const {
			capture = false,
			once = false,
			signal
		} = normalizeOptions(options);

		const isAbortSignal = signal instanceof AbortSignal;
		if (isAbortSignal && signal.aborted) {
			return; // aborted, don't set, return undefined
		}

		if (!this._map.has(type)) {
			this._map.set(type, new Map());
		}
		const typeMap = this._map.get(type);
		if (!typeMap.has(listener)) {
			typeMap.set(listener, new Map());
		}
		const listenerMap = typeMap.get(listener);
		if (!listenerMap.has(capture)) {
			const captured = {};

			if (once) {
				if (typeof listener === 'function') {
					const deleteListener = () => {
						this.delete(type, listener, options);
					};
					captured.listener = function (...args) {
						deleteListener();
						return listener.call(this, ...args);
					}
				} else {
					captured.listener = (...args) => {
						this.delete(type, listener, options);
						return listener.handleEvent(...args);
					};
				}
			} else {
				captured.listener = listener;
			}

			if (isAbortSignal) {
				captured.signal = signal;
				captured.signalListener = () => {
					this.delete(type, listener, options);
				};
				signal.addEventListener('abort', captured.signalListener, { once: true });
			}

			listenerMap.set(capture, captured);
		}

		const { listener: result } = listenerMap.get(capture);
		return result;
	}

	delete(type, listener, options) {
		const { capture = false } = normalizeOptions(options);

		let result;
		if (this._map.has(type)) {
			const typeMap = this._map.get(type);
			if (typeMap.has(listener)) {
				const listenerMap = typeMap.get(listener);
				if (listenerMap.has(capture)) {
					const {
						listener: tempListener,
						signal,
						signalListener
					} = listenerMap.get(capture);

					result = tempListener;

					if (signal instanceof AbortSignal) {
						signal.removeEventListener('abort', signalListener);
					}

					listenerMap.delete(capture);
					if (listenerMap.size === 0) {
						typeMap.delete(listener);
						if (typeMap.size === 0) {
							this._map.delete(type);
						}
					}
				}
			}
		}

		return result;
	}

	has(type, listener, options) {
		if (!this._map.has(type)) {
			return false;
		}

		if (listener !== undefined) {
			const typeMap = this._map.get(type);
			if (!typeMap.has(listener)) {
				return false;
			}

			if (options !== undefined) {
				const listenerMap = typeMap.get(listener);
				const { capture = false } = normalizeOptions(options);
				return listenerMap.has(capture);
			}
		}

		return true;
	}
}
