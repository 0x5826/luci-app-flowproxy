# FlowProxy - LuCI Traffic Diversion Application

基于 nftables 的 LuCI 流量分流应用，用于在路由器/网关上按照特定规则分流部分流量到指定的代理软件。

## 功能特性

- **设置模块**：规则的启停控制、变量配置、运行状态监控和日志管理
- **规则管理**：管理 nftables 规则的优先级顺序和分流配置
- **名单管理**：管理 nftables set 集合（源 MAC、源 IP、目标 IP、端口等）
- **配置预览**：预览生成的 nftables 配置

## 项目结构

```
luci-app-flowproxy/
├── Makefile                           # OpenWrt 编译配置
├── README.md                          # 项目说明
├── htdocs/luci-static/resources/view/flowproxy/
│   ├── settings.js                    # 设置页面
│   ├── rules.js                       # 规则管理页面
│   ├── lists.js                       # 名单管理页面
│   └── preview.js                     # 配置预览页面
├── root/
│   ├── etc/
│   │   ├── config/flowproxy           # UCI 配置文件
│   │   └── init.d/flowproxy           # 服务启动脚本
│   └── usr/share/
│       ├── luci/menu.d/
│       │   └── luci-app-flowproxy.json  # 菜单定义
│       ├── rpcd/
│       │   └── luci-app-flowproxy       # RPC 后端脚本
│       └── flowproxy/
│           └── chnroute.txt             # 中国 IP 列表
└── po/zh_Hans/
    └── flowproxy.po                   # 简体中文翻译
```

## 安装

### 编译安装

1. 将项目复制到 OpenWrt 源码的 `package/` 目录下
2. 运行 `make menuconfig`，在 `LuCI -> Applications` 中选择 `luci-app-flowproxy`
3. 编译固件或单独编译 ipk 包

### 手动安装

```bash
cp -r htdocs/* /www/
cp -r root/* /
chmod +x /etc/init.d/flowproxy
chmod +x /usr/share/rpcd/luci-app-flowproxy
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
/etc/init.d/flowproxy enable
```

## 使用方法

### 1. 基本设置

进入 **服务 → FlowProxy → 设置**：启用服务、配置代理 IP、接口、标记值

### 2. 规则配置

进入 **服务 → FlowProxy → 规则**：添加/编辑/删除 TCP 和 UDP 规则

### 3. 名单管理

进入 **服务 → FlowProxy → 名单**：管理跳过代理的地址和端口列表

### 4. 配置预览

进入 **服务 → FlowProxy → 预览**：查看生成的 nftables 配置

---

## nftables Chain 规则框架

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        nftables Table: inet flowproxy                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        nftables Sets                                 │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  no_proxy_src_mac        type ether_addr      (源 MAC 名单)          │    │
│  │  no_proxy_src_ip_v4      type ipv4_addr       (源 IP 名单)           │    │
│  │  no_proxy_dst_ip_v4      type ipv4_addr       (目标 IP 名单)         │    │
│  │  private_dst_ip_v4       type ipv4_addr       (私有 IP，自动生成)     │    │
│  │  chnroute_dst_ip_v4      type ipv4_addr       (中国 IP，文件加载)     │    │
│  │  no_proxy_dst_tcp_ports  type inet_service    (TCP 端口名单)         │    │
│  │  no_proxy_dst_udp_ports  type inet_service    (UDP 端口名单)         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              Chain: LAN_MARKFLOW_TCP                                 │    │
│  │              type filter hook prerouting priority 100                │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Rule 0: 基础规则（固定，不可配置）                              │  │    │
│  │  │ # 跳过本地/任播/组播地址                                       │  │    │
│  │  │ fib daddr type { unspec, local, anycast, multicast } return   │  │    │
│  │  │ # 跳过代理服务器自身流量（防止环路）                            │  │    │
│  │  │ ip saddr $proxy_ip ip protocol tcp counter return             │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Rule 1: 用户规则 "TCP规则" (enabled=1, priority=100)           │  │    │
│  │  ├───────────────────────────────────────────────────────────────┤  │    │
│  │  │ [跳过条件 - 用户可配置]                                        │  │    │
│  │  │ ├─ use_no_proxy_src_mac=1  → ether saddr @no_proxy_src_mac    │  │    │
│  │  │ ├─ use_no_proxy_src_ip=1   → ip saddr @no_proxy_src_ip_v4     │  │    │
│  │  │ ├─ use_no_proxy_dst_ip=1   → ip daddr @no_proxy_dst_ip_v4     │  │    │
│  │  │ ├─ use_private_dst_ip=1    → ip daddr @private_dst_ip_v4      │  │    │
│  │  │ ├─ use_chnroute_dst_ip=1   → ip daddr @chnroute_dst_ip_v4     │  │    │
│  │  │ └─ use_no_proxy_ports=1    → tcp dport @no_proxy_dst_tcp_ports│  │    │
│  │  │                                                                 │  │    │
│  │  │ [标记规则]                                                      │  │    │
│  │  │ ip protocol tcp meta mark set $tproxy_mark                     │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Rule 2: 用户规则 "自定义TCP规则" (enabled=1, priority=50)      │  │    │
│  │  │ ... (同上结构)                                                  │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              Chain: LAN_MARKFLOW_UDP                                 │    │
│  │              type filter hook prerouting priority 100                │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Rule 0: 基础规则（固定，不可配置）                              │  │    │
│  │  │ # 跳过本地/任播/组播地址                                       │  │    │
│  │  │ fib daddr type { unspec, local, anycast, multicast } return   │  │    │
│  │  │ # 跳过代理服务器自身流量（防止环路）                            │  │    │
│  │  │ ip saddr $proxy_ip ip protocol udp counter return             │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Rule 1: 用户规则 "UDP规则" (enabled=1, priority=100)           │  │    │
│  │  ├───────────────────────────────────────────────────────────────┤  │    │
│  │  │ [跳过条件 - 用户可配置]                                        │  │    │
│  │  │ ├─ use_no_proxy_src_mac=1  → ether saddr @no_proxy_src_mac    │  │    │
│  │  │ ├─ use_no_proxy_src_ip=1   → ip saddr @no_proxy_src_ip_v4     │  │    │
│  │  │ ├─ use_no_proxy_dst_ip=1   → ip daddr @no_proxy_dst_ip_v4     │  │    │
│  │  │ ├─ use_private_dst_ip=1    → ip daddr @private_dst_ip_v4      │  │    │
│  │  │ ├─ use_chnroute_dst_ip=1   → ip daddr @chnroute_dst_ip_v4     │  │    │
│  │  │ └─ use_no_proxy_ports=1    → udp dport @no_proxy_dst_udp_ports│  │    │
│  │  │                                                                 │  │    │
│  │  │ [标记规则]                                                      │  │    │
│  │  │ ip protocol udp meta mark set $tproxy_mark                     │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 界面规则与 Chain 规则映射关系

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           LuCI 界面配置                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TCP 规则                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 名称: TCP规则    启用: ✓    优先级: 100                                 │  │
│  │ ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │ │ 跳过条件:                                                          │ │  │
│  │ │ [✓] Skip Source MAC    [✓] Skip Source IP    [✓] Skip Destination IP│ │  │
│  │ │ [✓] Skip Private IP    [✓] Skip China IP     [✓] Skip Ports         │ │  │
│  │ └────────────────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    nftables Chain: LAN_MARKFLOW_TCP                    │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                         │  │
│  │  # 基础规则（固定，不可配置）                                            │  │
│  │  nft add rule ... fib daddr type { unspec, local, anycast, multicast } │  │
│  │      counter return                                                     │  │
│  │  nft add rule ... ip saddr $proxy_ip ip protocol tcp counter return    │  │
│  │                                                                         │  │
│  │  # 用户规则 "TCP规则"（界面配置）                                        │  │
│  │  nft add rule ... ether saddr @no_proxy_src_mac counter return         │  │
│  │  nft add rule ... ip saddr @no_proxy_src_ip_v4 counter return          │  │
│  │  nft add rule ... ip daddr @no_proxy_dst_ip_v4 counter return          │  │
│  │  nft add rule ... ip daddr @private_dst_ip_v4 counter return           │  │
│  │  nft add rule ... ip daddr @chnroute_dst_ip_v4 counter return          │  │
│  │  nft add rule ... tcp dport @no_proxy_dst_tcp_ports counter return     │  │
│  │  nft add rule ... ip protocol tcp counter meta mark set 100            │  │
│  │                                                                         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 规则处理流程

```
                    ┌─────────────────┐
                    │  数据包进入     │
                    │  prerouting     │
                    └────────┬────────┘
                             │
                             ▼
         ╔═══════════════════════════════════════╗
         ║       基础规则（固定，不可配置）       ║
         ╠═══════════════════════════════════════╣
         ║                                       ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 目标地址是本地/任播/组播？    │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       ▼              ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 源 IP = 代理服务器 IP？       │    ║
         ║  │ (防止代理服务器流量环路)      │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       │              ║
         ╚═══════════════════════╪══════════════╝
                                 │
                                 ▼
         ╔═══════════════════════════════════════╗
         ║       用户规则（界面可配置）           ║
         ╠═══════════════════════════════════════╣
         ║                                       ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 源 MAC 在名单？              │    ║
         ║  │ (Skip Source MAC = 1 时检查) │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       ▼              ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 源 IP 在名单？               │    ║
         ║  │ (Skip Source IP = 1 时检查)  │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       ▼              ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 目标 IP 在名单？             │    ║
         ║  │ (Skip Destination IP = 1)    │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       ▼              ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 目标 IP 是私有地址？          │    ║
         ║  │ (Skip Private IP = 1 时检查) │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       ▼              ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 目标 IP 是中国 IP？           │    ║
         ║  │ (Skip China IP = 1 时检查)   │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       ▼              ║
         ║  ┌──────────────────────────────┐    ║
         ║  │ 目标端口在名单？              │    ║
         ║  │ (Skip Ports = 1 时检查)      │    ║
         ║  └──────────────┬───────────────┘    ║
         ║         Yes │         │ No           ║
         ║             ▼         │              ║
         ║        ┌────────┐     │              ║
         ║        │ RETURN │     │              ║
         ║        └────────┘     │              ║
         ║                       │              ║
         ╚═══════════════════════╪══════════════╝
                                 │
                                 ▼
              ┌──────────────────────────────┐
              │ 设置防火墙标记                │
              │ meta mark set $tproxy_mark   │
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ 流量被标记     │
                    │ 走代理路由     │
                    └────────────────┘
```

### 完整 nftables 配置示例

```nft
# FlowProxy nftables Configuration

table inet flowproxy {
    # ==================== Sets ====================
    
    set no_proxy_src_mac {
        type ether_addr
        elements = { aa:bb:cc:dd:ee:ff }
    }
    
    set no_proxy_src_ip_v4 {
        type ipv4_addr
        elements = { 192.168.1.100, 192.168.1.101 }
    }
    
    set no_proxy_dst_ip_v4 {
        type ipv4_addr
        elements = { 8.8.8.8, 1.1.1.1 }
    }
    
    set private_dst_ip_v4 {
        type ipv4_addr
        elements = { 10.0.0.0/8, 172.16.0.0/12, 
                     192.168.0.0/16, 127.0.0.0/8, 
                     169.254.0.0/16 }
    }
    
    set chnroute_dst_ip_v4 {
        type ipv4_addr
        # 从 /usr/share/flowproxy/chnroute.txt 加载
    }
    
    set no_proxy_dst_tcp_ports {
        type inet_service
        elements = { 22, 80, 443 }
    }
    
    set no_proxy_dst_udp_ports {
        type inet_service
        elements = { 53, 123 }
    }
    
    # ==================== TCP Chain ====================
    
    chain LAN_MARKFLOW_TCP {
        type filter hook prerouting priority 100; policy accept;
        
        # ===== 基础规则（固定，不可配置）=====
        # 跳过本地/任播/组播地址
        fib daddr type { unspec, local, anycast, multicast } counter return
        
        # 跳过代理服务器自身流量（防止环路）
        ip saddr 192.168.1.2 ip protocol tcp counter return
        
        # ===== 用户规则 "TCP规则"（界面配置）=====
        ether saddr @no_proxy_src_mac ip protocol tcp counter return
        ip saddr @no_proxy_src_ip_v4 ip protocol tcp counter return
        ip daddr @no_proxy_dst_ip_v4 ip protocol tcp counter return
        ip daddr @private_dst_ip_v4 ip protocol tcp counter return
        ip daddr @chnroute_dst_ip_v4 ip protocol tcp counter return
        tcp dport @no_proxy_dst_tcp_ports counter return
        
        # 标记流量走代理
        ip protocol tcp counter meta mark set 100
    }
    
    # ==================== UDP Chain ====================
    
    chain LAN_MARKFLOW_UDP {
        type filter hook prerouting priority 100; policy accept;
        
        # ===== 基础规则（固定，不可配置）=====
        # 跳过本地/任播/组播地址
        fib daddr type { unspec, local, anycast, multicast } counter return
        
        # 跳过代理服务器自身流量（防止环路）
        ip saddr 192.168.1.2 ip protocol udp counter return
        
        # ===== 用户规则 "UDP规则"（界面配置）=====
        ether saddr @no_proxy_src_mac ip protocol udp counter return
        ip saddr @no_proxy_src_ip_v4 ip protocol udp counter return
        ip daddr @no_proxy_dst_ip_v4 ip protocol udp counter return
        ip daddr @private_dst_ip_v4 ip protocol udp counter return
        ip daddr @chnroute_dst_ip_v4 ip protocol udp counter return
        udp dport @no_proxy_dst_udp_ports counter return
        
        # 标记流量走代理
        ip protocol udp counter meta mark set 100
    }
}
```

### 路由规则

```bash
# 标记为 100 的流量查路由表 100
ip rule add fwmark 100 lookup 100

# 路由表 100 的默认路由指向代理服务器
ip route add default via 192.168.1.2 dev br-lan table 100
```

---

## 命令行调试

```bash
# 查看 nftables 表
nft list table inet flowproxy

# 查看规则链
nft list chain inet flowproxy LAN_MARKFLOW_TCP
nft list chain inet flowproxy LAN_MARKFLOW_UDP

# 查看 set 集合
nft list set inet flowproxy no_proxy_src_ip_v4
nft list set inet flowproxy chnroute_dst_ip_v4

# 查看路由规则
ip rule list
ip route show table 100

# 服务控制
/etc/init.d/flowproxy start
/etc/init.d/flowproxy stop
/etc/init.d/flowproxy restart
```

## 依赖

- nftables
- kmod-nft-core
- kmod-nft-nat
- luci-base

## 许可证

Apache License 2.0