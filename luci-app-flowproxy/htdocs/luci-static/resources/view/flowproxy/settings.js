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

var callGetNftStatus = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_nft_status'
});

var callGetLogs = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_logs',
    params: ['lines']
});

var callClearLogs = rpc.declare({
    object: 'luci.flowproxy',
    method: 'clear_logs'
});

var callGetInterfaces = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_interfaces'
});

var callStartService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'start_service'
});

var callStopService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'stop_service'
});

var callRestartService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'restart_service'
});

return L.view.extend({
    load: function() {
        return Promise.all([
            uci.load('flowproxy').catch(function() { return {}; }),
            callGetStatus().catch(function() { return {}; }),
            callGetNftStatus().catch(function() { return {}; }),
            callGetInterfaces().catch(function() { return { interfaces: [] }; })
        ]);
    },

    render: function(data) {
        var status = data[1] || {};
        var interfaces = (data[3] && Array.isArray(data[3].interfaces)) ? data[3].interfaces : [];
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy'),
            _('traffic diversion based on nftables rules for routing specific traffic to proxy software.'));

        // 状态显示区域
        s = m.section(form.NamedSection, '_status', 'flowproxy', _('service status'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'table' }, [
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left', 'style': 'width: 30%' }, _('service status')),
                        E('div', { 'class': 'td left', 'id': 'service-status' }, _('loading...'))
                    ]),
                    // 动态详情行：默认隐藏
                    E('div', { 'class': 'tr', 'id': 'nft-status-row', 'style': 'display: none;' }, [
                        E('div', { 'class': 'td left' }, _('nftables status')),
                        E('div', { 'class': 'td left', 'id': 'nft-status' }, '-')
                    ]),
                    E('div', { 'class': 'tr', 'id': 'proxy-ip-row', 'style': 'display: none;' }, [
                        E('div', { 'class': 'td left' }, _('active proxy ip')),
                        E('div', { 'class': 'td left', 'id': 'proxy-ip' }, '-')
                    ]),
                    E('div', { 'class': 'tr', 'id': 'interface-row', 'style': 'display: none;' }, [
                        E('div', { 'class': 'td left' }, _('active interface')),
                        E('div', { 'class': 'td left', 'id': 'interface' }, '-')
                    ]),
                    E('div', { 'class': 'tr', 'id': 'tproxy-mark-row', 'style': 'display: none;' }, [
                        E('div', { 'class': 'td left' }, _('active mark')),
                        E('div', { 'class': 'td left', 'id': 'tproxy-mark' }, '-')
                    ])
                ]),
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-top: 10px' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-apply',
                        'click': L.bind(this.handleStart, this),
                        'id': 'btn-start'
                    }, _('start')),
                    E('button', {
                        'class': 'cbi-button cbi-button-reset',
                        'click': L.bind(this.handleStop, this),
                        'id': 'btn-stop'
                    }, _('stop')),
                    E('button', {
                        'class': 'cbi-button cbi-button-reload',
                        'click': L.bind(this.handleRestart, this)
                    }, _('restart'))
                ])
            ]);
        }, this);

        // 基本设置
        s = m.section(form.NamedSection, 'global', 'flowproxy', _('basic settings'));

        o = s.option(form.Flag, 'enabled', _('enabled'));
        o.rmempty = false;
        o.default = '0';

        o = s.option(form.Value, 'proxy_ip', _('proxy ip address'));
        o.datatype = 'ip4addr';
        o.rmempty = false;
        var suggestedIp = '';
        if (status.lan_ip) {
            var parts = status.lan_ip.split('.');
            if (parts.length === 4) {
                parts[3] = parseInt(parts[3]) + 1;
                suggestedIp = parts.join('.');
            }
        }
        o.default = suggestedIp || '192.168.1.100';
        o.placeholder = suggestedIp;

        o = s.option(form.ListValue, 'interface', _('network interface'));
        interfaces.forEach(function(iface) {
            o.value(iface.name, iface.name + (iface.mac ? ' (' + iface.mac + ')' : ''));
        });
        o.default = 'br-lan';

        o = s.option(form.Value, 'tproxy_mark', _('tproxy mark'));
        o.datatype = 'uinteger';
        o.default = '100';

        // 日志设置
        s = m.section(form.NamedSection, 'global', 'flowproxy', _('log settings'));
        o = s.option(form.ListValue, 'log_level', _('log level'));
        o.value('debug', 'debug'); o.value('info', 'info'); o.value('warn', 'warn'); o.value('error', 'error');
        o.default = 'info';

        o = s.option(form.Value, 'log_size', _('log size (kb)'));
        o.datatype = 'uinteger';
        o.default = '1024';

        o = s.option(form.Value, 'log_count', _('log count'));
        o.datatype = 'uinteger';
        o.default = '3';

        // 日志查看
        s = m.section(form.NamedSection, '_logs', 'flowproxy', _('runtime logs'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-bottom: 10px' }, [
                    E('button', { 'class': 'cbi-button cbi-button-refresh', 'click': L.bind(this.refreshLogs, this) }, _('refresh')),
                    E('button', { 'class': 'cbi-button cbi-button-reset', 'click': L.bind(this.clearLogs, this) }, _('clear logs'))
                ]),
                E('textarea', {
                    'id': 'log-content',
                    'style': 'width: 100%; height: 400px; font-family: monospace; font-size: 12px; resize: vertical;',
                    'readonly': true,
                    'placeholder': _('no logs available')
                }, _('loading logs...'))
            ]);
        }, this);

        this.pollStatus();

        return m.render().then(L.bind(function(node) {
            this.refreshLogs();
            return node;
        }, this));
    },

    pollStatus: function() {
        poll.add(L.bind(function() {
            return Promise.all([
                callGetStatus(),
                callGetNftStatus()
            ]).then(L.bind(function(data) {
                var status = data[0] || {};
                var nftStatus = data[1] || {};
                var isRunning = (status.enabled == 1 && status.running == 1);

                var statusEl = document.getElementById('service-status');
                if (statusEl) {
                    if (isRunning) {
                        statusEl.innerHTML = '<span style="color: green; font-weight: bold;">● ' + _('running') + '</span>';
                    } else {
                        statusEl.innerHTML = (status.enabled == 1) ? 
                            '<span style="color: orange; font-weight: bold;">● ' + _('enabled (stopped)') + '</span>' : 
                            '<span style="color: red; font-weight: bold;">● ' + _('disabled') + '</span>';
                    }
                }

                // 核心逻辑：仅在运行时显示详细状态
                var detailRows = ['nft-status-row', 'proxy-ip-row', 'interface-row', 'tproxy-mark-row'];
                detailRows.forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = isRunning ? '' : 'none';
                });

                if (isRunning) {
                    document.getElementById('proxy-ip').innerText = status.proxy_ip || '-';
                    document.getElementById('interface').innerText = status.interface || '-';
                    document.getElementById('tproxy-mark').innerText = status.tproxy_mark || '-';
                    
                    var nftEl = document.getElementById('nft-status');
                    var chains = [];
                    if (nftStatus.tcp_chain) chains.push('TCP');
                    if (nftStatus.udp_chain) chains.push('UDP');
                    nftEl.innerHTML = chains.length > 0 ? 
                        '<span style="color: green;">' + _('active: %s').format(chains.join(', ')) + '</span>' : 
                        '<span style="color: gray;">' + _('no active chains') + '</span>';
                }
            }, this));
        }, this), 5);
    },

    refreshLogs: function() {
        callGetLogs(200).then(L.bind(function(data) {
            var logEl = document.getElementById('log-content');
            var logs = (data && Array.isArray(data.logs)) ? data.logs : [];
            if (logEl) {
                logEl.value = logs.length > 0 ? logs.join('\n') : _('no logs available');
                if (logs.length > 0) logEl.scrollTop = logEl.scrollHeight;
            }
        }, this));
    },

    clearLogs: function() {
        if (confirm(_('clear all logs?'))) {
            callClearLogs().then(L.bind(this.refreshLogs, this));
        }
    },

    handleStart: function() { return callStartService().then(L.bind(this.refreshLogs, this)); },
    handleStop: function() { return callStopService().then(L.bind(this.refreshLogs, this)); },
    handleRestart: function() { return callRestartService().then(L.bind(this.refreshLogs, this)); }
});