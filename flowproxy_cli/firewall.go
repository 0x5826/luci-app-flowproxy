package main

import (
	"fmt"
	"os/exec"
	"strings"
)

type Firewall interface {
	GetName() string
	GenerateTransaction(cfg Config, preview bool) string
	Validate(cfg Config) error
	CleanupManual(cfg Config)
}

type NftablesEngine struct{}

func (e *NftablesEngine) GetName() string { return "nftables" }
func (e *NftablesEngine) GenerateTransaction(cfg Config, preview bool) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("table inet %s {\n", tableName))
	sb.WriteString(fmt.Sprintf("\tset %s { type ipv4_addr; flags interval; elements = { %s }; }\n", setPrivate, strings.Join(defaultPrivateIPs, ", ")))
	chn := ""; if preview && len(cfg.ChnrouteIPs) > 10 {
		chn = fmt.Sprintf("%s, ... (+%d more), %s", strings.Join(cfg.ChnrouteIPs[:5], ", "), len(cfg.ChnrouteIPs)-10, strings.Join(cfg.ChnrouteIPs[len(cfg.ChnrouteIPs)-5:], ", "))
	} else { chn = strings.Join(cfg.ChnrouteIPs, ", ") }
	sb.WriteString(fmt.Sprintf("\tset %s { type ipv4_addr; flags interval; elements = { %s }; }\n", setChnroute, chn))
	sb.WriteString("\tset no_proxy_src_mac { type ether_addr; }\n\tset no_proxy_src_ip_v4 { type ipv4_addr; flags interval; }\n\tset no_proxy_dst_ip_v4 { type ipv4_addr; flags interval; }\n\tset no_proxy_dst_tcp_ports { type inet_service; }\n\tset no_proxy_dst_udp_ports { type inet_service; }\n\n")
	for _, p := range []string{"tcp", "udp"} {
		if (p == "tcp" && cfg.TCPEnabled) || (p == "udp" && cfg.UDPEnabled) {
			sb.WriteString(fmt.Sprintf("\tchain LAN_MARKFLOW_%s {\n\t\ttype filter hook prerouting priority mangle; policy accept;\n\t\tfib daddr type { unspec, local, anycast, multicast } counter return\n\t\tether saddr @no_proxy_src_mac ip protocol %s counter return\n\t\tip saddr %s ip protocol %s counter return\n\t\tip saddr @no_proxy_src_ip_v4 ip protocol %s counter return\n\t\tip daddr @no_proxy_dst_ip_v4 ip protocol %s counter return\n\t\tip daddr @%s ip protocol %s counter return\n\t\tip daddr @%s ip protocol %s counter return\n\t\tip protocol %s %s dport @no_proxy_dst_%s_ports counter return\n\t\tip protocol %s counter meta mark set %d\n\t}\n", strings.ToUpper(p), p, cfg.ProxyIP, p, p, p, setPrivate, p, setChnroute, p, p, p, p, p, cfg.FwMark))
		}
	}
	sb.WriteString("}\n")
	return sb.String()
}
func (e *NftablesEngine) Validate(cfg Config) error {
	cmd := exec.Command("nft", "-c", "-f", "-")
	cmd.Stdin = strings.NewReader(e.GenerateTransaction(cfg, false))
	return cmd.Run()
}
func (e *NftablesEngine) CleanupManual(cfg Config) { _ = exec.Command("nft", "delete", "table", "inet", tableName).Run() }

type IptablesEngine struct{}

func (e *IptablesEngine) GetName() string { return "iptables+ipset" }
func (e *IptablesEngine) GenerateTransaction(cfg Config, preview bool) string {
	var sb strings.Builder
	sb.WriteString("ipset create " + setPrivate + " hash:net 2>/dev/null\n")
	for _, ip := range defaultPrivateIPs { sb.WriteString("ipset add " + setPrivate + " " + ip + "\n") }
	sb.WriteString("ipset create " + setChnroute + " hash:net 2>/dev/null\n")
	if preview && len(cfg.ChnrouteIPs) > 10 { sb.WriteString("# ... (+more chnroute IPs omitted) ...\n")
	} else { for _, ip := range cfg.ChnrouteIPs { sb.WriteString("ipset add " + setChnroute + " " + ip + "\n") } }
	sb.WriteString("iptables -t mangle -N FLOWPROXY 2>/dev/null\n")
	sb.WriteString("iptables -t mangle -A FLOWPROXY -s " + cfg.ProxyIP + " -j RETURN\n")
	sb.WriteString("iptables -t mangle -A FLOWPROXY -m set --match-set " + setPrivate + " dst -j RETURN\n")
	sb.WriteString("iptables -t mangle -A FLOWPROXY -m set --match-set " + setChnroute + " dst -j RETURN\n")
	sb.WriteString(fmt.Sprintf("iptables -t mangle -A FLOWPROXY -j MARK --set-mark %d\n", cfg.FwMark))
	if cfg.TCPEnabled { sb.WriteString("iptables -t mangle -A PREROUTING -p tcp -j FLOWPROXY\n") }
	if cfg.UDPEnabled { sb.WriteString("iptables -t mangle -A PREROUTING -p udp -j FLOWPROXY\n") }
	return sb.String()
}
func (e *IptablesEngine) Validate(cfg Config) error { return nil }
func (e *IptablesEngine) CleanupManual(cfg Config) {
	_ = exec.Command("iptables", "-t", "mangle", "-F", "FLOWPROXY").Run()
	_ = exec.Command("iptables", "-t", "mangle", "-X", "FLOWPROXY").Run()
	_ = exec.Command("ipset", "destroy", setChnroute).Run()
	_ = exec.Command("ipset", "destroy", setPrivate).Run()
}
