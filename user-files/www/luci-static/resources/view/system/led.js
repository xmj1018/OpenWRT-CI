'use strict';
'require view';
'require fs';
'require rpc';
'require ui';
'require poll';

var PRESETS = [
	[ '白色', 'ffffff' ], [ '红色', 'ff2d2d' ], [ '绿色', '2de02d' ],
	[ '蓝色', '1e90ff' ], [ '黄色', 'ffd500' ], [ '紫色', 'b030ff' ],
	[ '青色', '00e5ff' ], [ '橙色', 'ff8800' ]
];

var MODES = [
	[ 'static', '常亮' ], [ 'breath', '呼吸' ], [ 'blink', '闪烁' ], [ 'rainbow', '彩虹' ]
];

/* ---------- 命令调用：绕过 LuCI 的 batch 队列 + 超时兜底 ----------
   LuCI 的 ubus 请求会把「同一 tick 内」发起的多个调用合并成一个 JSON-RPC batch。
   只要这个 batch 请求失败（超时/网络抖动），整批的 Promise 会永久 pending ——
   luci.js 里的 flushRequestQueue() 只写了 .then(reply => ...) 没有 .catch，
   失败时既不 resolve 也不 reject。页面表现就是「改了没反应、也不报错」，
   而且同批次的其它调用（轮询 json、颜色、周期）会一起卡死。

   根治：自己声明 rpc 调用并加 nobatch: true ——
   luci.js 的 isQueueableRequest() 里 `if (opt.nobatch === true) return false`，
   nobatch 的请求独立发送，不会被合并进任何 batch。
   再加两道保险：串行队列（任何时刻只有一个 ubus 请求在飞）
   + 10 秒超时（真出问题就 reject 并弹提示，绝不静默）。 */
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
	/* 队列本身吞掉错误，避免一次失败把后续全部带崩 */
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

return view.extend({
	data: null,
	color: '1e90ff',
	brightness: 100,
	mode: 'static',
	speed: 3000,
	_lastColor: '1e90ff',
	_lastBright: 100,
	_bound: false,
	_ct: null,
	_st: null,

	/* ---------- 数据 ---------- */
	refresh: function() {
		var self = this;
		return execLed([ 'json' ]).then(function(res) {
			var d = null;
			try { d = JSON.parse((res.stdout || '').trim()); } catch (e) { d = null; }
			if (!d || !d.ok) return;
			self.data = d;
			self.update(d);
		}).catch(function() {});
	},

	update: function(d) {
		var el;
		el = document.getElementById('l-state');
		if (el) el.innerHTML = d.enabled
			? (d.active
				? '<span class="led-badge ok">活跃</span>'
				: '<span class="led-badge warn">已启用</span>')
			: '<span class="led-badge gray">已关闭</span>';

		el = document.getElementById('l-switch');
		if (el) el.textContent = d.enabled ? '开' : '关';

		el = document.getElementById('l-color');
		if (el) {
			el.innerHTML = '<span class="led-swatch" style="background:#' + (d.actual || d.color) + '"></span>'
				+ '<span class="mono">#' + (d.actual || d.color) + '</span>';
		}

		el = document.getElementById('l-mode');
		if (el) el.textContent = this.modeName(d.mode);

		el = document.getElementById('l-bright');
		if (el) el.textContent = d.brightness + '%';

		el = document.getElementById('l-speed');
		if (el) el.textContent = (d.mode === 'static') ? '—' : (d.speed + ' ms');

		el = document.getElementById('l-cfg');
		if (el) el.innerHTML = '<span class="led-badge ok">有效</span>';

		/* 首次载入才回填表单，避免轮询覆盖用户正在编辑的内容 */
		if (!this._bound && document.getElementById('l-enable')) {
		this.syncForm(d);
			this._lastColor = this.color;
			this._lastBright = this.brightness;

			var cb = document.getElementById('l-enable');
			if (cb) cb.checked = !!d.enabled;

			this.syncColorControls();
			var s = document.getElementById('l-bright-slider');
			if (s && !this._dragging) s.value = this.brightness;
			var n = document.getElementById('l-bright-num');
			if (n) n.value = this.brightness;
			var sp = document.getElementById('l-speed-in');
			if (sp) sp.value = this.speed;
			this.syncModeControls();

			this._bound = true;
		}

		/* 模式相关控件状态（radio 选中 + 速度禁用）每轮都同步，避免外部改模式后不同步 */
		this.mode = d.mode || 'static';
		this.syncModeControls();

		/* 实时预览色块 = 实际显示颜色（含亮度缩放） */
		el = document.getElementById('l-preview');
		if (el) el.style.background = '#' + (d.actual || d.color);
	},

	modeName: function(m) {
		for (var i = 0; i < MODES.length; i++)
			if (MODES[i][0] === m) return MODES[i][1];
		return m;
	},

	/* ---------- 颜色控件同步 ---------- */
	rgbFromHex: function(hex) {
		hex = String(hex || 'ffffff').replace('#', '');
		if (hex.length < 6) hex = 'ffffff';
		return [
			parseInt(hex.substr(0, 2), 16),
			parseInt(hex.substr(2, 2), 16),
			parseInt(hex.substr(4, 2), 16)
		];
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
		var names = [ 'l-r', 'l-g', 'l-b' ];
		for (var i = 0; i < 3; i++) {
			var s = document.getElementById(names[i]);
			if (s) s.value = rgb[i];
			var n = document.getElementById(names[i] + '-num');
			if (n) n.value = rgb[i];
		}
		var h = document.getElementById('l-hex-in');
		if (h) h.value = this.color;
		var cp = document.getElementById('l-color-picker');
		if (cp) cp.value = '#' + this.color;
		/* 高亮选中的预设色 */
		document.querySelectorAll('.led-preset').forEach(function(el) {
			var on = el.getAttribute('data-color') === this.color;
			el.style.boxShadow = on ? '0 0 0 2px #5e72e4' : '';
		}.bind(this));
	},

	syncModeControls: function() {
		document.querySelectorAll('input[name="l-mode"]').forEach(function(r) {
			r.checked = (r.value === this.mode);
		}.bind(this));
		var sp = document.getElementById('l-speed-in');
		if (sp) sp.disabled = (this.mode === 'static');
	},

	/* ---------- 事件 ---------- */
	handleToggle: function() {
		var cb = document.getElementById('l-enable');
		this.run(cb.checked ? [ 'on' ] : [ 'off' ]);
	},

	handlePreset: function(hex) {
		this.color = hex;
		this._lastColor = hex;
		this.syncColorControls();
		this.liveColor(true);
	},

	handleHexInput: function() {
		var h = document.getElementById('l-hex-in');
		var v = String(h ? h.value : '').replace('#', '').toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(v)) return;
		this.color = v;
		this.syncColorControls();
		this.liveColor(true);
	},

	handleColorPicker: function() {
		var cp = document.getElementById('l-color-picker');
		var v = String(cp ? cp.value : '').replace('#', '').toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(v)) return;
		this.color = v;
		this.syncColorControls();
		this.liveColor(true);
	},

	handleRgb: function(ch) {
		var idx = { r: 0, g: 1, b: 2 }[ch];
		var s = document.getElementById('l-' + ch);
		var v = parseInt(s.value, 10);
		if (isNaN(v)) v = 0;
		var rgb = this.rgbFromHex(this.color);
		rgb[idx] = v;
		this.color = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
		var n = document.getElementById('l-' + ch + '-num');
		if (n) n.value = v;
		var h = document.getElementById('l-hex-in');
		if (h) h.value = this.color;
		var cp = document.getElementById('l-color-picker');
		if (cp) cp.value = '#' + this.color;
		/* 拖动中只预览，松手（change）才落盘 */
		this.liveColor(false);
	},

	handleRgbCommit: function(ch) {
		this.liveColor(true);
	},

	handleBrightness: function() {
		var s = document.getElementById('l-bright-slider');
		var v = parseInt(s.value, 10);
		if (isNaN(v)) v = 100;
		this.brightness = v;
		this._dragging = true;
		var n = document.getElementById('l-bright-num');
		if (n) n.value = v;
		this.liveBrightness();
	},

	handleBrightnessCommit: function() {
		this._dragging = false;
		this.liveBrightness(true);
	},

	handleMode: function(mode) {
		this.mode = mode;
		this.syncModeControls();
		return this.run([ 'mode', mode ]);
	},

	handleSpeed: function() {
		var s = document.getElementById('l-speed-in');
		var v = parseInt(s ? s.value : this.speed, 10);
		if (isNaN(v)) return;
		this.speed = v;
		var self = this;
		/* 用独立的定时器句柄：_ct 被 liveColor / liveBrightness 共用，
		   混用会互相取消（改颜色把待执行的 speed 干掉，反之亦然） */
		if (this._st) clearTimeout(this._st);
		this._st = setTimeout(function() {
			execLed([ 'speed', String(self.speed) ]).then(function(res) {
				/* 失败必须让用户看见：之前这里静默 catch，
				   「改了没反应」完全无从查起 */
				if (res.code !== 0)
					ui.addNotification(null, E('p', {}, '周期设置失败：code=' + res.code +
						' ' + (res.stderr || res.stdout || '')), 'danger');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '周期设置异常：' +
					(e && e.message ? e.message : e)), 'danger');
			});
		}, 300);
	},

	/* 本页所有控件都是即时生效的，这个按钮的作用是把表单当前值完整落盘，
	   并给出一句明确的生效摘要（否则点了看起来像什么都没发生）。 */
	handleApply: function() {
		/* mode 始终写入：常亮模式下设的灯效/周期也要存下来，
		   之前只在非 static 才写，切回呼吸/彩虹时设置会丢 */
		var args = [ [ 'color', this.color ], [ 'brightness', String(this.brightness) ],
			[ 'mode', this.mode ], [ 'speed', String(this.speed) ] ];
		return this.runSeq(args, '已应用：' + this.describe());
	},

	/* 恢复默认：颜色/亮度/灯效/周期 全部回到出厂值，并同步回填表单。
	   方法名故意不叫 handleReset —— 本页为了隐藏 LuCI 基类底部按钮栏设了
	   handleReset: null，同名会被覆盖掉，按钮的 click 事件就绑不上（点了没反应）。 */
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
			ui.addNotification(null, E('p', {},
				'已恢复默认：常亮 / #' + DEF.color + ' / 亮度 ' + DEF.brightness +
				'% / 周期 ' + DEF.speed + ' ms'), 'info');
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '恢复默认失败：' +
				(e && e.message ? e.message : e)), 'danger');
		});
	},
	
	/* 把设备当前配置回填到页面控件。
	   update() 只在首次载入时回填（避免 5 秒轮询覆盖用户正在编辑的内容），
	   保存/恢复默认后需要强制回填时统一调这里。 */
	syncForm: function(d) {
		d = d || {};
		this.color = d.color || '1e90ff';
		this.brightness = parseInt(d.brightness, 10) || 100;
		this.mode = d.mode || 'static';
		this.speed = parseInt(d.speed, 10) || 3000;
		var sp = document.getElementById('l-speed-in');
		if (sp) sp.value = this.speed;
		var bs = document.getElementById('l-bright-slider');
		if (bs) bs.value = this.brightness;
		var bn = document.getElementById('l-bright-num');
		if (bn) bn.value = this.brightness;
		this.syncColorControls();
		this.syncModeControls();
	},
	
	/* 当前设置的摘要，用于「保存并应用」的反馈文案 */
	describe: function() {
		var mn = { static: '常亮', breath: '呼吸', blink: '闪烁', rainbow: '彩虹' };
		return (mn[this.mode] || this.mode) + ' / #' + this.color +
			' / 亮度 ' + this.brightness + '% / 周期 ' + this.speed + ' ms';
	},

	/* commit=true 落盘（写 uci），false 只做即时预览（--nosave）。
	   灯效模式下守护进程每轮都按 uci 里的 color 重绘，
	   所以颜色必须落盘，否则改完会被立刻拉回旧颜色。 */
	liveColor: function(commit) {
		var self = this;
		if (this._ct) clearTimeout(this._ct);
		this._ct = setTimeout(function() {
			execLed([ 'color', self.color, commit ? '' : '--nosave' ].filter(Boolean)).then(function(res) {
				if (res.code !== 0)
					ui.addNotification(null, E('p', {}, '颜色设置失败：code=' + res.code +
						' ' + (res.stderr || res.stdout || '')), 'danger');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '颜色设置异常：' +
					(e && e.message ? e.message : e)), 'danger');
			});
		}, 200);
	},

	liveBrightness: function(commit) {
		var self = this;
		if (this._ct) clearTimeout(this._ct);
		this._ct = setTimeout(function() {
			execLed([ 'brightness', String(self.brightness),
				commit ? '' : '--nosave' ].filter(Boolean)).then(function(res) {
				if (res.code !== 0)
					ui.addNotification(null, E('p', {}, '亮度设置失败：code=' + res.code +
						' ' + (res.stderr || res.stdout || '')), 'danger');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '亮度设置异常：' +
					(e && e.message ? e.message : e)), 'danger');
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
		self.syncForm(self.data);
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, '执行失败：' + (e.message || e)), 'danger');
		});
	},

	/* ---------- 渲染 ---------- */
	render: function() {
		var self = this;

		var css = E('style', {}, [
			'.led-page{max-width:820px;margin:0 auto}',
			'.led-kv{border-top:1px solid #eef1f7}',
			'.led-kv-row{display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid #eef1f7}',
			'.led-kv-row:last-child{border-bottom:0}',
			'.led-kv-key{color:#6b7891;font-size:13px;flex:0 0 42%}',
			'.led-kv-val{margin-left:auto;text-align:right;display:flex;align-items:center;gap:6px;justify-content:flex-end}',
			'.led-swatch{display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.12);vertical-align:-3px}',
			'.led-badge{display:inline-block;font-size:12px;line-height:1.5;padding:2px 10px;border-radius:5px;background:#eef1f7;color:#6b7891;font-weight:500}',
			'.led-badge.ok{background:#2dce89;color:#fff}',
			'.led-badge.warn{background:#fff4e6;color:#b76e00}',
			'.led-badge.gray{background:#eee;color:#6b7891}',
			'.led-field{display:flex;align-items:center;gap:10px;padding:9px 0}',
			'.led-field>label{flex:0 0 90px;color:#6b7891;font-size:13px}',
			'.led-presets{display:flex;flex-wrap:wrap;gap:8px}',
			'.led-preset{width:34px;height:34px;border-radius:8px;border:1px solid rgba(0,0,0,.12);cursor:pointer;display:inline-block}',
			'.led-preset-name{font-size:11px;color:#6b7891;text-align:center}',
			'.led-rgb-row{display:flex;align-items:center;gap:8px;margin:4px 0}',
			'.led-rgb-label{width:16px;font-size:12px;font-weight:600}',
			'.led-rgb-row input[type=range]{flex:1}',
			'.led-rgb-row input[type=number]{width:56px}',
			'.led-preview{width:100%;height:48px;border-radius:10px;border:1px solid rgba(0,0,0,.12);transition:background .25s;margin-top:6px}',
			'.led-mode{display:flex;gap:8px;flex-wrap:wrap}',
			'.led-mode label{display:flex;align-items:center;gap:5px;padding:7px 12px;border:1px solid #dfe3ea;border-radius:8px;cursor:pointer;font-size:13px}',
			'.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}'
		]);

		var kv = function(key, id) {
			return E('div', { 'class': 'led-kv-row' }, [
				E('span', { 'class': 'led-kv-key' }, key),
				E('span', { 'class': 'led-kv-val', 'id': id }, '—')
			]);
		};

		/* 输入类控件一律用原生 addEventListener 绑定，不用 ui.createHandlerFn。
		   createHandlerFn 的包装在事件里会执行 t.disabled = true（还会顺手 t.blur()），
		   输入框在第一个字符后就被禁用，后续字符根本打不进去，
		   change 事件也随之不再触发 —— 表现为「改了没反应、保存后还是旧值」。
		   另外它在不传额外参数时传给 handler 的是 Event 对象而非 DOM 元素。 */
		var bind = function(el, ev, fn) {
			el.addEventListener(ev, fn);
			return el;
		};

		var modeBtn = function(m, label) {
			return E('label', {}, [
				bind(E('input', { 'type': 'radio', 'name': 'l-mode', 'value': m }),
					'change', function() { self.handleMode(m); }),
				label
			]);
		};

		var preset = function(name, hex) {
			return E('div', { 'style': 'text-align:center' }, [
				bind(E('span', { 'class': 'led-preset', 'data-color': hex,
					'style': 'background:#' + hex }),
					'click', function() { self.handlePreset(hex); }),
				E('div', { 'class': 'led-preset-name' }, name)
			]);
		};

		var rgbRow = function(ch, label, color) {
			return E('div', { 'class': 'led-rgb-row' }, [
				E('span', { 'class': 'led-rgb-label', 'style': 'color:' + color }, label),
				bind(E('input', { 'type': 'range', 'id': 'l-' + ch, 'min': '0', 'max': '255', 'value': '30' }),
					'input', function() { self.handleRgb(ch); },
					'change', function() { self.handleRgbCommit(ch); }),
				bind(E('input', { 'type': 'number', 'id': 'l-' + ch + '-num', 'min': '0', 'max': '255', 'value': '30',
					'style': 'width:56px' }),
					'input', function() { self.handleRgb(ch); },
					'change', function() { self.handleRgbCommit(ch); })
			]);
		};

		var body = E('div', { 'class': 'led-page' }, [
			css,

			/* 运行状态 */
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '运行状态'),
				E('div', { 'class': 'led-kv' }, [
					kv('LED 状态', 'l-state'),
					kv('LED 开关', 'l-switch'),
					kv('颜色', 'l-color'),
					kv('灯效', 'l-mode'),
					kv('亮度', 'l-bright'),
					kv('周期 / 速度', 'l-speed'),
					kv('配置', 'l-cfg')
				])
			]),

			/* 设置 */
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '前置状态灯'),
				E('div', { 'class': 'cbi-section-descr' }, '配置前置状态灯的颜色、亮度与灯效。'),

				E('div', { 'class': 'led-field' }, [
					E('label', {}, '启用 LED'),
					bind(E('input', { 'type': 'checkbox', 'id': 'l-enable' }),
						'change', function() { self.handleToggle(); })
				]),

				E('div', { 'class': 'led-field' }, [
					E('label', {}, '颜色'),
					E('div', { 'class': 'led-presets' }, PRESETS.map(function(p) {
						return preset(p[0], p[1]);
					}))
				]),

				E('div', { 'class': 'led-field' }, [
					E('label', {}, '取色'),
					bind(E('input', { 'type': 'color', 'id': 'l-color-picker', 'value': '#1e90ff',
						'style': 'width:56px;height:34px;padding:0;border:1px solid #dfe3ea;border-radius:6px;background:none' }),
						'input', function() { self.handleColorPicker(); }),
					bind(E('input', { 'type': 'text', 'id': 'l-hex-in', 'class': 'mono', 'value': '1e90ff',
						'style': 'width:96px' }),
						'input', function() { self.handleHexInput(); }),
					E('span', { 'class': 'led-hint', 'style': 'color:#6b7891;font-size:12px' }, 'RRGGBB')
				]),

				E('div', { 'style': 'flex:1;margin-left:100px' }, [
					rgbRow('r', 'R', '#f5365c'),
					rgbRow('g', 'G', '#2dce89'),
					rgbRow('b', 'B', '#5e72e4')
				]),

				E('div', { 'class': 'led-field' }, [
					E('label', {}, '亮度'),
					bind(E('input', { 'type': 'range', 'id': 'l-bright-slider', 'min': '0', 'max': '100', 'value': '100',
						'style': 'flex:1' }),
						'input', function() { self.handleBrightness(); },
						'change', function() { self.handleBrightnessCommit(); }),
					bind(E('input', { 'type': 'number', 'id': 'l-bright-num', 'min': '0', 'max': '100', 'value': '100',
						'style': 'width:64px' }),
						'input', function() { self.handleBrightness(); }),
					E('span', {}, '%')
				]),

				E('div', { 'class': 'led-field' }, [
					E('label', {}, '灯效'),
					E('div', { 'class': 'led-mode' }, MODES.map(function(m) {
						return modeBtn(m[0], m[1]);
					}))
				]),

				E('div', { 'class': 'led-field' }, [
					E('label', {}, '周期/速度'),
					bind(E('input', { 'type': 'number', 'id': 'l-speed-in', 'min': '200', 'max': '60000', 'value': '3000',
						'style': 'width:110px' }),
						'input', function() { self.handleSpeed(); },
						'change', function() { self.handleSpeed(); }),
					E('span', { 'class': 'led-hint', 'style': 'color:#6b7891;font-size:12px' },
						'毫秒（呼吸/闪烁一个周期，彩虹一圈）')
				]),

				E('div', { 'style': 'margin-left:100px' }, [
					E('div', { 'class': 'led-preview', 'id': 'l-preview', 'style': 'background:#1e90ff' }),
					E('div', { 'style': 'color:#6b7891;font-size:12px;margin-top:4px' }, '实时预览（含亮度缩放后的实际颜色）')
				]),

				E('div', { 'style': 'margin-top:14px;display:flex;gap:8px' }, [
					E('button', { 'class': 'cbi-button cbi-button-apply',
						'click': ui.createHandlerFn(self, 'handleApply') }, '保存并应用'),
					E('button', { 'class': 'cbi-button cbi-button-reset',
						'click': ui.createHandlerFn(self, 'handleLedReset') }, '恢复默认')
				])
			])
		]);

		poll.add(function() { return self.refresh(); }, 5);
		this.refresh();

		return body;
	},

	/* 覆盖 LuCI 基类默认方法为 null，隐藏页面右下角的
	   「保存并应用 / 保存 / 重置」底部按钮栏 —— 本页所有改动即时生效，
	   卡片内已有自己的「保存并应用 / 复位」按钮，底部那组是多余的 */
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
