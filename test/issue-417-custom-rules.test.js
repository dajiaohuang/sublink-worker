import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

function createTestApp() {
    return createApp({
        kv: new MemoryKVAdapter(),
        assetFetcher: null,
        logger: console,
        config: { configTtlSeconds: 60, shortLinkTtlSeconds: null },
    });
}

async function getCustomRulesFactory() {
    const response = await createTestApp().request('http://localhost/');
    const html = await response.text();
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map((match) => match[1])
        .find((content) => content.includes('function customRulesData()'));

    expect(script).toBeDefined();

    const listeners = new Map();
    const window = {
        addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    };
    const values = new Map();
    const localStorage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
    };
    const factory = new Function(
        'window',
        'localStorage',
        'setTimeout',
        'confirm',
        `${script}; return customRulesData;`
    )(window, localStorage, () => {}, () => true);

    return { factory, listeners, localStorage, values };
}

describe('Issue #417 custom-rule persistence', () => {
    it('restores saved rules and persists edits across page loads', async () => {
        const { factory, listeners, localStorage, values } = await getCustomRulesFactory();
        const savedRules = [{ name: 'Synthetic', domain_suffix: 'example.test', outbound: 'DIRECT' }];
        values.set('customRules', JSON.stringify(savedRules));

        const state = factory();
        const watchers = new Map();
        state.$watch = (key, callback) => watchers.set(key, callback);
        state.init();

        expect(state.rules).toEqual(savedRules);
        expect(state.jsonContent).toBe(JSON.stringify(savedRules, null, 2));

        state.rules[0].name = 'Edited synthetic rule';
        watchers.get('rules')(state.rules);
        expect(JSON.parse(localStorage.getItem('customRules'))[0].name).toBe('Edited synthetic rule');

        const restoredRules = [{ name: 'Restored', domain_keyword: 'example.test', outbound: 'DIRECT' }];
        listeners.get('restore-custom-rules')({ detail: { rules: restoredRules } });
        watchers.get('rules')(state.rules);
        expect(state.rules).toEqual(restoredRules);
        expect(JSON.parse(localStorage.getItem('customRules'))).toEqual(restoredRules);

        const reloaded = factory();
        reloaded.$watch = (key, callback) => watchers.set(key, callback);
        reloaded.init();
        expect(reloaded.rules).toEqual(restoredRules);
    });
});
