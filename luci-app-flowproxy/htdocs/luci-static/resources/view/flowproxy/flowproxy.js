'use strict';
'require form';
'require uci';
'require rpc';
'require poll';
'require view';
'require dom';
'require fs';
'require ui';

var callGetStatus = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_status'
});

var callGetInterfaces = rpc.declare({
    object: 'luci.flowproxy',
    method: 'get_interfaces'
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
        return Promise.all([
            uci.load('flowproxy').catch(function() { return {}; }),
            callGetInterfaces().catch(function() { return { interfaces: [] }; }),
            callGenerateNftConfig().catch(function() { return { config: '' }; }),
            callGetRuntimeConfig().catch(function() { return { runtime: '' }; })
        ]);
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

    refreshStatus: function(map, node) {
        return callGetStatus().then(L.bind(function(status) {
            if (!status) return;
            var isRunning = (status.running == 1);
            var container = node || document;
            
            var statusEl = container.querySelector('#service-status');
            if (statusEl) {
                if (isRunning) {
                    var chains = [];
                    if (status.nft && status.nft.tcp) chains.push('TCP');
                    if (status.nft && status.nft.udp) chains.push('UDP');
                    var ip = status.proxy_server_ip_addr || '-';
                    var protoHtml = chains.length > 0 ? 
                        '<span style="color: #FF9800; font-weight: bold;">' + chains.join('+') + '</span>' : '-';
                    statusEl.innerHTML = '<span style="color: green; font-weight: bold;">' + _('running') + '</span>' + 
                                         ' (' + ip + ':' + protoHtml + ')';
                } else {
                    statusEl.innerHTML = '<span style="color: red; font-weight: bold;">' + _('stopped') + '</span>';
                }
            }

            var dnsEl = container.querySelector('#dns-status');
            if (dnsEl) {
                if (status.dns_running == 1) {
                    var ip = status.proxy_server_ip_addr || '-';
                    var portHtml = '<span style="color: #FF9800; font-weight: bold;">' + (status.proxy_server_dns_port || '5353') + '</span>';
                    dnsEl.innerHTML = '<span style="color: green; font-weight: bold;">' + _('running') + '</span>' + 
                                      ' (' + ip + ':' + portHtml + ')';
                } else {
                    dnsEl.innerHTML = '<span style="color: red; font-weight: bold;">' + _('stopped') + '</span>';
                }
            }

            // 预填 Proxy Server IP 逻辑
            if (status.lan_ip) {
                var parts = status.lan_ip.split('.');
                if (parts.length === 4) {
                    parts[3] = parseInt(parts[3]) + 1;
                    var suggestedIp = parts.join('.');
                    
                    if (map) {
                        var ipOpt = map.lookupOption('proxy_server_ip_addr', 'global')[0];
                        if (ipOpt) ipOpt.placeholder = suggestedIp;
                    }

                    var input = container.querySelector('input[name="cbid.flowproxy.global.proxy_server_ip_addr"]');
                    if (input) {
                        input.placeholder = suggestedIp;
                        // 只有当输入框真的为空（既无用户输入也无 UCI 配置值）时才代填
                        if (!input.value || input.value === '') {
                            var uciVal = uci.get('flowproxy', 'global', 'proxy_server_ip_addr');
                            if (!uciVal) {
                                input.value = suggestedIp;
                                input.dispatchEvent(new CustomEvent('change', { bubbles: true }));
                            }
                        }
                    }
                }
            }
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

    render: function(data) {
        var self = this;
        var ifdata = data[1];
        var genConfig = (data[2] && data[2].config) ? data[2].config : '';
        var runConfig = (data[3] && data[3].runtime) ? data[3].runtime : '';
        var m, s, o;

        m = new form.Map('flowproxy', _('FlowProxy'),
            _('Traffic diversion based on nftables rules. The service will automatically start/stop when you click "Save & Apply".'));

        // 注入样式
        var style = E('style', {}, `
            #log-content { 
                width: 100% !important; height: 600px; font-family: monospace; font-size: 12px; 
                background: #f5f5f5 !important; color: #333 !important; 
                border: 1px solid #ccc !important; padding: 10px; resize: vertical; 
                border-radius: 4px; box-sizing: border-box;
            }
            .nft-code-view { 
                background: #f5f5f5 !important; color: #333333 !important; padding: 15px !important; 
                font-family: monospace !important; font-size: 12px !important; 
                overflow-x: auto !important; white-space: pre-wrap !important; 
                width: 100% !important; border: 1px solid #cccccc !important; border-radius: 4px;
                box-sizing: border-box;
            }
            .nft-comment { color: #777777; font-style: italic; }
            .nft-keyword { color: #a626a1; font-weight: bold; }
            .nft-proto { color: #4078f2; }
            .nft-match { color: #986801; }
            .nft-action { color: #e45649; font-weight: bold; }
            .nft-variable { color: #50a14f; font-weight: bold; }
        `);
        document.head.appendChild(style);

        // 主配置区块，用于承载标签页
        s = m.section(form.NamedSection, 'global', 'flowproxy');
        s.tab('settings', _('Settings'));
        s.tab('rules', _('Rules'));
        s.tab('lists', _('Lists'));
        s.tab('preview', _('Preview'));
        s.tab('logs', _('Logs'));

        // --- Settings Tab ---
        o = s.taboption('settings', form.DummyValue, '_service_status', _('Current Status'));
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<div id="service-status" style="display:inline-block;"><em class="spinning">' + _('checking...') + '</em></div>';
        };

        o = s.taboption('settings', form.DummyValue, '_dns_status', _('DNS Redirection'));
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<div id="dns-status" style="display:inline-block;">-</div>';
        };

        o = s.taboption('settings', form.Flag, 'enabled', _('Enable FlowProxy'));
        o.rmempty = false; o.default = '0';

        o = s.taboption('settings', form.Flag, 'dns_proxy_enabled', _('Force upstream DNS to proxy server'));
        o.rmempty = false; o.default = '0';

        o = s.taboption('settings', form.Value, 'proxy_server_ip_addr', _('Proxy server IP address'));
        o.datatype = 'ip4addr'; o.rmempty = false;

        o = s.taboption('settings', form.Value, 'proxy_server_dns_port', _('Proxy server DNS port'));
        o.datatype = 'port'; o.rmempty = false; o.default = '5353';

        o = s.taboption('settings', form.ListValue, 'interface', _('Network interface'));
        if (ifdata && ifdata.interfaces) {
            ifdata.interfaces.forEach(function(i) { o.value(i.name, i.name); });
        }
        o.default = 'br-lan';

        o = s.taboption('settings', form.Value, 'traffic_mark', _('Traffic Mark'));
        o.datatype = 'and(uinteger,range(1, 4294967295))';
        o.default = '100';

        o = s.taboption('settings', form.Value, 'routing_table', _('Routing Table ID'));
        o.datatype = 'and(uinteger,range(1, 4294967295))';
        o.default = '100';

        // --- Rules Tab ---
        var nftsets = uci.sections('flowproxy', 'nftset').map(function(ss) { return '@' + ss['.name']; });
        nftsets.push('@proxy_server_ip_addr');

        var createTemplateButtons = function(type) {
            var presets = {
                'local': { name: 'local (dst)', type: 'custom', val: 'fib daddr type { unspec, local, anycast, multicast }' },
                'priv': { name: 'private (dst)', type: 'dst_ip', val: '@private_dst_ip_v4' },
                'china': { name: 'china (dst)', type: 'dst_ip', val: '@chnroute_dst_ip_v4' },
                'src_ip': { name: 'ip (src)', type: 'src_ip', val: '@no_proxy_src_ip_v4' },
                'dst_ip': { name: 'ip (dst)', type: 'dst_ip', val: '@no_proxy_dst_ip_v4' },
                'mac': { name: 'mac (src)', type: 'src_mac', val: '@no_proxy_src_mac' },
                'ports': { name: 'ports (dst)', type: 'dst_port', val: (type === 'tcp_rule') ? '@no_proxy_dst_tcp_ports' : '@no_proxy_dst_udp_ports' }
            };

            var btnGroup = E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; align-items: center;' }, [
                E('small', { 'style': 'margin-right: 5px; color: #888;' }, _('Quick add:'))
            ]);

            Object.keys(presets).forEach(function(k) {
                var p = presets[k];
                btnGroup.appendChild(E('button', {
                    'class': 'cbi-button cbi-button-apply',
                    'style': 'padding: 0 6px; font-size: 0.75rem; height: 22px; line-height: 22px; opacity: 0.8; margin-bottom: 4px;',
                    'click': ui.createHandlerFn(self, function() {
                        var sid = uci.add('flowproxy', type);
                        uci.set('flowproxy', sid, 'enabled', '1');
                        uci.set('flowproxy', sid, 'match_type', p.type);
                        uci.set('flowproxy', sid, 'match_value', p.val);
                        uci.set('flowproxy', sid, 'action', 'return');
                        uci.set('flowproxy', sid, 'counter', '0');
                        
                        // 局部刷新：重新渲染 Map 并替换 DOM，避免全页刷新
                        return m.render().then(function(newNode) {
                            m.container.parentNode.replaceChild(newNode, m.container);
                            self.refreshStatus(m, newNode);
                        });
                    })
                }, [ E('em', { 'class': 'icon-plus' }), ' ', p.name ]));
            });
            return btnGroup;
        };

        var setupRuleTable = function(type, title, switch_opt) {
            var st = s.taboption('rules', form.SectionValue, '_tab_' + type, form.TableSection, type, title);
            var ss = st.subsection;
            ss.addremove = true; ss.anonymous = true; ss.sortable = false;

            ss.render = function() {
                return form.TableSection.prototype.render.apply(ss).then(function(node) {
                    var titleEl = node.querySelector('h3');
                    if (titleEl) {
                        titleEl.style.display = 'block';
                        var headerRow = E('div', { 'style': 'display: flex; align-items: center; gap: 10px;' }, [
                            E('span', {}, title),
                            E('div', { 'style': 'font-size: 0.8em; font-weight: normal; display: inline-flex; align-items: center; gap: 5px; color: #666;' }, [
                                (function() {
                                    var val = uci.get('flowproxy', 'global', switch_opt);
                                    var is_enabled = (val === '0') ? false : true;
                                    return E('input', {
                                        'type': 'checkbox', 'style': 'width: 16px; height: 18px; cursor: pointer;',
                                        'checked': is_enabled ? 'checked' : null,
                                        'change': function(ev) {
                                            uci.set('flowproxy', 'global', switch_opt, ev.target.checked ? '1' : '0');
                                            ui.addNotification(null, E('p', _('Master switch updated. Click "Save & Apply" to take effect.')), 'info');
                                        }
                                    });
                                })(),
                                E('span', {}, _('enable protocol'))
                            ])
                        ]);
                        titleEl.innerHTML = '';
                        titleEl.appendChild(headerRow);
                        titleEl.appendChild(createTemplateButtons(type));
                    }
                    return node;
                });
            };

            ss.renderSectionAdd = function(extra_class) {
                var node = form.TableSection.prototype.renderSectionAdd.apply(this, [extra_class]);
                var label = (type === 'tcp_rule') ? 'TCP' : 'UDP';
                var addBtn = node.querySelector('.cbi-button-add');
                if (addBtn) addBtn.innerText = _('Add rule');

                var resetBtn = E('button', {
                    'class': 'cbi-button cbi-button-reset',
                    'style': 'margin-left: 10px; border: 1px solid #cc0000; color: #cc0000;',
                    'click': ui.createHandlerFn(self, function() {
                        if (confirm(_('this will delete ALL current %s rules and generate default templates. are you sure?').format(label))) {
                            uci.sections('flowproxy', type).forEach(function(r) { uci.remove('flowproxy', r['.name']); });
                            var defs = [
                                { t: 'src_mac', v: '@no_proxy_src_mac' },
                                { t: 'dst_ip', v: '@private_dst_ip_v4' },
                                { t: 'dst_ip', v: '@chnroute_dst_ip_v4' }
                            ];
                            if (type === 'tcp_rule') defs.push({ t: 'dst_port', v: '@no_proxy_dst_tcp_ports' });
                            else if (type === 'udp_rule') defs.push({ t: 'dst_port', v: '@no_proxy_dst_udp_ports' });

                            defs.forEach(function(r) {
                                var sid = uci.add('flowproxy', type);
                                uci.set('flowproxy', sid, 'enabled', '1');
                                uci.set('flowproxy', sid, 'match_type', r.t);
                                uci.set('flowproxy', sid, 'match_value', r.v);
                                uci.set('flowproxy', sid, 'action', 'return');
                                uci.set('flowproxy', sid, 'counter', '0');
                            });
                            
                            return m.render().then(function(newNode) {
                                m.container.parentNode.replaceChild(newNode, m.container);
                                self.refreshStatus(m, newNode);
                            });
                        }
                    })
                }, [ E('em', { 'class': 'icon-reload' }), ' ', _('reset %s templates').format(label) ]);
                node.appendChild(resetBtn);
                return node;
            };

            o = ss.option(form.Flag, 'enabled', _('Enabled')); o.width = '8%';
            o = ss.option(form.ListValue, 'match_type', _('Match Type'));
            o.value('dst_ip', 'dest ip'); o.value('src_ip', 'src ip'); o.value('src_mac', 'src mac');
            o.value('dst_port', 'dest port'); o.value('src_port', 'src port'); o.value('custom', 'custom (raw)');
            o.default = 'dst_ip'; o.width = '15%';
            o = ss.option(form.Value, 'match_value', _('Match Value'));
            o.rmempty = false; o.width = '45%';
            nftsets.forEach(function(set) { o.value(set); });
            o = ss.option(form.Flag, 'counter', _('Counter')); o.width = '8%';
            o = ss.option(form.ListValue, 'action', _('Action'));
            o.value('return', 'return'); o.value('accept', 'accept'); o.value('drop', 'drop');
            o.default = 'return'; o.width = '12%';
        };

        setupRuleTable('tcp_rule', _('TCP Matching Rules'), 'tcp_enabled');
        setupRuleTable('udp_rule', _('UDP Matching Rules'), 'udp_enabled');

        // --- Lists Tab ---
        var predefined = [
            { id: 'no_proxy_src_mac', name: _('no_proxy_src_mac'), type: 'macaddr' },
            { id: 'no_proxy_src_ip_v4', name: _('no_proxy_src_ip_v4'), type: 'or(ip4addr, cidr4)' },
            { id: 'no_proxy_dst_ip_v4', name: _('no_proxy_dst_ip_v4'), type: 'or(ip4addr, cidr4)' },
            { id: 'no_proxy_dst_tcp_ports', name: _('no_proxy_dst_tcp_ports'), type: 'or(port, portrange)' },
            { id: 'no_proxy_dst_udp_ports', name: _('no_proxy_dst_udp_ports'), type: 'or(port, portrange)' }
        ];

        predefined.forEach(function(p) {
            var sl = s.taboption('lists', form.SectionValue, '_list_' + p.id, form.NamedSection, p.id, 'nftset', p.name + ' (@' + p.id + ')');
            var ssl = sl.subsection;
            ssl.option(form.Flag, 'enabled', _('Enabled')).default = '1';
            ssl.option(form.DynamicList, 'elements', _('Elements')).datatype = p.type;
        });

        // 特殊：chnroute
        var sc = s.taboption('lists', form.SectionValue, '_list_chnroute', form.NamedSection, 'chnroute_dst_ip_v4', 'nftset', _('chnroute_dst_ip_v4') + ' (@chnroute_dst_ip_v4)');
        var ssc = sc.subsection;
        ssc.option(form.Flag, 'enabled', _('Enabled')).default = '1';
        ssc.option(form.Value, 'file_path', _('File Path')).default = '/usr/share/flowproxy/chnroute.txt';
        ssc.option(form.Value, 'download_url', _('Download URL'));
        o = ssc.option(form.Button, '_download', _('Update Chnroute'));
        o.inputstyle = 'apply';
        o.onclick = function(ev, section_id) {
            var url = uci.get('flowproxy', section_id, 'download_url');
            var path = uci.get('flowproxy', section_id, 'file_path') || '/usr/share/flowproxy/chnroute.txt';
            if (!url) { ui.addNotification(null, E('p', _('Please set download_url first')), 'error'); return; }
            
            ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Downloading chnroute data...')) ]);
            return fs.exec('/usr/bin/wget', ['-q', '-O', path, url, '--timeout=10', '--no-check-certificate']).then(function(res) {
                ui.hideModal();
                if (res.code === 0) ui.addNotification(null, E('p', _('Updated successfully.')), 'info');
                else ui.addNotification(null, E('p', _('Download failed')), 'error');
            }).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', _('Error: ') + e.message), 'error'); });
        };

        // --- Preview Tab ---
        var sp = s.taboption('preview', form.SectionValue, '_preview_section', form.NamedSection, 'global', 'flowproxy');
        var ssp = sp.subsection;
        ssp.tab('generated', _('Generated Config'));
        ssp.tab('runtime', _('Live Runtime State'));

        o = ssp.taboption('generated', form.DummyValue, '_preview_gen');
        o.render = function() {
            return E('div', { 'style': 'width:100%; padding:10px; box-sizing:border-box;' }, [
                E('div', { 'style': 'margin-bottom: 10px' }, [
                    E('button', { 'class': 'cbi-button cbi-button-apply', 'click': function() { navigator.clipboard.writeText(genConfig); ui.addNotification(null, E('p', _('Copied')), 'info'); } }, _('Copy Config'))
                ]),
                E('pre', { 'class': 'nft-code-view', 'id': 'gen-code' }, [ _('loading...') ])
            ]);
        };

        o = ssp.taboption('runtime', form.DummyValue, '_preview_run');
        o.render = function() {
            return E('div', { 'style': 'width:100%; padding:10px; box-sizing:border-box;' }, [
                E('div', { 'style': 'margin-bottom: 10px' }, [
                    E('button', { 'class': 'cbi-button cbi-button-refresh', 'click': function() { location.reload(); } }, _('Refresh Status'))
                ]),
                E('pre', { 'class': 'nft-code-view', 'id': 'run-code' }, [ _('loading...') ])
            ]);
        };

        // --- Logs Tab ---
        o = s.taboption('logs', form.ListValue, 'log_level', _('Log Level'));
        o.value('debug', 'debug'); o.value('info', 'info'); o.value('warn', 'warn'); o.value('error', 'error');
        o.default = 'info';

        o = s.taboption('logs', form.Value, 'log_size', _('Log Size (KB)'));
        o.datatype = 'uinteger'; o.default = '1024';

        o = s.taboption('logs', form.DummyValue, '_log_view');
        o.render = function() {
            return E('div', { 'style': 'width:100%; padding:10px; box-sizing:border-box;' }, [
                E('div', { 'class': 'cbi-page-actions', 'style': 'margin-bottom: 10px; text-align: left;' }, [
                    E('button', { 'class': 'cbi-button cbi-button-refresh', 'click': L.bind(self.refreshLogs, self) }, _('Refresh Logs')),
                    E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left: 10px;', 'click': L.bind(function() { if(confirm(_('Clear logs?'))) callClearLogs().then(L.bind(self.refreshLogs, self)); }, self) }, _('Clear Logs'))
                ]),
                E('textarea', { 'id': 'log-content', 'readonly': true, 'style': 'width:100% !important; height:600px !important;' }, _('loading logs...'))
            ]);
        };

        return m.render().then(L.bind(function(node) {
            var self = this;
            var updateContent = function() {
                var genEl = node.querySelector('#gen-code');
                if (genEl) genEl.innerHTML = self.highlightNft(genConfig);
                var runEl = node.querySelector('#run-code');
                if (runEl) runEl.innerHTML = self.highlightNft(runConfig);
            };

            // 1. 初始加载后尝试填入
            setTimeout(updateContent, 100);

            // 2. 监听标签切换事件，确保从其他页切回来时内容也正确
            node.addEventListener('cbi-tab-active', function() {
                setTimeout(updateContent, 50);
            });

            this.refreshStatus(m, node);
            this.refreshLogs();
            poll.add(L.bind(function() {
                return this.refreshStatus(m, node);
            }, this), 5);

            return node;
        }, this));
    }
});