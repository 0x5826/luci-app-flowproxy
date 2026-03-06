'use strict';
'require form';
'require uci';
'require rpc';
'require view';
'require ui';

var callGenerateNftConfig = rpc.declare({
    object: 'luci.flowproxy',
    method: 'generate_nft_config'
});

var callGetStatus = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_status'
});

return L.view.extend({
    load: function() {
        // 先尝试将当前会话的 UCI 更改保存到缓存文件（不 commit）
        // 这样 generate_nft.sh 就能读取到最新的修改
        return uci.save().then(function() {
            return Promise.all([
                uci.load('flowproxy'),
                callGenerateNftConfig(),
                callGetStatus()
            ]);
        });
    },

    render: function(data) {
        var nftConfig = (data[1] && data[1].config) ? data[1].config : '';
        var status = data[2] || {};
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - preview'),
            _('preview the generated nftables configuration based on your CURRENT (saved) rules.'));

        // 当前运行概览
        s = m.section(form.NamedSection, '_current', 'flowproxy', _('running summary'));
        s.render = function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'table' }, [
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left', 'style': 'width: 30%' }, _('service enabled')),
                        E('div', { 'class': 'td left' }, (status.enabled == 1) ? 
                            '<span style="color: green;">' + _('yes') + '</span>' : 
                            '<span style="color: red;">' + _('no') + '</span>')
                    ]),
                    E('div', { 'class': 'tr' }, [
                        E('div', { 'class': 'td left' }, _('proxy server ip')),
                        E('div', { 'class': 'td left' }, status.proxy_ip || '-')
                    ])
                ])
            ]);
        };

        // nftables 配置预览
        s = m.section(form.NamedSection, '_preview', 'flowproxy', _('nftables configuration'));
        s.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-bottom: 10px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': function() { location.reload(); }
                    }, _('refresh preview')),
                    E('button', {
                        'class': 'cbi-button cbi-button-apply',
                        'click': L.bind(this.copyConfig, this)
                    }, _('copy to clipboard'))
                ]),
                E('textarea', {
                    'id': 'nft-config-preview',
                    'style': 'width: 100%; height: 600px; font-family: monospace; font-size: 12px; border: 1px solid #ccc; padding: 10px; background: #fafafa; resize: vertical;',
                    'readonly': true
                }, nftConfig)
            ]);
        }, this);

        return m.render();
    },

    copyConfig: function() {
        var el = document.getElementById('nft-config-preview');
        if (el && el.value) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(el.value).then(function() {
                    ui.addNotification(null, E('p', _('copied to clipboard')), 'info');
                });
            }
        }
    }
});