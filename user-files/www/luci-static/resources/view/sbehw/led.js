'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

/* SBE1V1K 前置 RGB 状态灯 —— 新版界面
   后端 /usr/sbin/ledctl 保持原样（static / breath / blink / rainbow 四灯效）。 */

var PRESETS = [
	[ '白色', 'ffffff' ], [ '红色', 'ff2d2d' ], [ '绿色', '2de02d' ],
	[ '蓝色', '1e90ff' ], [ '黄色', 'ffd500' ], [ '紫色', 'b030ff' ],
	[ '青色', '00e5ff' ], [ '橙色', 'ff8800' ], [ '粉色', 'ff5fa2' ],
	[ '湖蓝', '19c7c7' ], [ '琥珀', 'ffb020' ], [ '靛蓝', '5a5aff' ]
];

var MODES = [
	[ 'static', '常亮' ], [ 'breath', '呼吸' ], [ 'blink', '闪烁' ], [ 'rainbow', '彩虹' ]
];

const callFileExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params', 'env' ],
	nobatch: true
});

var _execChain = Promise.resolve();
function execLed(args) {
	var p = _execChain.then(function() {
		return callFileExec('/usr/sbin/ledctl', args, null);
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
	'.hw-foot{font-size:12px;opacity:.6;margin-top:9px;line-height:1.55}',
	'.hw-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0}',
	'.hw-row>label{font-size:12.5px;opacity:.7;min-width:62px}',
	'.hw-slider{flex:1;min-width:110px}',
	'.hw-num{width:70px;padding:7px 8px;border-radius:9px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;text-align:center;font-variant-numeric:tabular-nums}',
	'.hw-btn{padding:9px 16px;border-radius:10px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.07);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-btn:hover{border-color:var(--primary,#5e72e4);transform:translateY(-1px)}',
	'.hw-btn.primary{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff}',
	'.hw-btn.on{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff;box-shadow:0 4px 12px rgba(94,114,228,.3)}',
	'.hw-kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(127,127,127,.12);font-size:12.5px}',
	'.hw-kv:last-child{border-bottom:0}',
	'.hw-kv span:first-child{opacity:.65}',
	'.hw-kv span:last-child{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}',
	'.hw-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}',
	/* 灯泡预览 */
	'.hw-lampbox{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:190px}',
	'.hw-lamp{width:112px;height:112px;border-radius:50%;position:relative;transition:background .25s,box-shadow .25s;' +
		'border:1px solid rgba(255,255,255,.25)}',
	'.hw-lamp:after{content:"";position:absolute;inset:-18px;border-radius:50%;background:inherit;filter:blur(24px);opacity:.5;z-index:-1}',
	'.hw-lamp.off{opacity:.25;box-shadow:none !important}',
	'.hw-hex{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;margin-top:16px;letter-spacing:.5px}',
	/* 预设色板 */
	'.hw-presets{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}',
	'.hw-sw{aspect-ratio:1;border-radius:11px;border:2px solid rgba(127,127,127,.22);cursor:pointer;transition:transform .16s,box-shadow .16s;position:relative}',
	'.hw-sw:hover{transform:scale(1.09)}',
	'.hw-sw.on{box-shadow:0 0 0 3px var(--primary,#5e72e4)}',
	'.hw-sw-name{font-size:11px;opacity:.65;text-align:center;margin-top:5px}',
	/* RGB 通道 */
	'.hw-ch{display:grid;grid-template-columns:20px minmax(90px,1fr) 62px;align-items:center;gap:10px;margin:9px 0}',
	'.hw-ch-tag{font-weight:700;font-size:12.5px;text-align:center}',
	'.hw-ch input[type=range]{width:100%}',
	/* 灯效卡片 */
	'.hw-eff{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}',
	'.hw-eff button{padding:14px 6px;border-radius:12px;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.05);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-eff button:hover{transform:translateY(-2px);border-color:var(--primary,#5e72e4)}',
	'.hw-eff button.on{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff;box-shadow:0 4px 12px rgba(94,114,228,.3)}',
	'.hw-eff-ico{display:block;font-size:19px;margin-bottom:5px;opacity:.9}',
	'.hw-switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer;font-size:13px;font-weight:600}',
	'.hw-switch input{width:18px;height:18px;accent-color:var(--primary,#5e72e4);cursor:pointer}',
	'.hw-note{padding:11px 14px;border-radius:11px;background:rgba(94,114,228,.09);border:1px solid rgba(94,114,228,.25);font-size:12.5px;line-height:1.65;margin-top:12px}',
	'@media(max-width:560px){.hw-presets{grid-template-columns:repeat(4,1fr)}.hw-eff{grid-template-columns:repeat(2,1fr)}.hw-metric{font-size:25px}}'
].join('');

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
	});
}

return view.extend({
	data: null,
	color: '1e90ff',
	brightness: 100,
	mode: 'static',
	speed: 3000,
	_bound: false,
	_ct: null,
	_st: null,
	_dragging: false,
	_presetEls: [],
	_effEls: {},

	refresh: function() {
		var self = this;
		return execLed([ 'json' ]).then(function(res) {
			var d = null;
			try { d = JSON.parse((res.stdout || '').trim()); } catch (e) { d = null; }
			if (!d || !d.ok) { self.noHw(); return; }
			self.data = d;
			self.update(d);
		}).catch(function() { self.noHw(); });
	},

	noHw: function() { var n = document.getElementById('hw-nohw'); if (n) n.style.display = ''; },
	setText: function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; },
	setHTML: function(id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; },

	update: function(d) {
		var n = document.getElementById('hw-nohw'); if (n) n.style.display = 'none';
		this.setHTML('hw-state-pill', '<span class="hw-dot"></span>' + (d.enabled ? (d.active ? '灯已点亮' : '已启用') : '已关闭'));
		this.setText('hw-actual', '#' + (d.actual || d.color));
		this.setText('hw-mode-now', this.modeName(d.mode));
		this.setText('hw-bright-now', d.brightness + ' %');
		this.setText('hw-speed-now', d.mode === 'static' ? '—' : (d.speed + ' ms'));
		this.setText('hw-conf-color', '#' + d.color);
		this.setText('hw-conf-bright', d.brightness + ' %');
		this.setText('hw-conf-mode', this.modeName(d.mode));
		this.setText('hw-conf-speed', d.speed + ' ms');

		var lamp = document.getElementById('hw-lamp');
		if (lamp) {
			var c = '#' + (d.actual || d.color);
			lamp.style.background = c;
			lamp.style.boxShadow = d.enabled && d.active
				? '0 0 34px 8px ' + c + ', inset 0 0 22px rgba(255,255,255,.35)'
				: 'none';
			if (d.enabled && d.active) lamp.classList.remove('off'); else lamp.classList.add('off');
		}

		if (!this._bound && document.getElementById('hw-enable')) {
			this.syncForm(d);
			var cb = document.getElementById('hw-enable'); if (cb) cb.checked = !!d.enabled;
			this._bound = true;
		}
		this.mode = d.mode || 'static';
		this.syncModeControls();
	},

	modeName: function(m) {
		for (var i = 0; i < MODES.length; i++) if (MODES[i][0] === m) return MODES[i][1];
		return m;
	},

	rgbFromHex: function(hex) {
		hex = String(hex || 'ffffff').replace('#', '');
		if (hex.length < 6) hex = 'ffffff';
		return [ parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16) ];
	},

	rgbToHex: function(r, g, b) {
		var p = function(n) {
			n = Math.max(0, Math.min(255, Math.round(n)));
			return (n < 16 ? '0' : '') + n.toString(16);
		};
		return p(r) + p(g) + p(b);
	},

	syncColorControls: function() {
		var rgb = this.rgbFromHex(this.color);
		var names = [ 'r', 'g', 'b' ];
		for (var i = 0; i < 3; i++) {
			var s = document.getElementById('hw-' + names[i]); if (s) s.value = rgb[i];
			var nu = document.getElementById('hw-' + names[i] + '-num'); if (nu) nu.value = rgb[i];
		}
		var h = document.getElementById('hw-hex'); if (h) h.value = this.color;
		var cp = document.getElementById('hw-picker'); if (cp) cp.value = '#' + this.color;
		var self = this;
		this._presetEls.forEach(function(o) {
			if (o.el.getAttribute('data-color') === self.color) o.el.classList.add('on');
			else o.el.classList.remove('on');
		});
		var lamp = document.getElementById('hw-lamp-edit');
		if (lamp) lamp.style.background = '#' + this.color;
	},

	syncModeControls: function() {
		var self = this;
		Object.keys(this._effEls).forEach(function(m) {
			if (m === self.mode) self._effEls[m].classList.add('on');
			else self._effEls[m].classList.remove('on');
		});
		var sp = document.getElementById('hw-speed');
		if (sp) sp.disabled = (this.mode === 'static');
		var spn = document.getElementById('hw-speed-num');
		if (spn) spn.disabled = (this.mode === 'static');
	},

	syncForm: function(d) {
		d = d || {};
		this.color = d.color || '1e90ff';
		this.brightness = parseInt(d.brightness, 10) || 100;
		this.mode = d.mode || 'static';
		this.speed = parseInt(d.speed, 10) || 3000;
		var sp = document.getElementById('hw-speed'); if (sp) sp.value = this.speed;
		var spn = document.getElementById('hw-speed-num'); if (spn) spn.value = this.speed;
		var bs = document.getElementById('hw-bright'); if (bs) bs.value = this.brightness;
		var bn = document.getElementById('hw-bright-num'); if (bn) bn.value = this.brightness;
		this.setText('hw-bright-big', this.brightness);
		this.syncColorControls();
		this.syncModeControls();
	},

	handleToggle: function() {
		var cb = document.getElementById('hw-enable');
		this.run(cb.checked ? [ 'on' ] : [ 'off' ]);
	},

	handlePreset: function(hex) {
		this.color = hex;
		this.syncColorControls();
		this.liveColor(true);
	},

	handleHexInput: function() {
		var h = document.getElementById('hw-hex');
		var v = String(h ? h.value : '').replace('#', '').toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(v)) return;
		this.color = v;
		this.syncColorControls();
		this.liveColor(true);
	},

	handlePicker: function() {
		var cp = document.getElementById('hw-picker');
		var v = String(cp ? cp.value : '').replace('#', '').toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(v)) return;
		this.color = v;
		this.syncColorControls();
		this.liveColor(true);
	},

	handleRgb: function(ch) {
		var idx = { r: 0, g: 1, b: 2 }[ch];
		var s = document.getElementById('hw-' + ch);
		var v = parseInt(s.value, 10); if (isNaN(v)) v = 0;
		var rgb = this.rgbFromHex(this.color);
		rgb[idx] = v;
		this.color = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
		var nu = document.getElementById('hw-' + ch + '-num'); if (nu) nu.value = v;
		var h = document.getElementById('hw-hex'); if (h) h.value = this.color;
		var cp = document.getElementById('hw-picker'); if (cp) cp.value = '#' + this.color;
		var lamp = document.getElementById('hw-lamp-edit'); if (lamp) lamp.style.background = '#' + this.color;
		this.liveColor(false);
	},

	handleRgbCommit: function() { this.liveColor(true); },

	handleBrightness: function() {
		var s = document.getElementById('hw-bright');
		var v = parseInt(s.value, 10); if (isNaN(v)) v = 100;
		this.brightness = v; this._dragging = true;
		var nu = document.getElementById('hw-bright-num'); if (nu) nu.value = v;
		this.setText('hw-bright-big', v);
		this.liveBrightness();
	},

	handleBrightnessCommit: function() { this._dragging = false; this.liveBrightness(true); },

	handleMode: function(mode) {
		this.mode = mode;
		this.syncModeControls();
		return this.run([ 'mode', mode ]);
	},

	handleSpeed: function() {
		var s = document.getElementById('hw-speed');
		var v = parseInt(s ? s.value : this.speed, 10); if (isNaN(v)) return;
		this.speed = v;
		var sn = document.getElementById('hw-speed-num'); if (sn) sn.value = v;
		var self = this;
		if (this._st) clearTimeout(this._st);
		this._st = setTimeout(function() {
			execLed([ 'speed', String(self.speed) ]).then(function(res) {
				if (res.code !== 0)
					ui.addNotification(null, E('p', {}, '周期设置失败：' + (res.stderr || res.stdout || ('code ' + res.code))), 'danger');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '周期设置异常：' + (e && e.message ? e.message : e)), 'danger');
			});
		}, 300);
	},

	handleApply: function() {
		var args = [ [ 'color', this.color ], [ 'brightness', String(this.brightness) ],
			[ 'mode', this.mode ], [ 'speed', String(this.speed) ] ];
		return this.runSeq(args, '已应用 · ' + this.describe());
	},

	handleLedReset: function() {
		var self = this;
		var DEF = { mode: 'static', color: '1e90ff', brightness: '100', speed: '3000' };
		return execLed([ 'mode', DEF.mode ]).then(function() {
			return execLed([ 'color', DEF.color ]);
		}).then(function() {
			return execLed([ 'brightness', DEF.brightness ]);
		}).then(function() {
			return execLed([ 'speed', DEF.speed ]);
		}).then(function() {
			self.syncForm(DEF);
			ui.addNotification(null, E('p', {}, '已恢复默认 · 常亮 / #1e90ff / 100% / 3000 ms'), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '恢复默认失败：' + (e && e.message ? e.message : e)), 'danger');
		});
	},

	describe: function() {
		return this.modeName(this.mode) + ' / #' + this.color +
			' / 亮度 ' + this.brightness + '% / 周期 ' + this.speed + ' ms';
	},

	liveColor: function(commit) {
		var self = this;
		if (this._ct) clearTimeout(this._ct);
		this._ct = setTimeout(function() {
			execLed([ 'color', self.color, commit ? '' : '--nosave' ].filter(Boolean)).then(function(res) {
				if (res.code !== 0)
					ui.addNotification(null, E('p', {}, '颜色设置失败：' + (res.stderr || res.stdout || ('code ' + res.code))), 'danger');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '颜色设置异常：' + (e && e.message ? e.message : e)), 'danger');
			});
		}, 200);
	},

	liveBrightness: function(commit) {
		var self = this;
		if (this._ct) clearTimeout(this._ct);
		this._ct = setTimeout(function() {
			execLed([ 'brightness', String(self.brightness), commit ? '' : '--nosave' ].filter(Boolean)).then(function(res) {
				if (res.code !== 0)
					ui.addNotification(null, E('p', {}, '亮度设置失败：' + (res.stderr || res.stdout || ('code ' + res.code))), 'danger');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '亮度设置异常：' + (e && e.message ? e.message : e)), 'danger');
			});
		}, 200);
	},

	run: function(args, quiet) {
		var self = this;
		return execLed(args).then(function(res) {
			if (res.code !== 0)
				ui.addNotification(null, E('p', {}, '执行失败：' + (res.stderr || res.stdout || ('exit ' + res.code))), 'danger');
			else if (!quiet)
				ui.addNotification(null, E('p', {}, '已应用'), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '调用失败：' + e.message), 'danger');
		});
	},

	runSeq: function(list, okMsg) {
		var self = this;
		return list.reduce(function(p, args) {
			return p.then(function() {
				return execLed(args).then(function(res) {
					if (res.code !== 0)
						throw new Error((res.stderr || res.stdout || ('code ' + res.code)).trim());
				});
			});
		}, Promise.resolve()).then(function() {
			ui.addNotification(null, E('p', {}, okMsg), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '执行失败：' + (e.message || e)), 'danger');
		});
	},

	render: function() {
		var self = this;
		/* 支持多组 (ev, fn)：旧版界面的 bind 只收 3 个参数，
		   第 4/5 个参数（'change' 事件）被静默丢弃，控件松手不保存。 */
		var bind = function(el) {
			for (var i = 1; i + 1 < arguments.length; i += 2)
				el.addEventListener(arguments[i], arguments[i + 1]);
			return el;
		};

		/* 预设色板 */
		var presets = E('div', { 'class': 'hw-presets' }, PRESETS.map(function(p) {
			var sw = bind(E('div', { 'class': 'hw-sw', 'data-color': p[1],
				'style': 'background:#' + p[1], 'title': p[0] }),
				'click', function() { self.handlePreset(p[1]); });
			self._presetEls.push({ el: sw, hex: p[1] });
			return E('div', {}, [ sw, E('div', { 'class': 'hw-sw-name' }, p[0]) ]);
		}));

		/* RGB 三通道 */
		var chans = [ [ 'r', 'R', '#f5365c' ], [ 'g', 'G', '#2dce89' ], [ 'b', 'B', '#5e72e4' ] ].map(function(c) {
			return E('div', { 'class': 'hw-ch' }, [
				E('span', { 'class': 'hw-ch-tag', 'style': 'color:' + c[2] }, c[1]),
				bind(E('input', { 'type': 'range', 'id': 'hw-' + c[0], 'min': '0', 'max': '255', 'value': '30',
					'style': 'accent-color:' + c[2] }),
					'input', function() { self.handleRgb(c[0]); },
					'change', function() { self.handleRgbCommit(); }),
				bind(E('input', { 'type': 'number', 'id': 'hw-' + c[0] + '-num', 'min': '0', 'max': '255', 'value': '30', 'class': 'hw-num', 'style': 'width:62px' }),
					'input', function() {
						var s = document.getElementById('hw-' + c[0]);
						if (s) s.value = this.value;
						self.handleRgb(c[0]);
					},
					'change', function() { self.handleRgbCommit(); })
			]);
		});

		/* 灯效卡片 */
		var ICO = { static: '●', breath: '◐', blink: '◉', rainbow: '✦' };
		var effs = E('div', { 'class': 'hw-eff' }, MODES.map(function(m) {
			var b = E('button', { 'click': ui.createHandlerFn(self, 'handleMode', m[0]) }, [
				E('span', { 'class': 'hw-eff-ico' }, ICO[m[0]]), m[1]
			]);
			self._effEls[m[0]] = b;
			return b;
		}));

		poll.add(function() { return self.refresh(); }, 5);
		this.refresh();

		return E('div', { 'class': 'cbi-map hw-page' }, [
			E('style', {}, CSS),
			E('div', { 'class': 'hw-head' }, [
				E('div', {}, [
					E('h2', { 'class': 'hw-title' }, 'RGB 状态灯'),
					E('div', { 'class': 'hw-sub' },
						'前置三色 PWM LED（红 GPIO44 / 绿 GPIO45 / 蓝 GPIO56，最大亮度 255）。' +
						'支持常亮、呼吸、闪烁、彩虹循环，颜色与灯效设置重启后保留。')
				]),
				E('span', { 'class': 'hw-pill', 'id': 'hw-state-pill' }, [
					E('span', { 'class': 'hw-dot' }), '读取中'
				])
			]),

			E('div', { 'class': 'hw-card', 'id': 'hw-nohw', 'style': 'display:none;border-color:rgba(245,54,92,.4);background:rgba(245,54,92,.08)' }, [
				E('h3', {}, '未检测到 RGB LED'),
				E('div', { 'class': 'hw-foot' },
					'固件里没有 /sys/class/leds/ 下的 red/green/blue:status 节点。' +
					'插件本身不需要设备树，但内核需要 pwm-leds 驱动与 DTS 节点。请刷带 RGB 支持的固件后重试。')
			]),

			/* ---- 预览 + 状态 ---- */
			E('div', { 'class': 'hw-2col' }, [
				E('div', { 'class': 'hw-card hw-lampbox' }, [
					E('div', { 'class': 'hw-lamp', 'id': 'hw-lamp', 'style': 'background:#1e90ff' }),
					E('div', { 'class': 'hw-hex', 'id': 'hw-actual' }, '#1e90ff'),
					E('div', { 'class': 'hw-foot' }, '实时显示颜色（已按亮度缩放）')
				]),
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '运行状态'),
					E('div', {}, [
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '灯效'), E('span', { 'id': 'hw-mode-now' }, '—') ]),
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '亮度'), E('span', { 'id': 'hw-bright-now' }, '—') ]),
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '周期 / 速度'), E('span', { 'id': 'hw-speed-now' }, '—') ]),
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '保存的颜色'), E('span', { 'id': 'hw-conf-color' }, '—') ]),
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '保存的亮度'), E('span', { 'id': 'hw-conf-bright' }, '—') ]),
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '保存的灯效'), E('span', { 'id': 'hw-conf-mode' }, '—') ]),
						E('div', { 'class': 'hw-kv' }, [ E('span', {}, '保存的周期'), E('span', { 'id': 'hw-conf-speed' }, '—') ])
					]),
					E('div', { 'class': 'hw-row', 'style': 'margin-bottom:0' }, [
						E('label', { 'class': 'hw-switch' }, [
							bind(E('input', { 'type': 'checkbox', 'id': 'hw-enable' }),
								'change', function() { self.handleToggle(); }),
							'启用状态灯'
						])
					])
				])
			]),

			/* ---- 颜色 ---- */
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '颜色'),
				E('div', { 'class': 'hw-2col' }, [
					E('div', {}, [
						E('div', { 'class': 'hw-label' }, '预设色'),
						presets,
						E('div', { 'class': 'hw-row' }, [
							E('label', {}, '取色'),
							bind(E('input', { 'type': 'color', 'id': 'hw-picker', 'value': '#1e90ff',
								'style': 'width:46px;height:36px;padding:0;border:1px solid rgba(127,127,127,.3);border-radius:8px;background:none;cursor:pointer' }),
								'input', function() { self.handlePicker(); }),
							bind(E('input', { 'type': 'text', 'id': 'hw-hex', 'class': 'hw-num', 'value': '1e90ff', 'style': 'width:96px;font-family:monospace' }),
								'input', function() { self.handleHexInput(); }),
							E('span', { 'class': 'hw-foot', 'style': 'margin:0' }, 'RRGGBB')
						]),
						E('div', { 'style': 'margin-top:12px;padding:10px 12px;border-radius:11px;background:rgba(127,127,127,.05)' }, [
							E('div', { 'style': 'display:flex;align-items:center;gap:10px' }, [
								E('div', { 'id': 'hw-lamp-edit', 'style': 'width:28px;height:28px;border-radius:50%;background:#1e90ff;border:1px solid rgba(255,255,255,.25)' }),
								E('span', { 'class': 'hw-foot', 'style': 'margin:0' }, '当前选定颜色')
							])
						])
					]),
					E('div', {}, [
						E('div', { 'class': 'hw-label' }, 'RGB 通道 (0–255)'),
						chans,
						E('div', { 'class': 'hw-label', 'style': 'margin-top:16px' }, '主控亮度'),
						E('div', { 'class': 'hw-metric' }, [
							E('span', { 'id': 'hw-bright-big' }, '100'),
							E('span', { 'class': 'hw-unit' }, '%')
						]),
						E('div', { 'class': 'hw-row' }, [
							bind(E('input', { 'type': 'range', 'id': 'hw-bright', 'min': '0', 'max': '100', 'value': '100',
								'class': 'hw-slider', 'style': 'accent-color:var(--primary,#5e72e4)' }),
								'input', function() { self.handleBrightness(); },
								'change', function() { self.handleBrightnessCommit(); }),
							bind(E('input', { 'type': 'number', 'id': 'hw-bright-num', 'min': '0', 'max': '100', 'value': '100', 'class': 'hw-num' }),
								'input', function() {
									var s = document.getElementById('hw-bright');
									if (s) s.value = this.value;
									self.handleBrightness();
								},
								'change', function() { self.handleBrightnessCommit(); })
						])
					])
				])
			]),

			/* ---- 灯效 ---- */
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '灯效'),
				effs,
				E('div', { 'class': 'hw-row', 'style': 'margin-top:14px' }, [
					E('label', {}, '周期 / 速度'),
					bind(E('input', { 'type': 'range', 'id': 'hw-speed', 'min': '200', 'max': '20000', 'step': '100', 'value': '3000',
						'class': 'hw-slider', 'style': 'accent-color:var(--primary,#5e72e4)' }),
						'input', function() { self.handleSpeed(); },
						'change', function() { self.handleSpeed(); }),
					bind(E('input', { 'type': 'number', 'id': 'hw-speed-num', 'min': '200', 'max': '60000', 'value': '3000', 'class': 'hw-num' }),
						'input', function() {
							var s = document.getElementById('hw-speed');
							if (s) s.value = Math.min(20000, parseInt(this.value, 10) || 3000);
							self.handleSpeed();
						},
						'change', function() { self.handleSpeed(); }),
					E('span', { 'class': 'hw-foot', 'style': 'margin:0' }, 'ms')
				]),
				E('div', { 'class': 'hw-note' },
					'呼吸 / 闪烁：数值为一个完整明暗周期；彩虹：数值为跑完一圈色环的时间。' +
					'常亮模式下周期不生效。所有设置即时预览，点「保存并应用」写入配置。'),
				E('div', { 'style': 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap' }, [
					E('button', { 'class': 'hw-btn primary', 'click': ui.createHandlerFn(self, 'handleApply') }, '保存并应用'),
					E('button', { 'class': 'hw-btn', 'click': ui.createHandlerFn(self, 'handleLedReset') }, '恢复默认')
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
