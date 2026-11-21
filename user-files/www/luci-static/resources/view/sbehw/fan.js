'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

/* SBE1V1K 风扇控制 —— 新版界面
   后端 /usr/sbin/fanctl 保持原样（PID 曲线 / 过温兜底 / 转速读取）。
   本文件只重做外壳：自适应栅格、跨深浅主题、SVG 曲线图、完整温度列表。 */

var LEVELS = [ 36, 72, 128, 255 ];

/* 保留原作者踩坑后修好的调用机制：nobatch + 串行队列 + 超时兜底。
   LuCI 的 rpc 会把同一 tick 的调用合并成 batch，一旦失败整批 Promise
   永久 pending（luci.js 的 flushRequestQueue 没有 .catch），页面表现为
   「改了没反应」。nobatch 让请求独立发送，超时则明确报错。 */
const callFileExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params', 'env' ],
	nobatch: true
});

var _execChain = Promise.resolve();
function execCmd(args) {
	var p = _execChain.then(function() {
		return callFileExec('/usr/sbin/fanctl', args, null);
	});
	_execChain = p.then(function() {}, function() {});
	return Promise.race([
		p.then(function(res) { return res || { code: -1, stdout: '', stderr: 'no reply' }; }),
		new Promise(function(_, rej) {
			setTimeout(function() {
				rej(new Error((args && args[0] ? args[0] : '命令') + ' 执行超时'));
			}, 30000);
		})
	]);
}

/* ---------- 共用样式：中性半透明 + currentColor，浅色/深色主题都成立 ----------
   旧界面写死 #eef1f7 白底 + 固定 820px，在 Argon 深色/半透明卡片里对比度崩掉，
   窄屏图表溢出 —— 这就是「显示不全、看着别扭」的根因。 */
var CSS = [
	'.hw-page{width:100%;max-width:100%;margin:0}',
	'.hw-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 18px}',
	'.hw-title{font-size:22px;font-weight:750;letter-spacing:.3px;margin:0;line-height:1.2}',
	'.hw-sub{opacity:.62;font-size:13px;margin-top:6px;line-height:1.6;max-width:720px}',
	'.hw-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.07);white-space:nowrap}',
	'.hw-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(127,127,127,.15)}',
	'.hw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}',
	'.hw-card{border:1px solid rgba(127,127,127,.2);border-radius:16px;background:rgba(127,127,127,.06);padding:16px 18px;min-width:0}',
	'.hw-card.wide{grid-column:1/-1}',
	'.hw-card h3{margin:0 0 14px;font-size:14px;font-weight:700;letter-spacing:.4px;display:flex;align-items:center;gap:9px}',
	'.hw-card h3:before{content:"";width:3px;height:14px;border-radius:2px;background:var(--primary,#5e72e4)}',
	'.hw-metric{font-size:30px;font-weight:750;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.5px}',
	'.hw-unit{font-size:14px;font-weight:600;opacity:.55;margin-left:3px}',
	'.hw-label{font-size:12px;opacity:.6;margin-bottom:8px;letter-spacing:.3px}',
	'.hw-foot{font-size:12px;opacity:.6;margin-top:9px;line-height:1.5}',
	'.hw-bar{height:8px;border-radius:999px;background:rgba(127,127,127,.16);overflow:hidden;margin-top:12px}',
	'.hw-bar>i{display:block;height:100%;border-radius:999px;transition:width .4s ease,background .3s}',
	'.hw-seg{display:flex;gap:7px;flex-wrap:wrap}',
	'.hw-seg button{flex:1;min-width:80px;padding:11px 12px;border-radius:11px;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.05);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-seg button:hover{border-color:var(--primary,#5e72e4);transform:translateY(-1px)}',
	'.hw-seg button.on{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff;box-shadow:0 4px 12px rgba(94,114,228,.3)}',
	'.hw-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:9px 0}',
	'.hw-row>label{font-size:12.5px;opacity:.7;min-width:62px}',
	'.hw-slider{flex:1;min-width:110px;accent-color:var(--primary,#5e72e4)}',
	'.hw-num{width:70px;padding:7px 8px;border-radius:9px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;text-align:center;font-variant-numeric:tabular-nums}',
	'.hw-btn{padding:9px 16px;border-radius:10px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.07);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-btn:hover{border-color:var(--primary,#5e72e4);transform:translateY(-1px)}',
	'.hw-btn.primary{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff}',
	'.hw-select{padding:8px 10px;border-radius:9px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;font-size:13px}',
	'.hw-sens-row{display:grid;grid-template-columns:minmax(105px,1fr) minmax(55px,1.1fr) 60px;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid rgba(127,127,127,.12)}',
	'.hw-sens-row:last-child{border-bottom:0}',
	'.hw-sens-name{font-size:12.5px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
	'.hw-sens-track{height:7px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden}',
	'.hw-sens-track>i{display:block;height:100%;border-radius:999px;transition:width .4s}',
	'.hw-sens-t{text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}',
	'.hw-chart{width:100%;height:auto;display:block;border-radius:12px;background:rgba(127,127,127,.05);border:1px solid rgba(127,127,127,.14)}',
	'.hw-pt{display:flex;align-items:center;gap:7px;margin-bottom:7px;font-size:12px;flex-wrap:wrap}',
	'.hw-pt input{width:58px;padding:6px;border-radius:8px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;text-align:center}',
	'.hw-note{padding:11px 14px;border-radius:11px;background:rgba(251,99,64,.1);border:1px solid rgba(251,99,64,.28);font-size:12.5px;line-height:1.65;margin-top:12px}',
	'.hw-kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(127,127,127,.12);font-size:12.5px}',
	'.hw-kv:last-child{border-bottom:0}',
	'.hw-kv span:first-child{opacity:.65}',
	'.hw-kv span:last-child{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}',
	'.hw-link{color:var(--primary,#5e72e4);cursor:pointer;font-size:12.5px;text-decoration:none;font-weight:600}',
	'.hw-link:hover{text-decoration:underline}',
	'.hw-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}',
	'@media(max-width:560px){.hw-metric{font-size:25px}}'
].join('');

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
	});
}

function tcolor(t) {
	return t >= 80 ? '#f5365c' : t >= 65 ? '#fb6340' : t >= 50 ? '#e6a100' : '#2dce89';
}

return view.extend({
	data: null,
	curve: [[40,20],[50,35],[65,60],[80,100]],
	defaultCurve: [[40,20],[50,35],[65,60],[80,100]],
	src: 'max',
	manualPct: 50,
	modeBtns: {},
	showAll: false,
	last: null,
	_lastPct: 50,
	_zeroOk: false,
	_mt: null,
	_dragging: false,

	refresh: function() {
		var self = this;
		return execCmd([ 'json' ]).then(function(res) {
			var d = null;
			try { d = JSON.parse((res.stdout || '').trim()); } catch (e) { d = null; }
			if (!d || !d.ok) { self.noHw(); return; }
			self.data = d;
			self.update(d);
		}).catch(function(e) { self.noHw(e); });
	},

	noHw: function() {
		var n = document.getElementById('hw-nohw');
		if (n) n.style.display = '';
	},

	setText: function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; },
	setHTML: function(id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; },

	update: function(d) {
		var self = this;
		var hot = null;
		(d.sensors || []).forEach(function(s) { if (!hot || s.temp > hot.temp) hot = s; });
		var n = document.getElementById('hw-nohw'); if (n) n.style.display = 'none';

		this.setHTML('hw-mode-pill', '<span class="hw-dot"></span>' + esc(this.modeLabel(d.mode)));
		this.setText('hw-temp', d.hot);
		this.setText('hw-temp-src', hot ? hot.name : '—');
		var te = document.getElementById('hw-temp'); if (te) te.style.color = tcolor(d.hot);
		this.setText('hw-pct', d.pct);
		this.setText('hw-rpm', (d.rpm === undefined || d.rpm === null || d.rpm < 0) ? '—' : d.rpm);
		this.setText('hw-soc', d.temp);
		this.setText('hw-level', this.levelText(d));
		this.setText('hw-thermal', d.thermal === 'disabled' ? '用户态接管' : '内核接管');
		this.setText('hw-enable', d.enable === 2 ? '内核调速 (2)' : d.enable === 1 ? '手动 (1)' : (d.enable + ''));
		this.setText('hw-config', d.cfg ? '已加载' : '未加载');
		this.setText('hw-hwmon', 'pwmfan / pwm1');

		var bar = document.getElementById('hw-bar-i');
		if (bar) {
			bar.style.width = d.pct + '%';
			bar.style.background = d.pct === 0 ? 'rgba(127,127,127,.4)'
				: d.pct >= 90 ? '#f5365c' : d.pct >= 50 ? '#5e72e4' : '#2dce89';
		}

		Object.keys(this.modeBtns).forEach(function(m) {
			var b = self.modeBtns[m]; if (!b) return;
			if (m === d.mode) b.classList.add('on'); else b.classList.remove('on');
		});

		var mc = document.getElementById('hw-manual-card');
		if (mc) mc.style.display = (d.mode === 'manual') ? '' : 'none';
		var cc = document.getElementById('hw-curve-card');
		if (cc) cc.style.display = (d.mode === 'curve') ? '' : 'none';

		var lag = document.getElementById('hw-lag');
		if (lag) {
			var diff = d.hot - d.temp;
			if (d.mode === 'auto' && diff >= 5) {
				lag.style.display = '';
				lag.textContent = '最热点是「' + (hot ? hot.name : '—') + '」' + d.hot +
					' °C，比内核温区绑定的 SoC 高 ' + diff +
					' °C。自动模式跟随 SoC，射频发热时会滞后；切到「曲线」并选「最热传感器」可覆盖。';
			} else lag.style.display = 'none';
		}

		this.last = d;
		this.applySensors();
		this.syncInputs(d);
		if (this.curveSig() !== this._ptSig) this.renderPoints();
		this.drawChart();
	},

	syncInputs: function(d) {
		if (this.curveTouched) return;
		if (d.curve) {
			var pts = String(d.curve).split(',').map(function(s) {
				var a = s.split(':');
				return [ parseInt(a[0], 10) || 40, parseInt(a[1], 10) || 0 ];
			}).filter(function(p) { return p.length === 2; });
			if (pts.length) this.curve = pts;
		}
		if ((d.src === 'soc' || d.src === 'max') && !this.srcTouched) {
			this.src = d.src;
			var s = document.getElementById('hw-src'); if (s) s.value = d.src;
		}
		if (!this._dragging) {
			var sl = document.getElementById('hw-pct-slider');
			var nm = document.getElementById('hw-pct-num');
			this.manualPct = d.pct;
			if (sl) sl.value = d.pct;
			if (nm) nm.value = d.pct;
			this.setText('hw-pct-big', d.pct);
		}
	},

	applySensors: function() {
		var d = this.last || {};
		var all = d.sensors_all || [];
		var list = this.showAll ? (all.length ? all : (d.sensors || [])) : (d.sensors || []);
		this.renderSensors(list);
		var more = document.getElementById('hw-src-more');
		if (more) {
			if (!all.length || all.length === (d.sensors || []).length) more.style.display = 'none';
			else { more.style.display = ''; more.textContent = this.showAll ? '收起（只看每类最高）' : ('展开全部 ' + all.length + ' 路'); }
		}
	},

	renderSensors: function(list) {
		var box = document.getElementById('hw-sens-list'); if (!box) return;
		var html = '', max = 0;
		list.forEach(function(s) { if (s.temp > max) max = s.temp; });
		var tagged = false;
		list.forEach(function(s) {
			var isHot = (!tagged && s.temp === max && list.length > 1);
			if (isHot) tagged = true;
			var w = Math.min(100, Math.max(3, s.temp / 95 * 100));
			html += '<div class="hw-sens-row">' +
				'<span class="hw-sens-name">' + esc(s.name) + (isHot ? ' <b style="color:#e6a100;font-size:11px">最高</b>' : '') + '</span>' +
				'<span class="hw-sens-track"><i style="width:' + w + '%;background:' + tcolor(s.temp) + '"></i></span>' +
				'<span class="hw-sens-t" style="color:' + tcolor(s.temp) + '">' + s.temp + '°</span>' +
				'</div>';
		});
		box.innerHTML = html || '<div class="hw-foot">读取中…</div>';
	},

	curveSig: function() { return JSON.stringify(this.curve || []); },

	renderPoints: function() {
		var box = document.getElementById('hw-points'); if (!box) return;
		var self = this; box.innerHTML = '';
		this._ptSig = this.curveSig();
		this.curve.forEach(function(p, i) {
			var ti = E('input', { 'type': 'number', 'min': '30', 'max': '95', 'value': p[0] });
			var pi = E('input', { 'type': 'number', 'min': '0', 'max': '100', 'value': p[1] });
			ti.addEventListener('change', function() {
				self.curve[i][0] = Math.min(95, Math.max(30, parseInt(ti.value, 10) || 40));
				self.curveTouched = true;
				self.curve.sort(function(a, b) { return a[0] - b[0]; });
				self.renderPoints(); self.drawChart(); self.persistCurve();
			});
			pi.addEventListener('change', function() {
				self.curve[i][1] = Math.min(100, Math.max(0, parseInt(pi.value, 10) || 0));
				self.curveTouched = true;
				self.drawChart(); self.persistCurve();
			});
			box.appendChild(E('div', { 'class': 'hw-pt' }, [
				E('span', {}, '温度'), ti, E('span', {}, '°C'),
				E('span', {}, '占空比'), pi, E('span', {}, '%'),
				E('button', { 'class': 'hw-btn', 'style': 'padding:5px 10px',
					'click': function() {
						if (self.curve.length <= 1) return;
						self.curve.splice(i, 1);
						self.curveTouched = true;
						self.renderPoints(); self.drawChart(); self.persistCurve();
					} }, '删除')
			]));
		});
	},

	/* 响应式 SVG 曲线图：viewBox + width:100%，不再用固定 520px canvas */
	drawChart: function() {
		var box = document.getElementById('hw-chart-box'); if (!box) return;
		var W = 600, H = 230, padL = 40, padR = 14, padT = 14, padB = 28;
		var x0 = 30, x1 = 90;
		function X(t) { return padL + (t - x0) / (x1 - x0) * (W - padL - padR); }
		function Y(p) { return H - padB - p / 100 * (H - padT - padB); }
		var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hw-chart" preserveAspectRatio="xMidYMid meet">';
		[ 0, 25, 50, 75, 100 ].forEach(function(p) {
			s += '<line x1="' + padL + '" y1="' + Y(p) + '" x2="' + (W - padR) + '" y2="' + Y(p) +
				'" stroke="rgba(127,127,127,.18)" stroke-width="1"/>';
			s += '<text x="4" y="' + (Y(p) + 3) + '" font-size="10" fill="currentColor" opacity=".55">' + p + '%</text>';
		});
		[ 30, 45, 60, 75, 90 ].forEach(function(t) {
			s += '<line x1="' + X(t) + '" y1="' + padT + '" x2="' + X(t) + '" y2="' + (H - padB) +
				'" stroke="rgba(127,127,127,.09)" stroke-width="1"/>';
			s += '<text x="' + (X(t) - 8) + '" y="' + (H - 9) + '" font-size="10" fill="currentColor" opacity=".55">' + t + '°</text>';
		});
		/* 内核四档阶梯（虚线） */
		var prevY = Y(Math.round(LEVELS[0] * 100 / 255));
		var stair = 'M ' + X(30) + ' ' + prevY;
		[ [ 40, 36 ], [ 50, 72 ], [ 65, 128 ], [ 80, 255 ] ].forEach(function(lv) {
			stair += ' L ' + X(lv[0]) + ' ' + prevY;
			prevY = Y(Math.round(lv[1] * 100 / 255));
			stair += ' L ' + X(lv[0]) + ' ' + prevY;
		});
		stair += ' L ' + X(90) + ' ' + prevY;
		s += '<path d="' + stair + '" fill="none" stroke="rgba(127,127,127,.5)" stroke-width="1.5" stroke-dasharray="5 4"/>';
		/* 用户曲线（渐变面积 + 折线 + 点） */
		var pts = this.curve || [];
		if (pts.length) {
			var line = 'M ' + X(30) + ' ' + Y(pts[0][1]);
			pts.forEach(function(p) { line += ' L ' + X(p[0]) + ' ' + Y(p[1]); });
			line += ' L ' + X(90) + ' ' + Y(pts[pts.length - 1][1]);
			s += '<path d="' + line + ' L ' + X(90) + ' ' + Y(0) + ' L ' + X(30) + ' ' + Y(0) +
				' Z" fill="rgba(94,114,228,.12)"/>';
			s += '<path d="' + line + '" fill="none" stroke="var(--primary,#5e72e4)" stroke-width="2.5" stroke-linejoin="round"/>';
			pts.forEach(function(p) {
				s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="4" fill="#fff" stroke="var(--primary,#5e72e4)" stroke-width="2"/>';
			});
		}
		/* 当前工作点 */
		if (this.data) {
			var t = (this.data.mode === 'curve' && this.src === 'max') ? this.data.hot : this.data.temp;
			s += '<circle cx="' + X(Math.min(x1, Math.max(x0, t))) + '" cy="' + Y(this.data.pct) +
				'" r="6" fill="#f5365c" stroke="#fff" stroke-width="2"/>';
		}
		s += '<text x="' + (W - padR - 2) + '" y="' + (padT + 8) + '" text-anchor="end" font-size="10" fill="currentColor" opacity=".5">虚线 = 内核四档 / 蓝线 = 自定义曲线 / 红点 = 当前</text>';
		s += '</svg>';
		box.innerHTML = s;
	},

	modeLabel: function(m) { return ({ auto: '自动', manual: '手动', curve: '曲线', off: '停转' })[m] || m; },

	curveSegment: function(t) {
		var pts = this.curve, m = (pts && pts.length) ? pts.length : 1;
		if (m < 2) return { k: 1, m: m };
		var k = m;
		for (var i = 0; i < pts.length; i++) if (t <= pts[i][0]) { k = i + 1; break; }
		return { k: k, m: m };
	},

	levelText: function(d) {
		if (d.mode === 'curve') {
			var t = (this.src === 'max') ? d.hot : d.temp;
			var seg = this.curveSegment(t);
			return '曲线 ' + seg.k + ' / ' + seg.m;
		}
		if (d.mode === 'auto') {
			var lv = (d.cur !== undefined && d.cur !== null && d.cur >= 0) ? d.cur : d.level;
			return '内核 ' + (lv + 1) + ' / ' + LEVELS.length;
		}
		if (d.mode === 'off') return '停转 0 / ' + LEVELS.length;
		var lv2 = 0;
		for (var i = 0; i < LEVELS.length; i++) if (d.pwm >= LEVELS[i]) lv2 = i + 1;
		return '固定 ' + lv2 + ' / ' + LEVELS.length;
	},

	run: function(args, quiet) {
		var self = this;
		return execCmd(args).then(function(res) {
			if (res.code !== 0)
				ui.addNotification(null, E('p', {}, '执行失败：' + (res.stderr || res.stdout || ('exit ' + res.code))), 'danger');
			else if (!quiet)
				ui.addNotification(null, E('p', {}, '已应用：' + args.join(' ')), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '调用失败：' + e.message), 'danger');
		});
	},

	handleMode: function(mode) {
		this._dragging = false;
		if (this._mt) { clearTimeout(this._mt); this._mt = null; }
		if (mode === 'off' && !confirm('确定停转风扇？长时间高负载可能触发降频。')) return;
		if (mode === 'manual') {
			var s = document.getElementById('hw-pct-slider');
			var v = s ? parseInt(s.value, 10) : this.manualPct;
			if (isNaN(v)) v = 50;
			return this.run([ 'manual', String(v) ]);
		}
		if (mode === 'curve') return this.run([ 'curve', this.curveStr(), '--src', this.src ]);
		return this.run([ mode ]);
	},

	handleManualInput: function() {
		var s = document.getElementById('hw-pct-slider');
		var n = document.getElementById('hw-pct-num');
		var v = s ? parseInt(s.value, 10) : 50;
		if (isNaN(v)) return;
		this.manualPct = v; this._dragging = true;
		if (n) n.value = v;
		this.setText('hw-pct-big', v);
		if (v > 0) this._lastPct = v;
		if (this._mt) clearTimeout(this._mt);
		this._mt = setTimeout(function() {
			execCmd([ 'manual', String(v), '--nosave' ]).catch(function() {});
		}, 200);
	},

	handleManualCommit: function() {
		var s = document.getElementById('hw-pct-slider');
		var v = s ? parseInt(s.value, 10) : this.manualPct;
		if (isNaN(v)) v = 50;
		this._dragging = false;
		if (this._mt) { clearTimeout(this._mt); this._mt = null; }
		if (v === 0) {
			if (!this._zeroOk) {
				if (!confirm('确定把风扇调到 0%？等同于停转，长时间高负载可能触发降频。')) {
					var prev = this._lastPct || 50;
					if (s) s.value = prev;
					var nb = document.getElementById('hw-pct-num'); if (nb) nb.value = prev;
					this.manualPct = prev; this.setText('hw-pct-big', prev);
					return this.run([ 'manual', String(prev) ], true);
				}
				this._zeroOk = true;
			}
		} else { this._zeroOk = false; this._lastPct = v; }
		return this.run([ 'manual', String(v) ], true);
	},

	handleManualNum: function(el) {
		var v = parseInt(el.value, 10);
		if (isNaN(v)) return;
		v = Math.min(100, Math.max(0, v));
		var s = document.getElementById('hw-pct-slider'); if (s) s.value = v;
		this.handleManualInput();
	},

	handleSrc: function() {
		var sel = document.getElementById('hw-src'); if (sel) this.src = sel.value;
		this.srcTouched = true;
		execCmd([ 'setcurve', '--src', this.src ]).catch(function() {});
		this.drawChart();
	},

	handleCurve: function() {
		var self = this;
		var sel = document.getElementById('hw-src'); if (sel) this.src = sel.value;
		return execCmd([ 'curve', this.curveStr(), '--src', this.src ]).then(function(res) {
			self.curveTouched = false;
			if (res.code !== 0)
				ui.addNotification(null, E('p', {}, '应用失败：' + (res.stderr || res.stdout || ('exit ' + res.code))), 'danger');
			else
				ui.addNotification(null, E('p', {}, '曲线已应用 · 取温源：' + (self.src === 'max' ? '最热传感器' : 'SoC')), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '调用失败：' + e.message), 'danger');
		});
	},

	handleAddPoint: function() {
		if (this.curve.length >= 8) return;
		var last = this.curve[this.curve.length - 1] || [ 50, 50 ];
		this.curve.push([ Math.min(95, last[0] + 10), Math.min(100, last[1] + 15) ]);
		this.curveTouched = true;
		this.curve.sort(function(a, b) { return a[0] - b[0]; });
		this.renderPoints(); this.drawChart(); this.persistCurve();
	},

	curveStr: function() { return this.curve.map(function(p) { return p[0] + ':' + p[1]; }).join(','); },

	persistCurve: function() {
		var self = this;
		if (this._ct) clearTimeout(this._ct);
		this._ct = setTimeout(function() {
			execCmd([ 'setcurve', self.curveStr(), '--src', self.src ]).catch(function() {});
		}, 400);
	},

	handleRestoreDefault: function() {
		this.curve = this.defaultCurve.map(function(p) { return p.slice(); });
		this.curveTouched = true;
		this.renderPoints(); this.drawChart(); this.persistCurve();
	},

	handleToggleAll: function() { this.showAll = !this.showAll; this.applySensors(); },

	render: function() {
		var self = this;
		/* 输入控件一律原生 addEventListener：ui.createHandlerFn 会 disabled+blur，
		   导致滑块拖不动、输入框打不进第二个字符。
		   支持 bind(el, ev1, fn1, ev2, fn2, ...) —— 旧版界面这里的 bind 只收 3 个参数，
		   传进去的 'change' 事件被静默丢弃，手动滑块拖完根本不会保存。 */
		var bind = function(el) {
			for (var i = 1; i + 1 < arguments.length; i += 2)
				el.addEventListener(arguments[i], arguments[i + 1]);
			return el;
		};

		var modeBtn = function(mode, label) {
			var b = E('button', { 'click': ui.createHandlerFn(self, 'handleMode', mode) }, label);
			self.modeBtns[mode] = b;
			return b;
		};

		var metric = function(id, label, val, unit, foot) {
			return E('div', { 'class': 'hw-card' }, [
				E('div', { 'class': 'hw-label' }, label),
				E('div', { 'class': 'hw-metric', 'id': id }, val),
				E('span', { 'class': 'hw-unit' }, unit),
				E('div', { 'class': 'hw-foot' }, foot || '')
			]);
		};

		poll.add(function() { return self.refresh(); }, 5);
		this.refresh();

		return E('div', { 'class': 'cbi-map hw-page' }, [
			E('style', {}, CSS),
			E('div', { 'class': 'hw-head' }, [
				E('div', {}, [
					E('h2', { 'class': 'hw-title' }, '风扇控制'),
					E('div', { 'class': 'hw-sub' },
						'IPQ9570 PWM 通道 3 · 台达 ASB0512HA。自动模式按 40 / 50 / 65 / 80 °C 四档调速；' +
						'曲线模式每 10 秒采样插值，可跟随最热传感器；任何模式下超过 92 °C 强制全速。')
				]),
				E('span', { 'class': 'hw-pill', 'id': 'hw-mode-pill' }, [
					E('span', { 'class': 'hw-dot' }), '读取中'
				])
			]),

			E('div', { 'class': 'hw-card', 'id': 'hw-nohw', 'style': 'display:none;border-color:rgba(245,54,92,.4);background:rgba(245,54,92,.08)' }, [
				E('h3', {}, '未检测到 PWM 风扇'),
				E('div', { 'class': 'hw-foot' },
					'固件里没有 /sys/class/hwmon 下的 pwmfan 节点。插件本身不需要设备树，' +
					'但内核需要打过 DTS 补丁才能导出调速与转速节点。请刷带 PWM 风扇支持的固件后重试。')
			]),

			/* ---- 顶部仪表盘 ---- */
			E('div', { 'class': 'hw-grid' }, [
				metric('hw-temp', '最热点温度', '—', '°C', '来源见下方温度列表'),
				metric('hw-pct', '风扇占空比', '—', '%', ''),
				metric('hw-rpm', '实测转速', '—', 'RPM', '无 tach 补丁时显示 —'),
				metric('hw-soc', 'SoC 温区', '—', '°C', '内核 governor 跟随此值')
			]),

			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '实时占空比'),
				E('div', { 'class': 'hw-bar' }, E('i', { 'id': 'hw-bar-i', 'style': 'width:0%' })),
				E('div', { 'class': 'hw-row', 'style': 'margin-bottom:0' }, [
					E('div', { 'class': 'hw-kv', 'style': 'flex:1;border:0;padding:0' }, [
						E('span', {}, '当前档位'), E('span', { 'id': 'hw-level' }, '—')
					]),
					E('div', { 'class': 'hw-kv', 'style': 'flex:1;border:0;padding:0' }, [
						E('span', {}, '温控归属'), E('span', { 'id': 'hw-thermal' }, '—')
					]),
					E('div', { 'class': 'hw-kv', 'style': 'flex:1;border:0;padding:0' }, [
						E('span', {}, 'PWM 使能'), E('span', { 'id': 'hw-enable' }, '—')
					]),
					E('div', { 'class': 'hw-kv', 'style': 'flex:1;border:0;padding:0' }, [
						E('span', {}, '控制器'), E('span', { 'id': 'hw-hwmon' }, '—')
					]),
					E('div', { 'class': 'hw-kv', 'style': 'flex:1;border:0;padding:0' }, [
						E('span', {}, '配置'), E('span', { 'id': 'hw-config' }, '—')
					])
				]),
				E('div', { 'class': 'hw-note', 'id': 'hw-lag', 'style': 'display:none' }, '')
			]),

			/* ---- 模式 + 温度 ---- */
			E('div', { 'class': 'hw-2col', 'style': 'margin-top:14px' }, [
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '调速模式'),
					E('div', { 'class': 'hw-seg' }, [
						modeBtn('auto', '自动'),
						modeBtn('manual', '手动'),
						modeBtn('curve', '曲线'),
						modeBtn('off', '停转')
					]),
					E('div', { 'class': 'hw-foot' },
						'自动 = 内核 thermal governor 四档；手动 = 固定占空比；曲线 = 用户态按温度插值；停转 = 关闭风扇。'),
					E('div', { 'class': 'hw-card', 'id': 'hw-manual-card', 'style': 'display:none;margin-top:14px;background:rgba(127,127,127,.03)' }, [
						E('h3', {}, '固定转速'),
						E('div', { 'class': 'hw-metric' }, [
							E('span', { 'id': 'hw-pct-big' }, '50'),
							E('span', { 'class': 'hw-unit' }, '%')
						]),
						E('div', { 'class': 'hw-row' }, [
							bind(E('input', { 'id': 'hw-pct-slider', 'type': 'range', 'min': '0', 'max': '100', 'value': '50', 'class': 'hw-slider' }),
								'input', function() { self.handleManualInput(); },
								'change', function() { self.handleManualCommit(); }),
							bind(E('input', { 'id': 'hw-pct-num', 'type': 'number', 'min': '0', 'max': '100', 'value': '50', 'class': 'hw-num' }),
								'input', function() { self.handleManualNum(this); },
								'change', function() { self.handleManualCommit(); })
						]),
						E('div', { 'class': 'hw-foot' }, '拖动即时生效，松手保存。台达风扇约 30% 占空比才能起转。')
					])
				]),
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '温度传感器'),
					E('div', { 'style': 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px' }, [
						E('span', { 'class': 'hw-label', 'style': 'margin:0' }, '全部实时读数 · 按温度排序'),
						E('a', { 'class': 'hw-link', 'id': 'hw-src-more', 'href': 'javascript:void(0)',
							'click': ui.createHandlerFn(this, 'handleToggleAll') }, '展开全部')
					]),
					E('div', { 'id': 'hw-sens-list' }, E('div', { 'class': 'hw-foot' }, '读取中…'))
				])
			]),

			/* ---- 曲线编辑器 ---- */
			E('div', { 'class': 'hw-card wide', 'id': 'hw-curve-card', 'style': 'display:none;margin-top:14px' }, [
				E('h3', {}, '自定义风扇曲线'),
				E('div', { 'class': 'hw-2col' }, [
					E('div', {}, [
						E('div', { 'class': 'hw-row' }, [
							E('label', {}, '取温源'),
							bind(E('select', { 'id': 'hw-src', 'class': 'hw-select' }, [
								E('option', { 'value': 'max' }, '最热传感器（推荐）'),
								E('option', { 'value': 'soc' }, 'SoC / CPU 温区')
							]), 'change', function() { self.handleSrc(); })
						]),
						E('div', { 'id': 'hw-points' }),
						E('div', { 'style': 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap' }, [
							E('button', { 'class': 'hw-btn', 'click': ui.createHandlerFn(this, 'handleAddPoint') }, '添加点'),
							E('button', { 'class': 'hw-btn', 'click': ui.createHandlerFn(this, 'handleRestoreDefault') }, '默认曲线'),
							E('button', { 'class': 'hw-btn primary', 'click': ui.createHandlerFn(this, 'handleCurve') }, '应用曲线')
						]),
						E('div', { 'class': 'hw-foot' }, '格式「温度:占空比」，最多 8 点，中间线性插值。编辑即自动保存。')
					]),
					E('div', { 'id': 'hw-chart-box' })
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
