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

    // 简单的语法高亮函数
    highlightNft: function(text) {
        if (!text) return '';
        var rules = [
            { rex: /#(.*)/g, cls: 'comment' },                                      // 注释
            { rex: /\b(table|chain|set|elements|type)\b/g, cls: 'keyword' },        // 结构关键词
            { rex: /\b(ip|ip6|tcp|udp|ether|meta|meta nfproto)\b/g, cls: 'proto' },  // 协议/层
            { rex: /\b(saddr|daddr|sport|dport|mark)\b/g, cls: 'match' },           // 匹配项
            { rex: /\b(return|accept|drop|reject|counter|set)\b/g, cls: 'action' }, // 动作
            { rex: /@[\w_]+/g, cls: 'variable' },                                   // 变量/名单引用
            { rex: /\{|\}/g, cls: 'bracket' }                                       // 括号
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

        m = new form.Map('flowproxy', _('flowproxy - preview & debug'),
            _('view the generated configuration and live kernel state with syntax highlighting.'));

        // 注入高亮 CSS
        var style = E('style', {}, `
            .nft-code-container { 
                background: #282c34; color: #abb2bf; padding: 15px; border-radius: 4px; 
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
                font-size: 13px; line-height: 1.5; overflow-x: auto; white-space: pre; 
                min-height: 400px; width: 100%; border: 1px solid #181a1f;
            }
            .nft-comment { color: #5c6370; font-style: italic; }
            .nft-keyword { color: #c678dd; font-weight: bold; }
            .nft-proto { color: #61afef; }
            .nft-match { color: #d19a66; }
            .nft-action { color: #e06c75; font-weight: bold; }
            .nft-variable { color: #98c379; text-decoration: underline; }
            .nft-bracket { color: #56b6c2; }
        `);
        document.head.appendChild(style);

        s = m.section(form.NamedSection, 'global', 'flowproxy', _('inspection tabs'));
        s.tab('generated', _('generated config'));
        s.tab('runtime', _('live runtime state'));

        // Tab 1: 生成的配置
        o = s.taboption('generated', form.SectionValue, '_gen_val', form.NamedSection, 'global', 'flowproxy');
        o.subsection.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px;' }, [
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

        // Tab 2: 内核实时状态
        o = s.taboption('runtime', form.SectionValue, '_run_val', form.NamedSection, 'global', 'flowproxy');
        o.subsection.render = L.bind(function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('div', { 'style': 'padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px;' }, [
                    E('button', {
                        'class': 'cbi-button cbi-button-refresh',
                        'click': function() { location.reload(); }
                    }, _('refresh status'))
                ]),
                E('div', { 'class': 'nft-code-container', 'style': 'background: #1e1e1e;' }, [
                    E('code', { 'id': 'run-code' })
                ])
            ]);
        }, this);

        return m.render().then(L.bind(function(node) {
            // 在 Map 渲染完成后手动注入 HTML 高亮内容
            var genCodeEl = node.querySelector('#gen-code');
            if (genCodeEl) genCodeEl.innerHTML = this.highlightNft(genConfig);
            
            var runCodeEl = node.querySelector('#run-code');
            if (runCodeEl) runCodeEl.innerHTML = this.highlightNft(runConfig);
            
            return node;
        }, this));
    }
});