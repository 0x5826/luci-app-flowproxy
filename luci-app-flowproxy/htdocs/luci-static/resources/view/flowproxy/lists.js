'use strict';
'require form';
'require uci';
'require rpc';
'require view';
'require fs';

var callGetNftsetContent = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_nftset_content',
    params: ['set_name']
});

var callAddNftsetElement = rpc.declare({
    object: 'luci.flowproxy',
    method: 'add_nftset_element',
    params: ['set_name', 'element']
});

var callDeleteNftsetElement = rpc.declare({
    object: 'luci.flowproxy',
    method: 'delete_nftset_element',
    params: ['set_name', 'element']
});

return L.view.extend({
    load: function() {
        return uci.load('flowproxy');
    },

    render: function() {
        var m, s, o;

        m = new form.Map('flowproxy', _('FlowProxy - Lists Management'),
            _('Manage nftables set collections used by traffic rules.'));

        // 源 MAC 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_mac', 'nftset', _('No Proxy Source MAC'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('elements', form.DynamicList, 'elements', _('MAC Addresses'),
            _('Enter MAC addresses (e.g., aa:bb:cc:dd:ee:ff)'));
        o.datatype = 'macaddr';
        o.optional = true;

        // 源 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_src_ip_v4', 'nftset', _('No Proxy Source IPv4'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Addresses'),
            _('Enter IPv4 addresses or CIDR (e.g., 192.168.1.100 or 192.168.1.0/24)'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.optional = true;

        // 目标 IPv4 地址名单
        s = m.section(form.NamedSection, 'no_proxy_dst_ip_v4', 'nftset', _('No Proxy Destination IPv4'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Addresses'),
            _('Enter IPv4 addresses or CIDR (e.g., 8.8.8.8 or 10.0.0.0/8)'));
        o.datatype = 'or(ip4addr, cidr4)';
        o.optional = true;

        // 私有地址段
        s = m.section(form.NamedSection, 'private_dst_ip_v4', 'nftset', _('Private IP Ranges'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Flag, 'auto_generate', _('Auto Generate'),
            _('Automatically generate private IP ranges (RFC 1918)'));
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Ranges'),
            _('Private IP ranges (auto-generated if enabled)'));
        o.datatype = 'cidr4';
        o.optional = true;
        o.depends('auto_generate', '0');

        // 中国路由地址段
        s = m.section(form.NamedSection, 'chnroute_dst_ip_v4', 'nftset', _('China IP Ranges'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('config', form.Value, 'file_path', _('IP List File'),
            _('Path to file containing China IP ranges (one CIDR per line)'));
        o.default = '/usr/share/flowproxy/chnroute.txt';
        o.datatype = 'file';

        o = s.taboption('elements', form.DynamicList, 'elements', _('IPv4 Ranges'),
            _('China IP ranges (loaded from file)'));
        o.datatype = 'cidr4';
        o.optional = true;

        // TCP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_tcp_ports', 'nftset', _('No Proxy TCP Ports'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('elements', form.DynamicList, 'elements', _('TCP Ports'),
            _('Enter port numbers or ranges (e.g., 80, 443, 8080-8090)'));
        o.optional = true;

        // UDP 端口名单
        s = m.section(form.NamedSection, 'no_proxy_dst_udp_ports', 'nftset', _('No Proxy UDP Ports'));
        s.tab('config', _('Configuration'));
        s.tab('elements', _('Elements'));

        o = s.taboption('config', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.taboption('config', form.Value, 'comment', _('Description'));
        o.optional = true;

        o = s.taboption('elements', form.DynamicList, 'elements', _('UDP Ports'),
            _('Enter port numbers or ranges (e.g., 53, 123, 5000-5010)'));
        o.optional = true;

        // 帮助信息
        s = m.section(form.NamedSection, '_help', 'nftset', _('Quick Reference'));
        s.render = function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('table', { 'class': 'table', 'style': 'width: 100%;' }, [
                    E('tr', { 'class': 'tr table-titles' }, [
                        E('th', { 'class': 'th', 'style': 'width: 25%;' }, _('List Name')),
                        E('th', { 'class': 'th', 'style': 'width: 25%;' }, _('Type')),
                        E('th', { 'class': 'th', 'style': 'width: 50%;' }, _('Usage'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('No Proxy Source MAC')),
                        E('td', { 'class': 'td' }, 'ether_addr'),
                        E('td', { 'class': 'td' }, _('Source MAC addresses that bypass proxy'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('No Proxy Source IPv4')),
                        E('td', { 'class': 'td' }, 'ipv4_addr'),
                        E('td', { 'class': 'td' }, _('Source IPv4 addresses that bypass proxy'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('No Proxy Destination IPv4')),
                        E('td', { 'class': 'td' }, 'ipv4_addr'),
                        E('td', { 'class': 'td' }, _('Destination IPv4 addresses that bypass proxy'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('Private IP Ranges')),
                        E('td', { 'class': 'td' }, 'ipv4_addr'),
                        E('td', { 'class': 'td' }, _('Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('China IP Ranges')),
                        E('td', { 'class': 'td' }, 'ipv4_addr'),
                        E('td', { 'class': 'td' }, _('China IP ranges loaded from file'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('No Proxy TCP Ports')),
                        E('td', { 'class': 'td' }, 'inet_service'),
                        E('td', { 'class': 'td' }, _('TCP ports that bypass proxy'))
                    ]),
                    E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td' }, _('No Proxy UDP Ports')),
                        E('td', { 'class': 'td' }, 'inet_service'),
                        E('td', { 'class': 'td' }, _('UDP ports that bypass proxy'))
                    ])
                ])
            ]);
        };

        return m.render();
    }
});