import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WatchTracker} from '../../src/lib/training/playback-runtime';
function fixture(){
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{visibilityState:'visible'}});
  const video={currentTime:0,paused:false,seeking:false,readyState:4,playbackRate:1};let now=0;
  const tracker=new WatchTracker(video as HTMLVideoElement,()=>now);
  return {video,tracker,tick:(position:number,ms=1000)=>{now+=ms;video.currentTime=position;tracker.sample();},restore:()=>{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}};
}
test('seek to minute four saves position and preserves only continuous watched segments',()=>{
  const f=fixture();try{f.tracker.sample();f.tick(1);f.tick(2);f.tracker.boundary();f.video.currentTime=240;f.tracker.sample();f.tick(241);const p=f.tracker.take();assert.equal(p.position,241);assert.deepEqual(p.segments.map(s=>[s.start,s.end]),[[0,2],[240,241]]);}finally{f.restore();}
});
test('small seek, rewind, buffering and background gaps cannot become watched coverage',()=>{
  const f=fixture();try{f.tracker.sample();f.tick(1);f.tracker.boundary();f.video.currentTime=1.1;f.tracker.sample();f.tick(2.1);f.tracker.boundary();f.video.currentTime=0;f.tracker.sample();f.tick(1);f.tick(100,10000);const p=f.tracker.take();assert.deepEqual(p.segments.map(s=>[s.start,s.end]),[[0,1],[1.1,2.1],[0,1]]);}finally{f.restore();}
});
test('pause retains actual preceding segment and does not count idle timeline movement',()=>{
  const f=fixture();try{f.tracker.sample();f.tick(1);f.video.paused=true;f.tick(1.5,500);f.tick(20,1000);const p=f.tracker.take();assert.deepEqual(p.segments.map(s=>[s.start,s.end]),[[0,1.5]]);}finally{f.restore();}
});
