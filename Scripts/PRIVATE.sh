#!/bin/bash
# SPDX-License-Identifier: MIT
# 自定义插件源扩展脚本（由官方 Scripts/Packages.sh 末尾自动 source）
# 目标：VIKINGYFY/immortalwrt owrt 分支 + qualcommbe/ipq95xx/xiaomi_be10000
# 精简版：严格复刻官方可启动基线，只额外加入 honk + OAF 两套。
# 说明：UPDATE_PACKAGE "包名" "项目地址" "分支" "pkg(可选,从大杂烩提取)" "需清理的同名包(可选)"

echo " "
echo "========== Load PRIVATE.sh (custom packages) =========="

# ---------------- honk（用户指定：kenzok8/openwrt-honk）----------------
# 官方 Packages.sh 未包含 honk；克隆 honk 仓库并把 honk/ 与 luci-app-honk/ 提取到 package/
# pkg 模式会按 *honk* 匹配仓库内的子目录并复制到 ./package
rm -rf ./package/honk ./package/luci-app-honk ./package/openwrt-honk 2>/dev/null
UPDATE_PACKAGE "honk" "kenzok8/openwrt-honk" "main" "pkg" "honk luci-app-honk doona luci-app-doona"
UPDATE_PACKAGE "luci-app-honk" "kenzok8/openwrt-honk" "main" "pkg"

# v2ray GeoIP / GeoSite（honk 路由数据依赖，来自 kenzok8/small 的 v2ray-geodata）
UPDATE_PACKAGE "v2ray-geodata" "kenzok8/small" "master" "" "v2ray-geoip v2ray-geosite"

# ---------------- OAF（应用过滤，用户指定）----------------
# destan19/OpenAppFilter 自带完整一套：appfilter(服务) + oaf(内核模块) + luci-app-oaf(界面)。
# 用官方推荐的 open-app-filter 写法整仓克隆，清理 feeds 里同名旧组件。
# 注意：切勿再从 kenzok8/jell 克隆 luci-app-oaf —— 两个源的界面都提供
# usr/share/rpcd/acl.d/luci-app-oaf.json，apk 安装会报 "trying to overwrite" 冲突。
UPDATE_PACKAGE "open-app-filter" "destan19/OpenAppFilter" "master" "" "luci-app-appfilter oaf"

# ---------------- iStoreOS 风格（用户指定：quickstart 首页向导 + istorex + store）----------------
# 依赖链：luci-app-quickstart→quickstart/luci-app-store；luci-app-istorex→luci-lib-taskd；
# luci-app-store→luci-lib-taskd；luci-lib-taskd→luci-lib-xterm+taskd。全部从 kenzok8/openwrt-packages 克隆。
for PKG in quickstart luci-app-quickstart istorex luci-app-istorex luci-app-store taskd luci-lib-taskd luci-lib-xterm; do
  UPDATE_PACKAGE "$PKG" "kenzok8/openwrt-packages" "master" "pkg"
done

# ---------------- Argon 主题（用户指定，设为默认）----------------
# kenzok8/openwrt-packages 的 argon 为新版（依赖 ucode-mod-math），适配 owrt 分支。
# 先清理 feeds 自带旧 argon，再从该源提取主题 + 配置包。
UPDATE_PACKAGE "luci-theme-argon" "kenzok8/openwrt-packages" "master" "pkg" "luci-theme-argon luci-app-argon-config"
UPDATE_PACKAGE "luci-app-argon-config" "kenzok8/openwrt-packages" "master" "pkg"

# ---------------- 品牌定制：登录页 + 左上角统一显示 immortalwrt ----------------
# hostname 由 Settings.sh 依 WRT_NAME=immortalwrt 写入；这里补 description 与 LuCI 显示字符串（纯 sed，不增体积）。
CFG_GEN="./package/base-files/files/bin/config_generate"
[ -f "$CFG_GEN" ] && sed -i "s/hostname='.*'/hostname='immortalwrt'/g; s/description='.*'/description='immortalwrt'/g" "$CFG_GEN"
grep -rl -E 'ImmortalWrt|OpenWrt|OWRT' ./feeds/luci/modules/luci-base/htdocs/luci-static/resources/ ./package/emortal/luci-app-router-tool/ 2>/dev/null | xargs -r sed -i 's/ImmortalWrt/immortalwrt/g; s/OpenWrt/immortalwrt/g; s/OWRT/immortalwrt/g'

echo "========== PRIVATE.sh done =========="
