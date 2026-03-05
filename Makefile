include $(TOPDIR)/rules.mk

PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Support for FlowProxy Traffic Diversion
LUCI_DEPENDS:=+nftables +kmod-nft-core +kmod-nft-nat
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk