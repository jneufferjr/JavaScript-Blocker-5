"use strict";

if (!window.safari)
	throw new Error('preventing execution.');

function DeepInject (name, script) {
	if (typeof name !== 'string')
		name = '';

	this.name = name;
	this.cleanName = name.replace(/([^a-zA-Z_0-9])/g, '_');
	this.fnName = this.cleanName;
	this.script = script;
	this.scriptString = script.toString();
	this.id = Utilities.Token.create(this.name);

	if (!DeepInject.fnHeaderRegExp.test(this.scriptString))
		this.scriptString = 'function () {' + this.scriptString + '}';

	this.prepare();
};

DeepInject.useURL = true;
DeepInject.fnHeaderRegExp = /^(function +)(\(([^\)]+)?\)) +{/;

DeepInject.prototype.anonymize = function () {
	this.fnName = '';

	this.prepare();
};

DeepInject.prototype.prepare = function () {
	var self = this,
			header =  this.scriptString.substr(0, this.scriptString.indexOf('{') + 1),
			inner = this.scriptString.substring(header.length, this.scriptString.lastIndexOf('}'));

	header = header.replace(DeepInject.fnHeaderRegExp, function (complete, fn, argString) {
		return 'function ' + self.fnName + ' ' + argString + ' {';
	});

	this.pieces = {
		args: {},
		header: header,
		inner: inner.replace(/^\n|\s+$/g, '').split(/\n/g)
	};

	this.setArguments();
};

DeepInject.cleanLine = function (script) {
	if (typeof script !== 'string')
		throw new TypeError('script is not a string');

	if (!script._endsWith(';'))
		script += ';';

	return script;
};

DeepInject.prototype.setHeader = function (header) {
	this.pieces.header = ['function ', this.fnName, ' (', header.join(', '), ')', ' {'].join('');

	return this;
};

DeepInject.prototype.setArguments = function (args) {
	if (!args)
		this.pieces.args = {};
	else if (typeof args === 'object') {
		this.setHeader(Object.keys(args));

		for (var arg in args)
			this.pieces.args[arg] = typeof args[arg] === 'undefined' ? null : args[arg];
	}

	return this;
};

DeepInject.prototype.inner = function () {
	return this.pieces.inner.join("\n");
};

DeepInject.prototype.asFunction = function () {
	return [this.pieces.header, "\n", this.inner(), "\n", '}'].join('');
};

DeepInject.prototype.executable = function () {
	var str;

	var args = [];

	for (var arg in this.pieces.args) {
		try {
			str = JSON.stringify(this.pieces.args[arg]);

			if (typeof str === 'undefined')
				throw new Error;
			
			args.push(JSON.stringify(this.pieces.args[arg]));
		} catch (error) {
			args.push(this.pieces.args[arg]);
		}
	}

	return ['(', this.asFunction(), ')(', args.join(', '), ')'].join('');
};

DeepInject.prototype.prepend = function (script) {
	if (Array.isArray(script)) {
		for (var i = 0; i < script.length; i++)
			this.prepend(script[i]);

		return this;
	}

	this.pieces.inner.unshift(DeepInject.cleanLine(script));

	return this;
};

DeepInject.prototype.append = function (script) {
	if (Array.isArray(script)) {
		for (var i = 0; i < script.length; i++)
			this.append(script[i]);

		return this;
	}

	this.pieces.inner.push(DeepInject.cleanLine(script));

	return this;
};

DeepInject.prototype.injectable = function (useURL) {
	if (this.__injectable)
		return this.__injectable;

	var executable = this.executable(),
			scriptElement = document.createElement('script');

	scriptElement.id = 'jsb-injected-' + Utilities.id();

	scriptElement.setAttribute('data-jsbAllowAndIgnore', Utilities.Token.create('AllowAndIgnore'));
	scriptElement.setAttribute('data-jsbInjectedScript', this.name);

	if (useURL) {
		var URL = window.URL || window.webkitURL;

		if (window.Blob && URL) {
			var url = URL.createObjectURL(new Blob([executable], {
				type: 'text/javascript'
			}));
		} else
			var url = 'data:text/javascript;base64,' + Utilities.encode(executable);

		scriptElement.src = url;

		if (!globalSetting('debugMode'))
			scriptElement.onload = function () {
				URL.revokeObjectURL(url);
			};
	} else
		scriptElement.appendChild(document.createTextNode(executable));

	this.__injectable = scriptElement;

	return scriptElement;
};

DeepInject.prototype.inject = function (useURL) {
	var injectable = this.injectable(typeof useURL === 'boolean' ? useURL : DeepInject.useURL);

	if (document.documentElement.firstChild)
		document.documentElement.insertBefore(injectable, document.documentElement.firstChild);
	else
		document.documentElement.appendChild(injectable);

	if ((useURL === false || DeepInject.useURL === false) && !globalSetting('debugMode'))
		injectable.innerText = '';
};