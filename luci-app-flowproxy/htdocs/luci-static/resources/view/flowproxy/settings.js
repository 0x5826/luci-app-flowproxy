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
    method: 'get_status',
    expect: { '*': {} }
});

var callGetNftStatus = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_nft_status',
    expect: { '*': {} }
});

var callGetLogs = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_logs',
    params: ['lines'],
    expect: { '*': [] }
});

var callClearLogs = rpc.declare({
    object: 'luci.flowproxy',
    method: 'clear_logs',
    expect: { '*': false }
});

var callGetInterfaces = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_interfaces',
    expect: { '*': [] }
});

var callStartService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'start_service',
    expect: { '*': false }
});

var callStopService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'stop_service',
    expect: { '*': false }
});

var callRestartService = rpc.declare({
    object: 'luci.flowproxy',
    method: 'restart_service',
    expect: { '*': false }
});

return L.view.extend({
    load: function() {
        return Promise.all([
            uci.load('flowproxy'),
            callGetStatus(),
            callGetNftStatus(),
            callGetInterfaces()
        ]);
    },

    render: function(data) {
        var status = data[1] || {};
        var nftStatus = data[2] || {};
        var interfaces = data[3] || [];
        var m, s, o;

        m = new form.Map('flowproxy', _('FlowProxy'),
            _('Traffic diversion based on nftables rules for routing specific traffic to proxy software.'));

        // 状态显示区域
        s = m.section(form.NamedSection, '_status', 'flowproxy', _('Service Status'));
        s.render = L.bind(function() {
            var statusHtml = E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'table' }, [
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left', 'style': 'width: 30%' }, _('Service Status')),
                        E('div', { 'class': 'td left', 'id': 'service-status' }, _('Loading...'))
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('nftables Status')),
                        E('div', { 'class': 'td left', 'id': 'nft-status' }, _('Loading...'))
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('Proxy IP')),
                        E('div', { 'class': 'td left', 'id': 'proxy-ip' }, status.proxy_ip || '-')
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('Interface')),
                        E('div', { 'class': 'td left', 'id': 'interface' }, status.interface || '-')
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('Mark Value')),
                        E('div', { 'class': 'td left', 'id': 'tproxy-mark' }, status.tproxy_mark || '-')
                    ])
                ]),
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-top: 10px' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-apply',
                        'click': L.bind(this.handleStart, this),
                        'id': 'btn-start'
                    }, _('Start')),
                    E('button', {
                        'class': 'cbi-button cbi-button-reset',
                        'click': L.bind(this.handleStop, this),
                        'id': 'btn-stop'
                    }, _('Stop')),
                    E('button', {
                        'class': 'cbi-button cbi-button-reload',
                        'click': L.bind(this.handleRestart, this)
                    }, _('Restart'))
                ])
            ]);
            return statusHtml;
        }, this);

        // 基本设置
        s = m.section(form.NamedSection, 'global', 'flowproxy', _('Basic Settings'));

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '0';

        o = s.option(form.Value, 'proxy_ip', _('Proxy IP Address'));
        o.datatype = 'ip4addr';
        o.rmempty = false;
        o.description = _('The IP address of the proxy server (e.g., 192.168.1.100)');

        o = s.option(form.ListValue, 'interface', _('Network Interface'));
        interfaces.forEach(function(iface) {
            o.value(iface.name, iface.name + (iface.mac ? ' (' + iface.mac + ')' : ''));
        });
        o.default = 'br-lan';
        o.description = _('Network interface for routing traffic');

        o = s.option(form.Value, 'tproxy_mark', _('TPROXY Mark'));
        o.datatype = 'uinteger';
        o.default = '100';
        o.description = _('Firewall mark value for transparent proxy (default: 100)');

        // 日志设置
        s = m.section(form.NamedSection, 'global', 'flowproxy', _('Log Settings'));

        o = s.option(form.ListValue, 'log_level', _('Log Level'));
        o.value('debug', _('Debug'));
        o.value('info', _('Info'));
        o.value('warn', _('Warning'));
        o.value('error', _('Error'));
        o.default = 'info';

        o = s.option(form.Value, 'log_size', _('Log Size (KB)'));
        o.datatype = 'uinteger';
        o.default = '1024';
        o.description = _('Maximum log file size in kilobytes');

        o = s.option(form.Value, 'log_count', _('Log Count'));
        o.datatype = 'uinteger';
        o.default = '3';
        o.description = _('Number of rotated log files to keep');

        // 日志查看
        s = m.section(form.NamedSection, '_logs', 'flowproxy', _('Runtime Logs'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-bottom: 10px' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': L.bind(this.refreshLogs, this)
                    }, _('Refresh')),
                    E('button', {
                        'class': 'cbi-button cbi-button-reset',
                        'click': L.bind(this.clearLogs, this)
                    }, _('Clear Logs'))
                ]),
                E('textarea', {
                    'id': 'log-content',
                    'style': 'width: 100%; height: 400px; font-family: monospace; font-size: 12px; resize: vertical;',
                    'readonly': true,
                    'placeholder': _('No logs available')
                }, _('Loading logs...'))
            ]);
        }, this);

        // 启动轮询更新状态
        this.pollStatus();

        return m.render().then(L.bind(function(node) {
            // 初始加载日志
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

                // 更新服务状态
                var statusEl = document.getElementById('service-status');
                if (statusEl) {
                    if (status.enabled == 1 && status.running == 1) {
                        statusEl.innerHTML = '<span style="color: green; font-weight: bold;">● ' + _('Running') + '</span>';
                    } else if (status.enabled == 1) {
                        statusEl.innerHTML = '<span style="color: orange; font-weight: bold;">● ' + _('Enabled (Not Running)') + '</span>';
                    } else {
                        statusEl.innerHTML = '<span style="color: red; font-weight: bold;">● ' + _('Disabled') + '</span>';
                    }
                }

                // 更新 nftables 状态
                var nftEl = document.getElementById('nft-status');
                if (nftEl) {
                    var chains = [];
                    if (nftStatus.tcp_chain) chains.push('TCP');
                    if (nftStatus.udp_chain) chains.push('UDP');
                    if (chains.length > 0) {
                        nftEl.innerHTML = '<span style="color: green;">' + _('Active chains: %s').format(chains.join(', ')) + '</span>';
                    } else {
                        nftEl.innerHTML = '<span style="color: gray;">' + _('No active chains') + '</span>';
                    }
                }
            }, this));
        }, this), 5);
    },

    refreshLogs: function() {
        callGetLogs(200).then(L.bind(function(data) {
            var logEl = document.getElementById('log-content');
            if (logEl) {
                if (data && data.length > 0) {
                    logEl.value = data.join('\n');
                    logEl.scrollTop = logEl.scrollHeight;
                } else {
                    logEl.value = _('No logs available');
                }
            }
        }, this));
    },

    clearLogs: function() {
        if (confirm(_('Are you sure you want to clear all logs?'))) {
            callClearLogs().then(L.bind(function() {
                this.refreshLogs();
            }, this));
        }
    },

    handleStart: function(ev) {
        return callStartService().then(L.bind(function() {
            return this.refreshLogs();
        }, this));
    },

    handleStop: function(ev) {
        return callStopService().then(L.bind(function() {
            return this.refreshLogs();
        }, this));
    },

    handleRestart: function(ev) {
        return callRestartService().then(L.bind(function() {
            return this.refreshLogs();
        }, this));
    }
});