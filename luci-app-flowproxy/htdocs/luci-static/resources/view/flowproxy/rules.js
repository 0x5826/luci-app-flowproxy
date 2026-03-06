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
            _('define nftables rules. choose match type and provide value (IP, MAC, or @set).'));

        // 1. 快捷模板区域
        s = m.section(form.NamedSection, '_templates', 'flowproxy', _('quick templates'));
        s.render = L.bind(function() {
            var presets = {
                'local': { name: 'skip local (dst)', type: 'custom', val: 'fib daddr type { local, anycast, multicast }', proto: 'both' },
                'proxy_srv': { name: 'skip proxy server', type: 'src_ip', val: '@proxy_server_ip', proto: 'both' },
                'private': { name: 'skip private (dst)', type: 'dst_ip', val: '@private_dst_ip_v4', proto: 'both' },
                'china': { name: 'skip china (dst)', type: 'dst_ip', val: '@chnroute_dst_ip_v4', proto: 'both' },
                'src_ip': { name: 'skip ip (src)', type: 'src_ip', val: '@no_proxy_src_ip_v4', proto: 'both' },
                'dst_ip': { name: 'skip ip (dst)', type: 'dst_ip', val: '@no_proxy_dst_ip_v4', proto: 'both' },
                'src_mac': { name: 'skip mac (src)', type: 'src_mac', val: '@no_proxy_src_mac', proto: 'both' },
                'tcp_ports': { name: 'skip ports (dst)', type: 'dst_port', val: '@no_proxy_dst_tcp_ports', proto: 'tcp' }
            };

            var container = E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; display: flex; flex-wrap: wrap; gap: 8px;' })
            ]);

            var btnGroup = container.querySelector('div');
            Object.keys(presets).forEach(function(k) {
                var p = presets[k];
                btnGroup.appendChild(E('button', {
                    'class': 'cbi-button cbi-button-apply',
                    'click': ui.createHandlerFn(this, function() {
                        var sid = uci.add('flowproxy', 'rule');
                        uci.set('flowproxy', sid, 'name', p.name);
                        uci.set('flowproxy', sid, 'enabled', '1');
                        uci.set('flowproxy', sid, 'protocol', p.proto);
                        uci.set('flowproxy', sid, 'match_type', p.type);
                        uci.set('flowproxy', sid, 'match_value', p.val);
                        uci.set('flowproxy', sid, 'action', 'return');
                        uci.set('flowproxy', sid, 'counter', '0');
                        return uci.save().then(function() { location.reload(); });
                    })
                }, [ E('em', { 'class': 'icon-plus' }), ' ', p.name ]));
            }, this);

            return container;
        }, this);

        // 2. 规则列表
        s = m.section(form.TableSection, 'rule', _('matching rules'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.nodescription = true;

        s.renderSectionAdd = function(extra_class) {
            var node = form.TableSection.prototype.renderSectionAdd.apply(this, [extra_class]);
            var resetBtn = E('button', {
                'class': 'cbi-button cbi-button-reset',
                'style': 'margin-left: 10px; border: 1px solid #cc0000; color: #cc0000;',
                'title': _('reset to default templates'),
                'click': ui.createHandlerFn(this, function() {
                    if (confirm(_('this will delete ALL current rules and generate default templates. are you sure?'))) {
                        var existing = uci.sections('flowproxy', 'rule');
                        existing.forEach(function(r) { uci.remove('flowproxy', r['.name']); });

                        var default_rules = [
                            { name: 'skip local (dst)', type: 'custom', val: 'fib daddr type { local, anycast, multicast }', proto: 'both' },
                            { name: 'skip proxy server', type: 'src_ip', val: '@proxy_server_ip', proto: 'both' },
                            { name: 'skip mac (src)', type: 'src_mac', val: '@no_proxy_src_mac', proto: 'both' },
                            { name: 'skip private (dst)', type: 'dst_ip', val: '@private_dst_ip_v4', proto: 'both' },
                            { name: 'skip china (dst)', type: 'dst_ip', val: '@chnroute_dst_ip_v4', proto: 'both' },
                            { name: 'skip tcp ports (dst)', type: 'dst_port', val: '@no_proxy_dst_tcp_ports', proto: 'tcp' }
                        ];

                        default_rules.forEach(function(r) {
                            var sid = uci.add('flowproxy', 'rule');
                            uci.set('flowproxy', sid, 'name', r.name);
                            uci.set('flowproxy', sid, 'enabled', '1');
                            uci.set('flowproxy', sid, 'protocol', r.proto);
                            uci.set('flowproxy', sid, 'match_type', r.type);
                            uci.set('flowproxy', sid, 'match_value', r.val);
                            uci.set('flowproxy', sid, 'action', 'return');
                            uci.set('flowproxy', sid, 'counter', '0');
                        });
                        return uci.save().then(function() { location.reload(); });
                    }
                })
            }, [ E('em', { 'class': 'icon-reload' }), ' ', _('reset to default') ]);
            node.appendChild(resetBtn);
            return node;
        };

        s.renderRowActions = function(section_id) {
            var node = form.TableSection.prototype.renderRowActions.apply(this, [section_id]);
            var delBtn = node.querySelector('.cbi-button-remove');
            if (delBtn) {
                delBtn.onclick = L.bind(function(ev) {
                    if (confirm(_('really delete this rule?'))) {
                        uci.remove('flowproxy', section_id);
                        uci.save().then(function() { location.reload(); });
                    }
                    ev.stopPropagation();
                    return false;
                }, this);
            }
            return node;
        };

        // 优化点：手动添加按钮不再生成空白规则，而是预填常用模版
        s.handleAdd = function(ev) {
            var sid = uci.add('flowproxy', 'rule');
            uci.set('flowproxy', sid, 'name', 'skip private (dst)');
            uci.set('flowproxy', sid, 'enabled', '1');
            uci.set('flowproxy', sid, 'protocol', 'both');
            uci.set('flowproxy', sid, 'match_type', 'dst_ip');
            uci.set('flowproxy', sid, 'match_value', '@private_dst_ip_v4');
            uci.set('flowproxy', sid, 'action', 'return');
            uci.set('flowproxy', sid, 'counter', '0');
            return uci.save().then(function() { location.reload(); });
        };

        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.width = '8%';

        o = s.option(form.Value, 'name', _('name'));
        o.rmempty = false;
        o.width = '10%';

        o = s.option(form.ListValue, 'protocol', _('protocol'));
        o.value('both', 'both'); o.value('tcp', 'tcp'); o.value('udp', 'udp');
        o.width = '10%';

        o = s.option(form.ListValue, 'match_type', _('match type'));
        o.value('dst_ip', _('dest ip'));
        o.value('src_ip', _('src ip'));
        o.value('src_mac', _('src mac'));
        o.value('dst_port', _('dest port'));
        o.value('src_port', _('src port'));
        o.value('custom', _('custom (raw)'));
        o.default = 'dst_ip';
        o.width = '15%';

        o = s.option(form.Value, 'match_value', _('match value'));
        o.rmempty = false;
        o.width = '32%';
        nftsets.forEach(function(set) { o.value(set); });

        o = s.option(form.Flag, 'counter', _('counter'));
        o.width = '8%';

        o = s.option(form.ListValue, 'action', _('action'));
        o.value('return', 'return'); o.value('accept', 'accept'); o.value('drop', 'drop');
        o.default = 'return';
        o.width = '10%';

        return m.render();
    }
});