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

var callGetRuntimeConfig = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_runtime_config'
});

return L.view.extend({
    load: function() {
        return uci.save().then(function() {
            return Promise.all([
                uci.load('flowproxy'),
                callGenerateNftConfig(),
                callGetRuntimeConfig()
            ]);
        });
    },

    render: function(data) {
        var genConfig = (data[1] && data[1].config) ? data[1].config : '';
        var runConfig = (data[2] && data[2].runtime) ? data[2].runtime : '';
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - preview & debug'),
            _('view the generated configuration and live kernel state.'));

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('inspection tabs'));
        s.tab('generated', _('generated config'));
        s.tab('runtime', _('live runtime state'));

        // Tab 1: 生成的配置
        o = s.taboption('generated', form.SectionValue, '_gen_val', form.NamedSection, 'global', 'flowproxy');
        var ss_gen = o.subsection;
        ss_gen.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px;' }, [
                    E('p', {}, _('this is the nftables file generated based on your CURRENT rules (saved but maybe not applied).'))
                ]),
                E('textarea', {
                    'style': 'width: 100%; height: 600px; font-family: monospace; font-size: 12px; background: #fdfdfd; border: none; padding: 10px;',
                    'readonly': true
                }, genConfig)
            ]);
        }, this);

        // Tab 2: 内核实时状态
        o = s.taboption('runtime', form.SectionValue, '_run_val', form.NamedSection, 'global', 'flowproxy');
        var ss_run = o.subsection;
        ss_run.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px;' }, [
                    E('p', {}, _('this shows the ACTUAL rules and routing policies currently active in the linux kernel.')),
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': function() { location.reload(); }
                    }, _('refresh status'))
                ]),
                E('textarea', {
                    'style': 'width: 100%; height: 600px; font-family: monospace; font-size: 12px; background: #f0f4f8; border: none; padding: 10px; color: #2c3e50;',
                    'readonly': true
                }, runConfig)
            ]);
        }, this);

        return m.render();
    }
});