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

        // 获取所有定义的 nftset 名称供 @ 补全
        var nftsets = uci.sections('flowproxy', 'nftset').map(function(s) {
            return '@' + s['.name'];
        });
        nftsets.push('@proxy_server_ip');

        m = new form.Map('flowproxy', _('flowproxy - rules'),
            _('define nftables rules. choose match type and provide value (IP, MAC, or @set).'));

        // 快捷模板区域
        s = m.section(form.NamedSection, '_templates', 'flowproxy', _('quick templates'));
        s.render = L.bind(function() {
            var presets = {
                'local': { name: 'skip local', type: 'custom', val: 'meta nfproto ipv4 ip daddr type { local, anycast, multicast }', proto: 'both' },
                'private': { name: 'skip private', type: 'dst_ip', val: '@private_dst_ip_v4', proto: 'both' },
                'china': { name: 'skip china', type: 'dst_ip', val: '@chnroute_dst_ip_v4', proto: 'both' },
                'src_mac': { name: 'skip mac', type: 'src_mac', val: '@no_proxy_src_mac', proto: 'both' },
                'tcp_ports': { name: 'skip tcp ports', type: 'dst_port', val: '@no_proxy_dst_tcp_ports', proto: 'tcp' }
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
                                uci.set('flowproxy', sid, 'match_type', presets[k].type);
                                uci.set('flowproxy', sid, 'match_value', presets[k].val);
                                uci.set('flowproxy', sid, 'action', 'return');
                                uci.set('flowproxy', sid, 'counter', '0');
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

        s.handleAdd = function(ev) {
            var sid = uci.add('flowproxy', 'rule');
            uci.set('flowproxy', sid, 'name', 'new rule');
            uci.set('flowproxy', sid, 'enabled', '1');
            uci.set('flowproxy', sid, 'protocol', 'both');
            uci.set('flowproxy', sid, 'match_type', 'dst_ip');
            uci.set('flowproxy', sid, 'match_value', '');
            uci.set('flowproxy', sid, 'action', 'return');
            uci.set('flowproxy', sid, 'counter', '0');
            uci.save();
            location.reload();
        };

        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.width = '5%';

        o = s.option(form.Value, 'name', _('name'));
        o.rmempty = false;
        o.width = '10%';

        o = s.option(form.ListValue, 'protocol', _('protocol'));
        o.value('both', 'both');
        o.value('tcp', 'tcp');
        o.value('udp', 'udp');
        o.width = '10%';

        // 匹配类型选择
        o = s.option(form.ListValue, 'match_type', _('match type'));
        o.value('dst_ip', 'dest ip');
        o.value('src_ip', 'src ip');
        o.value('src_mac', 'src mac');
        o.value('dst_port', 'dest port');
        o.value('src_port', 'src port');
        o.value('custom', 'custom (raw)');
        o.default = 'dst_ip';
        o.width = '10%';

        // 匹配内容字段：集成 @ 名单建议
        o = s.option(form.Value, 'match_value', _('match value'));
        o.rmempty = false;
        o.width = '35%';
        
        o.renderWidget = function(section_id, option_id, formatvalue) {
            var node = form.Value.prototype.renderWidget.apply(this, [section_id, option_id, formatvalue]);
            var input = node.querySelector('input');
            var dlId = 'nftsets-list-' + section_id;
            var dl = E('datalist', { id: dlId }, nftsets.map(function(s) { return E('option', { value: s }); }));
            input.setAttribute('list', dlId);
            input.setAttribute('autocomplete', 'off');
            node.appendChild(dl);
            return node;
        };

        o.description = E('div', { 'style': 'font-size: 0.9em; margin-top: 4px;' }, [
            E('span', { 'style': 'display: inline-flex; flex-wrap: wrap; gap: 4px;' }, nftsets.map(function(s) {
                return E('a', {
                    'href': '#',
                    'style': 'background: #f0f0f0; padding: 1px 4px; border-radius: 3px; border: 1px solid #ccc; text-decoration: none; color: #333;',
                    'click': function(ev) {
                        ev.preventDefault();
                        var input = ev.target.closest('.cbi-value-field').querySelector('input');
                        var start = input.selectionStart;
                        var val = input.value;
                        input.value = val.substring(0, start) + s + val.substring(input.selectionEnd);
                        input.dispatchEvent(new CustomEvent('change', { bubbles: true }));
                        input.focus();
                        input.setSelectionRange(start + s.length, start + s.length);
                    }
                }, s);
            }))
        ]);

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