package main

import (
	"bufio"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

func checkEnv(p Platform, fw Firewall) {
	if os.Geteuid() != 0 { fmt.Fprintln(os.Stderr, "[ERROR] Must run as root"); os.Exit(1) }
	if fw.GetName() == "iptables+ipset" && !hasCommand("ipset") { fmt.Fprintln(os.Stderr, "[ERROR] Missing 'ipset'"); os.Exit(1) }
}

func fetchChnroute(cfg *Config) {
	fmt.Printf("Fetching chnroute... ")
	c := http.Client{Timeout: 10 * time.Second}; r, err := c.Get(cfg.ChnrouteURL); if err != nil { fmt.Printf("FAILED\n"); os.Exit(1) }
	defer r.Body.Close(); s := bufio.NewScanner(r.Body)
	for s.Scan() { line := strings.TrimSpace(s.Text()); if line != "" && !strings.HasPrefix(line, "#") { cfg.ChnrouteIPs = append(cfg.ChnrouteIPs, line) } }
	fmt.Printf("OK (%d IPs)\n", len(cfg.ChnrouteIPs))
}

func hasCommand(cmd string) bool { _, err := exec.LookPath(cmd); return err == nil }
func hasFile(path string) bool { _, err := os.Stat(path); return err == nil }
