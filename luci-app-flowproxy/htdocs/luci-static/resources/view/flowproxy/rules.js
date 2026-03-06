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

        var nftsets = uci.sections('flowproxy', 'nftset').map(function(s) {
            return '@' + s['.name'];
        });
        nftsets.push('@proxy_server_ip');

        m = new form.Map('flowproxy', _('代理分流 - 规则管理'),
            _('define nftables rules. choose match type and provide value. rules are separated into TCP and UDP lists.'));

        // 1. 快捷模板区域
        s = m.section(form.NamedSection, '_templates', 'flowproxy', _('quick templates'));
        s.render = L.bind(function() {
            var presets = {
                'local': { name: 'skip local (dst)', type: 'custom', val: 'fib daddr type { local, anycast, multicast }' },
                'proxy_srv': { name: 'skip proxy server', type: 'src_ip', val: '@proxy_server_ip' },
                'private': { name: 'skip private (dst)', type: 'dst_ip', val: '@private_dst_ip_v4' },
                'china': { name: 'skip china (dst)', type: 'dst_ip', val: '@chnroute_dst_ip_v4' },
                'src_ip': { name: 'skip ip (src)', type: 'src_ip', val: '@no_proxy_src_ip_v4' },
                'dst_ip': { name: 'skip ip (dst)', type: 'dst_ip', val: '@no_proxy_dst_ip_v4' },
                'src_mac': { name: 'skip mac (src)', type: 'src_mac', val: '@no_proxy_src_mac' },
                'ports': { name: 'skip ports (dst)', type: 'dst_port', val: '@no_proxy_dst_tcp_ports' }
            };

            var container = E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; display: flex; flex-wrap: wrap; gap: 8px;' })
            ]);

            var btnGroup = container.querySelector('div');
            Object.keys(presets).forEach(function(k) {
                var p = presets[k];
                btnGroup.appendChild(E('button', {
                    'class': 'cbi-button cbi-button-apply',
                    'title': _('Click to add to BOTH TCP and UDP lists'),
                    'click': ui.createHandlerFn(this, function() {
                        // 默认模版依然同时添加到两个列表，因为大多数分流规则是通用的
                        ['tcp_rule', 'udp_rule'].forEach(function(type) {
                            var sid = uci.add('flowproxy', type);
                            uci.set('flowproxy', sid, 'name', p.name);
                            uci.set('flowproxy', sid, 'enabled', '1');
                            uci.set('flowproxy', sid, 'match_type', p.type);
                            uci.set('flowproxy', sid, 'match_value', p.val);
                            uci.set('flowproxy', sid, 'action', 'return');
                            uci.set('flowproxy', sid, 'counter', '0');
                        });
                        return uci.save().then(function() { location.reload(); });
                    })
                }, [ E('em', { 'class': 'icon-plus' }), ' ', p.name ]));
            }, this);

            return container;
        }, this);

        // 辅助函数：创建规则表格
        var renderTable = L.bind(function(map, type, title) {
            var s = map.section(form.TableSection, type, title);
            s.addremove = true;
            s.anonymous = true;
            s.sortable = true;
            s.nodescription = true;

            s.renderRowActions = function(sid) {
                var node = form.TableSection.prototype.renderRowActions.apply(this, [sid]);
                var delBtn = node.querySelector('.cbi-button-remove');
                if (delBtn) {
                    delBtn.onclick = L.bind(function(ev) {
                        if (confirm(_('really delete this rule?'))) {
                            uci.remove('flowproxy', sid);
                            uci.save().then(function() { location.reload(); });
                        }
                        ev.stopPropagation(); return false;
                    }, this);
                }
                return node;
            };

            s.handleAdd = function(ev) {
                var sid = uci.add('flowproxy', type);
                uci.set('flowproxy', sid, 'name', 'new rule');
                uci.set('flowproxy', sid, 'enabled', '1');
                uci.set('flowproxy', sid, 'match_type', 'dst_ip');
                uci.set('flowproxy', sid, 'match_value', '');
                uci.set('flowproxy', sid, 'action', 'return');
                uci.set('flowproxy', sid, 'counter', '0');
                return uci.save().then(function() { location.reload(); });
            };

            o = s.option(form.Flag, 'enabled', _('enabled'));
            o.width = '5%';

            o = s.option(form.Value, 'name', _('name'));
            o.rmempty = false; o.width = '15%';

            o = s.option(form.ListValue, 'match_type', _('match type'));
            // 不加 _() 翻译，显示原英文
            o.value('dst_ip', 'dest ip');
            o.value('src_ip', 'src ip');
            o.value('src_mac', 'src mac');
            o.value('dst_port', 'dest port');
            o.value('src_port', 'src port');
            o.value('custom', 'custom (raw)');
            o.default = 'dst_ip';
            o.width = '12%';

            o = s.option(form.Value, 'match_value', _('match value'));
            o.rmempty = false; o.width = '35%';
            nftsets.forEach(function(set) { o.value(set); });

            o = s.option(form.Flag, 'counter', _('counter'));
            o.width = '8%';

            o = s.option(form.ListValue, 'action', _('action'));
            o.value('return', 'return'); o.value('accept', 'accept'); o.value('drop', 'drop');
            o.default = 'return';
            o.width = '10%';
        }, this);

        // 2. TCP 规则列表
        renderTable(m, 'tcp_rule', _('TCP Matching Rules'));

        // 3. UDP 规则列表
        renderTable(m, 'udp_rule', _('UDP Matching Rules'));

        // 4. 重置按钮区域 (放置在最下方)
        s = m.section(form.NamedSection, '_reset', 'flowproxy', _('advanced control'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node', 'style': 'padding: 10px; text-align: right;' }, [
                E('button', {
                    'class': 'cbi-button cbi-button-reset',
                    'style': 'border: 1px solid #cc0000; color: #cc0000;',
                    'click': ui.createHandlerFn(this, function() {
                        if (confirm(_('this will delete ALL current rules and generate default templates. are you sure?'))) {
                            uci.sections('flowproxy', 'tcp_rule').forEach(function(r) { uci.remove('flowproxy', r['.name']); });
                            uci.sections('flowproxy', 'udp_rule').forEach(function(r) { uci.remove('flowproxy', r['.name']); });

                            var defs = [
                                { n: 'skip local (dst)', t: 'custom', v: 'fib daddr type { local, anycast, multicast }' },
                                { n: 'skip proxy server', t: 'src_ip', v: '@proxy_server_ip' },
                                { n: 'skip mac (src)', t: 'src_mac', v: '@no_proxy_src_mac' },
                                { n: 'skip private (dst)', t: 'dst_ip', v: '@private_dst_ip_v4' },
                                { n: 'skip china (dst)', t: 'dst_ip', v: '@chnroute_dst_ip_v4' },
                                { n: 'skip ports (dst)', t: 'dst_port', v: '@no_proxy_dst_tcp_ports' }
                            ];

                            ['tcp_rule', 'udp_rule'].forEach(function(type) {
                                defs.forEach(function(r) {
                                    var sid = uci.add('flowproxy', type);
                                    uci.set('flowproxy', sid, 'name', r.n);
                                    uci.set('flowproxy', sid, 'enabled', '1');
                                    uci.set('flowproxy', sid, 'match_type', r.t);
                                    uci.set('flowproxy', sid, 'match_value', r.v);
                                    uci.set('flowproxy', sid, 'action', 'return');
                                    uci.set('flowproxy', sid, 'counter', '0');
                                });
                            });
                            return uci.save().then(function() { location.reload(); });
                        }
                    })
                }, [ E('em', { 'class': 'icon-reload' }), ' ', _('reset to default templates') ])
            ]);
        }, this);

        return m.render();
    }
});