#!/bin/sh
# Generate nftables configuration for flowproxy

. /lib/functions.sh
. /lib/functions/config.sh

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
    config_get_bool auto_generate "private_dst_ip_v4" auto_generate 1
    if [ "$auto_generate" -eq 1 ]; then
        echo "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16"
    else
        get_set_elements "private_dst_ip_v4"
    fi
}

PROXY_IP=$(get_config "global" "proxy_ip" "")
TPROXY_MARK=$(get_config "global" "tproxy_mark" "100")

# 提取各个集合的数据
config_load "$CONFIG"
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
    config_get_bool enabled "$section" enabled 1
    config_get protocol "$section" protocol "both"
    config_get match_type "$section" match_type "custom"
    config_get match_value "$section" match_value ""
    config_get action "$section" action "return"
    config_get_bool counter "$section" counter 0

    [ "$enabled" -eq 0 ] || [ -z "$match_value" ] && return

    local segment_tcp=""
    local segment_udp=""

    case "$match_type" in
        src_mac)  segment_tcp="ether saddr $match_value"; segment_udp="ether saddr $match_value" ;;
        src_ip)   segment_tcp="ip saddr $match_value"; segment_udp="ip saddr $match_value" ;;
        dst_ip)   segment_tcp="ip daddr $match_value"; segment_udp="ip daddr $match_value" ;;
        src_port) segment_tcp="tcp sport $match_value"; segment_udp="udp sport $match_value" ;;
        dst_port) segment_tcp="tcp dport $match_value"; segment_udp="udp dport $match_value" ;;
        *)        segment_tcp="$match_value"; segment_udp="$match_value" ;; # custom
    esac

    # 附加计数器和动作
    local line_tcp="$segment_tcp"
    local line_udp="$segment_udp"
    [ "$counter" -eq 1 ] && line_tcp="$line_tcp counter" && line_udp="$line_udp counter"
    line_tcp="$line_tcp $action"
    line_udp="$line_udp $action"

    # 变量替换
    line_tcp=$(echo "$line_tcp" | sed "s/@proxy_server_ip/$PROXY_IP/g")
    line_udp=$(echo "$line_udp" | sed "s/@proxy_server_ip/$PROXY_IP/g")

    if [ "$protocol" = "tcp" ] || [ "$protocol" = "both" ]; then
        echo "        $line_tcp" >> "$TCP_RULES_TMP"
    fi
    if [ "$protocol" = "udp" ] || [ "$protocol" = "both" ]; then
        echo "        $line_udp" >> "$UDP_RULES_TMP"
    fi
}

config_foreach generate_user_rule "rule"

# 生成最终配置文件
cat > "$OUTPUT_FILE" << EOF
#!/usr/sbin/nft -f

# 清理旧表
delete table $NFT_TABLE 2>/dev/null

# 创建表
table $NFT_TABLE {
    # 名单集合
    set no_proxy_src_mac {
        type ether_addr
        elements = { $SRC_MAC_ELEMS }
        comment "不代理的源MAC地址"
    }

    set no_proxy_src_ip_v4 {
        type ipv4_addr
        elements = { $SRC_IP_ELEMS }
        comment "不代理的源IPv4地址"
    }

    set no_proxy_dst_ip_v4 {
        type ipv4_addr
        elements = { $DST_IP_ELEMS }
        comment "不代理的目标IPv4地址"
    }

    set private_dst_ip_v4 {
        type ipv4_addr
        elements = { $PRIVATE_IPS }
        comment "私有IPv4地址段"
    }

    set chnroute_dst_ip_v4 {
        type ipv4_addr
        elements = { $CHNROUTE_ELEMS }
        comment "中国IPv4地址段"
    }

    set no_proxy_dst_tcp_ports {
        type inet_service
        elements = { $TCP_PORT_ELEMS }
        comment "不代理的TCP端口"
    }

    set no_proxy_dst_udp_ports {
        type inet_service
        elements = { $UDP_PORT_ELEMS }
        comment "不代理的UDP端口"
    }

    # TCP 标记链
    chain LAN_MARKFLOW_TCP {
        type filter hook prerouting priority mangle; policy accept;
$(cat "$TCP_RULES_TMP")
        # 默认打标
        meta mark set $TPROXY_MARK
    }

    # UDP 标记链
    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority mangle; policy accept;
$(cat "$UDP_RULES_TMP")
        # 默认打标
        meta mark set $TPROXY_MARK
    }
}
EOF

# 清理临时文件
rm -f "$TCP_RULES_TMP" "$UDP_RULES_TMP"

# 输出内容（供预览使用）
cat "$OUTPUT_FILE"
