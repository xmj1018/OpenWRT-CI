'use strict';
'require view';
'require fs';
'require rpc';
'require ui';
'require poll';

var LEVELS = [ 36, 72, 128, 255 ];   /* 内核 cooling-levels */

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

function execCmd(args) {
	var p = _execChain.then(function() {
		return callFileExec('/usr/sbin/fanctl', args, null);
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

	/* ---------- 数据 ---------- */

	refresh: function() {
		var self = this;

		return execCmd([ 'json' ]).then(function(res) {
			var d = null;
			try { d = JSON.parse((res.stdout || '').trim()); } catch (e) { d = null; }
			if (!d || !d.ok) return;
			self.data = d;
			self.update(d);
		}).catch(function() {});
	},

	update: function(d) {
		var self = this;
		var hot = null;
		(d.sensors || []).forEach(function(s) { if (!hot || s.temp > hot.temp) hot = s; });

		var el;
		el = document.getElementById('v-mode');
		if (el) el.innerHTML = '<span class="fan-badge ' + this.modeBadge(d.mode) + '">' + this.modeLabel(d.mode) + '</span>';

		el = document.getElementById('v-maxtemp');
		if (el) { el.textContent = d.hot + ' °C'; el.style.color = this.tempColor(d.hot); }

		el = document.getElementById('v-maxsrc');
		if (el) el.textContent = hot ? hot.name : '—';

		el = document.getElementById('v-pct');
		if (el) el.textContent = d.pct + ' %';

		el = document.getElementById('v-rpm');
		if (el) {
			var r = (d.rpm === undefined || d.rpm === null) ? -1 : d.rpm;
			el.textContent = (r >= 0) ? (r + ' RPM') : '不可用';
		}

		el = document.getElementById('v-bar');
		if (el) {
			el.style.width = d.pct + '%';
			el.style.background = d.pct === 0 ? '#c9d2e3'
				: d.pct >= 90 ? '#f5365c'
				: d.pct >= 50 ? '#5e72e4' : '#2dce89';
		}

		el = document.getElementById('v-level');
		if (el) el.textContent = this.levelText(d);

		el = document.getElementById('v-thermal');
		if (el) el.innerHTML = (d.thermal === 'disabled')
			? '<span class="fan-badge warn">用户态接管</span>'
			: '<span class="fan-badge ok">内核接管</span>';

		el = document.getElementById('v-cfg');
		if (el) el.innerHTML = '<span class="fan-badge ' + (d.cfg ? 'ok' : 'warn') + '">' +
			(d.cfg ? '有效' : '未加载') + '</span>';

		Object.keys(this.modeBtns).forEach(function(m) {
			var b = self.modeBtns[m];
			if (!b) return;
			var on = (m === d.mode);
			/* 类 + 内联双保险，避免主题 CSS 优先级覆盖 */
			if (on) b.classList.add('fan-mode-on');
			else b.classList.remove('fan-mode-on');
			b.style.background = on ? '#5e72e4' : '';
			b.style.borderColor = on ? '#5e72e4' : '';
			b.style.color = on ? '#fff' : '';
			b.style.boxShadow = on ? '0 2px 6px rgba(94,114,228,.35)' : '';
		});

		var mc = document.getElementById('fan-manual-card');
		if (mc) mc.style.display = (d.mode === 'manual') ? '' : 'none';

		var cc = document.getElementById('fan-curve-card');
		if (cc) cc.style.display = (d.mode === 'curve') ? '' : 'none';

		el = document.getElementById('lag-note');
		if (el) {
			var diff = d.hot - d.temp;
			if (d.mode === 'auto' && diff >= 5) {
				el.style.display = 'block';
				el.textContent = '注意：最热的是「' + (hot ? hot.name : '—') + '」' + d.hot +
					' °C，比内核温区绑定的 SoC 高 ' + diff + ' °C。自动模式跟的是 SoC，射频过热时会滞后；' +
					'切到曲线模式并选「最热传感器」可以覆盖这一点。';
			} else {
				el.style.display = 'none';
			}
		}

		this.last = d;
		this.applySensors();
		this.syncInputs(d);
		/* 只有曲线内容真的变了才重绘点编辑器。
		   之前每 5 秒轮询都重建一次 DOM，会把用户正在输入的
		   温度/占空比值清掉并丢失焦点。 */
		if (this.curveSig() !== this._ptSig) this.renderPoints();
		window.setTimeout(function() { self.drawChart(); }, 0);
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
		if ((d.src === 'soc' || d.src === 'max') && !this.srcTouched) this.src = d.src;

		if (!this._dragging) {
			var s = document.getElementById('fan-pct');
			var n = document.getElementById('fan-pct-num');
			this.manualPct = d.pct;
			if (s) s.value = d.pct;
			if (n) n.value = d.pct;
		}
	},

	/* ---------- 渲染 ---------- */

	/* 温度源：默认每类取最高，展开后显示全部 */
	applySensors: function() {
		var d = this.last || {};
		var all = d.sensors_all || [];
		var list = this.showAll ? (all.length ? all : (d.sensors || [])) : (d.sensors || []);

		this.renderSensors(list);

		var more = document.getElementById('fan-src-more');
		if (more) {
			if (!all.length || all.length === (d.sensors || []).length) {
				more.style.display = 'none';
			}
			else {
				more.style.display = '';
				more.textContent = this.showAll ? '只看每类最高'
					: ('展开全部（' + all.length + ' 路）');
			}
		}
	},

	handleToggleAll: function() {
		this.showAll = !this.showAll;
		this.applySensors();
	},

	renderSensors: function(list) {
		var box = document.getElementById('src-list');
		if (!box) return;
		box.innerHTML = '';
		var max = 0;
		list.forEach(function(s) { if (s.temp > max) max = s.temp; });

		var tagged = false;
		list.forEach(function(s) {
			var isHot = (!tagged && s.temp === max && list.length > 1);
			if (isHot) tagged = true;
			box.appendChild(E('div', { 'class': 'fan-src-row' }, [
				E('span', { 'class': 'fan-src-name' }, s.name),
				isHot ? E('span', { 'class': 'fan-tag-hot' }, '最高') : '',
				E('span', { 'class': 'fan-src-temp', 'style': 'color:' + (s.temp >= 80 ? '#f5365c' : s.temp >= 65 ? '#fb6340' : s.temp >= 50 ? '#b76e00' : '#2dce89') }, s.temp + ' °C')
			]));
		});
	},

	/* 曲线的签名，用来判断点编辑器是否需要重建 */
	curveSig: function() {
		return JSON.stringify(this.curve || []);
	},

	renderPoints: function() {
		var box = document.getElementById('fan-points');
		if (!box) return;
		var self = this;
		box.innerHTML = '';
		this._ptSig = this.curveSig();

		this.curve.forEach(function(p, i) {
			var ti = E('input', { 'type': 'number', 'min': '30', 'max': '95', 'value': p[0], 'style': 'width:64px' });
			var pi = E('input', { 'type': 'number', 'min': '0', 'max': '100', 'value': p[1], 'style': 'width:64px' });

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

			box.appendChild(E('div', { 'class': 'fan-pt-row' }, [
				E('span', { 'class': 'fan-hint' }, '温度'), ti,
				E('span', { 'class': 'fan-hint' }, '占空比'), pi,
				E('button', {
					'class': 'cbi-button cbi-button-remove',
					'click': function() {
						if (self.curve.length <= 1) return;
						self.curve.splice(i, 1);
						self.curveTouched = true;
						self.renderPoints(); self.drawChart(); self.persistCurve();
					}
				}, '删')
			]));
		});
	},

	drawChart: function() {
		var c = document.getElementById('fan-chart');
		if (!c || !c.getContext) return;
		var ctx = c.getContext('2d');
		var W = c.width, H = c.height;
		var padL = 34, padR = 10, padT = 10, padB = 22;
		var x0 = 30, x1 = 90;

		ctx.clearRect(0, 0, W, H);

		function X(t) { return padL + (t - x0) / (x1 - x0) * (W - padL - padR); }
		function Y(p) { return H - padB - p / 100 * (H - padT - padB); }

		ctx.strokeStyle = '#eef1f7'; ctx.lineWidth = 1;
		ctx.font = '10px sans-serif'; ctx.fillStyle = '#9aa6bd';

		[ 0, 50, 100 ].forEach(function(p) {
			ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(W - padR, Y(p)); ctx.stroke();
			ctx.fillText(p + '%', 4, Y(p) + 3);
		});
		[ 30, 60, 90 ].forEach(function(t) {
			ctx.fillText(t + '°', X(t) - 8, H - 8);
		});

		ctx.strokeStyle = '#b9c6de'; ctx.setLineDash([ 4, 3 ]);
		ctx.beginPath();
		var prevY = Y(Math.round(LEVELS[0] * 100 / 255));
		ctx.moveTo(X(30), prevY);
		[ [ 40, 36 ], [ 50, 72 ], [ 65, 128 ], [ 80, 255 ] ].forEach(function(lv) {
			ctx.lineTo(X(lv[0]), prevY);
			prevY = Y(Math.round(lv[1] * 100 / 255));
			ctx.lineTo(X(lv[0]), prevY);
		});
		ctx.lineTo(X(90), prevY);
		ctx.stroke(); ctx.setLineDash([]);

		var pts = this.curve;
		if (pts.length) {
			ctx.strokeStyle = '#5e72e4'; ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(X(30), Y(pts[0][1]));
			pts.forEach(function(p) { ctx.lineTo(X(p[0]), Y(p[1])); });
			ctx.lineTo(X(90), Y(pts[pts.length - 1][1]));
			ctx.stroke();

			ctx.fillStyle = '#fff'; ctx.strokeStyle = '#5e72e4';
			pts.forEach(function(p) {
				ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
			});
		}

		if (this.data) {
			var t = (this.data.mode === 'curve' && this.src === 'max') ? this.data.hot : this.data.temp;
			ctx.beginPath();
			ctx.arc(X(Math.min(x1, Math.max(x0, t))), Y(this.data.pct), 5, 0, Math.PI * 2);
			ctx.fillStyle = '#f5365c'; ctx.fill();
			ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
		}
	},

	/* ---------- 工具 ---------- */

	modeLabel: function(m) { return ({ auto: '自动', manual: '手动', curve: '曲线', off: '停转' })[m] || m; },
	modeBadge: function(m) { return ({ auto: 'ok', manual: 'warn', curve: 'ok', off: 'gray' })[m] || 'gray'; },
	tempColor: function(t) { return t >= 80 ? '#f5365c' : t >= 65 ? '#fb6340' : t >= 50 ? '#b76e00' : '#2dce89'; },

	/* 档位 = 曲线点数：每个点代表一档，共 N 档（N = 点数）
	   温度 <= 第 i 个点的温度，即落在第 i 档；高于末点取末档 */
	curveSegment: function(t) {
		var pts = this.curve;
		var m = (pts && pts.length) ? pts.length : 1;
		if (m < 2) return { k: 1, m: m };
		var k = m;
		for (var i = 0; i < pts.length; i++) {
			if (t <= pts[i][0]) { k = i + 1; break; }
		}
		return { k: k, m: m };
	},

	levelText: function(d) {
		if (d.mode === 'curve') {
			var t = (this.src === 'max') ? d.hot : d.temp;
			var seg = this.curveSegment(t);
			return '曲线 ' + seg.k + ' / ' + seg.m;
		}
		if (d.mode === 'auto') {
			/* 用内核真实的 cur_state，而不是按温度估算 */
			var lv = (d.cur !== undefined && d.cur !== null && d.cur >= 0) ? d.cur : d.level;
			return '内核 ' + (lv + 1) + ' / ' + LEVELS.length;
		}
		if (d.mode === 'off') return '停转 0 / ' + LEVELS.length;
		return '固定 ' + this.levelFromPwm(d.pwm) + ' / ' + LEVELS.length;
	},

	/* 当前 PWM 落在 4 档中的第几档；0% 记 0 档 */
	levelFromPwm: function(pwm) {
		if (!pwm) return 0;
		var lv = 1;
		for (var i = 0; i < LEVELS.length; i++)
			if (pwm >= LEVELS[i]) lv = i + 1;
		return lv;
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

	/* ---------- 事件 ---------- */

	handleMode: function(mode) {
		this._dragging = false;
		if (this._mt) { clearTimeout(this._mt); this._mt = null; }
		if (mode === 'off' && !confirm('确定停转风扇？长时间高负载下可能触发降频。'))
			return;

		if (mode === 'manual') {
			var s = document.getElementById('fan-pct');
			var v = s ? parseInt(s.value, 10) : this.manualPct;
			if (isNaN(v)) v = 50;
			return this.run([ 'manual', String(v) ]);
		}
		if (mode === 'curve')
			return this.run([ 'curve', this.curveStr(), '--src', this.src ]);

		return this.run([ mode ]);
	},

	handleManualInput: function() {
		var s = document.getElementById('fan-pct');
		var n = document.getElementById('fan-pct-num');
		var v = s ? parseInt(s.value, 10) : 50;
		if (isNaN(v)) return;

		this.manualPct = v;
		this._dragging = true;
		if (n) n.value = v;
		if (v > 0) this._lastPct = v;

		if (this._mt) clearTimeout(this._mt);
		this._mt = setTimeout(function() {
			execCmd([ 'manual', String(v), '--nosave' ]).catch(function() {});
		}, 200);
	},

	handleManualCommit: function() {
		var s = document.getElementById('fan-pct');
		var v = s ? parseInt(s.value, 10) : this.manualPct;
		if (isNaN(v)) v = 50;

		this._dragging = false;
		if (this._mt) { clearTimeout(this._mt); this._mt = null; }

		/* 手动 0% 等同停转，要二次确认；取消就回滚到上一个非零值。
		   （拖动时已经实时把转速拉到 0，所以这里必须还原。） */
		if (v === 0) {
			if (!this._zeroOk) {
				if (!confirm('确定把风扇调到 0%？这等同于停转，' +
					'长时间高负载可能触发降频。')) {
					var prev = this._lastPct || 50;
					if (s) s.value = prev;
					var nb = document.getElementById('fan-pct-num');
					if (nb) nb.value = prev;
					this.manualPct = prev;
					return this.run([ 'manual', String(prev) ], true);
				}
				this._zeroOk = true;
			}
		}
		else {
			this._zeroOk = false;
			this._lastPct = v;
		}

		return this.run([ 'manual', String(v) ], true);
	},

	handleManualNum: function(el) {
		var v = parseInt(el.value, 10);
		if (isNaN(v)) return;
		v = Math.min(100, Math.max(0, v));
		var s = document.getElementById('fan-pct');
		if (s) s.value = v;
		this.handleManualInput();
	},

	handleSrc: function() {
		/* LuCI 26.x 的 ui.createHandlerFn 在不传额外参数时，
		   handler 收到的第一个参数是 Event 对象（不是 DOM 元素），
		   el.value 恒为 undefined。这里统一用 getElementById 取值。 */
		var sel = document.getElementById('fan-src-toggle');
		if (sel) this.src = sel.value;
		this.srcTouched = true;
		/* 取温源也写进配置（只存配置，不切换模式），
		   否则刷新页面就丢了。 */
		var self = this;
		execCmd([ 'setcurve', '--src', this.src ])
			.catch(function() {});
	},

	handleCurve: function() {
		var self = this;
		var sel = document.getElementById('fan-src-toggle');
		if (sel) this.src = sel.value;

		return execCmd([ 'curve', this.curveStr(), '--src', this.src ]).then(function(res) {
			self.curveTouched = false;
			if (res.code !== 0)
				ui.addNotification(null, E('p', {}, '应用失败：' + (res.stderr || res.stdout || ('exit ' + res.code))), 'danger');
			else
				ui.addNotification(null, E('p', {}, '曲线已应用，取温源：' + (self.src === 'max' ? '最热传感器' : 'SoC')), 'info');
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

	curveStr: function() {
		return this.curve.map(function(p) { return p[0] + ':' + p[1]; }).join(',');
	},

	/* 仅保存曲线，不切换模式（编辑即记忆） */
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
		this.renderPoints();
		this.drawChart();
		this.persistCurve();
	},

	/* ---------- 视图 ---------- */

	render: function() {
		var self = this;

		var css = E('style', {}, [
			'.fan-page{max-width:820px;margin:0 auto}',
			'.fan-kv{border-top:1px solid #eef1f7}',
			'.fan-kv-row{display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid #eef1f7}',
			'.fan-kv-row:last-child{border-bottom:0}',
			'.fan-kv-key{color:#6b7891;font-size:13px;flex:0 0 42%}',
			'.fan-kv-val{margin-left:auto;text-align:right;font-variant-numeric:tabular-nums}',
			'.fan-bar{height:6px;background:#edf1f7;border-radius:999px;overflow:hidden;margin-top:8px}',
			'.fan-bar>i{display:block;height:100%;border-radius:999px;background:#5e72e4;transition:width .35s}',
			'.fan-src-row{display:flex;align-items:center;gap:8px;padding:10px 2px;border-bottom:1px solid #eef1f7}',
			'.fan-src-row:last-child{border-bottom:0}',
			'.fan-src-name{font-size:13px}',
			'.fan-src-head{display:flex;align-items:baseline;gap:10px;margin:0 0 2px}',
			'.fan-src-head .cbi-section-descr{margin:0;flex:1}',
			'.fan-src-more{font-size:12.5px;color:#5e72e4;text-decoration:none;white-space:nowrap;cursor:pointer}',
			'.fan-src-more:hover{text-decoration:underline}',
			'.fan-src-temp{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}',
			'.fan-tag-hot{font-size:11px;padding:1px 7px;border-radius:4px;background:#b45309;color:#fff}',
			'.fan-note{margin-top:12px;padding:10px 12px;border-radius:8px;background:#fff8e6;border:1px solid #ffe3a3;color:#7a5300;font-size:12.5px}',
			'.fan-badge{display:inline-block;font-size:12px;line-height:1.5;padding:2px 10px;border-radius:5px;background:#eef1f7;color:#6b7891;font-weight:500}',
			'.fan-badge.ok{background:#2dce89;color:#fff}',
			'.fan-badge.warn{background:#fff4e6;color:#b76e00}',
			'.fan-badge.gray{background:#eee;color:#6b7891}',
			'.fan-pt-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
			'.fan-hint{color:#6b7891;font-size:12px}',
			'.fan-chart{width:100%;height:220px;display:block}',
			'.fan-grid{display:grid;grid-template-columns:260px 1fr;gap:18px}',
			'.fan-mode{display:flex;gap:8px;flex-wrap:wrap}',
			'.fan-mode .cbi-button{min-width:96px}',
			'.fan-mode .fan-mode-on{background:#5e72e4 !important;border-color:#5e72e4 !important;color:#fff !important;box-shadow:0 2px 6px rgba(94,114,228,.35)}',
			'.fan-slider{width:100%;margin:6px 0 2px}',
			'@media(max-width:700px){.fan-grid{grid-template-columns:1fr}}'
		].join(''));

		function modeBtn(mode, label) {
			var b = E('button', {
				'class': 'cbi-button',
				'click': ui.createHandlerFn(self, 'handleMode', mode)
			}, label);
			self.modeBtns[mode] = b;
			return b;
		}

		var kv = E('div', { 'class': 'fan-kv' }, [
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, 'PWM 控制器'),
				E('span', { 'class': 'fan-kv-val' }, E('span', { 'class': 'fan-badge ok' }, '活跃'))
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '控制模式'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-mode' }, '—')
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '内核温控'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-thermal' }, '—')
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '最高温度'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-maxtemp', 'style': 'font-size:18px;font-weight:600' }, '—')
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '最热传感器'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-maxsrc' }, '—')
			]),
			E('div', { 'class': 'fan-kv-row', 'style': 'display:block' }, [
				E('div', { 'style': 'display:flex;gap:10px' }, [
					E('span', { 'class': 'fan-kv-key', 'style': 'flex:1' }, '风扇占空比'),
					E('span', { 'class': 'fan-kv-val', 'id': 'v-pct' }, '—')
				]),
				E('div', { 'class': 'fan-bar' }, E('i', { 'id': 'v-bar', 'style': 'width:0%' }))
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '风扇转速'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-rpm' }, '—')
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '当前档位'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-level' }, '—')
			]),
			E('div', { 'class': 'fan-kv-row' }, [
				E('span', { 'class': 'fan-kv-key' }, '配置'),
				E('span', { 'class': 'fan-kv-val', 'id': 'v-cfg' }, '—')
			])
		]);

		/* 输入类控件用原生 addEventListener，不用 ui.createHandlerFn：
		   它的包装会 t.disabled = true + t.blur()，滑块/输入框在第一个
		   input 事件后就被禁用，拖不动也打不进字。 */
		var bind = function(el, ev, fn) {
			el.addEventListener(ev, fn);
			return el;
		};

		var manualCard = E('div', { 'class': 'cbi-section', 'id': 'fan-manual-card', 'style': 'display:none' }, [
			E('h3', {}, '手动固定转速'),
			E('div', { 'class': 'cbi-section-descr' }, '拖动即时生效，松手保存。占空比 0–100%，0 等于停转。'),
			E('div', { 'style': 'display:flex;align-items:center;gap:12px;margin-top:8px' }, [
				bind(E('input', {
					'id': 'fan-pct', 'type': 'range', 'min': '0', 'max': '100', 'value': '50',
					'class': 'fan-slider'
				}),
					'input', function() { self.handleManualInput(); },
					'change', function() { self.handleManualCommit(); }),
				bind(E('input', {
					'id': 'fan-pct-num', 'type': 'number', 'min': '0', 'max': '100', 'value': '50',
					'style': 'width:70px'
				}),
					'input', function() { self.handleManualNum(); },
					'change', function() { self.handleManualCommit(); }),
				E('span', { 'class': 'fan-hint' }, '%')
			])
		]);

		var srcSel = bind(E('select', {
			'id': 'fan-src-toggle', 'class': 'cbi-input-select'
		}, [
			E('option', { 'value': 'max' }, '最热传感器'),
			E('option', { 'value': 'soc' }, 'SoC / CPU')
		]), 'change', function() { self.handleSrc(); });

		poll.add(function() { return self.refresh(); }, 5);
		this.refresh();

		return E('div', { 'class': 'cbi-map fan-page' }, [
			css,
			E('h2', {}, '风扇控制'),
			E('div', { 'class': 'cbi-map-descr' },
				'风扇接在 IPQ9570 的 PWM 通道 3，由内核 pwm-fan 驱动。自动模式按 40/50/65/80 °C 分四档' +
				'（14% / 28% / 50% / 100%）；曲线模式由用户态每 10 秒采样插值，可选跟随最热传感器。'),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '运行状态'), kv,
				E('div', { 'class': 'fan-note', 'id': 'lag-note', 'style': 'display:none' }, '')
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '温度源'),
				E('div', { 'class': 'fan-src-head' }, [
					E('span', { 'class': 'cbi-section-descr' }, '默认每类只显示最热的一路。'),
					E('a', {
						'href': 'javascript:void(0)', 'id': 'fan-src-more', 'class': 'fan-src-more',
						'click': ui.createHandlerFn(this, 'handleToggleAll')
					}, '展开全部')
				]),
				E('div', { 'id': 'src-list' }, E('em', {}, '读取中…'))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '调速模式'),
				E('div', { 'class': 'fan-mode' }, [
					modeBtn('auto', '自动'),
					modeBtn('manual', '手动'),
					modeBtn('curve', '曲线'),
					modeBtn('off', '停转')
				])
			]),

			manualCard,

			E('div', { 'class': 'cbi-section', 'id': 'fan-curve-card', 'style': 'display:none' }, [
				E('h3', {}, '自定义曲线'),
				E('div', { 'class': 'cbi-section-descr' },
					'格式「温度:占空比」，最多 8 个点，中间线性插值。低于首点取首值，高于末点取末值。'),
				E('div', { 'style': 'display:flex;align-items:center;gap:10px;margin:8px 0' }, [
					E('span', { 'class': 'fan-hint' }, '取温源'), srcSel
				]),
				E('div', { 'class': 'fan-grid' }, [
					E('div', {}, [
						E('div', { 'id': 'fan-points' }),
						E('div', { 'style': 'margin-top:8px' }, [
							E('button', { 'class': 'cbi-button', 'click': ui.createHandlerFn(this, 'handleAddPoint') }, '添加点'),
							' ',
							E('button', { 'class': 'cbi-button', 'click': ui.createHandlerFn(this, 'handleRestoreDefault') }, '默认曲线'),
							' ',
							E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(this, 'handleCurve') }, '应用曲线')
						])
					]),
					E('div', {}, [
						E('canvas', { 'id': 'fan-chart', 'class': 'fan-chart', 'width': '520', 'height': '220' })
					])
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
