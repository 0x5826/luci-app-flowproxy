package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
)

func main() {
	proxyIP := flag.String("proxy-ip", "", "")
	iface := flag.String("interface", "br-lan", "")
	fwMark := flag.Int("mark", 100, "")
	tcpEnabled := flag.Bool("tcp", true, "")
	udpEnabled := flag.Bool("udp", true, "")
	action := flag.String("action", "", "")
	savePath := flag.String("save-path", "/usr/bin/flowproxy-rules.sh", "")
	flag.Parse()

	if *action == "" { flag.Usage(); return }

	// Auto Detection
	var platform Platform = &Linux{}
	if hasFile("/etc/openwrt_release") { platform = &OpenWrt{} }
	var firewall Firewall = &NftablesEngine{}
	if !hasCommand("nft") { firewall = &IptablesEngine{} }

	cfg := Config{
		ProxyIP: *proxyIP, Interface: *iface, FwMark: *fwMark,
		TCPEnabled: *tcpEnabled, UDPEnabled: *udpEnabled,
		ScriptPath: *savePath, ChnrouteURL: defaultChnrouteURL,
	}

	switch *action {
	case "preview":
		checkEnv(platform, firewall); fetchChnroute(&cfg); showPreview(platform, firewall, cfg)
	case "install":
		checkEnv(platform, firewall)
		if cfg.ProxyIP == "" { fmt.Fprintln(os.Stderr, "Error: -proxy-ip required"); os.Exit(1) }
		fetchChnroute(&cfg); doInstall(platform, firewall, cfg)
	case "uninstall":
		doUninstall(platform, firewall, cfg)
	default:
		fmt.Fprintf(os.Stderr, "Unknown action: %s\n", *action)
		os.Exit(1)
	}
}

func showPreview(p Platform, fw Firewall, cfg Config) {
	fmt.Printf("--- Deployment Scheme (%s + %s) ---\n", p.GetName(), fw.GetName())
	p.ShowStrategy(cfg)
	p.ShowStatus()
	fmt.Printf("\n--- Implementation Preview (%d IPs) ---\n", len(cfg.ChnrouteIPs))
	fmt.Println(generateFullScript(cfg, fw, true))
	fmt.Print("Syntax Validation: ")
	if err := fw.Validate(cfg); err == nil { fmt.Println("PASSED") } else { fmt.Println("FAILED") }
}

func doInstall(p Platform, fw Firewall, cfg Config) {
	fmt.Printf("\n=== Installing for %s via %s ===\n", p.GetName(), fw.GetName())
	script := generateFullScript(cfg, fw, false)
	fmt.Print("-> Validating rules... "); if err := fw.Validate(cfg); err != nil { fmt.Printf("FAILED\n"); os.Exit(1) }
	fmt.Println("OK")
	_ = os.WriteFile(cfg.ScriptPath, []byte(script), 0755)
	fmt.Print("-> Applying rules... "); if err := exec.Command("sh", cfg.ScriptPath, "start").Run(); err != nil {
		fmt.Println("FAILED"); _ = exec.Command("sh", cfg.ScriptPath, "stop").Run(); os.Exit(1)
	}
	fmt.Println("DONE")
	_ = p.Install(cfg, fw)
}

func doUninstall(p Platform, fw Firewall, cfg Config) {
	fmt.Printf("\n=== Uninstalling (%s) ===\n", p.GetName())
	if hasFile(cfg.ScriptPath) { 
		fmt.Print("-> Stopping service logic... "); _ = exec.Command("sh", cfg.ScriptPath, "stop").Run(); fmt.Println("DONE") 
	}
	fw.CleanupManual(cfg)
	_ = exec.Command("ip", "rule", "del", "fwmark", fmt.Sprint(cfg.FwMark)).Run()
	_ = exec.Command("ip", "route", "flush", "table", fmt.Sprint(cfg.FwMark)).Run()
	_ = p.Uninstall(cfg, fw)
	_ = os.Remove(cfg.ScriptPath)
	fmt.Println("Uninstall complete.")
}

func generateFullScript(cfg Config, fw Firewall, preview bool) string {
	trans := fw.GenerateTransaction(cfg, preview)
	if fw.GetName() == "nftables" {
		return fmt.Sprintf("#!/bin/sh\ndo_stop() {\n    ip rule del fwmark %d table %d 2>/dev/null\n    ip route flush table %d 2>/dev/null\n    nft delete table inet %s 2>/dev/null\n}\ndo_start() {\n    do_stop\n    ip route add default via %s dev %s table %d\n    ip rule add fwmark %d lookup %d\n    nft -f - <<EOF\n%sEOF\n}\ncase \"$1\" in stop) do_stop ;; *) do_start ;; esac\n", cfg.FwMark, cfg.FwMark, cfg.FwMark, tableName, cfg.ProxyIP, cfg.Interface, cfg.FwMark, cfg.FwMark, cfg.FwMark, trans)
	}
	return trans
}
