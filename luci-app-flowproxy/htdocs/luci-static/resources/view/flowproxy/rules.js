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

        m = new form.Map('flowproxy', _('flowproxy - rules'),
            _('Manage diversion rules, mainly used to define which traffic should bypass the proxy server.'));

        // 1. 隐藏的数据绑定段 (仅用于后端数据绑定)
        var master_s = m.section(form.NamedSection, 'global', 'flowproxy');
        master_s.render = function() { return E('div', { 'style': 'display:none' }); };
        master_s.option(form.Flag, 'tcp_enabled', _('TCP diversion master switch'));
        master_s.option(form.Flag, 'udp_enabled', _('UDP diversion master switch'));

        // 辅助函数：生成模版按钮组
        var createTemplateButtons = L.bind(function(map, type) {
            var presets = {
                'local': { name: 'local (dst)', type: 'custom', val: 'fib daddr type { unspec, local, anycast, multicast }' },
                'priv': { name: 'private (dst)', type: 'dst_ip', val: '@private_dst_ip_v4' },
                'china': { name: 'china (dst)', type: 'dst_ip', val: '@chnroute_dst_ip_v4' },
                'src_ip': { name: 'ip (src)', type: 'src_ip', val: '@no_proxy_src_ip_v4' },
                'dst_ip': { name: 'ip (dst)', type: 'dst_ip', val: '@no_proxy_dst_ip_v4' },
                'mac': { name: 'mac (src)', type: 'src_mac', val: '@no_proxy_src_mac' },
                'ports': { name: 'ports (dst)', type: 'dst_port', val: '@no_proxy_dst_tcp_ports' }
            };

            var btnGroup = E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;' });
            Object.keys(presets).forEach(function(k) {
                var p = presets[k];
                // 如果是 UDP 列表，跳过 ports 模版（因为默认是针对 TCP）
                if (type === 'udp_rule' && k === 'ports') return;

                btnGroup.appendChild(E('button', {
                    'class': 'cbi-button cbi-button-apply',
                    'style': 'padding: 0 6px; font-size: 0.75rem; height: 22px; line-height: 22px; opacity: 0.8; margin-bottom: 4px;',
                    'click': ui.createHandlerFn(this, function() {
                        var sid = uci.add('flowproxy', type);
                        uci.set('flowproxy', sid, 'name', 'skip ' + p.name);
                        uci.set('flowproxy', sid, 'enabled', '1');
                        uci.set('flowproxy', sid, 'match_type', p.type);
                        uci.set('flowproxy', sid, 'match_value', p.val);
                        uci.set('flowproxy', sid, 'action', 'return');
                        uci.set('flowproxy', sid, 'counter', '0');
                        return uci.save().then(function() { location.reload(); });
                    })
                }, [ E('em', { 'class': 'icon-plus' }), ' ', p.name ]));
            });
            return btnGroup;
        }, this);

        // 辅助函数：创建标题带手动开关的规则表格
        var renderTable = L.bind(function(map, type, title, switch_option) {
            var s = map.section(form.TableSection, type, title);
            s.addremove = true;
            s.anonymous = true;
            s.sortable = true;
            s.nodescription = true;

            s.render = L.bind(function() {
                return form.TableSection.prototype.render.apply(s).then(L.bind(function(node) {
                    var titleEl = node.querySelector('h3');
                    if (titleEl) {
                        titleEl.style.display = 'block'; // 改为 block 方便下方换行放模版
                        
                        // 第一行：标题 + 总开关
                        var headerRow = E('div', { 'style': 'display: flex; align-items: center; gap: 10px;' }, [
                            E('span', {}, title),
                            E('div', { 'style': 'font-size: 0.8em; font-weight: normal; display: inline-flex; align-items: center; gap: 5px; color: #666;' }, [
                                (function() {
                                    var is_enabled = (uci.get('flowproxy', 'global', switch_option) === '1');
                                    return E('input', {
                                        'type': 'checkbox',
                                        'style': 'width: 16px; height: 18px; cursor: pointer;',
                                        'checked': is_enabled ? 'checked' : null,
                                        'change': ui.createHandlerFn(this, function(ev) {
                                            uci.set('flowproxy', 'global', switch_option, ev.target.checked ? '1' : '0');
                                            return uci.save().then(function() {
                                                ui.addNotification(null, E('p', _('Master switch updated. Click "Save & Apply" at the bottom to take effect.')), 'info');
                                            });
                                        })
                                    });
                                })(),
                                E('span', {}, _('master switch'))
                            ])
                        ]);
                        
                        // 清空原标题内容并重新组装
                        titleEl.innerHTML = '';
                        titleEl.appendChild(headerRow);
                        
                        // 第二行：在该协议框架内注入对应的模版按钮
                        titleEl.appendChild(createTemplateButtons(map, type));
                    }
                    return node;
                }, this));
            }, this);

            s.renderSectionAdd = function(extra_class) {
                var node = form.TableSection.prototype.renderSectionAdd.apply(this, [extra_class]);
                var label = (type === 'tcp_rule') ? 'TCP' : 'UDP';
                var resetBtn = E('button', {
                    'class': 'cbi-button cbi-button-reset',
                    'style': 'margin-left: 10px; border: 1px solid #cc0000; color: #cc0000;',
                    'click': ui.createHandlerFn(this, function() {
                        if (confirm(_('this will delete ALL current %s rules and generate default templates. are you sure?').format(label))) {
                            uci.sections('flowproxy', type).forEach(function(r) { uci.remove('flowproxy', r['.name']); });
                            var defs = [
                                { n: 'skip local (dst)', t: 'custom', v: 'fib daddr type { unspec, local, anycast, multicast }' },
                                { n: 'skip mac (src)', t: 'src_mac', v: '@no_proxy_src_mac' },
                                { n: 'skip private (dst)', t: 'dst_ip', v: '@private_dst_ip_v4' },
                                { n: 'skip china (dst)', t: 'dst_ip', v: '@chnroute_dst_ip_v4' }
                            ];
                            if (type === 'tcp_rule') defs.push({ n: 'skip ports (dst)', t: 'dst_port', v: '@no_proxy_dst_tcp_ports' });
                            defs.forEach(function(r) {
                                var sid = uci.add('flowproxy', type);
                                uci.set('flowproxy', sid, 'name', r.n);
                                uci.set('flowproxy', sid, 'enabled', '1');
                                uci.set('flowproxy', sid, 'match_type', r.t);
                                uci.set('flowproxy', sid, 'match_value', r.v);
                                uci.set('flowproxy', sid, 'action', 'return');
                                uci.set('flowproxy', sid, 'counter', '0');
                            });
                            return uci.save().then(function() { location.reload(); });
                        }
                    })
                }, [ E('em', { 'class': 'icon-reload' }), ' ', _('reset %s templates').format(label) ]);
                node.appendChild(resetBtn);
                return node;
            };

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
                uci.set('flowproxy', sid, 'name', 'skip private (dst)');
                uci.set('flowproxy', sid, 'enabled', '1');
                uci.set('flowproxy', sid, 'match_type', 'dst_ip');
                uci.set('flowproxy', sid, 'match_value', '@private_dst_ip_v4');
                uci.set('flowproxy', sid, 'action', 'return');
                uci.set('flowproxy', sid, 'counter', '0');
                return uci.save().then(function() { location.reload(); });
            };

            o = s.option(form.Flag, 'enabled', _('enabled')); o.width = '8%';
            o = s.option(form.Value, 'name', _('name')); o.rmempty = false; o.width = '10%';
            o = s.option(form.ListValue, 'match_type', _('match type'));
            o.value('dst_ip', 'dest ip'); o.value('src_ip', 'src ip'); o.value('src_mac', 'src mac');
            o.value('dst_port', 'dest port'); o.value('src_port', 'src port'); o.value('custom', 'custom (raw)');
            o.default = 'dst_ip'; o.width = '12%';
            o = s.option(form.Value, 'match_value', _('match value'));
            o.rmempty = false; o.width = '32%';
            nftsets.forEach(function(set) { o.value(set); });
            o = s.option(form.Flag, 'counter', _('counter')); o.width = '8%';
            o = s.option(form.ListValue, 'action', _('action'));
            o.value('return', 'return'); o.value('accept', 'accept'); o.value('drop', 'drop');
            o.default = 'return'; o.width = '10%';
        }, this);

        renderTable(m, 'tcp_rule', _('TCP Matching Rules'), 'tcp_enabled');
        renderTable(m, 'udp_rule', _('UDP Matching Rules'), 'udp_enabled');

        return m.render();
    }
});