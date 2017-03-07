/*
JS Blocker 5 (http://jsblocker.toggleable.com) - Copyright 2017 Travis Lee Roman
*/

'use strict';

var SyncClient = {
	PING_EVERY: TIME.ONE.HOUR,
	ORIGIN: 'https://imac.toggleable.com:8443',

	get SERVER() {
		return SyncClient.ORIGIN + '/jsb-sync' + (Settings.getItem('syncClientUseDevelopmentServer') ? '-development' : '') + '/api';
	},

	event: new EventListener,
	changes: [],

	handleError: function (source, error) {
		LogError(source, error.message || error.name || error);

		SyncClient.event.trigger('error', error);
	},

	generateSalt: function () {
		return CryptoJS.lib.WordArray.random(256 / 8).toString();
	},

	generateHashWorker: function (password, salt) {
		return SyncClient.promiseWorker.postMessage({
			command: 'generateHash',
			password: password,
			salt: salt
		});
	},

	encrypt: function (string, hash) {
		return new Promise(function (resolve, reject) {
			if (typeof string === 'undefined')
				return reject(Error('attempt to encrypt undefined'));

			var stringifyed = JSON.stringify(string);

			var encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf16.parse(stringifyed), hash, {
				mode: CryptoJS.mode.CBC
			}).toString();

			SyncClient.decrypt(encrypted, hash).then(function (decrypted) {
				if (JSON.stringify(decrypted) === stringifyed)
					resolve(encrypted);
				else
					reject(Error('encryption failed'));
			});
		});
	},

	encryptWorker: function (string, hash) {
		return new Promise(function (resolve, reject) {
			if (typeof string === 'undefined')
				return reject(Error('attempt to encrypt undefined'));

			var stringifyed = JSON.stringify(string);

			SyncClient.promiseWorker.postMessage({
				command: 'encrypt',
				string: JSON.stringify(string),
				hash: hash
			}).then(function (encrypted) {
				SyncClient.decryptWorker(encrypted, hash).then(function (decrypted) {
					if (JSON.stringify(decrypted) === stringifyed)
						resolve(encrypted);
					else {
						LogError('Encryption failed:', typeof string, string);

						reject(Error('encryption failed'));
					}
				}, function (err) {
					LogError(err);
				});
			}, function (err) {
				LogError(err);
			});
		});
	},

	decrypt: function (string, hash) {
		return new Promise(function (resolve, reject) {
			if (typeof string !== 'string' || typeof hash !== 'string')
				return reject(Error('string or hash is not a string'));

			var decrypted = CryptoJS.AES.decrypt(string, hash).toString(CryptoJS.enc.Utf16);

			if (!decrypted || !decrypted.length)
				return reject(Error('decryption failed'));

			try {
				resolve(JSON.parse(decrypted));
			} catch (err) {
				LogError(decrypted);
				reject(err);
			}
		});
	},

	decryptWorker: function (string, hash) {
		return SyncClient.promiseWorker.postMessage({
			command: 'decrypt',
			string: string,
			hash: hash
		}).then(function (decrypted) {
			return JSON.parse(decrypted);
		});
	},

	isRegistered: function () {
		return typeof SecureSettings.getItem('syncEmail') === 'string';
	},

	ping: function (syncSessionID, silent) {
		return new Promise(function (resolve, reject) {
			if (!SyncClient.isRegistered())
				return resolve(false);

			SyncClient.encrypt(syncSessionID || '', SecureSettings.getItem('syncSharedKey') || '').then(function (encryptedData) {
				$.post(SyncClient.SERVER + '/client/ping', {
					syncSessionID: syncSessionID || '',
					encryptedData: encryptedData
				}).then(function (res) {
					if (res.result === true)
						return resolve(true);

					resolve(false);
				}, function (err) {
					if (silent)
						return reject();

					if (err.responseJSON)
						if (err.responseJSON.error === 'invalid session')
							return resolve(false);
						else
							SyncClient.handleError('SyncClient.ping post', err.responseJSON.error || err.responseJSON);
					else
						SyncClient.handleError('SyncClient.ping post', err.responseText);

					reject(err);
				});
			}, Utilities.noop);
		});
	},

	pingTimer: function (on, syncSessionID) {
		if (on)
			Utilities.Timer.interval('syncClientPing', function (syncSessionID) {
				SyncClient.ping(syncSessionID, true).then(function () {
					SyncClient.Settings.autoSync(Settings.getItem('syncClientAutoSync'));
				}, Utilities.noop);
			}, SyncClient.PING_EVERY, [syncSessionID]);
		else
			Utilities.Timer.remove('interval', 'syncClientPing');
	},

	getServerStatus: function () {
		return $.get(SyncClient.SERVER + '/status');
	},

	logout: function () {
		return new Promise(function (resolve, reject) {
			if (!SyncClient.SRP.isLoggedIn()) {
				SyncClient.event.trigger('logout');

				return resolve(true);
			}

			var syncSessionID = SecureSettings.getItem('syncSessionID');

			SyncClient.encrypt(syncSessionID || '', SecureSettings.getItem('syncSharedKey') || '').then(function (encryptedData) {
				$.post(SyncClient.SERVER + '/client/logout', {
					syncSessionID: syncSessionID,
					encryptedData: encryptedData
				}).then(function (res) {
					if (res.error)	
						return reject(res.error);

					SecureSettings.removeItem('syncSessionID');
					SecureSettings.removeItem('syncSharedKey');
					SecureSettings.removeItem('syncPasswordHash');

					SyncClient.event.trigger('logout');

					resolve(true);
				}, function (err) {
					reject(err.responseJSON && err.responseJSON.error || err);
				});
			}, function () {
				SyncClient.event.trigger('logout');

				resolve(true);
			});
		});
	}
};

SyncClient.event
	.addCustomEventListener('autoLogin', function () {
		SyncClient.pingTimer(true, SecureSettings.getItem('syncSessionID'));
	});

SyncClient.promiseWorker = new PromiseWorker('../js/global/sync.worker.js');

if (Libraries.CryptoJS.blobURL)
	SyncClient.promiseWorker.postMessage({
		command: 'importScript',
		url: Libraries.CryptoJS.blobURL
	});
