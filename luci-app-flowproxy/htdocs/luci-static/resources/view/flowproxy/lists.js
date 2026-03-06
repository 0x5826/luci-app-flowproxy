'use strict';
'require form';
'require uci';
'require rpc';
'require view';
'require ui';

var callRestartService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'restart_service'
});

return L.view.extend({
    load: function() {
        return uci.load('flowproxy');
    },

    addSaveApplyButton: function(s) {
        var o = s.option(form.Button, '_apply', _('save & apply'));
        o.inputstyle = 'apply';
        o.inputtitle = _('save & apply this list');
        o.onclick = L.bind(function(ev, section_id) {
            return this.map.save().then(function() {
                ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('applying changes...')) ]);
                return callRestartService();
            }).then(function() {
                ui.hideModal();
                ui.addNotification(null, E('p', _('list changes applied successfully.')), 'info');
            }).catch(function(e) {
                ui.hideModal();
                ui.addNotification(null, E('p', _('failed to apply: %s').format(e.message || e)), 'danger');
            });
        }, this);
    },

    render: function() {
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - lists'),
            _('manage nftables set collections. you can use predefined lists or add custom ones at the bottom.'));

        // --- 1. 预设名单区域 ---
        var predefined = [
            { id: 'no_proxy_src_mac', name: _('no_proxy_src_mac'), type: 'macaddr', placeholder: 'aa:bb:cc:dd:ee:ff' },
            { id: 'no_proxy_src_ip_v4', name: _('no_proxy_src_ip_v4'), type: 'or(ip4addr, cidr4)', placeholder: '192.168.1.100' },
            { id: 'no_proxy_dst_ip_v4', name: _('no_proxy_dst_ip_v4'), type: 'or(ip4addr, cidr4)', placeholder: '8.8.8.8' },
            { id: 'no_proxy_dst_tcp_ports', name: _('no_proxy_dst_tcp_ports'), type: 'or(port, portrange)', placeholder: '80, 443' },
            { id: 'no_proxy_dst_udp_ports', name: _('no_proxy_dst_udp_ports'), type: 'or(port, portrange)', placeholder: '53, 123' }
        ];

        predefined.forEach(L.bind(function(p) {
            s = m.section(form.NamedSection, p.id, 'nftset', p.name);
            o = s.option(form.Flag, 'enabled', _('enabled'));
            o.rmempty = false; o.default = '1';
            o = s.option(form.DynamicList, 'elements', _('elements'));
            o.datatype = p.type; o.placeholder = p.placeholder;
            this.addSaveApplyButton(s);
        }, this));

        // 特殊预设：私有地址
        s = m.section(form.NamedSection, 'private_dst_ip_v4', 'nftset', _('private_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false; o.default = '1';
        o = s.option(form.Flag, 'auto_generate', _('auto_generate'));
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'cidr4'; o.depends('auto_generate', '0');
        this.addSaveApplyButton(s);

        // 特殊预设：中国路由
        s = m.section(form.NamedSection, 'chnroute_dst_ip_v4', 'nftset', _('chnroute_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false; o.default = '1';
        o = s.option(form.Value, 'file_path', _('file_path'));
        o.default = '/usr/share/flowproxy/chnroute.txt';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'cidr4';
        this.addSaveApplyButton(s);

        // --- 2. 自定义名单区域 ---
        s = m.section(form.GridSection, 'nftset', _('custom nftables sets'));
        s.addremove = true;
        s.anonymous = false; // 必须有名名称，因为名称直接作为 nft set 名
        s.nodescription = true;
        s.filter = function(section_id) {
            // 过滤掉预设的 NamedSection 节点，只显示自定义的
            var pre_ids = predefined.map(function(p) { return p.id; });
            pre_ids.push('private_dst_ip_v4', 'chnroute_dst_ip_v4');
            return (pre_ids.indexOf(section_id) === -1);
        };

        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false; o.default = '1';

        o = s.option(form.ListValue, 'type', _('element type'));
        o.value('ipv4_addr', 'IPv4 Address/CIDR');
        o.value('ether_addr', 'MAC Address');
        o.value('inet_service', 'Port/Service');
        o.default = 'ipv4_addr';

        o = s.option(form.DynamicList, 'elements', _('elements'));
        // 根据类型动态设置校验
        o.validate = function(section_id, value) {
            var type = uci.get('flowproxy', section_id, 'type');
            // 此处由于 LuCI 动态限制，简单处理或留空靠 nft 执行报错拦截
            return true;
        };

        return m.render();
    }
});