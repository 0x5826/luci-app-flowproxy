'use strict';
'require form';
'require uci';
'require rpc';
'require view';
'require dom';

var callGenerateNftConfig = rpc.declare({
    object: 'luci.flowproxy',
    method: 'generate_nft_config',
    expect: { config: '' }
});

var callGetStatus = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_status',
    expect: { '*': {} }
});

return L.view.extend({
    load: function() {
        return Promise.all([
            uci.load('flowproxy'),
            callGenerateNftConfig(),
            callGetStatus()
        ]);
    },

    render: function(data) {
        var nftConfig = data[1] || '';
        var status = data[2] || {};
        var m, s, o;

        m = new form.Map('flowproxy', _('FlowProxy - Configuration Preview'),
            _('Preview the generated nftables configuration before applying.'));

        // 当前配置状态
        s = m.section(form.NamedSection, '_current', 'flowproxy', _('Current Status'));
        s.render = function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'table' }, [
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left', 'style': 'width: 30%' }, _('Service Enabled')),
                        E('div', { 'class': 'td left' }, status.enabled == 1 ? 
                            '<span style="color: green;">' + _('Yes') + '</span>' : 
                            '<span style="color: red;">' + _('No') + '</span>')
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('Proxy IP')),
                        E('div', { 'class': 'td left' }, status.proxy_ip || '-')
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('Interface')),
                        E('div', { 'class': 'td left' }, status.interface || '-')
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('Mark Value')),
                        E('div', { 'class': 'td left' }, status.tproxy_mark || '-')
                    ])
                ])
            ]);
        };

        // nftables 配置预览
        s = m.section(form.NamedSection, '_preview', 'flowproxy', _('nftables Configuration'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-bottom: 10px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': L.bind(this.refreshConfig, this)
                    }, _('Refresh Preview')),
                    E('button', {
                        'class': 'cbi-button cbi-button-apply',
                        'click': L.bind(this.copyConfig, this)
                    }, _('Copy to Clipboard'))
                ]),
                E('textarea', {
                    'id': 'nft-config-preview',
                    'style': 'width: 100%; height: 500px; font-family: monospace; font-size: 12px; resize: vertical;',
                    'readonly': true
                }, nftConfig)
            ]);
        }, this);

        // 路由规则预览
        s = m.section(form.NamedSection, '_routes', 'flowproxy', _('Route Rules Preview'));
        s.render = L.bind(function() {
            var proxyIp = status.proxy_ip || _('(not configured)');
            var interface = status.interface || 'br-lan';
            var mark = status.tproxy_mark || '100';

            return E('div', { 'class': 'cbi-section-node' }, [
                E('pre', {
                    'style': 'background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;'
                }, [
                    E('code', {}, [
                        '# IP Rule\n',
                        'ip rule add fwmark ' + mark + ' lookup ' + mark + '\n\n',
                        '# IP Route\n',
                        'ip route add default via ' + proxyIp + ' dev ' + interface + ' table ' + mark + '\n\n',
                        '# Verify\n',
                        'ip rule list\n',
                        'ip route show table ' + mark
                    ])
                ])
            ]);
        }, this);

        // 命令行参考
        s = m.section(form.NamedSection, '_commands', 'flowproxy', _('Command Reference'));
        s.render = function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Service Control')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, '/etc/init.d/flowproxy start'),
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, '/etc/init.d/flowproxy stop'),
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, '/etc/init.d/flowproxy restart')
                    ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('View nftables Rules')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'nft list table inet flowproxy'),
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'nft list chain inet flowproxy LAN_MARKFLOW_TCP'),
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'nft list chain inet flowproxy LAN_MARKFLOW_UDP')
                    ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('View Sets')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'nft list set inet flowproxy no_proxy_src_ip_v4'),
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'nft list set inet flowproxy chnroute_dst_ip_v4')
                    ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Debug')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'nft --debug=netlink add rule inet flowproxy LAN_MARKFLOW_TCP counter'),
                        E('code', { 'style': 'display: block; margin: 5px 0;' }, 'tcpdump -i br-lan -n "ip and not port 22"')
                    ])
                ])
            ]);
        };

        return m.render();
    },

    refreshConfig: function() {
        return callGenerateNftConfig().then(function(config) {
            var el = document.getElementById('nft-config-preview');
            if (el) {
                el.value = config || '';
            }
        });
    },

    copyConfig: function() {
        var el = document.getElementById('nft-config-preview');
        if (el && el.value) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(el.value).then(function() {
                    alert(_('Configuration copied to clipboard'));
                });
            } else {
                el.select();
                document.execCommand('copy');
                alert(_('Configuration copied to clipboard'));
            }
        }
    }
});