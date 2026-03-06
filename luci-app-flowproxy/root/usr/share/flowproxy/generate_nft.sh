#!/bin/sh
# Generate nftables configuration for flowproxy

. /lib/functions.sh

[ -n "$UCI_CONFIG_DIR" ] && export UCI_CONFIG_DIR

CONFIG="flowproxy"
NFT_TABLE="inet flowproxy"
OUTPUT_FILE="/tmp/flowproxy_nft.conf"

ENABLED_SETS=""

# 辅助函数：获取 Set 定义
gen_set_definition() {
    local section="$1"
    local type enabled auto_gen file_path elems is_interval
    
    enabled=$(uci -q get "$CONFIG.$section.enabled")
    [ "$enabled" = "0" ] && return

    ENABLED_SETS="${ENABLED_SETS} @${section}"
    type=$(uci -q get "$CONFIG.$section.type")
    [ -z "$type" ] && type="ipv4_addr"
    
    # 处理特殊预设：私有地址
    if [ "$section" = "private_dst_ip_v4" ]; then
        auto_gen=$(uci -q get "$CONFIG.$section.auto_generate")
        if [ "$auto_gen" = "1" ] || [ -z "$auto_gen" ]; then
            elems="10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16"
        fi
    fi
    
    # 获取 UCI elements 列表
    local uci_elems=""
    for e in $(uci -q get "$CONFIG.$section.elements"); do
        [ -n "$uci_elems" ] && uci_elems="${uci_elems}, "
        uci_elems="${uci_elems}${e}"
    done
    [ -n "$uci_elems" ] && { [ -n "$elems" ] && elems="${elems}, "; elems="${elems}${uci_elems}"; }

    # 获取外部文件元素
    file_path=$(uci -q get "$CONFIG.$section.file_path")
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
        local file_elems=$(get_file_elements "$file_path")
        [ -n "$file_elems" ] && { [ -n "$elems" ] && elems="${elems}, "; elems="${elems}${file_elems}"; }
    fi

    # 自动判断 flags interval
    case "$elems" in */*|*-*) is_interval=1 ;; *) is_interval=0 ;; esac
    [ "$type" = "inet_service" ] && is_interval=1

    printf "    set %s {\n" "$section"
    printf "        type %s\n" "$type"
    [ "$is_interval" = "1" ] && printf "        flags interval\n"
    [ -n "$elems" ] && printf "        elements = { %s }\n" "$elems"
    printf "    }\n\n"
}

get_file_elements() {
    local file_path="$1"
    local elements=""
    [ ! -f "$file_path" ] && return
    while IFS= read -r line; do
        case "$line" in ''|\#*) continue ;; esac
        [ -n "$elements" ] && elements="${elements}, "
        elements="${elements}${line}"
    done < "$file_path"
    echo "$elements"
}

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

    # 安全检查：引用 Set 是否启用
    case "$match_value" in
        @*)
            local set_ref=$(echo "$match_value" | cut -d' ' -f1)
            [ "$set_ref" != "@proxy_server_ip" ] && ! echo "$ENABLED_SETS" | grep -q "$set_ref" && return
            ;;
    esac

    # 清理匹配内容
    match_value=$(echo "$match_value" | sed -E 's/ (return|accept|drop)$//g')
    local seg_tcp=""
    local seg_udp=""

    case "$match_type" in
        src_mac)  seg_tcp="ip saddr != 0.0.0.0 ether saddr $match_value"; seg_udp="ip saddr != 0.0.0.0 ether saddr $match_value" ;;
        src_ip)   seg_tcp="ip saddr $match_value"; seg_udp="ip saddr $match_value" ;;
        dst_ip)   seg_tcp="ip daddr $match_value"; seg_udp="ip daddr $match_value" ;;
        src_port) seg_tcp="ip protocol tcp tcp sport $match_value"; seg_udp="ip protocol udp udp sport $match_value" ;;
        dst_port) seg_tcp="ip protocol tcp tcp dport $match_value"; seg_udp="ip protocol udp udp dport $match_value" ;;
        *)        seg_tcp="ip saddr != 0.0.0.0 $match_value"; seg_udp="ip saddr != 0.0.0.0 $match_value" ;;
    esac

    local line_tcp="$seg_tcp"; [ "$counter" = "1" ] && line_tcp="$line_tcp counter"; line_tcp="$line_tcp $action"
    local line_udp="$seg_udp"; [ "$counter" = "1" ] && line_udp="$line_udp counter"; line_udp="$line_udp $action"

    local proxy_ip=$(uci -q get "$CONFIG.global.proxy_ip")
    line_tcp=$(echo "$line_tcp" | sed "s/@proxy_server_ip/$proxy_ip/g")
    line_udp=$(echo "$line_udp" | sed "s/@proxy_server_ip/$proxy_ip/g")

    [ "$protocol" = "tcp" ] || [ "$protocol" = "both" ] && echo "        $line_tcp" >> "$TCP_RULES_TMP"
    [ "$protocol" = "udp" ] || [ "$protocol" = "both" ] && echo "        $line_udp" >> "$UDP_RULES_TMP"
}

# --- 开始生成 ---
cat > "$OUTPUT_FILE" << EOF
#!/usr/sbin/nft -f
table $NFT_TABLE {
EOF

# 使用 uci show 遍历，确保感知临时缓存
for s in $(uci -q show "$CONFIG" | grep "=nftset" | cut -d'.' -f2 | cut -d'=' -f1); do
    gen_set_definition "$s" >> "$OUTPUT_FILE"
done

for s in $(uci -q show "$CONFIG" | grep "=rule" | cut -d'.' -f2 | cut -d'=' -f1); do
    generate_user_rule "$s"
done

TPROXY_MARK=$(uci -q get "$CONFIG.global.tproxy_mark" || echo "100")
cat >> "$OUTPUT_FILE" << EOF
    chain LAN_MARKFLOW_TCP {
        type filter hook prerouting priority mangle; policy accept;
        meta nfproto != ipv4 return
$(cat "$TCP_RULES_TMP")
        ip protocol tcp meta mark set $TPROXY_MARK
    }

    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority mangle; policy accept;
        meta nfproto != ipv4 return
$(cat "$UDP_RULES_TMP")
        ip protocol udp meta mark set $TPROXY_MARK
    }
}
EOF

rm -f "$TCP_RULES_TMP" "$UDP_RULES_TMP"
cat "$OUTPUT_FILE"
