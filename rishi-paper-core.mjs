// Ported from Rishi JARVIS web/paper.js; algorithm body retained. Dependencies are supplied by the local adapter.
export function createRishiPaper({newsFeatures,S,A,featuresOf,predict,cryptoSize,marketSession}){
// Live forward test ("paper trades"): every CONFIRMED signal is recorded automatically and then
// resolved from real 1-minute candles exactly like the backtest (next-bar-open fill, stop checked
// before target, time exit, costs). No orders are ever sent. Results feed the confidence model.

const MAX = 3000;
const multOf = mode => (mode === '1.5R' ? 1.5 : mode === '2R' ? 2 : 2);

function recordPaper(s, nowMs) {
  S.paper = S.paper || [];
  if (S.paper.some(p => p.key === s.key)) return;
  const mid = (s.entryLow + s.entryHigh) / 2;
  const x = { ...featuresOf(s, { regime: s.regime }), ...newsFeatures(s) }; // news alignment is learned from live outcomes
  const model = S.models?.[s.market];
  S.paper.push({
    id: s.id, key: s.key, market: s.market, symbol: s.symbol, strategyId: s.strategyId, strategyName: s.strategyName, variant: s.variant, tf: s.tf,
    direction: s.direction, score: s.score, confirmT: nowMs, entryRef: mid, stop: s.stop, exitMode: S.settings.backtest.exitMode,
    x, pAtSignal: model ? predict(model, x).p : null, status: 'open', demo: !!s.demo,
  });
  if (S.paper.length > MAX) S.paper.splice(0, S.paper.length - MAX);
  A.save();
}

function candlesFor(p) {
  if (p.market === 'crypto') return S.crypto[p.symbol]?.series['1m']?.candles || [];
  return (S.stocks[p.symbol]?.candles || []).filter(c => c.closed !== false);
}

function costR(p, entry, risk) {
  const bt = S.settings.backtest;
  if (p.market === 'stocks') return (2 * (bt.stockSlippagePerShare + bt.stockSpreadPerShare / 2)) / risk;
  const z = cryptoSize(entry, p.s > 0 ? entry - risk : entry + risk, S.settings, p.symbol);
  const slip = (2 * entry * (bt.cryptoSlippagePct + bt.cryptoSpreadPct / 2) / 100) / risk;
  return (z.ok ? z.feeToR : 0) + slip;
}

// Resolve open paper trades from closed 1m candles. Safe to call every few seconds.
function resolvePaper(nowMs) {
  let changed = false;
  for (const p of S.paper || []) {
    if (p.status !== 'open') continue;
    p.s = p.direction === 'bullish' ? 1 : -1;
    if (p.market === 'stocks' && marketSession(p.confirmT, S.settings).phase !== 'regular') { p.status = 'skipped'; p.note = 'signal came outside market hours'; changed = true; continue; }
    const cs = candlesFor(p);
    if (!cs.length) continue;
    const startIdx = cs.findIndex(c => c.t >= Math.floor(p.confirmT / 60000) * 60000);
    if (startIdx < 0) {
      if (nowMs - p.confirmT > 2 * 86400000) { p.status = 'unresolved'; changed = true; }
      continue;
    }
    const first = cs[startIdx];
    if (first.t > p.confirmT + 15 * 60000) { p.status = 'unresolved'; p.note = 'no candles right after the signal'; changed = true; continue; }
    const entry = p.fill ?? first.o;
    const risk = Math.abs(entry - p.stop);
    if (!(p.s * (entry - p.stop) > 0)) { p.status = 'skipped'; p.note = 'opened past the stop'; changed = true; continue; }
    p.fill = entry; p.risk = risk;
    const mult = multOf(p.exitMode);
    const target = entry + p.s * mult * risk;
    const expiry = p.market === 'crypto' ? p.confirmT + 4 * 3600000 : marketSession(p.confirmT, S.settings).closeMs;
    let mfe = 0, out = null;
    for (let i = startIdx; i < cs.length; i++) {
      const c = cs[i];
      if (c.t >= expiry) { const last = cs[i - 1] || c; out = { why: 'time exit', exitPx: last.c, exitT: last.t + 60000 }; break; }
      mfe = Math.max(mfe, p.s * ((p.s > 0 ? c.h : c.l) - entry) / risk);
      if (p.s > 0 ? c.l <= p.stop : c.h >= p.stop) { out = { why: 'stop', exitPx: p.stop, exitT: c.t + 60000 }; break; }
      if (p.s > 0 ? c.h >= target : c.l <= target) { out = { why: 'target', exitPx: target, exitT: c.t + 60000 }; break; }
    }
    p.mfeR = +mfe.toFixed(2);
    if (!out && nowMs > expiry + 120000 && cs.at(-1).t >= expiry - 60000) { const last = cs.filter(c => c.t < expiry).at(-1); out = { why: 'time exit', exitPx: last.c, exitT: last.t + 60000 }; }
    if (!out) continue;
    const grossR = p.s * (out.exitPx - entry) / risk;
    p.r = +(grossR - costR(p, entry, risk)).toFixed(3);
    p.win = p.r > 0;
    Object.assign(p, { status: 'closed', why: out.why, exitPx: out.exitPx, exitT: out.exitT });
    changed = true;
  }
  if (changed) A.save();
  return changed;
}

function paperStats(filter = () => true) {
  const all = (S.paper || []).filter(p => !p.demo && filter(p));
  const closed = all.filter(p => p.status === 'closed');
  const wins = closed.filter(p => p.win).length;
  return { total: all.length, open: all.filter(p => p.status === 'open').length, closed: closed.length, wins, losses: closed.length - wins,
    winRate: closed.length ? wins / closed.length : null, avgR: closed.length ? closed.reduce((a, p) => a + p.r, 0) / closed.length : null };
}
return {recordPaper,resolvePaper,paperStats};
}
