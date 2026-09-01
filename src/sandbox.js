const proxy = new Proxy([], {
	set: (target, property, value) => {
		const oldValue = target[property];
		console.log({ target, property, value, oldValue });
		return Reflect.set(target, property, value);
	}
});

proxy.push('Alice');
