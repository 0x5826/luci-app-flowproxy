'use strict';
'require form';
'require uci';
'require view';

return L.view.extend({
    load: function() {
        return uci.load('flowproxy');
    },

    render: function() {
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - lists'),
            _('manage nftables set collections. use the global "save & apply" button at the bottom to take effect.'));

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
        }, this));

        // 特殊预设：私有地址
        s = m.section(form.NamedSection, 'private_dst_ip_v4', 'nftset', _('private_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false; o.default = '1';
        o = s.option(form.Flag, 'auto_generate', _('auto_generate'));
        o.default = '1';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'cidr4'; o.depends('auto_generate', '0');

        // 特殊预设：中国路由
        s = m.section(form.NamedSection, 'chnroute_dst_ip_v4', 'nftset', _('chnroute_dst_ip_v4'));
        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false; o.default = '1';
        o = s.option(form.Value, 'file_path', _('file_path'));
        o.default = '/usr/share/flowproxy/chnroute.txt';
        o = s.option(form.DynamicList, 'elements', _('elements'));
        o.datatype = 'cidr4';

        // --- 2. 自定义名单区域 ---
        s = m.section(form.GridSection, 'nftset', _('custom nftables sets'));
        s.addremove = true;
        s.anonymous = false;
        s.nodescription = true;
        s.filter = function(section_id) {
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

        return m.render();
    }
});