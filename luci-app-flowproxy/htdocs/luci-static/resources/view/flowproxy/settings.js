'use strict';
'require form';
'require uci';
'require rpc';
'require poll';
'require view';
'require dom';
'require fs';

var callGetStatus = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_status'
});

var callGetInterfaces = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_interfaces'
});

return L.view.extend({
    load: function() {
        return uci.load('flowproxy').catch(function() { return {}; });
    },

    render: function(data) {
        var m, s, o;

        m = new form.Map('flowproxy', _('代理分流'),
            _('traffic diversion based on nftables rules. the service will automatically start/stop when you click "save & apply".'));

        s = m.section(form.NamedSection, '_status', 'flowproxy', _('service status'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'table' }, [
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left', 'style': 'width: 30%; font-weight: bold;' }, _('current status')),
                        E('div', { 'class': 'td left', 'id': 'service-status' }, E('em', { 'class': 'spinning' }, _('checking...')))
                    ]),
                    E('div', { 'class': 'tr', 'id': 'nft-status-row', 'style': 'display: none;' }, [
                        E('div', { 'class': 'td left' }, _('active rules')),
                        E('div', { 'class': 'td left', 'id': 'nft-status' }, '-')
                    ]),
                    E('div', { 'class': 'tr', 'id': 'proxy-ip-row', 'style': 'display: none;' }, [
                        E('div', { 'class': 'td left' }, _('active proxy ip')),
                        E('div', { 'class': 'td left', 'id': 'proxy-ip' }, '-')
                    ])
                ])
            ]);
        }, this);

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('basic settings'));

        o = s.option(form.Flag, 'enabled', _('enable flowproxy'));
        o.rmempty = false; o.default = '0';

        o = s.option(form.Value, 'proxy_ip', _('proxy ip address'));
        o.datatype = 'ip4addr'; o.rmempty = false;
        o.default = '192.168.1.100';

        o = s.option(form.ListValue, 'interface', _('network interface'));
        o.value('br-lan', 'br-lan');
        o.default = 'br-lan';

        o = s.option(form.Value, 'tproxy_mark', _('tproxy mark'));
        o.datatype = 'uinteger'; o.default = '100';

        return m.render().then(L.bind(function(node) {
            this.refreshStatus(m);
            
            callGetInterfaces().then(L.bind(function(ifdata) {
                var ifaceOpt = m.lookupOption('interface', 'global')[0];
                if (ifaceOpt && ifdata?.interfaces) {
                    ifdata.interfaces.forEach(function(i) {
                        ifaceOpt.value(i.name, i.name);
                    });
                }
            }, this));

            poll.add(L.bind(function() {
                return this.refreshStatus(m);
            }, this), 5);

            return node;
        }, this));
    },

    refreshStatus: function(map) {
        return callGetStatus().then(L.bind(function(status) {
            if (!status) return;
            var isRunning = (status.running == 1);
            
            var statusEl = document.getElementById('service-status');
            if (statusEl) {
                statusEl.innerHTML = isRunning ? 
                    '<span style="color: green; font-weight: bold;">' + _('running') + '</span>' : 
                    '<span style="color: red; font-weight: bold;">' + _('stopped') + '</span>';
            }

            ['nft-status-row', 'proxy-ip-row'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.style.display = isRunning ? '' : 'none';
            });

            if (isRunning) {
                var pipEl = document.getElementById('proxy-ip');
                if (pipEl) pipEl.innerText = status.proxy_ip || '-';
                
                var nftEl = document.getElementById('nft-status');
                if (nftEl && status.nft) {
                    var chains = [];
                    if (status.nft.tcp) chains.push('TCP');
                    if (status.nft.udp) chains.push('UDP');
                    nftEl.innerHTML = '<span style="color: green;">' + (chains.length > 0 ? chains.join(', ') : 'NONE') + '</span>';
                }
            }

            // 核心修复：预填 Proxy IP 为 LAN IP + 1
            if (status.lan_ip) {
                var parts = status.lan_ip.split('.');
                if (parts.length === 4) {
                    parts[3] = parseInt(parts[3]) + 1;
                    var suggestedIp = parts.join('.');
                    
                    var ipOpt = map.lookupOption('proxy_ip', 'global')[0];
                    if (ipOpt) {
                        ipOpt.placeholder = suggestedIp;
                        // 如果当前 UCI 值为空，则直接设置 default
                        var currentVal = uci.get('flowproxy', 'global', 'proxy_ip');
                        if (!currentVal) {
                            var input = document.querySelector('input[name="cbid.flowproxy.global.proxy_ip"]');
                            if (input && !input.value) {
                                input.value = suggestedIp;
                                // 触发 change 事件以确保 uci 状态同步
                                input.dispatchEvent(new CustomEvent('change', { bubbles: true }));
                            }
                        }
                    }
                }
            }
        }, this));
    }
});