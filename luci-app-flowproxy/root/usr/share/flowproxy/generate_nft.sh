#!/bin/sh
# Generate nftables configuration for flowproxy

. /lib/functions.sh

CONFIG="flowproxy"
NFT_TABLE="inet flowproxy"
OUTPUT_FILE="/tmp/flowproxy_nft.conf"

# 读取配置
get_config() {
    uci get "$CONFIG.$1.$2" 2>/dev/null || echo "$3"
}

PROXY_IP=$(get_config "global" "proxy_ip" "")
INTERFACE=$(get_config "global" "interface" "br-lan")
TPROXY_MARK=$(get_config "global" "tproxy_mark" "100")

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
        elements = {
            10.0.0.0/8,
            172.16.0.0/12,
            192.168.0.0/16
        }
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

        # Skip if destination is local/anycast/multicast
        meta nfproto ipv4 ip daddr type { local, anycast, multicast } return

        # Skip if source MAC is in no_proxy list
        ether saddr @no_proxy_src_mac return

        # Skip if source IP is proxy server
        ip saddr $PROXY_IP return

        # Skip if source IP is in no_proxy list
        ip saddr @no_proxy_src_ip_v4 return

        # Skip if destination IP is in no_proxy list
        ip daddr @no_proxy_dst_ip_v4 return

        # Skip if destination IP is private
        ip daddr @private_dst_ip_v4 return

        # Skip if destination IP is China IP
        ip daddr @chnroute_dst_ip_v4 return

        # Skip if destination port is in no_proxy list
        tcp dport @no_proxy_dst_tcp_ports return

        # Mark remaining traffic for proxy
        meta mark set $TPROXY_MARK
    }

    # Chain for marking UDP traffic
    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority mangle; policy accept;

        # Skip if destination is local/anycast/multicast
        meta nfproto ipv4 ip daddr type { local, anycast, multicast } return

        # Skip if source MAC is in no_proxy list
        ether saddr @no_proxy_src_mac return

        # Skip if source IP is proxy server
        ip saddr $PROXY_IP return

        # Skip if source IP is in no_proxy list
        ip saddr @no_proxy_src_ip_v4 return

        # Skip if destination IP is in no_proxy list
        ip daddr @no_proxy_dst_ip_v4 return

        # Skip if destination IP is private
        ip daddr @private_dst_ip_v4 return

        # Skip if destination IP is China IP
        ip daddr @chnroute_dst_ip_v4 return

        # Skip if destination port is in no_proxy list
        udp dport @no_proxy_dst_udp_ports return

        # Mark remaining traffic for proxy
        meta mark set $TPROXY_MARK
    }
}
EOF

cat "$OUTPUT_FILE"
