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
            _('Manage nftables set collections. All settings and elements are now merged into a single view for efficiency.'));

        // 源 MAC 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_mac', 'nftset', _('No Proxy Source MAC'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.DynamicList, 'elements', _('MAC Addresses'));
        o.datatype = 'macaddr';
        o.placeholder = 'aa:bb:cc:dd:ee:ff';

        // 源 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_ip_v4', 'nftset', _('No Proxy Source IPv4'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.DynamicList, 'elements', _('IPv4 Addresses'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.placeholder = '192.168.1.100 or 192.168.1.0/24';

        // 目标 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_dst_ip_v4', 'nftset', _('No Proxy Destination IPv4'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.DynamicList, 'elements', _('IPv4 Addresses'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.placeholder = '8.8.8.8 or 10.0.0.0/8';

        // 私有地址段
        s = m.section(form.NamedSection, 'private_dst_ip_v4', 'nftset', _('Private IP Ranges'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.Flag, 'auto_generate', _('Auto Generate'),
            _('Automatically manage private ranges (RFC 1918).'));
        o.default = '1';

        o = s.option(form.DynamicList, 'elements', _('IPv4 Ranges'));
        o.datatype = 'cidr4';
        o.depends('auto_generate', '0');

        // 中国路由地址段
        s = m.section(form.NamedSection, 'chnroute_dst_ip_v4', 'nftset', _('China IP Ranges'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.Value, 'file_path', _('IP List File'));
        o.default = '/usr/share/flowproxy/chnroute.txt';
        o.datatype = 'file';

        o = s.option(form.DynamicList, 'elements', _('IPv4 Ranges'), _('Custom IP ranges added here will coexist with file-loaded ranges.'));
        o.datatype = 'cidr4';

        // TCP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_tcp_ports', 'nftset', _('No Proxy TCP Ports'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.DynamicList, 'elements', _('TCP Ports'));
        o.datatype = 'or(port, portrange)';
        o.placeholder = '80, 443, 8080-8090';

        // UDP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_udp_ports', 'nftset', _('No Proxy UDP Ports'));
        
        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.DynamicList, 'elements', _('UDP Ports'));
        o.datatype = 'or(port, portrange)';
        o.placeholder = '53, 123, 5000-5010';

        return m.render();
    }
});