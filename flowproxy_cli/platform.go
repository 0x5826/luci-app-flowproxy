package main

import (
	"fmt"
	"os"
	"os/exec"
)

type Platform interface {
	GetName() string
	ShowStrategy(cfg Config)
	ShowStatus()
	Install(cfg Config, fw Firewall) error
	Uninstall(cfg Config, fw Firewall) error
}

type OpenWrt struct{}

func (p *OpenWrt) GetName() string { return "OpenWrt" }
func (p *OpenWrt) ShowStrategy(cfg Config) {
	fmt.Println("Strategy: OpenWrt Native Integration")
	fmt.Println("  Install:   1. Persist rule script to " + cfg.ScriptPath + "\n             2. Register include segment in /etc/config/firewall (uci)\n             3. Execute '/etc/init.d/firewall restart'")
	fmt.Println("  Uninstall: 1. Delete 'firewall.flowproxy' uci entry\n             2. Remove " + cfg.ScriptPath + " and reload firewall")
}
func (p *OpenWrt) ShowStatus() {
	fmt.Println("\n--- Current Integration Status ---")
	out, err := exec.Command("uci", "show", "firewall.flowproxy").Output()
	if err == nil { fmt.Print(string(out)) } else { fmt.Println("Status: Not installed") }
}
func (p *OpenWrt) Install(cfg Config, fw Firewall) error {
	_ = exec.Command("uci", "set", "firewall.flowproxy=include").Run()
	_ = exec.Command("uci", "set", "firewall.flowproxy.type=script").Run()
	_ = exec.Command("uci", "set", "firewall.flowproxy.path="+cfg.ScriptPath).Run()
	_ = exec.Command("uci", "set", "firewall.flowproxy.enabled=1").Run()
	_ = exec.Command("uci", "commit", "firewall").Run()
	fmt.Print("-> Registering UCI and reloading firewall... ")
	if err := exec.Command("/etc/init.d/firewall", "restart").Run(); err == nil { fmt.Println("DONE"); return nil }
	return fmt.Errorf("firewall restart failed")
}
func (p *OpenWrt) Uninstall(cfg Config, fw Firewall) error {
	_ = exec.Command("uci", "delete", "firewall.flowproxy").Run()
	_ = exec.Command("uci", "commit", "firewall").Run()
	fmt.Print("-> Removing UCI and reloading firewall... ")
	_ = exec.Command("/etc/init.d/firewall", "restart").Run()
	fmt.Println("DONE")
	return nil
}

type Linux struct{}

func (p *Linux) GetName() string { return "Generic Linux" }
func (p *Linux) ShowStrategy(cfg Config) {
	fmt.Println("Strategy: Linux Systemd Service")
	fmt.Println("  Install:   1. Persist script to " + cfg.ScriptPath + "\n             2. Create /etc/systemd/system/flowproxy.service\n             3. systemctl enable --now flowproxy")
}
func (p *Linux) ShowStatus() {
	fmt.Println("\n--- Current Integration Status ---")
	if _, err := os.Stat("/etc/systemd/system/flowproxy.service"); err != nil {
		fmt.Println("Status: Not installed")
	} else {
		out, _ := exec.Command("systemctl", "is-active", "flowproxy").Output()
		fmt.Printf("Service: Active (%s)", string(out))
	}
}
func (p *Linux) Install(cfg Config, fw Firewall) error {
	unit := fmt.Sprintf("[Unit]\nDescription=Flowproxy\nAfter=network.target\n\n[Service]\nType=oneshot\nRemainAfterExit=yes\nExecStart=%s start\nExecStop=%s stop\n\n[Install]\nWantedBy=multi-user.target\n", cfg.ScriptPath, cfg.ScriptPath)
	_ = os.WriteFile("/etc/systemd/system/flowproxy.service", []byte(unit), 0644)
	fmt.Print("-> Enabling systemd service... ")
	exec.Command("systemctl", "daemon-reload").Run()
	if err := exec.Command("systemctl", "enable", "--now", "flowproxy").Run(); err == nil { fmt.Println("DONE"); return nil }
	return fmt.Errorf("systemctl failed")
}
func (p *Linux) Uninstall(cfg Config, fw Firewall) error {
	fmt.Print("-> Disabling systemd service... ")
	_ = exec.Command("systemctl", "stop", "flowproxy").Run()
	_ = exec.Command("systemctl", "disable", "flowproxy").Run()
	_ = os.Remove("/etc/systemd/system/flowproxy.service")
	_ = exec.Command("systemctl", "daemon-reload").Run()
	fmt.Println("DONE")
	return nil
}
