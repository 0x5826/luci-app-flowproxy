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

# 辅助函数：生成 set 定义
gen_set_definition() {
    local section="$1"
    local name type enabled auto_gen file_path elems is_interval
    
    config_get_bool enabled "$section" enabled 1
    [ "$enabled" = "0" ] && return

    # 使用 section 名作为 nftables set 名
    name="$section"
    config_get type "$section" type "ipv4_addr"
    
    # 获取元素
    if [ "$section" = "private_dst_ip_v4" ]; then
        config_get_bool auto_gen "$section" auto_generate 1
        [ "$auto_gen" = "1" ] && elems="10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16"
    fi
    
    # 叠加 UCI elements 列表
    local uci_elems=$(get_set_elements "$section")
    if [ -n "$uci_elems" ]; then
        [ -n "$elems" ] && elems="${elems}, "
        elems="${elems}${uci_elems}"
    fi

    # 叠加外部文件元素 (如 chnroute)
    config_get file_path "$section" file_path
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
        local file_elems=$(get_file_elements "$file_path")
        if [ -n "$file_elems" ]; then
            [ -n "$elems" ] && elems="${elems}, "
            elems="${elems}${file_elems}"
        fi
    fi

    # 自动判断是否需要 flags interval (包含 / 或 - 的通常需要)
    case "$elems" in */*|*-*) is_interval=1 ;; *) is_interval=0 ;; esac
    # 端口类型通常也建议开启 interval 以支持范围
    [ "$type" = "inet_service" ] && is_interval=1

    printf "    set %s {\n" "$name"
    printf "        type %s\n" "$type"
    [ "$is_interval" = "1" ] && printf "        flags interval\n"
    [ -n "$elems" ] && printf "        elements = { %s }\n" "$elems"
    printf "    }\n\n"
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
    local elements=""
    while IFS= read -r line; do
        case "$line" in ''|\#*) continue ;; esac
        [ -n "$elements" ] && elements="${elements}, "
        elements="${elements}${line}"
    done < "$file_path"
    echo "$elements"
}

# 初始化规则临时文件
TCP_RULES_TMP="/tmp/flowproxy_tcp_rules.tmp"
UDP_RULES_TMP="/tmp/flowproxy_udp_rules.tmp"
echo "" > "$TCP_RULES_TMP"
echo "" > "$UDP_RULES_TMP"

generate_user_rule() {
    local section="$1"
    local enabled protocol match_type match_value action counter
    config_get_bool enabled "$section" enabled 1
    [ "$enabled" = "0" ] && return
    
    config_get protocol "$section" protocol "both"
    config_get match_type "$section" match_type "custom"
    config_get match_value "$section" match_value ""
    config_get action "$section" action "return"
    config_get_bool counter "$section" counter 0
    [ -z "$match_value" ] && return

    match_value=$(echo "$match_value" | sed -E 's/ (return|accept|drop)$//g')
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

    PROXY_IP=$(uci -q get "$CONFIG.global.proxy_ip")
    line_tcp=$(echo "$line_tcp" | sed "s/@proxy_server_ip/$PROXY_IP/g")
    line_udp=$(echo "$line_udp" | sed "s/@proxy_server_ip/$PROXY_IP/g")

    if [ "$protocol" = "tcp" ] || [ "$protocol" = "both" ]; then
        echo "        $line_tcp" >> "$TCP_RULES_TMP"
    fi
    if [ "$protocol" = "udp" ] || [ "$protocol" = "both" ]; then
        echo "        $line_udp" >> "$UDP_RULES_TMP"
    fi
}

# 开始构建输出内容
cat > "$OUTPUT_FILE" << EOF
#!/usr/sbin/nft -f
delete table $NFT_TABLE 2>/dev/null
table $NFT_TABLE {
EOF

# 动态生成所有 nftset 定义
config_load "$CONFIG"
config_foreach gen_set_definition "nftset" >> "$OUTPUT_FILE"

# 生成所有规则
config_foreach generate_user_rule "rule"

TPROXY_MARK=$(get_config "global" "tproxy_mark" "100")
cat >> "$OUTPUT_FILE" << EOF
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
