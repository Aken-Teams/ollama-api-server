/**
 * Central reactive state for the gateway frontend.
 *
 * Migration strategy:
 *   - Old code keeps reading `currentApiKey` etc. (let declarations in app.js)
 *   - New / migrated code reads via AppStore.get('apiKey') and writes via AppStore.set(...)
 *   - app.js mirrors writes both ways during transition
 *   - Subscribers fire on every set so cross-module reactivity works
 *
 * Persistence:
 *   - Keys ending in '*Persist' are auto-saved/restored from localStorage
 *
 * Debug helper:
 *   - In console: __store() prints current state
 */
(function () {
    'use strict';

    const _state = Object.create(null);
    const _subscribers = Object.create(null);
    const _persistKeys = new Set();

    // localStorage key namespace
    const LS_PREFIX = 'pj_store__';

    function _read(key) {
        return _state[key];
    }

    function _write(key, value, opts) {
        const prev = _state[key];
        if (prev === value) return value;
        _state[key] = value;

        if (_persistKeys.has(key)) {
            try {
                if (value === null || value === undefined) {
                    localStorage.removeItem(LS_PREFIX + key);
                } else if (typeof value === 'object') {
                    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
                } else {
                    localStorage.setItem(LS_PREFIX + key, String(value));
                }
            } catch (_) { /* quota / private mode */ }
        }

        const subs = _subscribers[key];
        if (subs) {
            for (const fn of subs) {
                try { fn(value, prev); } catch (e) { console.error('AppStore subscriber error', key, e); }
            }
        }
        return value;
    }

    function _restore(key, parser) {
        try {
            const raw = localStorage.getItem(LS_PREFIX + key);
            if (raw === null) return undefined;
            return parser ? parser(raw) : raw;
        } catch (_) { return undefined; }
    }

    const AppStore = {
        get(key) { return _read(key); },
        set(key, value) { return _write(key, value); },
        update(key, fn) { return _write(key, fn(_read(key))); },
        // subscribe(key, fn) → returns unsubscribe()
        subscribe(key, fn) {
            (_subscribers[key] = _subscribers[key] || []).push(fn);
            return () => {
                const arr = _subscribers[key];
                if (!arr) return;
                const i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            };
        },
        // mark a key as auto-persisting; optional initial-from-LS load
        persist(key, parser) {
            _persistKeys.add(key);
            const restored = _restore(key, parser);
            if (restored !== undefined) _state[key] = restored;
            return _state[key];
        },
        // dump current state (for debug)
        snapshot() { return Object.assign({}, _state); },
    };

    // ----- pre-register known shared keys (no value yet, just persistence flags) -----
    // Auth — currently stored under different LS keys for backward compat with auth.js
    _state.apiKey = localStorage.getItem('pj_api_key') || '';
    _state.isAuthenticated = localStorage.getItem('pj_authenticated') === 'true';
    _state.user = (() => { try { return JSON.parse(localStorage.getItem('pj_user') || 'null'); } catch (_) { return null; } })();
    _state.role = localStorage.getItem('pj_role') || null;
    // Models / discovery
    _state.models = [];           // list from /v1/models
    _state.quickTestModels = [];  // expanded list used by testing.js
    // Vision uploads
    _state.uploadedImage = null;  // for chat-completion test (data URL)
    _state.visionImage = null;    // for vision tab (data URL)
    // Last responses
    _state.lastRawResponse = null;
    _state.lastAIContent = '';
    _state.lastVisionResult = '';
    // Config (constants — not really mutable but exposed for one place lookup)
    _state.apiUrl = window.location.origin;
    _state.externalUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? window.location.origin
        : 'https://ollama_pjapi.theaken.com';

    // Expose
    window.AppStore = AppStore;
    // Console debug helper
    window.__store = function () {
        console.table(AppStore.snapshot());
        return AppStore.snapshot();
    };
})();
