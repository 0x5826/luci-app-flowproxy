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
            _('Directly edit nft rules below. Rules are processed in order. Matches with "return" will bypass proxy.'));

        // 快捷模板区域 (放在最上方，更直观)
        s = m.section(form.NamedSection, '_templates', 'flowproxy', _('Quick Template Gallery'));
        s.render = L.bind(function() {
            var presets = {
                'local': { name: _('Skip Local'), content: 'meta nfproto ipv4 ip daddr type { local, anycast, multicast } return', proto: 'both' },
                'private': { name: _('Skip Private'), content: 'ip daddr @private_dst_ip_v4 return', proto: 'both' },
                'china': { name: _('Skip China'), content: 'ip daddr @chnroute_dst_ip_v4 return', proto: 'both' },
                'src_mac': { name: _('Skip MAC'), content: 'ether saddr @no_proxy_src_mac return', proto: 'both' },
                'tcp_ports': { name: _('Skip TCP Ports'), content: 'tcp dport @no_proxy_dst_tcp_ports return', proto: 'tcp' }
            };

            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; display: flex; flex-wrap: wrap; gap: 8px;' }, 
                    Object.keys(presets).map(function(k) {
                        return E('button', {
                            'class': 'cbi-button cbi-button-apply',
                            'click': function(ev) {
                                ev.preventDefault();
                                var sid = uci.add('flowproxy', 'rule');
                                uci.set('flowproxy', sid, 'name', presets[k].name);
                                uci.set('flowproxy', sid, 'enabled', '1');
                                uci.set('flowproxy', sid, 'protocol', presets[k].proto);
                                uci.set('flowproxy', sid, 'content', presets[k].content);
                                m.save(null, true).then(function() { location.reload(); });
                            }
                        }, [ E('em', { 'class': 'icon-plus' }), ' ', presets[k].name ]);
                    })
                )
            ]);
        }, this);

        // 规则列表 (使用 TableSection 实现行内编辑)
        s = m.section(form.TableSection, 'rule', _('Traffic Matching Rules'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.nodescription = true;

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.width = '5%';

        o = s.option(form.Value, 'name', _('Rule Name'));
        o.rmempty = false;
        o.width = '20%';

        o = s.option(form.ListValue, 'protocol', _('Protocol'));
        o.value('both', 'TCP+UDP');
        o.value('tcp', 'TCP');
        o.value('udp', 'UDP');
        o.width = '15%';

        o = s.option(form.Value, 'content', _('NFT Rule Content'));
        o.rmempty = false;
        o.placeholder = 'e.g. ip daddr @private_dst_ip_v4 return';
        o.width = '50%';
        o.description = _('Tip: Use @proxy_server_ip, @chnroute_dst_ip_v4, etc.');

        return m.render();
    }
});