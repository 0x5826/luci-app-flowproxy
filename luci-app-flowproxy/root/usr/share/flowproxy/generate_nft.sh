#!/bin/sh
# Generate nftables configuration for flowproxy

. /lib/functions.sh

CONFIG="flowproxy"
NFT_TABLE="inet flowproxy"
OUTPUT_FILE="/tmp/flowproxy_nft.conf"

# 读取全局配置
get_config() {
    uci -q get "$CONFIG.$1.$2" || echo "$3"
}

# 辅助函数：将 UCI list 转换为 nft 元素列表
get_set_elements() {
    local section="$1"
    local elements=""
    
    append_element() {
        local elem="$1"
        [ -n "$elements" ] && elements="${elements}, "
        elements="${elements}${elem}"
    }
    
    config_list_foreach "$section" "elements" append_element
    echo "$elements"
}

# 辅助函数：从文件读取元素
get_file_elements() {
    local file_path="$1"
    [ ! -f "$file_path" ] && return
    
    local elements=""
    while IFS= read -r line; do
        case "$line" in ''|\#*) continue ;; esac
        [ -n "$elements" ] && elements="${elements}, "
        elements="${elements}${line}"
    done < "$file_path"
    echo "$elements"
}

# 获取私有地址配置
get_private_ips() {
    local auto_generate
    auto_generate=$(uci -q get "$CONFIG.private_dst_ip_v4.auto_generate")
    if [ "$auto_generate" = "1" ]; then
        echo "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16"
    else
        get_set_elements "private_dst_ip_v4"
    fi
}

PROXY_IP=$(get_config "global" "proxy_ip" "")
TPROXY_MARK=$(get_config "global" "tproxy_mark" "100")

# 提取各个集合的数据
SRC_MAC_ELEMS=$(get_set_elements "no_proxy_src_mac")
SRC_IP_ELEMS=$(get_set_elements "no_proxy_src_ip_v4")
DST_IP_ELEMS=$(get_set_elements "no_proxy_dst_ip_v4")
PRIVATE_IPS=$(get_private_ips)
TCP_PORT_ELEMS=$(get_set_elements "no_proxy_dst_tcp_ports")
UDP_PORT_ELEMS=$(get_set_elements "no_proxy_dst_udp_ports")

# 处理 chnroute 文件
CHNROUTE_FILE=$(get_config "chnroute_dst_ip_v4" "file_path" "/usr/share/flowproxy/chnroute.txt")
CHNROUTE_ELEMS=$(get_file_elements "$CHNROUTE_FILE")

# 初始化规则临时文件
TCP_RULES_TMP="/tmp/flowproxy_tcp_rules.tmp"
UDP_RULES_TMP="/tmp/flowproxy_udp_rules.tmp"
echo "" > "$TCP_RULES_TMP"
echo "" > "$UDP_RULES_TMP"

generate_user_rule() {
    local section="$1"
    local enabled protocol match_type match_value action counter
    
    enabled=$(uci -q get "$CONFIG.$section.enabled")
    [ "$enabled" = "0" ] && return
    
    protocol=$(uci -q get "$CONFIG.$section.protocol")
    [ -z "$protocol" ] && protocol="both"
    
    match_type=$(uci -q get "$CONFIG.$section.match_type")
    match_value=$(uci -q get "$CONFIG.$section.match_value")
    action=$(uci -q get "$CONFIG.$section.action")
    [ -z "$action" ] && action="return"
    
    counter=$(uci -q get "$CONFIG.$section.counter")

    [ -z "$match_value" ] && return

    local seg_tcp=""
    local seg_udp=""

    case "$match_type" in
        src_mac)  seg_tcp="ether saddr $match_value"; seg_udp="ether saddr $match_value" ;;
        src_ip)   seg_tcp="ip saddr $match_value"; seg_udp="ip saddr $match_value" ;;
        dst_ip)   seg_tcp="ip daddr $match_value"; seg_udp="ip daddr $match_value" ;;
        src_port) seg_tcp="tcp sport $match_value"; seg_udp="udp sport $match_value" ;;
        dst_port) seg_tcp="tcp dport $match_value"; seg_udp="udp dport $match_value" ;;
        *)        seg_tcp="$match_value"; seg_udp="$match_value" ;;
    esac

    local line_tcp="$seg_tcp"; [ "$counter" = "1" ] && line_tcp="$line_tcp counter"; line_tcp="$line_tcp $action"
    local line_udp="$seg_udp"; [ "$counter" = "1" ] && line_udp="$line_udp counter"; line_udp="$line_udp $action"

    line_tcp=$(echo "$line_tcp" | sed "s/@proxy_server_ip/$PROXY_IP/g")
    line_udp=$(echo "$line_udp" | sed "s/@proxy_server_ip/$PROXY_IP/g")

    if [ "$protocol" = "tcp" ] || [ "$protocol" = "both" ]; then
        echo "        $line_tcp" >> "$TCP_RULES_TMP"
    fi
    if [ "$protocol" = "udp" ] || [ "$protocol" = "both" ]; then
        echo "        $line_udp" >> "$UDP_RULES_TMP"
    fi
}

# 遍历所有 rule 类型
for s in $(uci show "$CONFIG" | grep "=rule" | cut -d'.' -f2 | cut -d'=' -f1); do
    generate_user_rule "$s"
done

# 生成最终配置文件
cat > "$OUTPUT_FILE" << EOF
#!/usr/sbin/nft -f

delete table $NFT_TABLE 2>/dev/null

table $NFT_TABLE {
    set no_proxy_src_mac { type ether_addr; elements = { $SRC_MAC_ELEMS }; }
    set no_proxy_src_ip_v4 { type ipv4_addr; elements = { $SRC_IP_ELEMS }; }
    set no_proxy_dst_ip_v4 { type ipv4_addr; elements = { $DST_IP_ELEMS }; }
    set private_dst_ip_v4 { type ipv4_addr; elements = { $PRIVATE_IPS }; }
    set chnroute_dst_ip_v4 { type ipv4_addr; elements = { $CHNROUTE_ELEMS }; }
    set no_proxy_dst_tcp_ports { type inet_service; elements = { $TCP_PORT_ELEMS }; }
    set no_proxy_dst_udp_ports { type inet_service; elements = { $UDP_PORT_ELEMS }; }

    chain LAN_MARKFLOW_TCP {
        type filter hook prerouting priority mangle; policy accept;
$(cat "$TCP_RULES_TMP")
        meta mark set $TPROXY_MARK
    }

    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority mangle; policy accept;
$(cat "$UDP_RULES_TMP")
        meta mark set $TPROXY_MARK
    }
}
EOF

rm -f "$TCP_RULES_TMP" "$UDP_RULES_TMP"
cat "$OUTPUT_FILE"
