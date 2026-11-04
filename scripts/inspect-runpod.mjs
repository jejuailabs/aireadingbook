// Read-only control-plane lookup. Never calls /run, /runsync, or changes workers.
const endpoint = process.env.RUNPOD_QWEN3_TTS_ENDPOINT_ID;
const key = process.env.RUNPOD_API_KEY;
if (!key || !/^[a-zA-Z0-9_-]+$/.test(endpoint || '')) throw new Error('RunPod configuration is missing.');
try {
  const response = await fetch(`https://rest.runpod.io/v1/endpoints/${endpoint}`, {
    headers: {Authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(15000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`Control API HTTP ${response.status}`);
  const data = await response.json();
  const safe = Object.fromEntries(['id','name','gpuIds','gpuTypeIds','gpuCount','workersMin','workersMax','idleTimeout','executionTimeoutMs','networkVolumeId'].map(k=>[k,data[k]??null]));
  safe.imageName = data.template?.imageName ?? null;
  safe.readOnly = true;
  console.log(JSON.stringify(safe, null, 2));
} catch (error) { console.error(error.message.startsWith('Control API') ? error.message : 'RunPod read-only inspection failed; no jobs submitted.'); process.exitCode = 1; }
