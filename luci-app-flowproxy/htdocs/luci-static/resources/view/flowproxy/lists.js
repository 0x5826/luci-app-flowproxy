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

        m = new form.Map('flowproxy', _('FlowProxy - Lists Management'),
            _('Manage nftables set collections. Data format is strictly validated to ensure nftables compatibility.'));

        // 源 MAC 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_mac', 'nftset', _('No Proxy Source MAC'));
        s.tab('config', _('Settings'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('elements', form.DynamicList, 'elements', _('MAC Addresses'));
        o.datatype = 'macaddr'; // 严格校验 MAC 地址格式
        o.placeholder = 'aa:bb:cc:dd:ee:ff';

        // 源 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_ip_v4', 'nftset', _('No Proxy Source IPv4'));
        s.tab('config', _('Settings'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Addresses'));
        o.datatype = 'or(ip4addr, cidr4)'; // 严格校验 IPv4 或 CIDR 格式
        o.placeholder = '192.168.1.100 or 192.168.1.0/24';

        // 目标 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_dst_ip_v4', 'nftset', _('No Proxy Destination IPv4'));
        s.tab('config', _('Settings'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Addresses'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.placeholder = '8.8.8.8 or 10.0.0.0/8';

        // 私有地址段
        s = m.section(form.NamedSection, 'private_dst_ip_v4', 'nftset', _('Private IP Ranges'));
        s.tab('config', _('Settings'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Flag, 'auto_generate', _('Auto Generate'),
            _('If enabled, private ranges (RFC 1918) are managed by the system.'));
        o.default = '1';

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Ranges'));
        o.datatype = 'cidr4';
        o.depends('auto_generate', '0');

        // TCP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_tcp_ports', 'nftset', _('No Proxy TCP Ports'));
        s.tab('config', _('Settings'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('elements', form.DynamicList, 'elements', _('TCP Ports'));
        o.datatype = 'or(port, portrange)'; // 严格校验单个端口或端口范围
        o.placeholder = '80, 443, 8080-8090';

        // UDP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_udp_ports', 'nftset', _('No Proxy UDP Ports'));
        s.tab('config', _('Settings'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('elements', form.DynamicList, 'elements', _('UDP Ports'));
        o.datatype = 'or(port, portrange)';
        o.placeholder = '53, 123, 5000-5010';

        return m.render();
    }
});