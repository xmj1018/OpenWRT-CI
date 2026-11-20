#!/bin/bash
# SPDX-License-Identifier: MIT
# 自定义插件源扩展脚本（由官方 Scripts/Packages.sh 末尾自动 source）
# 目标：VIKINGYFY/immortalwrt owrt 分支 + qualcommbe/ipq95xx/xiaomi_be10000
# 加入 honk / oaf 及用户指定插件，依赖补齐全
# 说明：UPDATE_PACKAGE "包名" "项目地址" "分支" "pkg(可选,从大杂烩提取)" "需清理的同名包(可选)"

echo " "
echo "========== Load PRIVATE.sh (custom packages) =========="

# ---------------- honk（用户指定：kenzok8/openwrt-honk）----------------
# 官方 Packages.sh 未包含 honk；这里克隆 honk 仓库并把 honk/ 与 luci-app-honk/ 提取到 package/
# pkg 模式会按 *honk* 匹配仓库内的子目录并复制到 ./package
rm -rf ./package/honk ./package/luci-app-honk ./package/openwrt-honk 2>/dev/null
UPDATE_PACKAGE "honk" "kenzok8/openwrt-honk" "main" "pkg" "honk luci-app-honk doona luci-app-doona"
UPDATE_PACKAGE "luci-app-honk" "kenzok8/openwrt-honk" "main" "pkg"

# v2ray GeoIP / GeoSite（honk 路由数据依赖，来自 kenzok8/small 的 v2ray-geodata）
UPDATE_PACKAGE "v2ray-geodata" "kenzok8/small" "master" "" "v2ray-geoip v2ray-geosite"

# ---------------- OAF（应用过滤，用户指定）----------------
UPDATE_PACKAGE "OpenAppFilter" "destan19/OpenAppFilter" "master" "" "luci-app-oaf oaf open-app-filter appfilter"
# 若 destan19 源不含独立 luci-app-oaf 界面，用 kenzok8/jell 版本补充
if [ ! -d "./package/luci-app-oaf" ]; then
  UPDATE_PACKAGE "luci-app-oaf" "kenzok8/jell" "main" "pkg"
fi

# ---------------- kenzok8/jell 聚合源中的冷门插件（pkg 提取）----------------
# 这些插件官方源没有，从 jell 大杂烩按包名单独提取
for PKG in luci-app-bandix luci-app-cpu-perf luci-app-cpu-status \
           luci-app-shadowrt luci-app-temp-status luci-app-unishare \
           luci-app-nikki luci-app-mosdns luci-app-passwall; do
  UPDATE_PACKAGE "$PKG" "kenzok8/jell" "main" "pkg"
done

# ---------------- istorex / quickstart / store / quickfile ----------------
# 注意：kenzok8/openwrt-packages 默认分支是 master（非 main）
UPDATE_PACKAGE "istorex" "kenzok8/openwrt-packages" "master" "pkg" "luci-app-istorex"
UPDATE_PACKAGE "quickstart" "kenzok8/openwrt-packages" "master" "pkg" "luci-app-quickstart"
UPDATE_PACKAGE "store" "kenzok8/openwrt-packages" "master" "pkg" "luci-app-store"
UPDATE_PACKAGE "quickfile" "sbwml/luci-app-quickfile" "main" "" "luci-app-quickfile quickfile"

# ---------------- 单独源插件 ----------------
# eMMC 健康度（BE10000 为 NAND，如编译期内核依赖不兼容可在 PRIVATE.txt 禁用此项）
UPDATE_PACKAGE "luci-app-emmc-health" "adminchenyu/eMMC-Health" "main"
# 端口视图
UPDATE_PACKAGE "portweaver" "LazuliKao/openwrt-portweaver" "main" "pkg" "luci-app-portweaver"
# zapret2（DPI 绕过）
UPDATE_PACKAGE "zapret2" "damocjwj/openwrt-zapret2" "main" "pkg" "luci-app-zapret2"
# re-homeproxy（homeproxy 重写版）
UPDATE_PACKAGE "luci-app-re-homeproxy" "1andrevich/homeproxy-hiddify" "master" "" "luci-app-homeproxy"

# ---------------- 品牌定制：左上角 owrt -> immortalwrt ----------------
# 说明：workflow 已把 WRT_NAME=immortalwrt，Settings.sh 会写 hostname='immortalwrt'。
# 部分主题左上角读 system.description；这里一并改成 immortalwrt，确保显示一致。
CFG_GEN="./package/base-files/files/bin/config_generate"
[ -f "$CFG_GEN" ] && sed -i "s/description='.*'/description='immortalwrt'/g" "$CFG_GEN"
# 主题 header 中若存在硬编码 OWRT 字样，替换为 immortalwrt（大小写兜底）
grep -rl 'OWRT' ./package/emortal/luci-app-router-tool/ 2>/dev/null | xargs -r sed -i 's/OWRT/immortalwrt/g'

echo "========== PRIVATE.sh done =========="
