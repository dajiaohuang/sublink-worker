import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const syntheticProxy = 'ss://YWVzLTEyOC1nY206cGFzcw@203.0.113.10:443#Synthetic';

function createTestApp(kv) {
    return createApp({
        kv,
        assetFetcher: null,
        logger: console,
        config: { configTtlSeconds: 60, shortLinkTtlSeconds: null },
    });
}

describe('Issue #417 short-link delivery', () => {
    it('serves the generated Clash config without redirecting to a long URL', async () => {
        const kv = new MemoryKVAdapter();
        const rules = Array.from({ length: 1000 }, (_, index) => `synthetic-rule-${index}`);
        const query = new URLSearchParams({
            config: syntheticProxy,
            selectedRules: JSON.stringify(rules),
        }).toString();
        expect(query.length).toBeGreaterThan(20_000);
        for (const prefix of ['c', 'b', 's', 'x']) {
            await kv.put(`synthetic-${prefix}`, `?${query}`);
        }

        const app = createTestApp(kv);
        for (const prefix of ['c', 'b', 's', 'x']) {
            const headers = prefix === 'b'
                ? { 'User-Agent': 'SFA/1.14.0 (100; sing-box 1.14.0; language zh_Hans_CN)' }
                : {};
            const response = await app.request(`http://localhost/${prefix}/synthetic-${prefix}`, { headers });
            const body = prefix === 'b' ? await response.json() : await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get('location')).toBeNull();
            expect(JSON.stringify(body).length).toBeGreaterThan(0);
            if (prefix === 'c') {
                expect(body).toContain('Synthetic');
            } else if (prefix === 'b') {
                expect(body.route.default_http_client).toBe('rule-set-download');
            }
        }
    });
});
