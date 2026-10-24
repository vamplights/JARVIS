// Per-signal confidence model: L2-regularized logistic regression trained on past outcomes
// (historical replay + live forward-test). Inputs are the SAME things the signal card shows:
// setup type, direction, regime, score and which rule checks passed. Output = estimated chance the
// trade ends net-positive under the current exit rule. It's an estimate from a limited sample, not a promise.

const CORE_FACTORS = ['Not choppy', 'Volume confirmation', 'Not extended from 34 EMA', 'Room to next level', 'Stop distance sensible',
  'VWAP side', 'Breakout volume', 'Not chasing', 'Breakout momentum', 'Holding VWAP side', 'VWAP direction', 'Trend day (few VWAP crosses)',
  '34 EMA on trend side of VWAP', '34 EMA slope', 'Liquid period', 'Tight consolidation', 'Strong day move', 'Market direction (SPY vs VWAP)',
  'Resumption candle', 'Candle closed through EMA', 'Leverage within safe cap'];

// Feature map for one signal (live candidate or backtest signal).
export function featuresOf(sig, extra = {}) {
  const f = {};
  f[`setup:${sig.strategyId}|${sig.variant}`] = 1;
  f['dir:long'] = sig.direction === 'bullish' ? 1 : 0;
  f['score'] = (sig.score ?? 60) / 100 - 0.75;
  for (const x of sig.factors || []) {
    const name = x.name.replace(/^\d+[mh] trend filter$/, 'HTF trend filter');
    if (CORE_FACTORS.includes(name) || name === 'HTF trend filter') f[`pass:${name}`] = x.pass ? 1 : -1;
  }
  if (extra.regime) f['regime:trending'] = extra.regime === 'trending' ? 1 : -1;
  return f;
}

export const FEATURE_LABELS = k => k.startsWith('setup:') ? 'setup type' : k === 'dir:long' ? 'long vs short' : k === 'score' ? 'rule score'
  : k.startsWith('pass:') ? k.slice(5) : k === 'regime:trending' ? 'trending market' : k;

const sigmoid = z => 1 / (1 + Math.exp(-z));

// samples: [{ x: featureMap, y: 0|1, w? }]
export function trainLogistic(samples, { lambda = 10, iters = 400, lr = 0.5 } = {}) {
  const vocab = [...new Set(samples.flatMap(s => Object.keys(s.x)))];
  const idx = Object.fromEntries(vocab.map((k, i) => [k, i]));
  const W = new Float64Array(vocab.length);
  const totalW = samples.reduce((a, s) => a + (s.w ?? 1), 0);
  const pos = samples.reduce((a, s) => a + (s.w ?? 1) * s.y, 0);
  const base = (pos + 1) / (totalW + 2);
  let b = Math.log(base / (1 - base));
  const rows = samples.map(s => ({ ks: Object.keys(s.x).map(k => idx[k]), vs: Object.values(s.x), y: s.y, w: s.w ?? 1 }));
  for (let it = 0; it < iters; it++) {
    const g = new Float64Array(vocab.length); let gb = 0;
    for (const r of rows) {
      let z = b; for (let j = 0; j < r.ks.length; j++) z += W[r.ks[j]] * r.vs[j];
      const e = (sigmoid(z) - r.y) * r.w;
      gb += e; for (let j = 0; j < r.ks.length; j++) g[r.ks[j]] += e * r.vs[j];
    }
    for (let k = 0; k < W.length; k++) W[k] -= lr * (g[k] / totalW + (lambda / totalW) * W[k]);
    b -= lr * gb / totalW;
  }
  return { vocab, w: Array.from(W), b, n: samples.length, base };
}

export function predict(model, x) {
  if (!model) return null;
  let z = model.b; const contrib = [];
  model.vocab.forEach((k, i) => { if (x[k] != null && model.w[i]) { const c = model.w[i] * x[k]; z += c; contrib.push({ k, c }); } });
  const p = sigmoid(z);
  // translate log-odds contributions into approximate percentage-point effects around the base rate
  const p0 = model.base;
  const pts = contrib.map(({ k, c }) => ({ label: FEATURE_LABELS(k), pts: (sigmoid(Math.log(p0 / (1 - p0)) + c) - p0) * 100 }))
    .filter(x => Math.abs(x.pts) >= 1).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
  return { p, base: p0, drivers: pts };
}

// Out-of-sample check: train on the older 70%, test on newest 30%.
export function holdoutCheck(samples) {
  if (samples.length < 60) return null;
  const sorted = [...samples].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const cut = Math.floor(sorted.length * 0.7);
  const m = trainLogistic(sorted.slice(0, cut));
  const test = sorted.slice(cut);
  let brier = 0, brier0 = 0; const bins = {};
  for (const s of test) {
    const p = predict(m, s.x).p; brier += (p - s.y) ** 2; brier0 += (m.base - s.y) ** 2;
    const key = `${Math.round(p * 10) * 10}%`; (bins[key] = bins[key] || { n: 0, wins: 0 }).n++; bins[key].wins += s.y;
  }
  return { n: test.length, brier: brier / test.length, brierBase: brier0 / test.length, beatsBase: brier < brier0, bins };
}
