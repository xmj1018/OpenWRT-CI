'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

/* Xiaomi BE10000 RGB 氛围灯 —— 万兆专属界面
   硬件: /sys/class/leds/{red,green,blue}:ambient/brightness (pwm-leds, 0..255)
   与 SBE1V1K 的 :status 三色灯插件完全独立。 */

const callFileExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params', 'env' ],
	nobatch: true
});

var _chain = Promise.resolve();
function exec(args) {
	var p = _chain.then(function() { return callFileExec('/usr/sbin/be10000-ledctl', args, null); });
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
	'.hw-label{font-size:12px;opacity:.6;margin-bottom:8px;letter-spacing:.3px}',
	'.hw-foot{font-size:12px;opacity:.6;margin-top:9px;line-height:1.5}',
	'.hw-lampbox{display:flex;align-items:center;justify-content:center;min-height:190px;background:rgba(127,127,127,.04) !important}',
	'.hw-lamp{width:104px;height:104px;border-radius:50%;border:2px solid rgba(127,127,127,.25);background:#0000ff;transition:background .25s,box-shadow .25s;box-shadow:0 0 0 rgba(0,0,255,0)}',
	'.hw-swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:9px}',
	'.hw-sw{height:44px;border-radius:11px;border:2px solid rgba(127,127,127,.22);cursor:pointer;transition:transform .16s,border-color .16s}',
	'.hw-sw:hover{transform:translateY(-2px);border-color:var(--primary,#5e72e4)}',
	'.hw-sw.on{border-color:#fff;box-shadow:0 0 0 2px var(--primary,#5e72e4)}',
	'.hw-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}',
	'.hw-mode{border:1px solid rgba(127,127,127,.2);border-radius:14px;background:rgba(127,127,127,.04);padding:14px;cursor:pointer;transition:all .18s;min-width:0}',
	'.hw-mode:hover{border-color:var(--primary,#5e72e4);transform:translateY(-2px)}',
	'.hw-mode.on{border-color:var(--primary,#5e72e4);background:rgba(94,114,228,.1)}',
	'.hw-mode b{display:block;font-size:13.5px;font-weight:700;margin-bottom:5px}',
	'.hw-mode small{display:block;font-size:11.5px;opacity:.65;line-height:1.5}',
	'.hw-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:9px 0}',
	'.hw-row>label{font-size:12.5px;opacity:.7;min-width:62px}',
	'.hw-slider{flex:1;min-width:110px;accent-color:var(--primary,#5e72e4)}',
	'.hw-num{width:70px;padding:7px 8px;border-radius:9px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;text-align:center;font-variant-numeric:tabular-nums}',
	'.hw-btn{padding:9px 16px;border-radius:10px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.07);color:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s}',
	'.hw-btn:hover{border-color:var(--primary,#5e72e4);transform:translateY(-1px)}',
	'.hw-btn.primary{background:var(--primary,#5e72e4);border-color:var(--primary,#5e72e4);color:#fff}',
	'.hw-colorin{width:92px;padding:7px 9px;border-radius:9px;border:1px solid rgba(127,127,127,.25);background:rgba(127,127,127,.06);color:inherit;font-family:monospace;font-size:13px}',
	'.hw-kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(127,127,127,.12);font-size:12.5px}',
	'.hw-kv:last-child{border-bottom:0}',
	'.hw-kv span:first-child{opacity:.65}',
	'.hw-kv span:last-child{font-weight:600;font-variant-numeric:tabular-nums}',
	'.hw-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}',
	'.hw-note{padding:11px 14px;border-radius:11px;background:rgba(251,99,64,.1);border:1px solid rgba(251,99,64,.28);font-size:12.5px;line-height:1.65;margin-top:12px}'
].join('');

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
	});
}

var SWATCHES = [
	'#0000ff', '#00a8ff', '#00ffff', '#00ff88', '#39ff14', '#c8ff00',
	'#ffcc00', '#ff8800', '#ff3300', '#ff0066', '#ff00ff', '#8b5cf6', '#ffffff'
];
var MODES = [
	{ k: 'static',      n: '常亮',     d: '固定主色，不变化' },
	{ k: 'breathe',     n: '呼吸',     d: '亮度渐明渐暗' },
	{ k: 'duotone',     n: '双色渐变', d: '主色与副色往返过渡' },
	{ k: 'rainbow',     n: '彩虹',     d: '七色色轮循环' },
	{ k: 'temperature', n: '温度联动', d: '绿→橙→红随最热温区' },
	{ k: 'cpu',         n: 'CPU 联动', d: '负载越高越偏红' },
	{ k: 'traffic',     n: '流量联动', d: 'WAN 吞吐越高越偏红' }
];

return view.extend({
	data: null,
	modeCards: {},
	swEls: {},

	refresh: function() {
		var self = this;
		return exec([ 'json' ]).then(function(res) {
			var d = null;
			try { d = JSON.parse((res.stdout || '').trim()); } catch (e) { d = null; }
			if (!d || !d.ok) { self.noHw(); return; }
			self.data = d; self.update(d);
		}).catch(function(e) { self.noHw(e); });
	},

	noHw: function(e) {
		var n = document.getElementById('hw-nohw'); if (n) n.style.display = '';
		var m = document.getElementById('hw-nohw-msg');
		if (m) m.textContent = e ? ('读取失败：' + e.message)
			: '未找到 :ambient 三色 LED。请确认 kmod-leds-pwm 已安装，且设备树已启用 pwm-leds 氛围灯。';
	},

	setText: function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; },
	setHTML: function(id, v) { var el = document.getElementById(id); if (el) el.innerHTML = v; },

	update: function(d) {
		var self = this;
		var no = document.getElementById('hw-nohw'); if (no) no.style.display = 'none';
		this.setHTML('hw-state-pill', '<span class="hw-dot"></span>' +
			esc(d.enabled === '0' ? '已关闭' : this.modeName(d.mode)));
		var lamp = document.getElementById('hw-lamp');
		if (lamp) {
			var c = d.actual || d.color || '#0000ff';
			lamp.style.background = c;
			lamp.style.boxShadow = (d.enabled === '0') ? 'none' : '0 0 34px 8px ' + c;
			lamp.style.opacity = (d.enabled === '0') ? '.25' : '1';
		}
		this.setText('hw-actual', d.actual || '—');
		this.setText('hw-rgb', d.r + ' / ' + d.g + ' / ' + d.b);
		this.setText('hw-cur-mode', this.modeName(d.mode));
		this.setText('hw-cur-bright', d.brightness + '%');
		this.setText('hw-cur-speed', d.speed);
		var ci = document.getElementById('hw-color'), cs = document.getElementById('hw-second');
		if (ci && document.activeElement !== ci) ci.value = d.color;
		if (cs && document.activeElement !== cs) cs.value = d.second;
		var bs = document.getElementById('hw-bright-slider'), bn = document.getElementById('hw-bright-num');
		if (bs && document.activeElement !== bs) bs.value = d.brightness;
		if (bn && document.activeElement !== bn) bn.value = d.brightness;
		var ss = document.getElementById('hw-speed-slider');
		if (ss && document.activeElement !== ss) ss.value = d.speed;
		this.setText('hw-bright-big', d.brightness);
		Object.keys(this.modeCards).forEach(function(k) {
			var c = self.modeCards[k]; if (c) { if (k === d.mode) c.classList.add('on'); else c.classList.remove('on'); }
		});
		Object.keys(this.swEls).forEach(function(k) {
			var e = self.swEls[k]; if (e) { if (k.toLowerCase() === String(d.color).toLowerCase()) e.classList.add('on'); else e.classList.remove('on'); }
		});
	},

	modeName: function(m) {
		for (var i = 0; i < MODES.length; i++) if (MODES[i].k === m) return MODES[i].n;
		return m || '—';
	},

	doCmd: function(args, okMsg) {
		var self = this;
		return exec(args).then(function(res) {
			if (res.code !== 0) ui.addNotification(null, E('p', {}, '执行失败：' + (res.stderr || res.stdout || ('exit ' + res.code))), 'danger');
			else if (okMsg) ui.addNotification(null, E('p', {}, okMsg), 'info');
			return self.refresh();
		}).catch(function(e) { ui.addNotification(null, E('p', {}, '调用失败：' + e.message), 'danger'); });
	},

	render: function() {
		var self = this;
		poll.add(function() { return self.refresh(); }, 5);

		var modeBox = E('div', { 'class': 'hw-modes' });
		MODES.forEach(function(m) {
			var c = E('div', {
				'class': 'hw-mode',
				'click': ui.createHandlerFn(self, 'doCmd', [ 'mode', m.k ], '灯效已切换为「' + m.n + '」')
			}, [ E('b', {}, m.n), E('small', {}, m.d) ]);
			self.modeCards[m.k] = c; modeBox.appendChild(c);
		});

		var swBox = E('div', { 'class': 'hw-swatches' });
		SWATCHES.forEach(function(c) {
			var e = E('div', {
				'class': 'hw-sw', 'style': 'background:' + c, 'title': c,
				'click': ui.createHandlerFn(self, 'doCmd', [ 'color', c ], '主色已设为 ' + c)
			});
			self.swEls[c] = e; swBox.appendChild(e);
		});

		var colorIn = E('input', { 'type': 'text', 'class': 'hw-colorin', 'id': 'hw-color', 'value': '#0000ff', 'maxlength': '7' });
		colorIn.addEventListener('change', function() {
			var v = colorIn.value.trim();
			if (/^#[0-9a-fA-F]{6}$/.test(v)) self.doCmd([ 'color', v ]);
			else { colorIn.value = (self.data && self.data.color) || '#0000ff'; ui.addNotification(null, E('p', {}, '请输入 #RRGGBB 格式'), 'danger'); }
		});
		var secondIn = E('input', { 'type': 'text', 'class': 'hw-colorin', 'id': 'hw-second', 'value': '#ff00aa', 'maxlength': '7' });
		secondIn.addEventListener('change', function() {
			var v = secondIn.value.trim();
			if (/^#[0-9a-fA-F]{6}$/.test(v)) self.doCmd([ 'second', v ]);
			else { secondIn.value = (self.data && self.data.second) || '#ff00aa'; ui.addNotification(null, E('p', {}, '请输入 #RRGGBB 格式'), 'danger'); }
		});

		var bs = E('input', { 'type': 'range', 'min': '0', 'max': '100', 'value': '96', 'class': 'hw-slider', 'id': 'hw-bright-slider' });
		var bn = E('input', { 'type': 'number', 'min': '0', 'max': '100', 'value': '96', 'class': 'hw-num', 'id': 'hw-bright-num' });
		var setBright = function(v) {
			v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
			self.doCmd([ 'brightness', String(v) ]);
		};
		bs.addEventListener('input', function() { bn.value = bs.value; self.setText('hw-bright-big', bs.value); });
		bs.addEventListener('change', function() { setBright(bs.value); });
		bn.addEventListener('change', function() { bs.value = bn.value; setBright(bn.value); });

		var ss = E('input', { 'type': 'range', 'min': '1', 'max': '10', 'value': '5', 'class': 'hw-slider', 'id': 'hw-speed-slider' });
		ss.addEventListener('change', function() { self.doCmd([ 'speed', ss.value ]); });

		return E('div', { 'class': 'cbi-map hw-page' }, [
			E('style', {}, CSS),
			E('div', { 'class': 'hw-head' }, [
				E('div', {}, [
					E('h2', { 'class': 'hw-title' }, 'RGB 氛围灯'),
					E('div', { 'class': 'hw-sub' }, '小米万兆 BE10000 专属 · :ambient 三色 PWM LED · 七种灯效 · 温度/负载联动')
				]),
				E('span', { 'class': 'hw-pill', 'id': 'hw-state-pill' }, [ E('span', { 'class': 'hw-dot' }), '读取中' ])
			]),
			E('div', { 'class': 'hw-card', 'id': 'hw-nohw', 'style': 'display:none;border-color:rgba(245,54,92,.4);background:rgba(245,54,92,.08)' }, [
				E('h3', {}, '未检测到 RGB 氛围灯'),
				E('div', { 'class': 'hw-foot', 'id': 'hw-nohw-msg' }, ''),
				E('div', { 'class': 'hw-foot' }, '此插件仅适用于 xiaomi,be10000 / be10000-es 的 :ambient 灯，不用于 SBE1V1K 的 :status 灯。')
			]),
			E('div', { 'class': 'hw-2col' }, [
				E('div', { 'class': 'hw-card hw-lampbox' }, E('div', { 'class': 'hw-lamp', 'id': 'hw-lamp' })),
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '当前状态'),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '实际输出'), E('span', { 'id': 'hw-actual' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, 'R / G / B'), E('span', { 'id': 'hw-rgb' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '灯效'), E('span', { 'id': 'hw-cur-mode' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '亮度'), E('span', { 'id': 'hw-cur-bright' }, '—') ]),
					E('div', { 'class': 'hw-kv' }, [ E('span', {}, '速度'), E('span', { 'id': 'hw-cur-speed' }, '—') ]),
					E('div', { 'class': 'hw-row', 'style': 'margin-top:12px' }, [
						E('button', { 'class': 'hw-btn', 'click': ui.createHandlerFn(self, 'doCmd', [ 'off' ], '已关闭氛围灯') }, '关闭'),
						E('button', { 'class': 'hw-btn primary', 'click': ui.createHandlerFn(self, 'doCmd', [ 'on' ], '已开启氛围灯') }, '开启'),
						E('button', { 'class': 'hw-btn', 'click': ui.createHandlerFn(self, 'doCmd', [ 'apply' ], '已立即应用') }, '刷新')
					])
				])
			]),
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '灯效模式'),
				modeBox
			]),
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '主色'),
				swBox,
				E('div', { 'class': 'hw-row', 'style': 'margin-top:14px' }, [
					E('label', {}, '主色'), colorIn,
					E('label', { 'style': 'margin-left:12px' }, '副色'), secondIn
				]),
				E('div', { 'class': 'hw-foot' }, '副色用于「双色渐变」；温度/CPU/流量联动模式会忽略取色，按实时数据自动变色。')
			]),
			E('div', { 'class': 'hw-2col', 'style': 'margin-top:14px' }, [
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '亮度'),
					E('div', { 'class': 'hw-row' }, [
						E('span', { 'style': 'font-size:26px;font-weight:700', 'id': 'hw-bright-big' }, '96'),
						E('span', { 'class': 'hw-unit' }, '%')
					]),
					E('div', { 'class': 'hw-row' }, [ bs, bn ]),
					E('div', { 'class': 'hw-foot' }, '呼吸/彩虹等动画会在此亮度上限内变化。')
				]),
				E('div', { 'class': 'hw-card' }, [
					E('h3', {}, '动画速度'),
					E('div', { 'class': 'hw-row' }, [ E('label', {}, '速度'), ss ]),
					E('div', { 'class': 'hw-foot' }, '1 最慢 · 10 最快，仅对动态灯效生效。')
				])
			]),
			E('div', { 'class': 'hw-card wide', 'style': 'margin-top:14px' }, [
				E('h3', {}, '说明'),
				E('div', { 'class': 'hw-foot' }, '氛围灯与网口指示灯是两套硬件：这里控制的是机身 RGB 灯条（red/green/blue:ambient），' +
					'网口黄绿灯由 MDIO/PHY 驱动管理。守护进程内含 board_name 与 LED 节点双重守卫，非万兆机型不会启动。')
			])
		]);
	}
});
