import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';

const vlessUrl = (name, alpn, packetEncoding) =>
    `vless://00000000-0000-4000-8000-000000000001@203.0.113.10:443?alpn=${alpn}&packet_encoding=${packetEncoding}#${name}`;

describe('Issue #417 VLESS option deduplication', () => {
    it('keeps nodes that differ only by ALPN or packet encoding', async () => {
        const builder = new ClashConfigBuilder(
            [
                vlessUrl('synthetic-h2', 'h2', 'xudp'),
                vlessUrl('synthetic-h3', 'h3', 'packetaddr'),
            ].join('\n'),
            'minimal',
            [],
            null,
            'zh-CN',
            'mihomo/1.0'
        );
        const config = yaml.load(await builder.build());
        const proxies = config.proxies.filter((proxy) => proxy.type === 'vless');

        expect(proxies).toHaveLength(2);
        expect(proxies.map((proxy) => proxy.alpn)).toEqual([['h2'], ['h3']]);
        expect(proxies.map((proxy) => proxy['packet-encoding'])).toEqual([
            'xudp',
            'packetaddr',
        ]);
    });
});
