include $(TOPDIR)/rules.mk

PKG_VERSION:=1.0.0

LUCI_TITLE:=LuCI Support for FlowProxy Traffic Diversion
LUCI_DEPENDS:=+nftables +kmod-nft-core +kmod-nft-nat

include $(TOPDIR)/feeds/luci/luci.mk