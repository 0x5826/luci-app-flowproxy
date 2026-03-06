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
        if (!text || text.trim() === '') return '<span style="color: #999;">(no content / table not loaded)</span>';
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

        // 注入强制白底高亮 CSS
        var style = E('style', {}, `
            .nft-code-view { 
                background: #ffffff !important; 
                color: #333333 !important; 
                padding: 20px !important; 
                margin: 10px 0 !important;
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace !important;
                font-size: 13px !important; 
                line-height: 1.6 !important; 
                overflow-x: auto !important; 
                white-space: pre !important; 
                width: 100% !important; 
                border: 1px solid #eeeeee !important;
                display: block !important;
                min-height: 100px;
            }
            .nft-comment { color: #999988 !important; font-style: italic !important; }
            .nft-keyword { color: #a626a1 !important; font-weight: bold !important; }
            .nft-proto { color: #4078f2 !important; }
            .nft-match { color: #986801 !important; }
            .nft-action { color: #e45649 !important; font-weight: bold !important; }
            .nft-variable { color: #50a14f !important; font-weight: bold !important; }
            .nft-bracket { color: #383a42 !important; }
        `);
        document.head.appendChild(style);

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('inspection tabs'));
        s.tab('generated', _('generated config'));
        s.tab('runtime', _('live runtime state'));

        // Tab 1: 生成的配置
        o = s.taboption('generated', form.SectionValue, '_gen_val', form.NamedSection, 'global', 'flowproxy');
        o.subsection.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 5px 0; border-bottom: 1px solid #eee; margin-bottom: 10px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-apply',
                        'click': function() { ui.addNotification(null, E('p', _('copied')), 'info'); navigator.clipboard.writeText(genConfig); }
                    }, _('copy raw config'))
                ]),
                E('pre', { 'class': 'nft-code-view', 'id': 'gen-code' }, [ _('loading...') ])
            ]);
        }, this);

        // Tab 2: 内核实时状态
        o = s.taboption('runtime', form.SectionValue, '_run_val', form.NamedSection, 'global', 'flowproxy');
        o.subsection.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 5px 0; border-bottom: 1px solid #eee; margin-bottom: 10px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': function() { location.reload(); }
                    }, _('refresh status'))
                ]),
                E('pre', { 'class': 'nft-code-view', 'id': 'run-code' }, [ _('loading...') ])
            ]);
        }, this);

        return m.render().then(L.bind(function(node) {
            // 在页面完全加载及 Tab 可能切换后，确保内容注入
            var self = this;
            var updateContent = function() {
                var genEl = document.getElementById('gen-code');
                if (genEl) genEl.innerHTML = self.highlightNft(genConfig);
                var runEl = document.getElementById('run-code');
                if (runEl) runEl.innerHTML = self.highlightNft(runConfig);
            };

            // 初次注入
            setTimeout(updateContent, 100);
            
            // 额外针对 Tab 切换做监听，确保内容在 Tab 切换时依然存在（LuCI 的 Tab 有时会重绘）
            node.addEventListener('cbi-tab-active', function() {
                setTimeout(updateContent, 50);
            });

            return node;
        }, this));
    }
});