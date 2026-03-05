'use strict';
'require form';
'require uci';
'require view';

return L.view.extend({
    load: function() {
        return uci.load('flowproxy');
    },

    render: function() {
        var m, s, o;

        m = new form.Map('flowproxy', _('FlowProxy - Rules Management'),
            _('Manage TCP and UDP traffic rules. All rules can be freely added, edited, or deleted.'));

        // TCP 规则
        s = m.section(form.TypedSection, 'rule', _('TCP Rules'));
        s.filter = function(section_id) {
            return uci.get('flowproxy', section_id, 'protocol') === 'tcp';
        };
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.addbtntitle = _('Add TCP Rule');
        
        // 添加新规则时的默认配置
        var defaultConfig = {
            priority: '100',
            use_no_proxy_src_mac: '1',
            use_no_proxy_src_ip: '1',
            use_no_proxy_dst_ip: '1',
            use_private_dst_ip: '1',
            use_chnroute_dst_ip: '1',
            use_no_proxy_ports: '1'
        };

        // 添加新规则
        s.handleAdd = function(ev) {
            var section_id = uci.add('flowproxy', 'rule');

            uci.set('flowproxy', section_id, 'name', _('New TCP Rule'));
            uci.set('flowproxy', section_id, 'protocol', 'tcp');
            uci.set('flowproxy', section_id, 'enabled', '1');
            uci.set('flowproxy', section_id, 'priority', defaultConfig.priority);
            uci.set('flowproxy', section_id, 'use_no_proxy_src_mac', defaultConfig.use_no_proxy_src_mac);
            uci.set('flowproxy', section_id, 'use_no_proxy_src_ip', defaultConfig.use_no_proxy_src_ip);
            uci.set('flowproxy', section_id, 'use_no_proxy_dst_ip', defaultConfig.use_no_proxy_dst_ip);
            uci.set('flowproxy', section_id, 'use_private_dst_ip', defaultConfig.use_private_dst_ip);
            uci.set('flowproxy', section_id, 'use_chnroute_dst_ip', defaultConfig.use_chnroute_dst_ip);
            uci.set('flowproxy', section_id, 'use_no_proxy_ports', defaultConfig.use_no_proxy_ports);

            return this.map.save().then(function() {
                window.location.reload();
            });
        };

        o = s.option(form.Value, 'name', _('Rule Name'));
        o.rmempty = false;
        o.placeholder = _('Enter rule name');

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.Value, 'priority', _('Priority'));
        o.datatype = 'integer';
        o.default = '100';
        o.description = _('Lower value = higher priority');

        o = s.option(form.Flag, 'use_no_proxy_src_mac', _('Skip Source MAC'));
        o.default = '1';

        o = s.option(form.Flag, 'use_no_proxy_src_ip', _('Skip Source IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_no_proxy_dst_ip', _('Skip Destination IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_private_dst_ip', _('Skip Private IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_chnroute_dst_ip', _('Skip China IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_no_proxy_ports', _('Skip Ports'));
        o.default = '1';

        // UDP 规则
        s = m.section(form.TypedSection, 'rule', _('UDP Rules'));
        s.filter = function(section_id) {
            return uci.get('flowproxy', section_id, 'protocol') === 'udp';
        };
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.addbtntitle = _('Add UDP Rule');
        
        s.handleAdd = function(ev) {
            var section_id = uci.add('flowproxy', 'rule');

            uci.set('flowproxy', section_id, 'name', _('New UDP Rule'));
            uci.set('flowproxy', section_id, 'protocol', 'udp');
            uci.set('flowproxy', section_id, 'enabled', '1');
            uci.set('flowproxy', section_id, 'priority', defaultConfig.priority);
            uci.set('flowproxy', section_id, 'use_no_proxy_src_mac', defaultConfig.use_no_proxy_src_mac);
            uci.set('flowproxy', section_id, 'use_no_proxy_src_ip', defaultConfig.use_no_proxy_src_ip);
            uci.set('flowproxy', section_id, 'use_no_proxy_dst_ip', defaultConfig.use_no_proxy_dst_ip);
            uci.set('flowproxy', section_id, 'use_private_dst_ip', defaultConfig.use_private_dst_ip);
            uci.set('flowproxy', section_id, 'use_chnroute_dst_ip', defaultConfig.use_chnroute_dst_ip);
            uci.set('flowproxy', section_id, 'use_no_proxy_ports', defaultConfig.use_no_proxy_ports);

            return this.map.save().then(function() {
                window.location.reload();
            });
        };

        o = s.option(form.Value, 'name', _('Rule Name'));
        o.rmempty = false;
        o.placeholder = _('Enter rule name');

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.Value, 'priority', _('Priority'));
        o.datatype = 'integer';
        o.default = '100';
        o.description = _('Lower value = higher priority');

        o = s.option(form.Flag, 'use_no_proxy_src_mac', _('Skip Source MAC'));
        o.default = '1';

        o = s.option(form.Flag, 'use_no_proxy_src_ip', _('Skip Source IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_no_proxy_dst_ip', _('Skip Destination IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_private_dst_ip', _('Skip Private IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_chnroute_dst_ip', _('Skip China IP'));
        o.default = '1';

        o = s.option(form.Flag, 'use_no_proxy_ports', _('Skip Ports'));
        o.default = '1';

        // 规则说明
        s = m.section(form.NamedSection, '_help', 'flowproxy', _('Rule Processing'));
        s.render = function() {
            return E('div', { 'class': 'cbi-section-node' }, [
                E('p', { 'style': 'color: #666; margin-bottom: 10px;' }, 
                    _('Rules are processed in order. Traffic matching any skip condition will bypass proxy.')),
                E('ol', { 'style': 'margin: 0; padding-left: 20px; color: #333;' }, [
                    E('li', {}, _('Check destination type (local/anycast/multicast) → skip')),
                    E('li', {}, _('Check source MAC in list → skip')),
                    E('li', {}, _('Check source IP is proxy server → skip')),
                    E('li', {}, _('Check source IP in list → skip')),
                    E('li', {}, _('Check destination IP in list → skip')),
                    E('li', {}, _('Check destination IP is private → skip')),
                    E('li', {}, _('Check destination IP is China IP → skip')),
                    E('li', {}, _('Check destination port in list → skip')),
                    E('li', {}, _('Mark traffic for proxy'))
                ])
            ]);
        };

        return m.render();
    }
});