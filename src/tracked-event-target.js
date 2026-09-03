// source: https://github.com/JamesRobertHugginsNgo/tracked-event-target/blob/2.0.0/src/tracked-event-target.js

// ls-remote repository: https://github.com/JamesRobertHugginsNgo/tracked-event-target.git
// ls-remote branch: refs/heads/2.x.x
// ls-remote branch sha: e67864e143581ac87cb808ee5df8d2c6657291c0

import ListenerTracker from './event-listener-tracker.js';

export default class TrackedEventTarget extends EventTarget {
	_tracker = new ListenerTracker();

	addEventListener(type, listener, options) {
		const capturedListener = this._tracker.set(type, listener, options);
		super.addEventListener(type, capturedListener ?? listener, options);
	}

	removeEventListener(type, listener, options) {
		const capturedListener = this._tracker.delete(type, listener, options);
		super.removeEventListener(type, capturedListener ?? listener, options);
	}

	canDispatch(type) {
		return this._tracker.has(type);
	}
}
