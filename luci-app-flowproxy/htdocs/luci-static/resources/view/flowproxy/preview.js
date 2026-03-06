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

    highlightNft: function(text) {
        if (!text) return '';
        var rules = [
            { rex: /#(.*)/g, cls: 'comment' },
            { rex: /\b(table|chain|set|elements|type)\b/g, cls: 'keyword' },
            { rex: /\b(ip|ip6|tcp|udp|ether|meta|meta nfproto)\b/g, cls: 'proto' },
            { rex: /\b(saddr|daddr|sport|dport|mark)\b/g, cls: 'match' },
            { rex: /\b(return|accept|drop|reject|counter|set)\b/g, cls: 'action' },
            { rex: /@[\w_]+/g, cls: 'variable' },
            { rex: /\{|\}/g, cls: 'bracket' }
        ];

        var html = text.replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });

        rules.forEach(function(r) {
            html = html.replace(r.rex, function(match) {
                return '<span class="nft-' + r.cls + '">' + match + '</span>';
            });
        });

        return html;
    },

    render: function(data) {
        var genConfig = (data[1] && data[1].config) ? data[1].config : '';
        var runConfig = (data[2] && data[2].runtime) ? data[2].runtime : '';
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - preview'),
            _('view the generated configuration and live kernel state.'));

        // 注入浅色主题高亮 CSS
        var style = E('style', {}, `
            .nft-code-container { 
                background: #fdfdfd; color: #333333; padding: 15px; border-radius: 4px; 
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                font-size: 13px; line-height: 1.5; overflow-x: auto; white-space: pre; 
                min-height: 400px; width: 100%; border: 1px solid #dddddd;
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
            }
            .nft-comment { color: #999988; font-style: italic; }
            .nft-keyword { color: #a626a1; font-weight: bold; }
            .nft-proto { color: #4078f2; }
            .nft-match { color: #986801; }
            .nft-action { color: #e45649; font-weight: bold; }
            .nft-variable { color: #50a14f; font-weight: bold; }
            .nft-bracket { color: #383a42; }
        `);
        document.head.appendChild(style);

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('inspection tabs'));
        s.tab('generated', _('generated config'));
        s.tab('runtime', _('live runtime state'));

        o = s.taboption('generated', form.SectionValue, '_gen_val', form.NamedSection, 'global', 'flowproxy');
        o.subsection.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; margin-bottom: 5px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-apply',
                        'click': function() { ui.addNotification(null, E('p', _('copied')), 'info'); navigator.clipboard.writeText(genConfig); }
                    }, _('copy raw config'))
                ]),
                E('div', { 'class': 'nft-code-container' }, [
                    E('code', { 'id': 'gen-code' })
                ])
            ]);
        }, this);

        o = s.taboption('runtime', form.SectionValue, '_run_val', form.NamedSection, 'global', 'flowproxy');
        o.subsection.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; margin-bottom: 5px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': function() { location.reload(); }
                    }, _('refresh status'))
                ]),
                E('div', { 'class': 'nft-code-container' }, [
                    E('code', { 'id': 'run-code' })
                ])
            ]);
        }, this);

        return m.render().then(L.bind(function(node) {
            var genCodeEl = node.querySelector('#gen-code');
            if (genCodeEl) genCodeEl.innerHTML = this.highlightNft(genConfig);
            
            var runCodeEl = node.querySelector('#run-code');
            if (runCodeEl) runCodeEl.innerHTML = this.highlightNft(runConfig);
            
            return node;
        }, this));
    }
});