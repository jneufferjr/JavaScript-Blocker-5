"use strict";

// Global constants =====================================================================

var ARRAY = {
	CONTAINS: {
		ONE: 1,
		ANY: 2,
		ALL: 4,
		NONE: 8
	}
};

var TIME = {
	ONE_SECOND: 1000,
	ONE_MINUTE: 1000 * 60,
	ONE_HOUR: 1000 * 60 * 60,
	ONE_DAY: 1000 * 60 * 60 * 24
};


// Primary utilities ====================================================================

var Utilities = {
	__immediateTimeouts: [],

	safariBuildVersion: window.navigator.appVersion.split('Safari/')[1].split('.')[0],

	noop: function () {},

	id: function () {
		return this.Token.generate();
	},

	makeArray: function (arrayLikeObject, offset) {
		if (typeof offset !== 'number')
			offset = 0;

		return Array.prototype.slice.call(arrayLikeObject, offset);
	},

	setImmediateTimeout: function (fn, args) {
		if (!this.Type.isFunction(fn))
			throw new TypeError('fn is not a function');

		this.__immediateTimeouts.push({
			fn: fn,
			args: args
		});

		window.postMessage('nextImmediateTimeout', '*');
	},

	nextImmediateTimeout: function () {
		if (this.__immediateTimeouts.length) {
			var next = this.__immediateTimeouts.shift();

			if (typeof next.fn === 'function')
				next.fn.apply(null, next.args);
		}
	},

	decode: function (str) {
		try {
			return decodeURIComponent(escape(window.atob(str)));
		} catch (e) {
			return str;
		}
	},
	encode: function (str) {
		return window.btoa(unescape(encodeURIComponent(str)));
	},

	throttle: function (fn, delay, extra) {
		var timeout = null, last = 0;

		return function () {
			var elapsed = Date.now() - last, args = Utilities.makeArray(arguments).concat(extra || []);

			var execute = function () {
				last = Date.now();

				fn.apply(this, args);
			}

			clearTimeout(timeout);

			if (elapsed > delay)
				execute.call(this)
			else
				timeout = setTimeout(execute.bind(this), delay - elapsed);
		};
	},

	byteSize: function(number) {	
		var power;

		var number = parseInt(number, 10),
				powers = ['', 'K', 'M', 'G', 'T', 'E', 'P'],
				divisor = /Mac/.test(navigator.platform) ? 1000 : 1024;

		for(var key = 0; key < powers.length; key++) {
			power = powers[key];

			if(Math.abs(number) < divisor)
				break;

			number /= divisor;
		}

		return (Math.round(number * 100) / 100) + ' ' + power + (divisor === 1024 && power.length ? 'i' : '') + (power.length ? 'B' : ('byte' + (number === 1 ? '' : 's')));
	},

	queue: function (fn, callback) {
		var promise = Promise.resolve(typeof callback === 'function' ? callback : Utilities.noop);

		return function queue () {
			promise.then(function (args, callback) {
				callback(fn.apply(null, args));
			}.bind(null, arguments));
		};
	},

	isNewerVersion: function (a, b) {
		var a = typeof a === 'string' ? a : '0',
				b = typeof b === 'string' ? b : '0',
				aModifier = a.split(/[^0-9\.]+/),
				bModifier = b.split(/[^0-9\.]+/),
				aSimpleModifier = a.split(/[0-9\.]+/),
				bSimpleModifier = b.split(/[0-9\.]+/),
				aVersionPieces = aModifier[0].split(/\./),
				bVersionPieces = bModifier[0].split(/\./),
				aModifierCheck = typeof aModifier[1] !== 'undefined' ? parseInt(aModifier[1], 10) : Infinity,
				bModifierCheck = typeof bModifier[1] !== 'undefined' ? parseInt(bModifier[1], 10) : Infinity;

		if (isNaN(aModifierCheck))
			aModifier[1] = aSimpleModifier[1];
		else
			aModifier[1] = aModifierCheck;

		if (isNaN(bModifierCheck))
			bModifier[1] = bSimpleModifier[1];
		else
			bModifier[1] = bModifierCheck;

		while (aVersionPieces.length < 6)
			aVersionPieces.push(0);

		while (bVersionPieces.length < 6)
			bVersionPieces.push(0);

		var aVersion = aVersionPieces.join(''), bVersion = bVersionPieces.join('');

		if (aVersion.charAt(0) === '0' || bVersion.charAt(0) === '0') {
			aVersion = '99999' + aVersion;
			bVersion = '99999' + bVersion;
		}

		aVersion = parseInt(aVersion, 10);
		bVersion = parseInt(bVersion, 10);

		return (bVersion > aVersion || (bVersion === aVersion && bModifier[1] > aModifier[1]));
	},

	Timer: {
		timers: {
			intervals: {},
			timeouts: {}
		},

		__run_interval: function (name) {
			var interval = this.timers.intervals[name];

			if (!interval)
				return this.remove('RunInterval' + name);

			interval.script.apply(null, interval.args);

			setTimeout(this.__run_interval.bind(this, name), interval.time);
		},

		interval: function () {
			return this.create.apply(this, ['interval'].concat(Utilities.makeArray(arguments)));
		},
		timeout: function () {
			return this.create.apply(this, ['timeout'].concat(Utilities.makeArray(arguments)));
		},
		
		create: function (type, name, script, time, args) {
			if (type !== 'interval' && type !== 'timeout')
				return false;
			
			if (typeof args !== 'object')
				args = [];

			this.remove(type, name);

			if (type === 'timeout')
				var timer = setTimeout(function (type, name, script, args) {
					script.apply(null, args);

					if (type === 'timeout')
						Utilities.Timer.remove(type, name);
				}.bind(null, type, name, script, args), time);
			else
				var timer = null;

			this.timers[type + 's'][name] = {
				name: name,
				timer: timer,
				args: args,
				time: time,
				script: script
			};

			if (type === 'interval')
				this.__run_interval(name);

			type = name = script = time = args = undefined;
		},
		remove: function () {
			var name;

			var args = Utilities.makeArray(arguments),
					type = args[0] + 's';

			if (args.length === 1) {
				var toRemove = [];
				
				for (name in this.timers[type])
					if (this.timers[type][name])
						toRemove.push(name);
				
				if (toRemove.length)
					this.remove.apply(this, [args[0]].concat(toRemove));

				return true;
			}
	
			for (var i = 1; (name = args[i]); i++) {
				try {
					if (args[0] == 'timeout')
						clearTimeout(this.timers[type][name].timer);

					delete this.timers[type][name];
				} catch(e) { }
			}

			return true;
		}
	},

	Token: (function () {
		var tokens = {};

		return {
			generate: function () {
				return Math.random().toString(36).substr(2, 10);
			},
			create: function (value, keep) {
				var token = this.generate();

				if (tokens[token])
					return this.create(value, keep);

				tokens[token] = {
					value: value,
					keep: !!keep
				};

				return token;
			},
			valid: function (token, value, expire) {
				if (typeof token !== 'string' || !(token in tokens))
					return false;

				var isValid = tokens[token].value === value;

				if (typeof expire !== 'undefined')
					this.expire(token, expire);

				return isValid;
			},
			expire: function (token, expireKept) {
				if ((token in tokens) && (!expireKept || !tokens[token].keep))
					delete tokens[token];
			}
		}
	})(),

	Type: {
		isUndefined: function (subject) {
			return typeof subject === 'undefined';
		},
		isObject: function (subject) {
			return subject instanceof Object;
		},
		isString: function (subject) {
			return typeof subject === 'string';
		},
		isFunction: function (subject) {
			return typeof subject === 'function';
		},
		isError: function (subject) {
			if (subject && subject.constructor && subject.constructor.name._endsWith('Error'))
				return true;

			return false;
		},
	},

	Element: {
		_adjustmentProperties: ['top', 'right', 'bottom', 'left', 'z-index', 'clear', 'float', 'vertical-align', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', '-webkit-margin-before-collapse', '-webkit-margin-after-collapse'],
		
		cloneAdjustmentProperties: function (fromElement, toElement) {
			for (var i = 0; i < this._adjustmentProperties.length; i++)
				toElement.style.setProperty(this._adjustmentProperties[i], fromElement.getPropertyValue(this._adjustmentProperties[i]), 'important');
		},

		setCSSProperties: function (element, properties, isImportant) {
			for (var property in properties)
				element.style.setProperty(property, properties[property], isImportant ? 'important' : '');
		},

		/**
		@function fitFontWithin Adjust the size of a font so that it fits perfectly within containerNode.
		@param {Element} containerNode - Box element that the font should fit within.
		@param {Element} textNode - Element that will have its font size adjusted.
		@param (Element) wrapperNode - Parent element of textNode whose top margin is adjusted so as to be centered within containerNode.
		*/
		fitFontWithin: function (containerNode, textNode, wrapperNode) {
			var currentFontSize = 22,
					maxWrapperHeight = containerNode.offsetHeight,
					maxWrapperWidth = containerNode.offsetWidth - 10, textNodeHeight, textNodeWidth;
						
			do {
				textNode.style.setProperty('font-size', currentFontSize + 'pt', 'important');
				wrapperNode.style.setProperty('margin-top', '-' + ((textNode.offsetHeight / 2) - 3) + 'px', 'important');

				textNodeHeight = textNode.offsetHeight;
				textNodeWidth = textNode.offsetWidth;

				currentFontSize -= 1;
			} while ((textNodeHeight + 3 > maxWrapperHeight || textNodeWidth + 3 > maxWrapperWidth) && currentFontSize > 4);

			this.setCSSProperties(textNode, {
				position: 'absolute',
				top: 'auto',
				left: '50%',
				'margin-left': '-' + Math.round(textNodeWidth / 2) + 'px'
			});
		}
	},

	Page: {
		isGlobal: GlobalPage.page() === window,
		isTop: window === window.top,
		isBlank: document.location.href === 'about:blank',

		getCurrentLocation: function () {
			if (['http:', 'https:', 'file:']._contains(document.location.protocol)) {
				var base = document.location.protocol + '//' + document.location.host;

				if (Utilities.safariBuildVersion > 534)
					base += document.location.pathname;
				else
					base += encodeURI(document.location.pathname);

				base += document.location.search;

				if (document.location.hash.length > 0)
					return base + document.location.hash;
				else if (document.location.href.substr(-1) === '#')
					return base + '#';
				else if (/\?$/.test(document.location.href))
					return base + '?';
				else
					return base;
			} else
				return document.location.href;
		}
	},

	URL: {
		_structure: /^(blob:)?(https?|s?ftp|file|safari\-extension):\/\/([^\/]+)\//,
		_IPv4: /^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]{1,7})?$/,

		isURL: function (url) {
			return url && this._structure.test(url);
		},

		createAnchor: function (path) {
			if (typeof path !== 'string' || !path.length)
				return null;

			var a = document.createElement('a');

			a.href = path;

			return a;
		},
		getAbsolutePath: function (url) {
			var anchor = this.createAnchor(url);

			if (!anchor)
				return '';

			return anchor.href;
		},
		extractHost: function (url) {
			var url = (typeof url !== 'string') ? Utilities.Page.getCurrentLocation() : url;

			if (/^about:/.test(url))
				return 'blank';

			if (/^javascript:/.test(url))
				return 'javascript';

			if (/^data:/.test(url))
				return 'data';

			var matched = url.match(this._structure);

			if (matched && matched.length > 2)
				return matched[3];

			return '';
		},
		hostParts: function (host, prefixed) {
			if (!this.hostParts.cache && window.Store)
				this.hostParts.cache = new Store('HostParts', {
					maxLife: TIME.ONE_HOUR
				});

			var cacheKey = prefixed ? 'prefixed' : 'unprefixed',
					cached = this.hostParts.cache.getStore(host, {
						selfDestruct: TIME.ONE_HOUR
					}).get(cacheKey);

			if (cached)
				return cached;

			if (host === 'blank')
				return ['blank'];

			if (this._IPv4.test(host))
				return [host];

			var split = host.split(/\./g).reverse(),
					part = split[0],
					parts = [],
					eTLDLength = EffectiveTLDs.length,
					sTLDLength = SimpleTLDs.length;

			var part,
					j;
							
			hostLoop:
			for (var i = 1; i < split.length; i++) {
				part = split[i] + '.' + part;

				for (j = 0; j < sTLDLength; j++)
					if (SimpleTLDs[j] === part)
						continue hostLoop;

				for (j = 0; j < eTLDLength; j++)
					if (EffectiveTLDs[j].test(part))
						continue hostLoop;

				parts.push((((i < split.length - 1) && prefixed) ? '.' : '') + part);
			}

			if (!parts.length)
				parts.push(host);

			parts.reverse();

			if (prefixed)
				parts.splice(1, 0, '.' + parts[0]);
			
			return this.hostParts.cache.get(host).set(cacheKey, parts).get(cacheKey);
		},
		protocol: function (url) {
			return url.substr(0, url.indexOf(':')).toUpperCase();
		}
	}
};


// Global functions ==========================================================

var Log = function () {
	console.log.apply(console, ['(JSB)'].concat(Utilities.makeArray(arguments)));
};

var LogError = function () {
	var	error,
			errorMessage,
			errorStack;
			
	var args = Utilities.makeArray(arguments);

	for (var i = 0; i < args.length; i++) {
		error = args[i];

		if (Array.isArray(error))
			error = error
				.filter(function (currentValue) {
					return (typeof currentValue !== 'undefined');
				})
				.map(function (currentValue) {
					if (typeof currentValue === 'object')
						try {
							return JSON.stringify(currentValue);
						} catch (error) {
							return currentValue.toString();
						}
					else
						return currentValue;
				})
				.join(' - ');

		if (error instanceof Error) {
			errorStack = error.stack ? error.stack.replace(new RegExp(ExtensionURL()._escapeRegExp(), 'g'), '/') : '';

			if (error.sourceURL)
				errorMessage = error.message + ' - ' + error.sourceURL.replace(ExtensionURL(), '/') +  ' line ' + error.line;
			else
				errorMessage = error.message;
		} else
			errorMessage = error;

		if (!Utilities.Page.isGlobal)
			GlobalPage.message('logError', {
				source: document.location.href,
				message: errorMessage
			});

		if (Utilities.Page.isGlobal || globalSetting('debugMode')) {
			console.error('(JSB)', errorMessage);

			if (errorStack) {
				console.groupCollapsed('(JSB) Stack');
				console.error(errorStack);
				console.groupEnd();
			}
		}
	}
};

var Struct = (function () {
	function Struct () {
		var objects = Utilities.makeArray(arguments);

		if (objects[0] === true) {
			this.deep = true;

			objects.shift();
		}

		this.object = {};

		for (var i = 0; i < objects.length; i++)
			if (typeof objects[i] === 'object')
				this.add(objects[i]);
	}

	Struct.BREAK = -1985465488;

	Struct.prototype.build = function (keys) {
		this.struct = [];

		var keyOrder = Array.isArray(keys) ? keys : this.keyOrder;

		for (var i = 0; i < keyOrder.length; i++)
			if (this.object.hasOwnProperty(keyOrder[i]))
				this.struct.push([keyOrder[i], this.object[keyOrder[i]]])

		return this;
	};

	Struct.prototype.sort = function (sortFunction) {
		return this.order(Object.keys(this.object).sort(sortFunction));
	};

	Struct.prototype.order = function (keys) {	
		this.keyOrder = keys;

		return this.build(keys);
	};

	Struct.prototype.forEach = function (callback) {
		if (typeof callback !== 'function')
			throw new TypeError(callback + ' is not a function');

		for (var i = 0, b = this.struct.length; i < b; i++)
			if (callback(this.struct[i][0], this.struct[i][1]) === Struct.BREAK)
				break;

		return Struct.BREAK;
	};

	Struct.prototype.add = function (object) {
		if (!(object instanceof Object))
			throw new TypeError(object + ' is not an instance of Object');

		for (var key in object)
			if (object.hasOwnProperty(key)) {
				if (this.deep && !(this.object[key] instanceof Struct) && (this.object[key] instanceof Object))
					this.object[key] = new Struct(true, object[key]);
				else
					this.object[key] = object[key];

				Object.defineProperty(this, '_' + key, {
					configurable: true,

					get: function (){
						return this.object[key];
					},
					set: function (value) {
						this.object[key] = value;
					}
				});
			}

		this.sort();

		return this;
	};

	return Struct;
})();


// Native object extensions =============================================================

var Extension = {
	Array: {
		__contains: {
			value: function (matchType, needle, returnMissingItems) {
				if (typeof matchType !== 'number')
					throw new TypeError(matchType + ' is not a number');
				
				switch(matchType) {
					case ARRAY.CONTAINS.ONE:
						return this.indexOf(needle) > -1;
					break;

					case ARRAY.CONTAINS.ANY:
						if (!Array.isArray(needle))
							throw new TypeError(needle + ' is not an array');

						for (var i = 0, b = needle.length; i < b; i++)
							if (this._contains(needle[i]))
								return true;

						return false;
					break;

					case ARRAY.CONTAINS.ALL:
						if (!Array.isArray(needle))
							throw new TypeError(needle + ' is not an array');

						var missingItems = [];

						for (var i = 0, b = needle.length; i < b; i++)
							if (!this._contains(needle[i]))
								if (returnMissingItems)
									missingItems.push(needle[i]);
								else
									return false;

						if (returnMissingItems)
							return missingItems;
						else
							return true;
					break;

					case ARRAY.CONTAINS.NONE:
						return !this._containsAny(needle);
					break;

					default:
						throw new Error('unsupported match type');
					break;
				}
			}
		},
		_contains: {
			value: function (needle) {
				return this.__contains(ARRAY.CONTAINS.ONE, needle);
			}
		},
		_containsAny: {
			value: function (needle) {
				return this.__contains(ARRAY.CONTAINS.ANY, needle);
			}
		},
		_containsAll: {
			value: function (needle, returnMissingItems) {
				return this.__contains(ARRAY.CONTAINS.ALL, needle, returnMissingItems);
			}
		},
		_containsNone: {
			value: function (needle) {
				return this.__contains(ARRAY.CONTAINS.NONE, needle);
			}
		},

		_clone: {
			value: function () {
				return Utilities.makeArray(this);
			}
		},

		_pushAll: {
			value: function (item) {
				if (!Array.isArray(item))
					item = [item];

				return this.push.apply(this, item);
			}
		},
		_pushMissing: {
			value: function (item) {
				if (!Array.isArray(item))
					item = [item];

				var missingItems = this._containsAll(item, true);

				return this._pushAll(missingItems);
			}
		},

		_unique: {
			value: function() {
				var a = this.concat();

				for(var i = 0; i < a.length; ++i) {
					for(var j = i + 1; j < a.length; ++j) {
						if(a[i] === a[j])
							a.splice(j--, 1);
					}
				}

			return a;
			}
		},

		_chunk: {
			value: function (pieces) {
				var chunks = [[]],
						chunk = 0;

				for (var i = 0, b = this.length; i < b; i++) {
					if (pieces > 0 && chunks[chunk].length >= pieces)
						chunks[++chunk] = [];

					chunks[chunk].push(this[i]);
				}

				return chunks;
			}
		}
	},

	String: {
		_contains: {
			value: function (string) {
				return this.indexOf(string) > -1;
			}
		},

		_startsWith: {
			value: function (prefix) {
				return this.indexOf(prefix) === 0;
			}
		},
		_endsWith: {
			value: function (suffix) {
				return this.indexOf(suffix, this.length - suffix.length) > -1;
			}
		},

		_ucfirst: {
			value: function() {
				return this.substr(0, 1).toUpperCase() + this.substr(1);
			}
		},

		_escapeRegExp: {
			value: function () {
				return this.replace(new RegExp('(\\' + ['/','.','*','+','?','|','$','^','(',')','[',']','{','}','\\'].join('|\\') + ')', 'g'), '\\$1');
			}
		},
		_escapeHTML: {
			value: function () {
				return this.replace(/&/g, '&amp;').replace(/</g, '&lt;');
			}
		}
	},

	Object: {
		_deepFreeze: {
			value: function () {
				Object.freeze(this);

				for (var key in this)
					if (this[key] !== null && typeof this[key] === 'object')
						this[key]._deepFreeze();
			}
		},

		_createReverseMap: {
			value: function (deep) {
				for (var key in this)
					if (deep && (this[key] instanceof Object))
						this[key] = this[key]._createReverseMap(deep);
					else
						this[this[key]] = key;

				return this;
			}
		},

		_isEmpty: {
			value: function () {
				return Object.keys(this).length === 0;
			}
		},

		_clone: {
			value: function () {
				var object = {};

				for (var key in this)
					object[key] = this[key];

				return object;
			}
		},

		_merge: {
			value: function () {
				var objects = Utilities.makeArray(arguments);

				if (objects[0] === true) {
					var deep = true;

					objects.shift();
				} else
					var deep = false;

				var object;

				for (var i = 0; i < objects.length; i++) {
					object = objects[i];

					if (typeof object !== 'object')
						throw new TypeError(object + ' is not an object');

					for (var key in object)
						if (object.hasOwnProperty(key)) {
							if (deep && typeof (this[key] instanceof Object) && (object[key] instanceof Object) && this.hasOwnProperty(key))
								this[key]._merge(true, object[key]);
							else
								this[key] = object[key];
						}
				}

				return this;
			}
		},

		_sort: {
			value: function (fn, reverse) {
				var newObject = {},
						keys = Object.keys(this).sort(fn);

				if (reverse)
					a.reverse();

				for (var i = 0, b = keys.length; i < b; i++)
					newObject[keys[i]] = this[keys[i]];

				return newObject;
			}
		},

		_chunk: {
			value: function (pieces) {
				var size = 0,
						chunk = 0,
						chunks = { 0: {} };

				for (var key in this) {
					if (pieces > 0 && size >= pieces) {
						size = 0;

						chunks[++chunk] = {};
					}

					chunks[chunk][key] = this[key];

					size++;
				}

				return chunks;
			}
		}
	}
};

for (var object in Extension)
	try {
		Object.defineProperties(window[object].prototype, Extension[object]);
	} catch (error) {}

Extension = undefined;


// Event listeners ======================================================================

window.addEventListener('message', function nextImmediateTimeout (event) {
	if (event.data === 'nextImmediateTimeout')
		Utilities.nextImmediateTimeout();
}, true);

document.addEventListener('DOMContentLoaded', function (event) {
	Utilities.DOMContentLoaded = true;
});