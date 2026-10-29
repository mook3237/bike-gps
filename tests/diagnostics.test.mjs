import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../diagnostics.js',import.meta.url),'utf8');
function load(fetch=async()=>({status:200})){
  const listeners=new Map(),clicks=new Map(),printed=[];
  const context=vm.createContext({URL,fetch,location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},navigator:{userAgent:'test'},console:{log(...args){printed.push(args)},error(){},warn(){},debug(){}},addEventListener:(name,fn)=>listeners.set(name,fn),document:{addEventListener:(name,fn)=>clicks.set(name,fn)}});
  vm.runInContext(source,context);
  return{context,listeners,clicks,printed,read:()=>JSON.parse(context.RideMateDiagnostics.exportText())};
}
test('diagnostics retain console output and errors, redact credentials, and handle circular values',()=>{
  const fixture=load();
  vm.runInContext(`const circular={value:1};circular.self=circular;console.log('hello',{token:'private-value'},circular,'Authorization: Bearer private-bearer');globalThis.failure=new Error('problem appkey=private-key');`,fixture.context);
  fixture.listeners.get('error')({error:fixture.context.failure});
  fixture.clicks.get('click')({target:{closest:()=>({id:'racingStartBtn',textContent:'Start',dataset:{}})}});
  const log=fixture.read(),text=JSON.stringify(log);
  assert.equal(fixture.printed.length,1);
  assert.match(text,/hello/);assert.match(text,/circular/);assert.match(text,/racingStartBtn/);assert.match(text,/problem/);
  assert.doesNotMatch(text,/private-value|private-key|private-bearer/);
  assert.ok(log.entries.some(entry=>entry.event==='app-loaded'));
  assert.ok(log.entries.some(entry=>entry.event==='error'&&entry.data.stack));
  fixture.listeners.get('unhandledrejection')({reason:'unhandled failure'});
  assert.equal(fixture.read().entries.at(-1).event,'unhandledrejection');
});
test('diagnostic fetch tracing preserves responses and failures without recording headers or unrelated requests',async()=>{
  const response={status:200},failure=new Error('network failed');
  const fixture=load(async url=>{if(String(url).includes('fail'))throw failure;return response});
  assert.equal(await fixture.context.fetch('/api/bicycle-route?route_mode=SHORTEST&appkey=hidden',{headers:{Authorization:'private-header'}}),response);
  await assert.rejects(fixture.context.fetch('/api/fail'),error=>error===failure);
  const before=fixture.read().entries.length;await fixture.context.fetch('https://other.test/');assert.equal(fixture.read().entries.length,before);
  const text=JSON.stringify(fixture.read());assert.match(text,/SHORTEST/);assert.match(text,/request-error/);assert.doesNotMatch(text,/hidden|private-header/);
});
test('diagnostic memory is bounded and reports discarded entries',()=>{
  const fixture=load();for(let i=0;i<2100;i++)fixture.context.RideMateDiagnostics.record('event',{i});
  const log=fixture.read();assert.equal(log.retained,2000);assert.equal(log.dropped,101);assert.equal(log.entries.at(-1).data.i,2099);
});
