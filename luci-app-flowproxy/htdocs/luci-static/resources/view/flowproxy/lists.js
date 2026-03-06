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
                ui.showModal(null, [
                    E('p', { 'class': 'spinning' }, _('applying changes...'))
                ]);
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
            _('manage nftables set collections. use "save & apply" on each section to take effect immediately.'));

        // 源 MAC 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_mac', 'nftset', _('no_proxy_src_mac'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'macaddr';
        o.placeholder = 'aa:bb:cc:dd:ee:ff';
        this.addSaveApplyButton(s);

        // 源 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_ip_v4', 'nftset', _('no_proxy_src_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.placeholder = '192.168.1.100 or 192.168.1.0/24';
        this.addSaveApplyButton(s);

        // 目标 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_dst_ip_v4', 'nftset', _('no_proxy_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.placeholder = '8.8.8.8 or 10.0.0.0/8';
        this.addSaveApplyButton(s);

        // 私有地址段
        s = m.section(form.NamedSection, 'private_dst_ip_v4', 'nftset', _('private_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.Flag, 'auto_generate', _('auto_generate'));
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'cidr4';
        o.depends('auto_generate', '0');
        this.addSaveApplyButton(s);

        // 中国路由地址段
        s = m.section(form.NamedSection, 'chnroute_dst_ip_v4', 'nftset', _('chnroute_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.Value, 'file_path', _('file_path'));
        o.default = '/usr/share/flowproxy/chnroute.txt';
        o.datatype = 'file';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'cidr4';
        this.addSaveApplyButton(s);

        // TCP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_tcp_ports', 'nftset', _('no_proxy_dst_tcp_ports'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'or(port, portrange)';
        o.placeholder = '80, 443, 8080-8090';
        this.addSaveApplyButton(s);

        // UDP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_udp_ports', 'nftset', _('no_proxy_dst_udp_ports'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'or(port, portrange)';
        o.placeholder = '53, 123, 5000-5010';
        this.addSaveApplyButton(s);

        return m.render();
    }
});