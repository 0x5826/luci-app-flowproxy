include $(TOPDIR)/rules.mk

PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Support for FlowProxy Traffic Diversion
LUCI_DEPENDS:=+luci-base +luci-compat +rpcd-mod-ucode +ucode-mod-uci +ucode-mod-fs
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature