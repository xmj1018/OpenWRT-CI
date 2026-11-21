'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

/* Xiaomi BE10000 智能风扇 —— 万兆专属界面
   硬件: Microchip EMC2301/2305 I2C @0x2f (hwmon name=emc2305)
         pwm1 0..255（thermal 10 档量化）+ fan1_input 真实 RPM
   温控: 扫描全部 thermal_zone 取最热；四档策略线性插值 + 滞回
   与 SBE1V1K 的 pwm-fan 插件完全独立，不共用任何路径/后端。 */

const callFileExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params', 'env' ],
	nobatch: true
});

var _chain = Promise.resolve();
function exec(args) {
	var p = _chain.then(function() { return callFileExec('/usr/sbin/be10000-fanctl', args, null); });
	_chain = p.then(function() {}, function() {});
	return Promise.race([
		p.then(function(r) { return r || { code: -1, stdout: '', stderr: 'no reply' }; }),
		new Promise(function(_, rej) {
			setTimeout(function() { rej(new Error((args[0] || '命令') + ' 执行超时')); }, 30000);
		})
	]);
}

var CSS = [
	'.hw-page{width:100%;max-width:100%;margin:0}',
	'.hw-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 18px}',
	'.hw-title{font-size:22px;font-weight:750;letter-spacing:.3px;margin:0;line-height:1.2}',
	'.hw-sub{opacity:.62;font-size:13px;margin-top:6px;line-height:1.6;max-width:760px}',
	'.hw-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.07);white-space:nowrap}',
	'.hw-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(127,127,127,.15)}',
	'.hw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}',
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
	'.hw-seg button{flex:1;min-width:78px;padding:11px 12px;border-radius:11px;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.05);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-seg button:hover{border-color:var(--primary,#5e72e4);transform:translateY(-1px)}',
	'.hw-seg button.on{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff;box-shadow:0 4px 12px rgba(94,114,228,.3)}',
	'.hw-profile{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}',
	'.hw-pf{border:1px solid rgba(127,127,127,.2);border-radius:14px;background:rgba(127,127,127,.04);padding:14px 15px;cursor:pointer;transition:all .18s}',
	'.hw-pf:hover{border-color:var(--primary,#5e72e4);transform:translateY(-2px)}',
	'.hw-pf.on{border-color:var(--primary,#5e72e4);background:rgba(94,114,228,.1);box-shadow:0 4px 14px rgba(94,114,228,.16)}',
	'.hw-pf b{font-size:14px;font-weight:700;display:block;margin-bottom:6px}',
	'.hw-pf small{font-size:12px;opacity:.65;line-height:1.55;display:block}',
	'.hw-pf .hw-range{font-size:11.5px;opacity:.8;margin-top:8px;font-variant-numeric:tabular-nums}',
	'.hw-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:9px 0}',
	'.hw-row>label{font-size:12.5px;opacity:.7;min-width:62px}',
	'.hw-slider{flex:1;min-width:110px;accent-color:var(--primary,#5e72e4)}',
	'.hw-num{width:70px;padding:7px 8px;border-radius:9px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;text-align:center;font-variant-numeric:tabular-nums}',
	'.hw-btn{padding:9px 16px;border-radius:10px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.07);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-btn:hover{border-color:var(--primary,#5e72e4);transform:translateY(-1px)}',
	'.hw-btn.primary{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff}',
	'.hw-sens-row{display:grid;grid-template-columns:minmax(110px,1fr) minmax(55px,1.1fr) 60px;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid rgba(127,127,127,.12)}',
	'.hw-sens-row:last-child{border-bottom:0}',
	'.hw-sens-name{font-size:12.5px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
	'.hw-sens-track{height:7px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden}',
	'.hw-sens-track>i{display:block;height:100%;border-radius:999px;transition:width .4s}',
	'.hw-sens-t{text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}',
	'.hw-chart{width:100%;height:auto;display:block;border-radius:12px;background:rgba(127,127,127,.05);border:1px solid rgba(127,127,127,.14)}',
	'.hw-kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(127,127,127,.12);font-size:12.5px}',
	'.hw-kv:last-child{border-bottom:0}',
	'.hw-kv span:first-child{opacity:.65}',
	'.hw-kv span:last-child{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}',
	'.hw-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}',
	'.hw-note{padding:11px 14px;border-radius:11px;background:rgba(251,99,64,.1);border:1px solid rgba(251,99,64,.28);font-size:12.5px;line-height:1.65;margin-top:12px}',
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

var PROFILES = [
	{ k: 'auto',        n: '自动',   d: '均衡日常，45°C 起转、85°C 全速', s: 45, f: 85 },
	{ k: 'quiet',       n: '静音',   d: '更晚起转、更低转速，优先安静',   s: 52, f: 80 },
	{ k: 'balanced',    n: '均衡',   d: '提前上速，压住高负载温度',       s: 45, f: 75 },
	{ k: 'performance', n: '性能',   d: '38°C 即起转、65°C 全速，最凉',   s: 38, f: 65 }
];

return view.extend({
	data: null,
	modeBtns: {},
	pfCards: {},
	showAll: false,
	_dragging: false,

	refresh: function() {
		var self = this;
		return exec([ 'json' ]).then(function(res) {
			var d = null;
			try { d = JSON.parse((res.stdout || '').trim()); } catch (e) { d = null; }
			if (!d || !d.ok) { self.noHw(d); return; }
			self.data = d; self.update(d);
		}).catch(function(e) { self.noHw(null, e); });
	},

	noHw: function(d, e) {
		var n = document.getElementById('hw-nohw');
		if (n) n.style.display = '';
		var m = document.getElementById('hw-nohw-msg');
		if (m) m.textContent = d && d.error === 'no-emc2305'
			? '未找到 EMC2305 风扇控制器（/sys/bus/i2c/devices/*-002f/hwmon）。请确认 kmod-hwmon-emc2305 已安装并加载。'
			: (e ? ('读取失败：' + e.message) : '无法读取风扇状态。');
	},

	setText: function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; },
	setHTML: function(id, v) { var el = document.getElementById(id); if (el) el.innerHTML = v; },

	update: function(d) {
		var self = this;
		var no = document.getElementById('hw-nohw'); if (no) no.style.display = 'none';
		this.setHTML('hw-mode-pill', '<span class="hw-dot"></span>' + esc(this.modeLabel(d.mode, d.profile)));
		this.setText('hw-temp', d.hot);
		this.setText('hw-temp-src', d.sensor || '—');
		var te = document.getElementById('hw-temp'); if (te) te.style.color = tcolor(d.hot);
		this.setText('hw-rpm', (d.rpm === undefined || d.rpm === null || d.rpm < 0) ? '—' : d.rpm);
		this.setText('hw-pct', d.pct);
		this.setText('hw-pwm', d.pwm);
		this.setText('hw-zonecount', d.zones);
		this.setText('hw-target', d.target);
		this.setText('hw-board', d.board || '—');
		this.setText('hw-hwmon', 'emc2305 / pwm1');
		this.setText('hw-profile', this.profileName(d.profile));
		this.setText('hw-range', d.start + '–' + d.full + ' °C');
		this.setText('hw-minpwm', d.minpwm + ' (' + Math.round(d.minpwm * 100 / 255) + '%)');
		this.setText('hw-error', d.error || '无');

		var bar = document.getElementById('hw-bar-i');
		if (bar) {
			bar.style.width = d.pct + '%';
			bar.style.background = d.pct === 0 ? 'rgba(127,127,127,.4)'
				: d.pct >= 90 ? '#f5365c' : d.pct >= 50 ? '#5e72e4' : '#2dce89';
		}
		Object.keys(this.modeBtns).forEach(function(m) {
			var b = self.modeBtns[m]; if (b) { if (m === d.mode) b.classList.add('on'); else b.classList.remove('on'); }
		});
		Object.keys(this.pfCards).forEach(function(k) {
			var c = self.pfCards[k]; if (c) { if (k === d.profile && d.mode === 'auto') c.classList.add('on'); else c.classList.remove('on'); }
		});
		var mc = document.getElementById('hw-manual-card');
		if (mc) mc.style.display = (d.mode === 'manual') ? '' : 'none';
		if (!this._dragging) {
			var sl = document.getElementById('hw-pct-slider'), nm = document.getElementById('hw-pct-num');
			if (sl) sl.value = d.pct; if (nm) nm.value = d.pct;
			this.setText('hw-pct-big', d.pct);
		}
		this.last = d;
		this.renderSensors(d.sensors || []);
		this.drawChart(d);
	},

	modeLabel: function(m, p) {
		return m === 'manual' ? '手动' : m === 'off' ? '已停止' : ('自动 · ' + this.profileName(p));
	},
	profileName: function(p) {
		for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].k === p) return PROFILES[i].n;
		return '自动';
	},

	renderSensors: function(list) {
		var box = document.getElementById('hw-sens-list'); if (!box) return;
		var html = '', max = 0;
		list.forEach(function(s) { if (s.temp > max) max = s.temp; });
		list.forEach(function(s) {
			var w = Math.min(100, Math.max(2, s.temp / 95 * 100));
			html += '<div class="hw-sens-row"><div class="hw-sens-name" title="' + esc(s.name) + '">' + esc(s.name) + '</div>' +
				'<div class="hw-sens-track"><i style="width:' + w + '%;background:' + tcolor(s.temp) + '"></i></div>' +
				'<div class="hw-sens-t" style="color:' + tcolor(s.temp) + '">' + s.temp + '°</div></div>';
		});
		box.innerHTML = html || '<div class="hw-foot">没有可读的温区</div>';
	},

	drawChart: function(d) {
		var svg = document.getElementById('hw-chart'); if (!svg) return;
		var W = 720, H = 200, PL = 46, PR = 16, PT = 16, PB = 28;
		var iw = W - PL - PR, ih = H - PT - PB;
		var lo = 30, hi = 95;
		function X(t) { return PL + (t - lo) / (hi - lo) * iw; }
		function Y(p) { return PT + ih - p / 100 * ih; }
		var s = '';
		for (var t = 30; t <= 95; t += 10) {
			s += '<line x1="' + X(t) + '" y1="' + PT + '" x2="' + X(t) + '" y2="' + (PT + ih) + '" stroke="rgba(127,127,127,.16)" stroke-width="1"/>';
			s += '<text x="' + X(t) + '" y="' + (H - 8) + '" font-size="11" fill="currentColor" opacity=".55" text-anchor="middle">' + t + '°</text>';
		}
		for (var p = 0; p <= 100; p += 25) {
			s += '<line x1="' + PL + '" y1="' + Y(p) + '" x2="' + (W - PR) + '" y2="' + Y(p) + '" stroke="rgba(127,127,127,.16)" stroke-width="1"/>';
			s += '<text x="' + (PL - 8) + '" y="' + (Y(p) + 4) + '" font-size="11" fill="currentColor" opacity=".55" text-anchor="end">' + p + '%</text>';
		}
		var st = d.start, fu = d.full, mp = Math.round(d.minpwm * 100 / 255);
		var pts = [ [lo, 0], [st, 0], [st, mp], [fu, 100], [hi, 100] ];
		var poly = pts.map(function(q) { return X(q[0]) + ',' + Y(q[1]); }).join(' ');
		s += '<polyline points="' + poly + '" fill="none" stroke="#5e72e4" stroke-width="2.5" stroke-linejoin="round"/>';
		var cx = Math.max(lo, Math.min(hi, d.hot)), cy = Y(d.pct);
		s += '<line x1="' + X(cx) + '" y1="' + PT + '" x2="' + X(cx) + '" y2="' + (PT + ih) + '" stroke="#fb6340" stroke-width="1" stroke-dasharray="4 3" opacity=".7"/>';
		s += '<circle cx="' + X(cx) + '" cy="' + cy + '" r="5.5" fill="#fb6340" stroke="#fff" stroke-width="2"/>';
		s += '<text x="' + (X(cx) + 9) + '" y="' + (cy - 8) + '" font-size="11.5" fill="currentColor" font-weight="600">' + d.hot + '°C / ' + d.pct + '%</text>';
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		svg.innerHTML = s;
	},

	doCmd: function(args, okMsg) {
		var self = this;
		return exec(args).then(function(res) {
			if (res.code !== 0) ui.addNotification(null, E('p', {}, '执行失败：' + (res.stderr || res.stdout || ('exit ' + res.code))), 'danger');
			else if (okMsg) ui.addNotification(null, E('p', {}, okMsg), 'info');
			return self.refresh();
		}).catch(function(e) { ui.addNotification(null, E('p', {}, '调用失败：' + e.message), 'danger'); });
	},

	card: function(id, label, val, unit, foot) {
		return E('div', { 'class': 'hw-card' }, [
			E('div', { 'class': 'hw-label' }, label),
			E('div', { 'class': 'hw-metric', 'id': id }, val),
			E('span', { 'class': 'hw-unit' }, unit),
			E('div', { 'class': 'hw-foot' }, foot || '')
		]);
	},

	render: function() {
		var self = this;
		poll.add(function() { return self.refresh(); }, 5);

		var modeSeg = E('div', { 'class': 'hw-seg' });
		[ [ 'auto', '自动温控' ], [ 'manual', '手动' ], [ 'off', '停止' ] ].forEach(function(m) {
			var b = E('button', { 'click': ui.createHandlerFn(self, 'doCmd', [ 'mode', m[0] ], '已切换：' + m[1]) }, m[1]);
			self.modeBtns[m[0]] = b; modeSeg.appendChild(b);
		});

		var pfBox = E('div', { 'class': 'hw-profile' });
		PROFILES.forEach(function(p) {
			var c = E('div', {
				'class': 'hw-pf',
				'click': ui.createHandlerFn(self, 'doCmd', [ 'profile', p.k ], '策略已切换为「' + p.n + '」')
			}, [
				E('b', {}, p.n),
				E('small', {}, p.d),
				E('div', { 'class': 'hw-range' }, p.s + '°C 起转 → ' + p.f + '°C 全速')
			]);
			self.pfCards[p.k] = c; pfBox.appendChild(c);
		});

		var slider = E('input', { 'type': 'range', 'min': '0', 'max': '100', 'value': '50', 'class': 'hw-slider', 'id': 'hw-pct-slider' });
		var num = E('input', { 'type': 'number', 'min': '0', 'max': '100', 'value': '50', 'class': 'hw-num', 'id': 'hw-pct-num' });
		var setManual = function(v) {
			v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
			self.doCmd([ 'manual', String(v) ]);
		};
		slider.addEventListener('input', function() { self._dragging = true; num.value = slider.value; self.setText('hw-pct-big', slider.value); });
		slider.addEventListener('change', function() { self._dragging = false; setManual(slider.value); });
		num.addEventListener('change', function() { slider.value = num.value; setManual(num.value); });

		return E('div', { 'class': 'cbi-map hw-page' }, [
			E('style', {}, CSS),
			E('div', { 'class': 'hw-head' }, [
				E('div', {}, [
					E('h2', { 'class': 'hw-title' }, '智能风扇控制'),
					E('div', { 'class': 'hw-sub' }, '小米万兆 BE10000 专属 · EMC2305 I2C 风扇控制器 · 四档温控策略 · 真实转速反馈')
				]),
				E('span', { 'class': 'hw-pill', 'id': 'hw-mode-pill' }, [ E('span', { 'class': 'hw-dot' }), '读取中' ])
			]),
			E('div', { 'class': 'hw-card', 'id': 'hw-nohw', 'style': 'display:none;border-color:rgba(245,54,92,.4);background:rgba(245,54,92,.08)' }, [
				E('h3', {}, '未检测到 EMC2305 风扇控制器'),
				E('div', { 'class': 'hw-foot', 'id': 'hw-nohw-msg' }, ''),
				E('div', { 'class': 'hw-foot' }, '此插件仅适用于 xiaomi,be10000 / be10000-es，不用于 SBE1V1K。')
			]),
			E('div', { 'class': 'hw-grid' }, [
				this.card('hw-temp', '最热温区', '—', '°C', [ E('span', { 'id': 'hw-temp-src' }, '—') ]),
				this.card('hw-rpm', '实时转速', '—', 'RPM', 'EMC2305 芯片原生 tach'),
				this.card('hw-pct', '当前占空比', '—', '%', [ E('span', { 'id': 'hw-pwm' }, '—'), ' / 255' ]),
				this.card('hw-zonecount', '温区总数', '—', '路', '取全部温区最高值决策')
			]),
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '转速与温度'),
				E('div', { 'class': 'hw-bar' }, E('i', { 'id': 'hw-bar-i', 'style': 'width:0%' })),
				E('svg', { 'class': 'hw-chart', 'id': 'hw-chart', 'style': 'margin-top:12px', 'viewBox': '0 0 720 200' })
			]),
			E('div', { 'class': 'hw-2col', 'style': 'margin-top:14px' }, [
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '运行模式'),
					modeSeg,
					E('div', { 'class': 'hw-card', 'id': 'hw-manual-card', 'style': 'display:none;margin-top:14px;background:rgba(127,127,127,.03)' }, [
						E('div', { 'class': 'hw-label' }, '手动占空比'),
						E('div', { 'class': 'hw-metric' }, [ E('span', { 'id': 'hw-pct-big' }, '50'), E('span', { 'class': 'hw-unit' }, '%') ]),
						E('div', { 'class': 'hw-row' }, [ slider, num ]),
						E('div', { 'class': 'hw-foot' }, '注意：≥75°C 时无论何种模式都会强制全速保护。')
					]),
					E('div', { 'class': 'hw-note' }, '风扇由内核 thermal 量化为 10 档 cooling state，写入任意 PWM 会被回弹到最近档位，属正常现象。')
				]),
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '硬件与策略状态'),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '机型'), E('span', { 'id': 'hw-board' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '风扇芯片'), E('span', { 'id': 'hw-hwmon' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '当前策略'), E('span', { 'id': 'hw-profile' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '起转 / 全速'), E('span', { 'id': 'hw-range' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '最低占空比'), E('span', { 'id': 'hw-minpwm' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '目标 PWM'), E('span', { 'id': 'hw-target' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '状态'), E('span', { 'id': 'hw-error' }, '—') ]),
					E('div', { 'class': 'hw-row', 'style': 'margin-top:12px' }, [
						E('button', { 'class': 'hw-btn primary', 'click': ui.createHandlerFn(self, 'doCmd', [ 'apply' ], '已立即应用') }, '立即应用')
					])
				])
			]),
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '温控策略'),
				pfBox,
				E('div', { 'class': 'hw-foot' }, '切换策略后守护进程会在下一个采样周期（默认 3 秒）生效；带滞回，避免温度在阈值附近反复起停。')
			]),
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '全部温区'),
				E('div', { 'id': 'hw-sens-list' })
			])
		]);
	}
});
