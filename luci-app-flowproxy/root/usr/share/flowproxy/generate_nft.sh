#!/bin/sh
# Generate nftables configuration for flowproxy

. /lib/functions.sh

[ -n "$UCI_CONFIG_DIR" ] && export UCI_CONFIG_DIR

CONFIG="flowproxy"
NFT_TABLE="inet flowproxy"
OUTPUT_FILE="/tmp/flowproxy_nft.conf"

ENABLED_SETS=""

# 辅助函数
get_config() {
    uci -q get "$CONFIG.$1.$2" || echo "$3"
}

# 辅助函数：生成 set 定义
gen_set_definition() {
    local section="$1"
    local type enabled auto_gen file_path elems is_interval
    
    enabled=$(uci -q get "$CONFIG.$section.enabled")
    [ "$enabled" = "0" ] && return

    ENABLED_SETS="${ENABLED_SETS} @${section}"
    type=$(uci -q get "$CONFIG.$section.type")
    [ -z "$type" ] && type="ipv4_addr"
    
    if [ "$section" = "private_dst_ip_v4" ]; then
        auto_gen=$(uci -q get "$CONFIG.$section.auto_generate")
        if [ "$auto_gen" = "1" ] || [ -z "$auto_gen" ]; then
            elems="10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16"
        fi
    fi
    
    local uci_elems=""
    for e in $(uci -q get "$CONFIG.$section.elements"); do
        [ -n "$uci_elems" ] && uci_elems="${uci_elems}, "
        uci_elems="${uci_elems}${e}"
    done
    [ -n "$uci_elems" ] && { [ -n "$elems" ] && elems="${elems}, "; elems="${elems}${uci_elems}"; }

    file_path=$(uci -q get "$CONFIG.$section.file_path")
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
        local file_elems=$(get_file_elements "$file_path")
        [ -n "$file_elems" ] && { [ -n "$elems" ] && elems="${elems}, "; elems="${elems}${file_elems}"; }
    fi

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

process_rule() {
    local section="$1"
    local proto="$2"
    local enabled match_type match_value action counter
    
    enabled=$(uci -q get "$CONFIG.$section.enabled")
    [ "$enabled" = "0" ] && return
    
    match_type=$(uci -q get "$CONFIG.$section.match_type")
    match_value=$(uci -q get "$CONFIG.$section.match_value")
    action=$(uci -q get "$CONFIG.$section.action")
    [ -z "$action" ] && action="return"
    counter=$(uci -q get "$CONFIG.$section.counter")
    [ -z "$match_value" ] && return

    case "$match_value" in
        @*)
            local set_ref=$(echo "$match_value" | cut -d' ' -f1)
            if [ "$set_ref" = "@proxy_server_ip" ]; then
                local proxy_ip=$(uci -q get "$CONFIG.global.proxy_ip")
                [ -z "$proxy_ip" ] && return
            else
                echo "$ENABLED_SETS" | grep -q "$set_ref" || return
            fi
            ;;
    esac

    match_value=$(echo "$match_value" | sed -E 's/ (return|accept|drop)$//g')
    local segment=""

    case "$match_type" in
        src_mac)  segment="ether saddr $match_value ip protocol $proto" ;;
        src_ip)   segment="ip saddr $match_value ip protocol $proto" ;;
        dst_ip)   segment="ip daddr $match_value ip protocol $proto" ;;
        src_port) segment="ip protocol $proto $proto sport $match_value" ;;
        dst_port) segment="ip protocol $proto $proto dport $match_value" ;;
        *)        segment="$match_value" ;;
    esac

    local line="$segment"
    [ "$counter" = "1" ] && line="$line counter"
    line="$line $action"

    local proxy_ip_final=$(uci -q get "$CONFIG.global.proxy_ip")
    # 使用管道符作为 sed 界定符，防止内容包含斜杠导致的崩溃
    line=$(echo "$line" | sed "s|@proxy_server_ip|$proxy_ip_final|g")

    [ -n "$line" ] && echo "        $line"
}

cat > "$OUTPUT_FILE" << EOF
#!/usr/sbin/nft -f
table $NFT_TABLE {
EOF

config_load "$CONFIG"
for s in $(uci -q show "$CONFIG" | grep "=nftset" | cut -d'.' -f2 | cut -d'=' -f1); do
    gen_set_definition "$s" >> "$OUTPUT_FILE"
done

cat >> "$OUTPUT_FILE" << EOF
    chain LAN_MARKFLOW_TCP {
        type filter hook prerouting priority mangle; policy accept;
        meta nfproto != ipv4 return
EOF
for s in $(uci -q show "$CONFIG" | grep "=tcp_rule" | cut -d'.' -f2 | cut -d'=' -f1); do
    process_rule "$s" "tcp" >> "$OUTPUT_FILE"
done
TPROXY_MARK=$(uci -q get "$CONFIG.global.tproxy_mark" || echo "100")
cat >> "$OUTPUT_FILE" << EOF
        ip protocol tcp counter meta mark set $TPROXY_MARK
    }

    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority mangle; policy accept;
        meta nfproto != ipv4 return
EOF
for s in $(uci -q show "$CONFIG" | grep "=udp_rule" | cut -d'.' -f2 | cut -d'=' -f1); do
    process_rule "$s" "udp" >> "$OUTPUT_FILE"
done
cat >> "$OUTPUT_FILE" << EOF
        ip protocol udp counter meta mark set $TPROXY_MARK
    }
}
EOF

rm -f /tmp/flowproxy_tcp_rules.tmp /tmp/flowproxy_udp_rules.tmp 2>/dev/null
cat "$OUTPUT_FILE"
