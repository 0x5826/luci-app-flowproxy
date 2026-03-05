# FlowProxy - Traffic Diversion LuCI Application
# Copyright (C) 2024
# This is free software, licensed under the Apache License, Version 2.0.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-flowproxy
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for FlowProxy Traffic Diversion
LUCI_DEPENDS:=+nftables +kmod-nft-core +kmod-nft-nat
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

$(eval $(call BuildPackage,luci-app-flowproxy))