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
        // 极致稳定性修复：严格串行执行生命周期
        // 1. 同步内存更改到 /tmp/.uci
        return uci.save().then(function() {
            // 2. 加载最新的缓存配置
            return uci.load('flowproxy');
        }).then(function() {
            // 3. 同时发起后端生成和运行时探测
            return Promise.all([
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
        var genConfig = (data[0] && data[0].config) ? data[0].config : '';
        var runConfig = (data[1] && data[1].runtime) ? data[1].runtime : '';
        var m, s, o;

        m = new form.Map('flowproxy', _('flowproxy - preview & debug'),
            _('view the generated configuration and live kernel state.'));

        var style = E('style', {}, `
            .nft-code-view { 
                background: #fafafa !important; 
                color: #383a42 !important; 
                padding: 20px !important; 
                margin: 10px 0 !important;
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace !important;
                font-size: 13px !important; 
                line-height: 1.6 !important; 
                overflow-x: auto !important; 
                white-space: pre-wrap !important; 
                word-break: break-all !important;
                width: 100% !important; 
                border: 1px solid #eeeeee !important;
                display: block !important;
                min-height: 100px;
                border-radius: 4px;
            }
            .nft-comment { color: #a0a1a7 !important; font-style: italic !important; }
            .nft-keyword { color: #a626a1 !important; font-weight: bold !important; }
            .nft-proto { color: #4078f2 !important; }
            .nft-match { color: #986801 !important; }
            .nft-action { color: #e45649 !important; font-weight: bold !important; }
            .nft-variable { color: #50a14f !important; font-weight: bold !important; }
            .nft-bracket { color: #383a42 !important; }

            /* 黑暗模式适配 (支持系统级和 Argon 等主题) */
            @media (prefers-color-scheme: dark) {
                .nft-code-view {
                    background: #1e1e1e !important;
                    color: #d4d4d4 !important;
                    border: 1px solid #333333 !important;
                }
                .nft-comment { color: #6a9955 !important; }
                .nft-keyword { color: #569cd6 !important; }
                .nft-proto { color: #9cdcfe !important; }
                .nft-match { color: #ce9178 !important; }
                .nft-action { color: #d16969 !important; }
                .nft-variable { color: #4ec9b0 !important; }
                .nft-bracket { color: #d4d4d4 !important; }
            }

            /* 强制黑暗模式类适配 */
            [data-theme="dark"] .nft-code-view, 
            .dark .nft-code-view {
                background: #1e1e1e !important;
                color: #d4d4d4 !important;
                border: 1px solid #333333 !important;
            }
            [data-theme="dark"] .nft-comment, .dark .nft-comment { color: #6a9955 !important; }
            [data-theme="dark"] .nft-keyword, .dark .nft-keyword { color: #569cd6 !important; font-weight: bold !important; }
            [data-theme="dark"] .nft-proto, .dark .nft-proto { color: #9cdcfe !important; }
            [data-theme="dark"] .nft-match, .dark .nft-match { color: #ce9178 !important; }
            [data-theme="dark"] .nft-action, .dark .nft-action { color: #d16969 !important; }
            [data-theme="dark"] .nft-variable, .dark .nft-variable { color: #4ec9b0 !important; }
            [data-theme="dark"] .nft-bracket, .dark .nft-bracket { color: #d4d4d4 !important; }
        `);
        document.head.appendChild(style);

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('inspection tabs'));
        s.tab('generated', _('generated config'));
        s.tab('runtime', _('live runtime state'));

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
            var self = this;
            var updateContent = function() {
                var genEl = document.getElementById('gen-code');
                if (genEl) genEl.innerHTML = self.highlightNft(genConfig);
                var runEl = document.getElementById('run-code');
                if (runEl) runEl.innerHTML = self.highlightNft(runConfig);
            };
            setTimeout(updateContent, 100);
            node.addEventListener('cbi-tab-active', function() {
                setTimeout(updateContent, 50);
            });
            return node;
        }, this));
    }
});