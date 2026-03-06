'use strict';
'require form';
'require uci';
'require view';
'require ui';

return L.view.extend({
    load: function() {
        return uci.load('flowproxy');
    },

    render: function() {
        var m, s, o;

        m = new form.Map('flowproxy', _('FlowProxy - Rules Management'),
            _('Directly write nft rules to match traffic. Rules are processed in order. Matches with "return" will bypass proxy.'));

        // 规则列表
        s = m.section(form.GridSection, 'rule', _('Traffic Matching Rules'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.addbtntitle = _('Add New Rule');
        
        // 预设模版
        var presets = {
            'local': {
                name: _('Skip Local/Multicast'),
                content: 'meta nfproto ipv4 ip daddr type { local, anycast, multicast } return',
                protocol: 'both'
            },
            'private': {
                name: _('Skip Private IP'),
                content: 'ip daddr @private_dst_ip_v4 return',
                protocol: 'both'
            },
            'china': {
                name: _('Skip China IP'),
                content: 'ip daddr @chnroute_dst_ip_v4 return',
                protocol: 'both'
            },
            'src_mac': {
                name: _('Skip Source MAC'),
                content: 'ether saddr @no_proxy_src_mac return',
                protocol: 'both'
            },
            'src_ip': {
                name: _('Skip Source IP'),
                content: 'ip saddr @no_proxy_src_ip_v4 return',
                protocol: 'both'
            },
            'dst_ip': {
                name: _('Skip Destination IP'),
                content: 'ip daddr @no_proxy_dst_ip_v4 return',
                protocol: 'both'
            },
            'tcp_ports': {
                name: _('Skip TCP Ports'),
                content: 'tcp dport @no_proxy_dst_tcp_ports return',
                protocol: 'tcp'
            },
            'udp_ports': {
                name: _('Skip UDP Ports'),
                content: 'udp dport @no_proxy_dst_udp_ports return',
                protocol: 'udp'
            }
        };

        // 修改添加按钮的行为，增加模版选择
        s.handleAdd = function(ev) {
            var section_id = uci.add('flowproxy', 'rule');
            
            // 默认创建一个空规则
            uci.set('flowproxy', section_id, 'name', _('New Custom Rule'));
            uci.set('flowproxy', section_id, 'enabled', '1');
            uci.set('flowproxy', section_id, 'protocol', 'both');
            uci.set('flowproxy', section_id, 'content', '');

            return this.map.save(null, true).then(L.bind(function() {
                return this.map.render();
            }, this));
        };

        o = s.option(form.Value, 'name', _('Rule Name'));
        o.rmempty = false;

        o = s.option(form.ListValue, 'protocol', _('Protocol'));
        o.value('both', _('Both (TCP+UDP)'));
        o.value('tcp', _('TCP Only'));
        o.value('udp', _('UDP Only'));
        o.default = 'both';

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.Value, 'content', _('NFT Rule Content'));
        o.rmempty = false;
        o.placeholder = _('e.g. ip daddr @private_dst_ip_v4 return');
        o.modalonly = false; // 在列表中也可见，但因为是 GridSection，通常点击编辑进入弹窗更好

        // 帮助说明
        s = m.section(form.NamedSection, '_help', 'flowproxy', _('How to use'));
        s.render = function() {
            var sets_list = [
                '@no_proxy_src_mac (MAC List)',
                '@no_proxy_src_ip_v4 (Source IP List)',
                '@no_proxy_dst_ip_v4 (Dest IP List)',
                '@private_dst_ip_v4 (Private IP Ranges)',
                '@chnroute_dst_ip_v4 (China IP Ranges)',
                '@no_proxy_dst_tcp_ports (TCP Ports)',
                '@no_proxy_dst_udp_ports (UDP Ports)',
                '@proxy_server_ip (Proxy Server IP)'
            ];

            var container = E('div', { 'class': 'cbi-section-node' }, [
                E('p', {}, _('You can use the following pre-defined sets in your rules:')),
                E('ul', { 'style': 'margin-left: 20px; font-family: monospace;' }, sets_list.map(function(s) {
                    return E('li', {}, s);
                })),
                E('p', { 'style': 'margin-top: 10px;' }, [
                    _('Action can be '),
                    E('b', {}, 'return'),
                    _(' (to bypass proxy) or other valid nftables actions.')
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Quick Add Templates:')),
                    E('div', { 'class': 'cbi-value-field' }, Object.keys(presets).map(function(k) {
                        return E('button', {
                            'class': 'cbi-button cbi-button-apply',
                            'style': 'margin: 2px;',
                            'click': function(ev) {
                                ev.preventDefault();
                                var section_id = uci.add('flowproxy', 'rule');
                                uci.set('flowproxy', section_id, 'name', presets[k].name);
                                uci.set('flowproxy', section_id, 'enabled', '1');
                                uci.set('flowproxy', section_id, 'protocol', presets[k].protocol);
                                uci.set('flowproxy', section_id, 'content', presets[k].content);
                                m.save(null, true).then(function() {
                                    location.reload();
                                });
                            }
                        }, presets[k].name);
                    }))
                ])
            ]);
            return container;
        };

        return m.render();
    }
});