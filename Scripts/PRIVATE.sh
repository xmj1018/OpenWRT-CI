#!/bin/bash
# SPDX-License-Identifier: MIT
# 自定义插件源扩展脚本（由官方 Scripts/Packages.sh 末尾自动 source）
# 目标：VIKINGYFY/immortalwrt owrt 分支 + qualcommbe/ipq95xx/xiaomi_be10000
# 加入 honk / oaf 及用户指定插件，依赖补齐全
# 说明：UPDATE_PACKAGE "包名" "项目地址" "分支" "pkg(可选,从大杂烩提取)" "需清理的同名包(可选)"

echo " "
echo "========== Load PRIVATE.sh (custom packages) =========="

# ---------------- honk（用户指定：kenzok8/openwrt-honk）----------------
# 官方 Packages.sh 未包含 honk；克隆 honk 仓库并把 honk/ 与 luci-app-honk/ 提取到 package/
# pkg 模式会按 *honk* 匹配仓库内的子目录并复制到 ./package
# 产物预期：honk-2026.11.18.1-r2-aarch64_cortex-a53.apk / luci-app-honk-...apk
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

# ---------------- kenzok8/jell 聚合源中的冷门插件（pkg 提取）----------------
# 这些插件官方源没有，从 jell 大杂烩按包名单独提取。
# 关键：UPDATE_PACKAGE 的 pkg 模式用 iname "*<名>*" 模糊匹配子目录。
# 因此用主程序名（而非 luci-app- 名）可同时抓到「界面 + 主程序」，避免
# apk install 时报 "<主程序> (no such package)" 依赖缺失。
#   bandix -> luci-app-bandix + openwrt-bandix
#   unishare -> luci-app-unishare + unishare (+ webdav2 传递依赖)
for PKG in bandix unishare docker-lan-bridge webdav2 \
           luci-app-cpu-perf luci-app-cpu-status \
           luci-app-shadowrt luci-app-temp-status \
           luci-app-nikki luci-app-mosdns luci-app-passwall; do
  UPDATE_PACKAGE "$PKG" "kenzok8/jell" "main" "pkg"
done
# luci-lib-taskd + taskd：必须从 openwrt-packages 源（与 istorex/store 同源），
# 该源 luci-lib-taskd 版本 1.0.26，满足 istorex>=1.0.15 / store>=1.0.19 约束。
# iname "taskd" 会同时抓到 taskd 和 luci-lib-taskd 两个目录。
UPDATE_PACKAGE "taskd" "kenzok8/openwrt-packages" "master" "pkg"
# luci-lib-taskd 依赖 luci-lib-xterm，但 iname "*taskd*" 匹配不到它，
# 需单独克隆（同源 kenzok8/openwrt-packages），否则 apk install 阶段报
# "luci-lib-xterm (no such package) required by luci-lib-taskd"。
UPDATE_PACKAGE "luci-lib-xterm" "kenzok8/openwrt-packages" "master" "pkg"


# ---------------- istorex / quickstart / store / quickfile ----------------
# 注意：kenzok8/openwrt-packages 默认分支是 master（非 main）
UPDATE_PACKAGE "istorex" "kenzok8/openwrt-packages" "master" "pkg" "luci-app-istorex"
UPDATE_PACKAGE "quickstart" "kenzok8/openwrt-packages" "master" "pkg" "luci-app-quickstart"
UPDATE_PACKAGE "store" "kenzok8/openwrt-packages" "master" "pkg" "luci-app-store"
UPDATE_PACKAGE "quickfile" "sbwml/luci-app-quickfile" "main" "" "luci-app-quickfile quickfile"

# ---------------- 单独源插件 ----------------
# eMMC 健康度：已移除。原因：该插件依赖 luci-js-deps（新版 luci 组件），
# 而 owrt 分支 luci 无此包，会导致 apk install 阶段依赖解析失败；且 BE10000
# 为 NAND 并非 eMMC，此插件对本机意义有限。需要时可在新版 luci 上单独装。
# 端口视图
UPDATE_PACKAGE "portweaver" "LazuliKao/openwrt-portweaver" "main" "pkg" "luci-app-portweaver"
# zapret2（DPI 绕过）
UPDATE_PACKAGE "zapret2" "damocjwj/openwrt-zapret2" "main" "pkg" "luci-app-zapret2"
# re-homeproxy（homeproxy 重写版）：已移除。
# 官方 GENERAL.txt 已含 CONFIG_PACKAGE_luci-app-homeproxy=y，官方源自带 homeproxy；
# 再装 hiddify 重写版会与官方 luci-app-homeproxy / luci-i18n-homeproxy-zh-cn
# 争抢 etc/homeproxy/* 和 www/luci-static/resources/homeproxy* 等文件，apk 报
# "trying to overwrite ... owned by luci-app-homeproxy" 冲突。保留官方版即可。
# UPDATE_PACKAGE "luci-app-re-homeproxy" "1andrevich/homeproxy-hiddify" "master" "" "luci-app-homeproxy"

# ---------------- 品牌定制：左上角 owrt -> immortalwrt ----------------
# 说明：workflow 已把 WRT_NAME=immortalwrt，Settings.sh 会写 hostname='immortalwrt'。
# 部分主题左上角读 system.description；这里一并改成 immortalwrt，确保显示一致。
CFG_GEN="./package/base-files/files/bin/config_generate"
[ -f "$CFG_GEN" ] && sed -i "s/description='.*'/description='immortalwrt'/g" "$CFG_GEN"
# 主题 header 中若存在硬编码 OWRT 字样，替换为 immortalwrt（大小写兜底）
grep -rl 'OWRT' ./package/emortal/luci-app-router-tool/ 2>/dev/null | xargs -r sed -i 's/OWRT/immortalwrt/g'

echo "========== PRIVATE.sh done =========="
