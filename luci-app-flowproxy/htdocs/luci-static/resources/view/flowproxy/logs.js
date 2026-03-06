'use strict';
'require form';
'require uci';
'require rpc';
'require view';
'require ui';

var callGetLogs = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_logs',
    params: ['lines']
});

var callClearLogs = rpc.declare({
    object: 'luci.flowproxy',
    method: 'clear_logs'
});

return L.view.extend({
    load: function() {
        return uci.load('flowproxy');
    },

    render: function() {
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - logs'),
            _('view and manage service runtime logs.'));

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('log control'));
        
        o = s.option(form.Button, '_refresh', _('refresh logs'));
        o.inputstyle = 'apply';
        o.onclick = L.bind(this.refreshLogs, this);

        o = s.option(form.Button, '_clear', _('clear logs'));
        o.inputstyle = 'reset';
        o.onclick = L.bind(this.clearLogs, this);

        s = m.section(form.NamedSection, '_logs', 'flowproxy', _('log output'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('textarea', {
                    'id': 'log-content',
                    'style': 'width: 100%; height: 600px; font-family: monospace; font-size: 12px; background: #fff; border: 1px solid #ddd; padding: 10px; resize: vertical;',
                    'readonly': true
                }, _('loading logs...'))
            ]);
        }, this);

        return m.render().then(L.bind(function(node) {
            this.refreshLogs();
            return node;
        }, this));
    },

    refreshLogs: function() {
        callGetLogs(500).then(L.bind(function(data) {
            var logEl = document.getElementById('log-content');
            var logs = (data && Array.isArray(data.logs)) ? data.logs : [];
            if (logEl) {
                logEl.value = logs.length > 0 ? logs.join('\n') : _('no logs available');
                if (logs.length > 0) logEl.scrollTop = logEl.scrollHeight;
            }
        }, this));
    },

    clearLogs: function() {
        if (confirm(_('really clear all service logs?'))) {
            callClearLogs().then(L.bind(this.refreshLogs, this));
        }
    }
});