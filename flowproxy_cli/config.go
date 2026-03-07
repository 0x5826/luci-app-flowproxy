package main

const (
	defaultChnrouteURL = "https://ghproxy.seckv.com/https://raw.githubusercontent.com/mayaxcn/china-ip-list/master/chnroute.txt"
	tableName          = "flowproxy"
	setPrivate         = "private_dst_ip_v4"
	setChnroute        = "chnroute_dst_ip_v4"
)

var defaultPrivateIPs = []string{
	"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
	"127.0.0.0/8", "169.254.0.0/16", "224.0.0.0/4", "240.0.0.0/4",
}

type Config struct {
	ProxyIP       string
	Interface     string
	FwMark        int
	TCPEnabled    bool
	UDPEnabled    bool
	ScriptPath    string
	ChnrouteURL   string
	ChnrouteIPs   []string
}
