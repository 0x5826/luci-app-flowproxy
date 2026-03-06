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
    // 极致优化：只加载配置，不等待状态接口，确保页面瞬间打开
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
                        E('div', { 'class': 'td left' }, _('nftables chains')),
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

        // 异步任务 1：获取真实状态并更新 UI
        callGetStatus().then(L.bind(function(status) {
            this.updateStatus(status);
            // 动态设置建议 IP
            if (status.lan_ip) {
                var parts = status.lan_ip.split('.');
                if (parts.length === 4) {
                    parts[3] = parseInt(parts[3]) + 1;
                    var suggestedIp = parts.join('.');
                    var ipOpt = m.lookupOption('proxy_ip', 'global')[0];
                    if (ipOpt) ipOpt.placeholder = suggestedIp;
                }
            }
        }, this));

        // 异步任务 2：填充接口列表
        callGetInterfaces().then(L.bind(function(data) {
            var ifaceOpt = m.lookupOption('interface', 'global')[0];
            if (ifaceOpt && data && Array.isArray(data.interfaces)) {
                data.interfaces.forEach(function(iface) {
                    ifaceOpt.value(iface.name, iface.name + (iface.mac ? ' (' + iface.mac + ')' : ''));
                });
            }
        }, this));

        this.pollStatus();

        return m.render();
    },

    updateStatus: function(status) {
        if (!status) return;
        var isRunning = (status.running == 1);
        var statusEl = document.getElementById('service-status');
        if (statusEl) {
            statusEl.innerHTML = isRunning ? 
                '<span style="color: green; font-weight: bold;">● ' + _('running') + '</span>' : 
                '<span style="color: red; font-weight: bold;">● ' + _('stopped') + '</span>';
        }

        var detailRows = ['nft-status-row', 'proxy-ip-row'];
        detailRows.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.display = isRunning ? '' : 'none';
        });

        if (isRunning) {
            var proxyIpEl = document.getElementById('proxy-ip');
            if (proxyIpEl) proxyIpEl.innerText = status.proxy_ip || '-';
            var nftEl = document.getElementById('nft-status');
            if (nftEl && status.nft) {
                var chains = [];
                if (status.nft.tcp) chains.push('TCP');
                if (status.nft.udp) chains.push('UDP');
                nftEl.innerHTML = '<span style="color: green;">' + (chains.length > 0 ? chains.join(', ') : 'NONE') + '</span>';
            }
        }
    },

    pollStatus: function() {
        poll.add(L.bind(function() {
            return callGetStatus().then(L.bind(this.updateStatus, this));
        }, this), 5);
    }
});