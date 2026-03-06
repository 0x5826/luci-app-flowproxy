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

return L.view.extend({
    load: function() {
        return Promise.all([
            uci.load('flowproxy').catch(function() { return {}; }),
            callGetStatus().catch(function() { return {}; }),
            callGetInterfaces().catch(function() { return { interfaces: [] }; })
        ]);
    },

    render: function(data) {
        var status = data[1] || {};
        var interfaces = (data[2] && Array.isArray(data[2].interfaces)) ? data[2].interfaces : [];
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy'),
            _('traffic diversion based on nftables rules. the service will automatically start/stop when you click "save & apply".'));

        // 状态显示区域 (仅展示，无按钮)
        s = m.section(form.NamedSection, '_status', 'flowproxy', _('service status'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'table' }, [
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left', 'style': 'width: 30%; font-weight: bold;' }, _('current status')),
                        E('div', { 'class': 'td left', 'id': 'service-status' }, _('loading...'))
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

        // 基本设置
        s = m.section(form.NamedSection, 'global', 'flowproxy', _('basic settings'));

        o = s.option(form.Flag, 'enabled', _('enable flowproxy'));
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
                E('textarea', { 'id': 'log-content', 'style': 'width: 100%; height: 300px; font-family: monospace; font-size: 12px; resize: vertical;', 'readonly': true }, _('loading logs...'))
            ]);
        }, this);

        this.updateStatus(status);
        this.pollStatus();

        return m.render().then(L.bind(function(node) {
            this.refreshLogs();
            return node;
        }, this));
    },

    updateStatus: function(status) {
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
            document.getElementById('proxy-ip').innerText = status.proxy_ip || '-';
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
    }
});