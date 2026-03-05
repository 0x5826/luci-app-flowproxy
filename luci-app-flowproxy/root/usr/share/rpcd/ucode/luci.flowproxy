#!/usr/bin/ucode
'use strict';

import { access } from 'fs';

const UCI_CONFIG = 'flowproxy';
const LOG_FILE = '/var/log/flowproxy.log';
const NFT_TABLE = 'flowproxy';

function uci_get_config(section, option, default_val) {
    try {
        var cursor = uci.cursor();
        var value = cursor.get(UCI_CONFIG, section, option);
        return value || default_val || '';
    } catch (e) {
        return default_val || '';
    }
}

function check_nft_chain(chain) {
    var ret = system('nft list chain inet ' + NFT_TABLE + ' ' + chain + ' >/dev/null 2>&1');
    return (ret === 0);
}

function get_status() {
    var enabled = parseInt(uci_get_config('global', 'enabled', '0')) || 0;
    var running = check_nft_chain('LAN_MARKFLOW_TCP') ? 1 : 0;

    return {
        enabled: enabled,
        running: running,
        proxy_ip: uci_get_config('global', 'proxy_ip', ''),
        interface: uci_get_config('global', 'interface', 'br-lan'),
        tproxy_mark: uci_get_config('global', 'tproxy_mark', '100')
    };
}

function get_nft_status() {
    return {
        tcp_chain: check_nft_chain('LAN_MARKFLOW_TCP') ? 1 : 0,
        udp_chain: check_nft_chain('LAN_MARKFLOW_UDP') ? 1 : 0
    };
}

function get_logs(args) {
    var lines = (args && args.lines) ? parseInt(args.lines) : 100;
    var logs = [];

    try {
        if (access(LOG_FILE, 'r')) {
            var content = readfile(LOG_FILE);
            if (content) {
                var log_lines = split(content, /\n/);
                var start = Math.max(0, length(log_lines) - lines);
                for (var i = start; i < length(log_lines); i++) {
                    if (log_lines[i]) {
                        push(logs, log_lines[i]);
                    }
                }
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return logs;
}

function clear_logs() {
    try {
        writefile(LOG_FILE, '');
        return true;
    } catch (e) {
        return false;
    }
}

function get_interfaces() {
    var interfaces = [];

    try {
        var net_dir = listdir('/sys/class/net');
        if (net_dir) {
            for (var i = 0; i < length(net_dir); i++) {
                var name = net_dir[i];
                var mac = '';
                try {
                    mac = trim(readfile('/sys/class/net/' + name + '/address'));
                } catch (e) {
                    mac = '';
                }
                push(interfaces, { name: name, mac: mac });
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return interfaces;
}

function start_service() {
    var ret = system('/etc/init.d/flowproxy start >/dev/null 2>&1');
    return (ret === 0);
}

function stop_service() {
    var ret = system('/etc/init.d/flowproxy stop >/dev/null 2>&1');
    return (ret === 0);
}

function restart_service() {
    var ret = system('/etc/init.d/flowproxy restart >/dev/null 2>&1');
    return (ret === 0);
}

function generate_nft_config() {
    var ret = system('/usr/share/flowproxy/generate_nft.sh >/dev/null 2>&1');
    try {
        if (access('/tmp/flowproxy_nft.conf', 'r')) {
            return trim(readfile('/tmp/flowproxy_nft.conf'));
        }
    } catch (e) {
        // Ignore errors
    }
    return '';
}

return {
    'luci.flowproxy': {
        get_status: get_status,
        get_nft_status: get_nft_status,
        get_logs: get_logs,
        clear_logs: clear_logs,
        get_interfaces: get_interfaces,
        start_service: start_service,
        stop_service: stop_service,
        restart_service: restart_service,
        generate_nft_config: generate_nft_config
    }
};
