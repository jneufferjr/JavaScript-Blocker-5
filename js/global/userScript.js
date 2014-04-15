"use strict";

var UserScript = {
	__updateInterval: TIME.ONE_DAY * 5,

	scripts: new Store('UserScripts', {
		save: true
	}),

	__fetch: function (store, resources) {
		store.clear();

		if ($.isEmptyObject(resources))
			return;		

		var addResource = function (self, resourceName, data, type) {
			if (!resourceName)
				return;

			store.set(resourceName, {
				data: data,
				type: type
			});
		};

		for (var resourceName in resources) {
			Utilities.setImmediateTimeout(function (self, resources, resourceName, addResource) {
				var xhr = new XMLHttpRequest(),
						bypassCache = (resources[resourceName]._contains('?') ? '&' : '?') + Date.now();

				xhr.open('GET', resources[resourceName] + bypassCache, true);

				xhr.responseType = 'arraybuffer';

				xhr.onload = function () {
					if (this.status !== 200)
						return LogError(['resource not found', store.name, resourceName]);

					var data = '',
							array = new Uint8Array(this.response);

					for (var i = 0, b = array.length; i < b; i++)
						data += String.fromCharCode(array[i]);

					addResource(self, resourceName, btoa(data), this.getResponseHeader('Content-Type'));
				};

				xhr.onerror = function () {
					LogError(['resource load error', store.name, resourceName]);
				};

				xhr.send(null);
			}, [this, resources, resourceName, addResource]);
		}
	},

	onContextMenu: function (event) {
		if (!event.userInfo)
			return;

		for (var caption in event.userInfo.menuCommand)
			event.contextMenu.appendContextMenuItem([
				'contextMenu',
				event.userInfo.pageID,
				event.userInfo.menuCommand[caption].sourceID,
				event.userInfo.menuCommand[caption].callbackID
			].join(':'), caption);

	},

	onExecuteMenuCommand: function (event) {
		if (event.command._startsWith('contextMenu:')) {
			var split = event.command.split(':');

			Tabs.messageAll('executeMenuCommand', {
				pageID: split[1],
				sourceID: split[2],
				callbackID: split[3]
			});
		}
	},

	forLocation: function (location, isFrame) {
		var scripts = Special.__forLocation(this.scripts.data, 'user_script', location, isFrame);

		for (var namespace in scripts) {
			if (!scripts[namespace])
				continue;

			this.update(namespace);

			scripts[namespace] = this.scripts.get(namespace).all();
		}

		return scripts;
	},

	removeRules: function (namespace) {
		var domain;

		var types = Rules.active.kind('user_script'),
				allTypes = types.all();

		for (var ruleType in allTypes)
			for (domain in allTypes[ruleType])
				if (allTypes[ruleType][domain][namespace] && [2, 3]._contains(allTypes[ruleType][domain][namespace].action))
					types[ruleType](domain).remove(namespace);
	},

	canBeUpdated: function (meta) {
		return (meta.updateURL && meta.updateURL.length && meta.version.length && ((meta.downloadURL && meta.downloadURL.length || meta.installURL && meta.installURL.length)));
	},

	update: function (namespace) {
		var currentMeta,
				updateMeta;

		var self = this,
				now = Date.now(),
				userScript = this.scripts.get(namespace),
				attributes = userScript.get('attributes'),
				isDeveloperMode = attributes.get('developerMode');

		if (isDeveloperMode || (attributes.get('autoUpdate') && (now - attributes.get('lastUpdate', 0) > this.__updateInterval))) {
			if (!isDeveloperMode)
				attributes.set('lastUpdate', now);

			currentMeta = attributes.get('meta');

			this.download(attributes.get('updateURL')).done(function (update) {
				updateMeta = self.parse(update).parsed;

				if (currentMeta.trueNamespace === updateMeta.trueNamespace) {
					if (isDeveloperMode || (Utilities.isNewerVersion(currentMeta.version, updateMeta.version) && this.canBeUpdated(updateMeta))) {
						self.download(attributes.get('downloadURL')).done(function (script) {
							self.add(script, true);
						});
					}
				} else
					LogError(['attempted to update user script, but updated name is not equal to current name.', currentMeta.trueNamespace, updateMeta.trueNamespace]);
			});
		}
	},

	download: function (url) {
		if (!Utilities.URL.isURL(url))
			throw new TypeError(url + ' is not a url.');

		return $.ajax({
			cache: false,
			dataType: 'text',
			async: false,
			url: url,
			timeout: 3000,
			headers: {
				'Accept': 'text/x-userscript-meta'
			}
		}).fail(function (error) {
			LogError(error);
		});
	},

	parse: function (script) {
		if (typeof script !== 'string')
			return null;

		var localKey,
				localValue;

		var lines = script.split(/\n/g),
				lineMatch = /\/\/\s@([a-z:0-9-]+)\s+([^\n]+)/i,
				parseLine = false,
				resource = null,
				metaStr = '';

		var parsed = {
			name: null,
			namespace: null,
			trueNamespace: null,
			description: '',
			exclude: [],
			excludeJSB: [],
			grant: [],
			icon: '',
			include: [],
			includeJSB: [],
			match: [],
			matchJSB: [],
			domain: [],
			require: {},
			resource: {},
			'run-at': '',
			version: ''
		};

		for (var line = 0; line < lines.length; line++) {
			if (!parseLine && /\/\/\s==UserScript==/.test(lines[line]))
				parseLine = true;
			else if (parseLine && /\/\/\s==\/UserScript==/.test(lines[line]))
				parseLine = false;
			else if (parseLine) {
				lines[line].replace(lineMatch, function (fullLine, key, value) {
					value = $.trim(value);
					metaStr += fullLine + "\n";

					if (parsed.hasOwnProperty(key) && value.length) {
						if (typeof parsed[key] === 'string' || parsed[key] === null)
							parsed[key] = value;
						else if (key === 'resource') {
							resource = value.split(' ');

							parsed[key][resource[0]] = resource[1];
						} else if (key === 'require') {
							parsed[key][value] = value;
						} else {
							if (['exclude', 'include', 'match']._contains(key)) {
								localKey = key + 'JSB';
								localValue = '^' + value.replace(/\*\./g, '_SUBDOMAINS_').replace(/\*/, '_ANY_')._escapeRegExp().replace(/_SUBDOMAINS_/g, '([^\\/]+\\.)?').replace(/_ANY_/g, '.*') + '$';

								if (localValue === '^.*$' && key !== 'exclude')
									parsed.domain._pushMissing('*');
								else
									parsed[localKey]._pushMissing(localValue);
							}

							parsed[key]._pushMissing(value);
						}
					} else if (value.length)
						parsed[key] = value;
				});
			}
		}

		parsed.trueNamespace = [parsed.name, parsed.namespace].join(':');

		return {
			parsed: parsed,
			metaStr: metaStr
		};
	},

	exist: function (namespace) {
		return !!this.scripts.get(namespace, false);
	},

	add: function (script, isAutoUpdate) {
		var parsed = this.parse(script),
				detail = parsed.parsed;

		if (detail.name === null || detail.namespace === null)
			return LogError('unable to add user script because it does not have a name or namespace');

		var canBeUpdated = this.canBeUpdated(detail);

		if (isAutoUpdate && !canBeUpdated)
			return LogError('attempted to update a script, but the new version will no longer be able to auto update.');

		var namespace = detail.trueNamespace,
				userScript = this.scripts.getStore(namespace),
				attributes = userScript.getStore('attributes');

		var newAttributes = {
			metaStr: parsed.metaStr,
			meta: detail,
			script: script,
			updateURL: detail.updateURL,
			downloadURL: detail.updateURL ? (detail.downloadURL || detail.installURL) : null,
			autoUpdate: canBeUpdated,
			developerMode: attributes.get('developerMode', false),
			before: (detail['run-at'] && detail['run-at'].toLowerCase()) === 'document-start',
			lastUpdate: Date.now()
		};

		var allowPages = detail.matchJSB.concat(detail.includeJSB),
				allowDomains = detail.domain;

		this.removeRules(namespace);

		for (var i = 0; i < allowPages.length; i++)
			Rules.active.addPage('user_script', allowPages[i], {
				rule: namespace,
				action: 3
			});

		for (var i = 0; i < allowDomains.length; i++)
			Rules.active.addDomain('user_script', allowDomains[i], {
				rule: namespace,
				action: 3
			});

		for (var i = 0; i < detail.excludeJSB.length; i++)
			Rules.active.addPage('user_script', detail.excludeJSB[i], {
				rule: namespace,
				action: 2
			});

		setTimeout(function (self, userScript, detail) {
			// If a script is in developer mode or just updated normally, the resources and
			// requirements will always be empty if this is not delayed.

			self.__fetch(userScript.getStore('resources'), detail.resource);
			self.__fetch(userScript.getStore('requirements'), detail.require);
		}, 100, this, userScript, detail);

		attributes.clear().setMany(newAttributes);
	}
};

Events.addApplicationListener('contextmenu', UserScript.onContextMenu);
Events.addApplicationListener('command', UserScript.onExecuteMenuCommand);