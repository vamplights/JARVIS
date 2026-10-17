import {specialReplay,specialStrategy} from './special-replay.mjs';
import {ReplaySeries} from './replay-series.mjs';
import {walkForward} from './walk-forward.mjs';
import {parentPort,workerData} from 'node:worker_threads';
import {backtest} from './engine.mjs';
function result(){if(specialStrategy(workerData.strategy))return specialReplay(workerData);if(workerData.mode!=='walk-forward-batch')return workerData.mode==='walk-forward'?walkForward(workerData):backtest(workerData);const prepared=new ReplaySeries(workerData),evaluationCache=new Map();return {runs:workerData.strategies.map(strategy=>walkForward({...workerData,strategy,prepared,evaluationCache}))};}
try{parentPort.postMessage({result:result()});}catch(e){parentPort.postMessage({error:e.message});}
