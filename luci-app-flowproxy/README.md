# FlowProxy - LuCI Traffic Diversion Application

基于 nftables 的 LuCI 流量分流应用，用于在路由器/网关上按照自定义规则将流量定向到指定的代理服务器。

## 功能特性

- **状态面板**：高度集成的状态监控，支持显示 `运行中 (IP:协议)` 及 `DNS 转发 (IP:端口)`，关键参数琥珀色高亮。
- **自动化管理**：服务启停完全跟随“启用”勾选框，保存即生效，无需手动干预。
- **DNS 转发 (New!)**：
  - **强制上游**：支持一键将 dnsmasq 的上游服务器修改为代理服务器。
  - **自动备份**：启用时自动备份原始 DNS 配置到 UCI 持久化存储。
  - **智能恢复**：禁用功能或停止服务时，精准还原原始配置，并自动处理“DNS 重定向”冲突。
- **规则引擎**：
  - **Match Type**：支持按目标 IP、源 IP、源 MAC、目标端口、源端口进行快速匹配。
  - **Action & Counter**：支持独立的动作选择（return/accept/drop）及数据包计数器。
  - **一键模版**：内置全套推荐规则模版，支持一键初始化。
  - **智能引用**：支持在规则中直接引用名单变量（如 `@chnroute_dst_ip_v4`）。
- **名单管理**：统一管理全局 `nftables set` 集合，支持 MAC、IP 及端口段的格式校验。
- **调试与审计**：
  - **配置预览**：实时查看由 UCI 转换生成的原始 `nftables` 配置文件。
  - **内核审计**：直接抓取内核中真实的规则、策略路由（ip rule）及路由表（ip route）。
- **日志系统**：独立的日志管理标签页，支持级别配置及实时查看。

## 项目结构

```
luci-app-flowproxy/
├── Makefile                           # OpenWrt 编译配置
├── README.md                          # 本项目说明
├── htdocs/luci-static/resources/view/flowproxy/
│   ├── settings.js                    # 基础设置页面 (自动化运行模式)
│   ├── rules.js                       # 规则管理 (Match Type + Action 分离)
│   ├── lists.js                       # 名单管理 (单页合并 + 格式校验)
│   ├── preview.js                     # 预览与审计 (双标签页 + 语法高亮)
│   └── logs.js                        # 独立日志管理页面
├── root/
│   ├── etc/
│   │   ├── config/flowproxy           # UCI 配置文件 (rule, nftset)
│   │   └── init.d/flowproxy           # 核心启动脚本 (支持自动清理与强力重载)
│   └── usr/share/
│       ├── rpcd/
│       │   └── luci.flowproxy           # 高性能 ucode RPC 后端
│       └── flowproxy/
│           ├── chnroute.txt             # 中国 IP 列表
│           └── generate_nft.sh          # 智能规则生成器 (处理 Set 语法与协议分支)
└── po/zh_Hans/
    └── flowproxy.po                   # 完整简体中文翻译
```

## 规则匹配逻辑

FlowProxy 采用 **"默认代理，规则跳过"** 的黑名单模式。

1.  **PREROUTING 捕获**：所有流量进入 `LAN_MARKFLOW` 链。
2.  **顺序匹配**：流量按用户定义的规则顺序比对。
3.  **Return 跳过**：如果规则动作为 `return` 且匹配成功，流量将退出分流链，**直接转发（不代理）**。
4.  **末尾打标**：未被任何规则拦截的剩余流量会在链末尾被打上 `TPROXY_MARK`。
5.  **策略路由**：带有标记的流量通过 `ip rule` 被导向 `Table 100`，最终转发至代理服务器。

## 预定义名单引用

在规则的 `Match Value` 中，您可以使用以下建议值：
- `@proxy_server_ip_addr`: 自动替换为当前配置的代理服务器 IP。
- `@no_proxy_src_mac`: 名单中配置的不走代理的设备 MAC。
- `@private_dst_ip_v4`: RFC1918 私有 IP 地址段。
- `@chnroute_dst_ip_v4`: 中国大陆 IP 地址段。
- `@no_proxy_dst_tcp_ports`: 特定的直连 TCP 端口。

## 许可证
Apache License 2.0
