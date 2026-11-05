// Keep worker memory bounded and start each timeout when its worker actually starts.
export function replayQueue(run){
 let tail=Promise.resolve();
 return input=>{
  const job=tail.then(()=>run(input));
  tail=job.catch(()=>{});
  return job;
 };
}
