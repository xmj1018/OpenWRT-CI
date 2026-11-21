#!/bin/bash
# SPDX-License-Identifier: MIT
# 自定义插件源扩展脚本（由官方 Scripts/Packages.sh 末尾自动 source）
# 目标：VIKINGYFY/immortalwrt owrt 分支 + qualcommbe/ipq95xx（含 askey_sbe1v1k / xiaomi_be10000）
# 全插件版（SBE1V1K 8GB eMMC，体积不限）：恢复最初 36 插件全集 + Docker + emmc-health
# + HomeProxy(1andrevich/homeproxy-hiddify) + 风扇/LED 控制 + 315 字体排版，依赖全配齐。
# 说明：UPDATE_PACKAGE "包名" "项目地址" "分支" "pkg(可选,从大杂烩提取)" "需清理的同名包(可选)"

echo " "
echo "========== Load PRIVATE.sh (custom packages) =========="

# ---------------- honk（用户指定：kenzok8/openwrt-honk）----------------
# 清理官方 doona-feed 旧包，避免与 kenzok8 版冲突
rm -rf ./package/honk ./package/luci-app-honk ./package/doona ./package/luci-app-doona 2>/dev/null
find ./feeds -maxdepth 4 -type d \( -iname "honk" -o -iname "luci-app-honk" -o -iname "doona" -o -iname "luci-app-doona" \) -exec rm -rf {} + 2>/dev/null
UPDATE_PACKAGE "honk" "kenzok8/openwrt-honk" "main" "pkg" "luci-app-honk honk doona luci-app-doona"
UPDATE_PACKAGE "luci-app-honk" "kenzok8/openwrt-honk" "main" "pkg"

# v2ray GeoIP / GeoSite（honk 路由数据依赖）
UPDATE_PACKAGE "v2ray-geodata" "kenzok8/small" "master" "" "v2ray-geoip v2ray-geosite"

# ---------------- OAF（应用过滤）----------------
# destan19/OpenAppFilter 自带 appfilter + oaf + luci-app-oaf 一整套，同源避免 rpcd acl 冲突
UPDATE_PACKAGE "open-app-filter" "destan19/OpenAppFilter" "master" "" "luci-app-appfilter oaf open-app-filter"
if [ ! -d "./package/luci-app-oaf" ]; then
  UPDATE_PACKAGE "luci-app-oaf" "kenzok8/jell" "main" "pkg"
  UPDATE_PACKAGE "oaf" "kenzok8/jell" "main" "pkg"
fi

# ---------------- iStoreOS 风格 ----------------
# 依赖链：luci-app-quickstart→quickstart/luci-app-store；istorex/store→luci-lib-taskd；
# luci-lib-taskd→luci-lib-xterm+taskd。全部同源 kenzok8/openwrt-packages 保版本一致。
for PKG in quickstart luci-app-quickstart luci-app-istorex luci-app-store taskd luci-lib-taskd luci-lib-xterm; do
  UPDATE_PACKAGE "$PKG" "kenzok8/openwrt-packages" "master" "pkg"
done

# ---------------- Argon 主题（默认）----------------
UPDATE_PACKAGE "luci-theme-argon" "kenzok8/openwrt-packages" "master" "pkg" "luci-theme-argon luci-app-argon-config"
UPDATE_PACKAGE "luci-app-argon-config" "kenzok8/openwrt-packages" "master" "pkg"

# ---------------- kenzok8/jell 聚合源中的冷门插件 ----------------
# 关键：pkg 模式用 iname "*<名>*" 模糊匹配。用主程序名可同时抓到界面+主程序，
# 避免 apk install 报 "<主程序> (no such package)"。
#   bandix -> luci-app-bandix + openwrt-bandix
#   unishare -> luci-app-unishare + unishare (+ webdav2 传递依赖)
for PKG in bandix unishare docker-lan-bridge webdav2 \
           luci-app-cpu-perf luci-app-cpu-status \
           luci-app-shadowrt luci-app-temp-status \
           luci-app-nikki luci-app-mosdns luci-app-passwall; do
  UPDATE_PACKAGE "$PKG" "kenzok8/jell" "main" "pkg"
done
# taskd/luci-lib-taskd 同源 openwrt-packages（版本 1.0.26 满足约束），iname "taskd" 两个都抓
UPDATE_PACKAGE "taskd" "kenzok8/openwrt-packages" "master" "pkg"

# ---------------- 单独源插件 ----------------
UPDATE_PACKAGE "quickfile" "sbwml/luci-app-quickfile" "main" "" "luci-app-quickfile quickfile"
UPDATE_PACKAGE "portweaver" "LazuliKao/openwrt-portweaver" "main" "pkg" "luci-app-portweaver"
UPDATE_PACKAGE "zapret2" "damocjwj/openwrt-zapret2" "main" "pkg" "luci-app-zapret2"
UPDATE_PACKAGE "luci-app-re-homeproxy" "1andrevich/homeproxy-hiddify" "master" "" "luci-app-homeproxy"

# ---------------- eMMC 健康（用户指定加回）----------------
# 克隆到 ./package/eMMC-Health（仓库名即目录名），Makefile 写死依赖 luci-js-deps，
# 而 owrt 分支 luci 源无此包（上次编译失败唯一根因）。该插件 JS 仅用 luci-base 自带组件，
# 不真正依赖它 —— 克隆后 sed 掉该依赖，即可正常编译安装（这也是社区通行做法）。
UPDATE_PACKAGE "luci-app-emmc-health" "adminchenyu/eMMC-Health" "main"
EMMC_MK="./package/eMMC-Health/Makefile"
if [ -f "$EMMC_MK" ]; then
  sed -i 's/+luci-js-deps//g' "$EMMC_MK"
  echo "patched eMMC-Health Makefile: removed luci-js-deps"
else
  echo "WARN: $EMMC_MK not found; try alternative path"
  find ./package -maxdepth 3 -iname "Makefile" -path "*eMMC*" -exec sed -i 's/+luci-js-deps//g' {} \; 2>/dev/null
fi

# ---------------- Docker 一整套（用户要求：这次加回 Docker）----------------
# owrt 分支自带 docker/dockerd/luci-app-dockerman/luci-lib-docker，
# 若 feeds 里缺 luci-app-dockerman 则补一个第三方源，避免 CONFIG=y 却无包可编。
if ! find ./feeds -maxdepth 4 -type d -iname "luci-app-dockerman" 2>/dev/null | grep -q .; then
  UPDATE_PACKAGE "luci-app-dockerman" "kenzok8/jell" "main" "pkg"
fi

# ---------------- 自定义文件覆盖（风扇/LED 插件 + 315 字体排版）----------------
# OpenWrt 编译时会自动把源码根目录 files/ 合并进固件 rootfs。
# 这里从 GITHUB_WORKSPACE/user-files 拷入，覆盖 argon 字体/模板并注入风扇/LED 控制。
if [ -d "$GITHUB_WORKSPACE/user-files" ]; then
  mkdir -p ./files
  cp -af "$GITHUB_WORKSPACE/user-files/." ./files/
  chmod +x ./files/usr/sbin/fanctl ./files/usr/sbin/ledctl ./files/etc/init.d/fanctl ./files/etc/init.d/ledctl ./files/sbin/led.sh 2>/dev/null
  echo "custom files overlaid: fan/led + 315 fonts/templates ($(find ./files -type f | wc -l) files)"
else
  echo "WARN: user-files not found, skip overlay"
fi

# ---------------- 品牌定制：登录页 + 左上角统一 ImmortalWRT ----------------
# hostname 由 Settings.sh 依 WRT_NAME=ImmortalWRT 写入；argon 品牌字取 ubus system.board 的 hostname。
CFG_GEN="./package/base-files/files/bin/config_generate"
[ -f "$CFG_GEN" ] && sed -i "s/hostname='.*'/hostname='ImmortalWRT'/g; s/description='.*'/description='ImmortalWRT'/g" "$CFG_GEN"
grep -rl -E 'ImmortalWrt|OpenWrt|OWRT' ./feeds/luci/modules/luci-base/htdocs/luci-static/resources/ ./package/emortal/luci-app-router-tool/ 2>/dev/null | xargs -r sed -i 's/ImmortalWrt/ImmortalWRT/g; s/OpenWrt/ImmortalWRT/g; s/OWRT/ImmortalWRT/g'

echo "========== PRIVATE.sh done =========="
