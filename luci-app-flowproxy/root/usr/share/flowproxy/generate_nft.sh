#!/bin/sh
# Generate nftables configuration for flowproxy

. /lib/functions.sh
. /lib/functions/config.sh

CONFIG="flowproxy"
NFT_TABLE="inet flowproxy"
OUTPUT_FILE="/tmp/flowproxy_nft.conf"

# 读取配置
get_config() {
    uci get "$CONFIG.$1.$2" 2>/dev/null || echo "$3"
}

# 获取私有地址配置
get_private_ips() {
    local auto_generate
    config_load "$CONFIG"
    config_get auto_generate "private_dst_ip_v4" auto_generate "0"
    if [ "$auto_generate" = "1" ]; then
        echo "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16"
    else
        # 从 elements 读取
        local elements=""
        config_list_foreach "private_dst_ip_v4" "elements" append_element
        echo "$elements"
    fi
}

append_element() {
    local elem="$1"
    [ -n "$elements" ] && elements="${elements}, "
    elements="${elements}${elem}"
}

PROXY_IP=$(get_config "global" "proxy_ip" "")
INTERFACE=$(get_config "global" "interface" "br-lan")
TPROXY_MARK=$(get_config "global" "tproxy_mark" "100")
PRIVATE_IPS=$(get_private_ips)

# Initialize temporary rule files
TCP_RULES="/tmp/flowproxy_tcp_rules.tmp"
UDP_RULES="/tmp/flowproxy_udp_rules.tmp"
echo "" > "$TCP_RULES"
echo "" > "$UDP_RULES"

generate_user_rule() {
    local section="$1"
    local name enabled protocol content
    config_get name "$section" name
    config_get_bool enabled "$section" enabled 1
    config_get protocol "$section" protocol "both"
    config_get content "$section" content ""

    [ "$enabled" = "0" ] && return
    [ -z "$content" ] && return

    # Replace @proxy_server_ip with actual IP if found in content
    # (Optional: user can also just write the IP directly, but this is a helper)
    content=$(echo "$content" | sed "s/@proxy_server_ip/$PROXY_IP/g")

    if [ "$protocol" = "tcp" ] || [ "$protocol" = "both" ]; then
        echo "        $content" >> "$TCP_RULES"
    fi
    if [ "$protocol" = "udp" ] || [ "$protocol" = "both" ]; then
        echo "        $content" >> "$UDP_RULES"
    fi
}

config_load "$CONFIG"
config_foreach generate_user_rule "rule"

cat > "$OUTPUT_FILE" << EOF
#!/usr/sbin/nft -f

# Flush existing rules
delete table $NFT_TABLE

# Create table
table $NFT_TABLE {
    # Sets for traffic matching
    set no_proxy_src_mac {
        type ether_addr
        comment "Source MAC addresses that bypass proxy"
    }

    set no_proxy_src_ip_v4 {
        type ipv4_addr
        comment "Source IPv4 addresses that bypass proxy"
    }

    set no_proxy_dst_ip_v4 {
        type ipv4_addr
        comment "Destination IPv4 addresses that bypass proxy"
    }

    set private_dst_ip_v4 {
        type ipv4_addr
        comment "Private IP ranges"
        elements = { $PRIVATE_IPS }
    }

    set chnroute_dst_ip_v4 {
        type ipv4_addr
        comment "China IP ranges"
    }

    set no_proxy_dst_tcp_ports {
        type inet_service
        comment "TCP ports that bypass proxy"
    }

    set no_proxy_dst_udp_ports {
        type inet_service
        comment "UDP ports that bypass proxy"
    }

    # Chain for marking TCP traffic
    chain LAN_MARKFLOW_TCP {
        type filter hook prerouting priority mangle; policy accept;
$(cat "$TCP_RULES")
        # Default action: Mark remaining traffic for proxy
        meta mark set $TPROXY_MARK
    }

    # Chain for marking UDP traffic
    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority mangle; policy accept;
$(cat "$UDP_RULES")
        # Default action: Mark remaining traffic for proxy
        meta mark set $TPROXY_MARK
    }
}
EOF

# Clean up
rm -f "$TCP_RULES" "$UDP_RULES"

# Output for verification/debugging
cat "$OUTPUT_FILE"
