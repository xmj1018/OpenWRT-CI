#!/bin/bash
# SPDX-License-Identifier: MIT
# 自定义插件源扩展脚本（由官方 Scripts/Packages.sh 末尾自动 source）
# 小米万兆 BE10000 精简版：严格复刻官方可启动基线，只加 honk + OAF + iStoreOS 风格
# + HomeProxyRE(1andrevich/homeproxy-hiddify) + Argon 默认主题 + 315 字体排版(T 折行)
# + 内置新版「风扇控制 / RGB 状态灯」界面插件(luci-app-sbehw)。
# 旧版 OW 自带的风扇/LED 界面、LED 触发器、pwmfan 模块加载项全部移除。
# 不加 Docker / emmc-health / 36 插件全集 —— 控制体积确保能启动。

echo " "
echo "========== Load PRIVATE.sh (xiaomi_be10000 lite) =========="

# ---------------- honk（用户指定：kenzok8/openwrt-honk）----------------
rm -rf ./package/honk ./package/luci-app-honk ./package/doona ./package/luci-app-doona 2>/dev/null
find ./feeds -maxdepth 4 -type d \( -iname "honk" -o -iname "luci-app-honk" -o -iname "doona" -o -iname "luci-app-doona" \) -exec rm -rf {} + 2>/dev/null
UPDATE_PACKAGE "honk" "kenzok8/openwrt-honk" "main" "pkg" "luci-app-honk honk doona luci-app-doona"
UPDATE_PACKAGE "luci-app-honk" "kenzok8/openwrt-honk" "main" "pkg"

# v2ray GeoIP / GeoSite（honk 路由数据依赖）
UPDATE_PACKAGE "v2ray-geodata" "kenzok8/small" "master" "" "v2ray-geoip v2ray-geosite"

# ---------------- OAF（应用过滤，destan19 同源一整套版本配套）----------------
# 不要额外克隆 kenzok8/jell 的 luci-app-oaf(版本0)，它和 appfilter 7.0.2 都提供
# usr/share/rpcd/acl.d/luci-app-oaf.json，会 trying to overwrite 导致打包失败。
UPDATE_PACKAGE "open-app-filter" "destan19/OpenAppFilter" "master" "" "luci-app-appfilter oaf open-app-filter"

# ---------------- iStoreOS 风格（同源保版本一致）----------------
for PKG in quickstart luci-app-quickstart luci-app-istorex luci-app-store taskd luci-lib-taskd luci-lib-xterm; do
  UPDATE_PACKAGE "$PKG" "kenzok8/openwrt-packages" "master" "pkg"
done

# ---------------- Argon 主题 ----------------
UPDATE_PACKAGE "luci-theme-argon" "kenzok8/openwrt-packages" "master" "pkg" "luci-theme-argon luci-app-argon-config"
UPDATE_PACKAGE "luci-app-argon-config" "kenzok8/openwrt-packages" "master" "pkg"

# ---------------- HomeProxy（用户指定：1andrevich/homeproxy-hiddify）----------------
UPDATE_PACKAGE "luci-app-re-homeproxy" "1andrevich/homeproxy-hiddify" "master" "" "luci-app-homeproxy"

# ---------------- 自定义文件覆盖（315 字体/模板 + 新版风扇/RGB 插件）----------------
if [ -d "$GITHUB_WORKSPACE/user-files" ]; then
  mkdir -p ./files
  cp -af "$GITHUB_WORKSPACE/user-files/." ./files/

  # GitHub REST API 上传的文件一律 100644，会丢可执行位。
  # 后端脚本 + init 必须补回 755，否则界面 exec 全失败、守护起不来。
  chmod 755 ./files/usr/sbin/fanctl ./files/usr/sbin/ledctl \
            ./files/etc/init.d/fanctl ./files/etc/init.d/ledctl 2>/dev/null || :

  # 双保险：清除上一版 SBE 全插件编译遗留的旧风扇/RGB 文件。
  # 这些是「OW 自带」的旧界面/旧菜单/LED 触发器/pwmfan 模块项，
  # 万兆不需要且与新菜单重复；即便远程 user-files 删漏了，这里也清干净。
  rm -f ./files/usr/share/luci/menu.d/luci-app-fan.json \
        ./files/usr/share/luci/menu.d/luci-app-led.json \
        ./files/usr/share/rpcd/acl.d/luci-app-fan.json \
        ./files/usr/share/rpcd/acl.d/luci-app-led.json \
        ./files/www/luci-static/resources/view/system/fan.js \
        ./files/www/luci-static/resources/view/system/led.js \
        ./files/etc/board.d/01_leds \
        ./files/etc/modules.d/60-hwmon-pwmfan \
        ./files/lib/functions/leds.sh \
        ./files/sbin/led.sh 2>/dev/null || :
  rm -rf ./files/www/luci-static/resources/view/system/led-trigger 2>/dev/null || :

  echo "315 fonts/templates + sbehw overlaid: $(find ./files -type f | wc -l) files"
else
  echo "WARN: user-files not found, skip overlay"
fi

# ---------------- 品牌定制：统一 ImmortalWRT ----------------
CFG_GEN="./package/base-files/files/bin/config_generate"
[ -f "$CFG_GEN" ] && sed -i "s/hostname='.*'/hostname='ImmortalWRT'/g; s/description='.*'/description='ImmortalWRT'/g" "$CFG_GEN"
grep -rl -E 'ImmortalWrt|OpenWrt|OWRT' ./feeds/luci/modules/luci-base/htdocs/luci-static/resources/ ./package/emortal/luci-app-router-tool/ 2>/dev/null | xargs -r sed -i 's/ImmortalWrt/ImmortalWRT/g; s/OpenWrt/ImmortalWRT/g; s/OWRT/ImmortalWRT/g'

echo "========== PRIVATE.sh done =========="
