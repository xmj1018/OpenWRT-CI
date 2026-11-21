#!/bin/bash
# SPDX-License-Identifier: MIT
# 自定义插件源扩展脚本（由官方 Scripts/Packages.sh 末尾自动 source）
# IPQ95XX 精简版：严格复刻官方可启动基线，只加 honk + OAF + iStoreOS 风格
# + HomeProxyRE(1andrevich/homeproxy-hiddify) + Argon 默认主题 + 315 字体排版(T 折行)
# + 【两个机型专属插件同时内置】luci-app-sbe1v1k + luci-app-be10000。
#
# 一次 CI 会输出 IPQ95XX.txt 里全部机型镜像，files/ 覆盖对所有机型生效，
# 无法按机型拆文件。因此两个插件一起铺进 rootfs，两者路径零重叠，且各自的
# init 都带 board_name + 硬件节点双重守卫：
#   * askey,sbe1v1k    -> fanctl / ledctl 生效，be10000-* 自动跳过
#   * xiaomi,be10000   -> be10000-fan / be10000-led 生效，fanctl / ledctl 自动跳过
# 非本机不会启动守护、不空转、不抢内核风扇控制权；界面显示「未检测到」。
# 旧版 OW 自带风扇/LED 界面、LED 触发器、pwmfan 模块加载项、旧 sbehw 全部移除。
# 不加 Docker / emmc-health / 36 插件全集 —— 控制体积确保能启动。

echo " "
echo "========== Load PRIVATE.sh (IPQ95XX lite, both hwctrl plugins) =========="

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

# ---------------- 自定义文件覆盖（315 字体/模板 + 两个机型专属 hwctrl 插件）----------------
if [ -d "$GITHUB_WORKSPACE/user-files" ]; then
  mkdir -p ./files
  cp -af "$GITHUB_WORKSPACE/user-files/." ./files/

  # GitHub REST API 上传的文件一律 100644，会丢可执行位。
  # 后端脚本、init、uci-defaults 必须补回 755，否则界面 exec 全失败、守护起不来。
  chmod 755 \
    ./files/usr/sbin/fanctl ./files/usr/sbin/ledctl \
    ./files/usr/sbin/be10000-fanctl ./files/usr/sbin/be10000-ledctl \
    ./files/etc/init.d/fanctl ./files/etc/init.d/ledctl \
    ./files/etc/init.d/be10000-fan ./files/etc/init.d/be10000-led \
    ./files/usr/lib/sbe1v1k/fanctl ./files/usr/lib/sbe1v1k/ledctl \
    ./files/usr/lib/sbe1v1k/init.fanctl ./files/usr/lib/sbe1v1k/init.ledctl \
    ./files/etc/uci-defaults/99-hwctrl-enable 2>/dev/null || :

  # 双保险：清除上一版编译遗留的旧风扇/RGB / 旧 sbehw 文件。
  # 远程 user-files 是全仓库共用的，切配置时残留会被整包卷进新固件。
  rm -f ./files/usr/share/luci/menu.d/luci-app-fan.json \
        ./files/usr/share/luci/menu.d/luci-app-led.json \
        ./files/usr/share/luci/menu.d/luci-app-sbehw.json \
        ./files/usr/share/rpcd/acl.d/luci-app-fan.json \
        ./files/usr/share/rpcd/acl.d/luci-app-led.json \
        ./files/usr/share/rpcd/acl.d/luci-app-sbehw.json \
        ./files/www/luci-static/resources/view/system/fan.js \
        ./files/www/luci-static/resources/view/system/led.js \
        ./files/etc/board.d/01_leds \
        ./files/etc/modules.d/60-hwmon-pwmfan \
        ./files/lib/functions/leds.sh \
        ./files/sbin/led.sh 2>/dev/null || :
  rm -rf ./files/www/luci-static/resources/view/system/led-trigger \
         ./files/www/luci-static/resources/view/sbehw 2>/dev/null || :

  echo "315 fonts/templates + sbe1v1k + be10000 overlaid: $(find ./files -type f | wc -l) files"
else
  echo "WARN: user-files not found, skip overlay"
fi

# ---------------- 品牌 / 无线 / SSID / 密码 / 后台地址：全部保持上游默认 ----------------
# 本脚本【不修改任何上游源码文件】，完全照抄 VIKINGYFY/immortalwrt 的默认：
#   * 主机名 / 左上角 / 登录页品牌：由官方 Settings.sh 按 WRT_NAME=ImmortalWRT 设置，
#     315 字体模板(header.ut / sysauth.ut)负责折行排版与字体，页脚作者已删。
#   * 无线：wifi-scripts 生成器输出 wifi-iface disabled='0'（默认开启）。
#   * SSID / 密码：luci-app-router-tool 初始化为
#     OWRT-2.4G / OWRT-5.2G / OWRT-5.8G + 12345678。
#   * 后台地址：官方 Settings.sh 按 WRT_IP 设为 192.168.10.1。
#
# 【OWRT 是字面量，严禁替换成 ImmortalWRT】
# 上游 luci-app-router-tool 靠 wireless.uc 里的 "iface.ssid != 'OWRT'" 判断
# 「未被修改过的默认 AP」；只有匹配才会执行初始化。上一版在这里对
# ./package/emortal/luci-app-router-tool/ 做了全局替换，把判断改成
# 'ImmortalWRT'，导致 router-tool 跳过初始化、无线默认失效 —— 已彻底撤销。
# 用户强调：是 OWRT，不是 OpenWrt。四个字母，一个都不能改。

echo "========== PRIVATE.sh done =========="
