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

        m = new form.Map('flowproxy', _('flowproxy - rules'),
            _('define nftables rules. matches with "return" action will bypass the proxy.'));

        // 快捷模板区域
        s = m.section(form.NamedSection, '_templates', 'flowproxy', _('quick templates'));
        s.render = L.bind(function() {
            var presets = {
                'local': { name: 'skip local', content: 'meta nfproto ipv4 ip daddr type { local, anycast, multicast }', proto: 'both' },
                'private': { name: 'skip private', content: 'ip daddr @private_dst_ip_v4', proto: 'both' },
                'china': { name: 'skip china', content: 'ip daddr @chnroute_dst_ip_v4', proto: 'both' },
                'src_mac': { name: 'skip mac', content: 'ether saddr @no_proxy_src_mac', proto: 'both' },
                'tcp_ports': { name: 'skip tcp ports', content: 'tcp dport @no_proxy_dst_tcp_ports', proto: 'tcp' }
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
                                uci.set('flowproxy', sid, 'action', 'return');
                                uci.set('flowproxy', sid, 'counter', '0');
                                
                                // 核心修复：先保存到 UCI 缓存，再刷新页面确保渲染引擎读取新数据
                                uci.save();
                                location.reload();
                            }
                        }, [ E('em', { 'class': 'icon-plus' }), ' ', presets[k].name ]);
                    })
                )
            ]);
        }, this);

        // 规则列表
        s = m.section(form.TableSection, 'rule', _('matching rules'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.nodescription = true;

        // 辅助：处理手动点击“添加”按钮时的默认值
        s.handleAdd = function(ev) {
            var sid = uci.add('flowproxy', 'rule');
            uci.set('flowproxy', sid, 'name', 'new rule');
            uci.set('flowproxy', sid, 'enabled', '1');
            uci.set('flowproxy', sid, 'protocol', 'both');
            uci.set('flowproxy', sid, 'action', 'return');
            uci.set('flowproxy', sid, 'counter', '0');
            
            uci.save();
            location.reload();
        };

        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.width = '5%';

        o = s.option(form.Value, 'name', _('name'));
        o.rmempty = false;
        o.width = '15%';

        o = s.option(form.ListValue, 'protocol', _('protocol'));
        o.value('both', 'both');
        o.value('tcp', 'tcp');
        o.value('udp', 'udp');
        o.width = '10%';

        o = s.option(form.Value, 'content', _('content'));
        o.rmempty = false;
        o.width = '45%';

        o = s.option(form.Flag, 'counter', _('counter'));
        o.width = '5%';

        o = s.option(form.ListValue, 'action', _('action'));
        o.value('return', 'return');
        o.value('accept', 'accept');
        o.value('drop', 'drop');
        o.default = 'return';
        o.width = '10%';

        return m.render();
    }
});