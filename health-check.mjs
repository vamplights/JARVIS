// Use the same configured loopback address as the server and launchers.
try {
 const port = Number(process.env.JARVIS_PORT || 8765);
 const response = await fetch(`http://127.0.0.1:${port}/api/health`, {signal: AbortSignal.timeout(3000)});
 if (!response.ok) throw Error('Unhealthy local response');
 const data = await response.json();
 if (data.application !== 'jarvis') throw Error('Unexpected local application');
 console.log(JSON.stringify(data));
} catch { process.exitCode = 1; }
