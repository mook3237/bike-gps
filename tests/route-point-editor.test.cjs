const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./profile-browser-flow.cjs');

test('route point editor mobile controls and real history keep edits separate from confirmed routes', { timeout: 45000 }, async () => {
  await run({ check: async (evaluate, client) => {
    await evaluate(`(async()=>{
      profileController.selectProfile(profileRepository.getProfiles()[0].id);await profileController.confirmSelection();
      globalThis.editBrowser={requests:[],draws:0,fits:0,notices:[]};
      fetchRoutes=(a,b,waypoints)=>new Promise((resolve,reject)=>editBrowser.requests.push({a,b,waypoints,resolve,reject}));
      drawRoutes=()=>{editBrowser.draws++};fitSelectedRoute=()=>{editBrowser.fits++};toast=message=>editBrowser.notices.push(message);
      state.departure={id:'start',name:'출발 장소',latitude:37,longitude:127};
      state.destination={id:'end',name:'도착 장소',latitude:37.01,longitude:127.01};
      globalThis.editorReply=()=>[{routeMode:'BIKE_ONLY',label:'자전거도로 우선',totalDistance:1000,totalTime:200,route:{coordinates:[[127,37],[127.01,37.01]]}}];
      globalThis.initialEditorRequest=loadRoutes();document.querySelector('#addWaypointBtn').click();
      editBrowser.requests[0].resolve(editorReply());await initialEditorRequest;
    })()`);
    assert.deepEqual(await evaluate(`({screen:state.screen,rows:document.querySelectorAll('#routePointEditorFields [data-route-point]').length,
      empty:document.querySelector('[data-route-point-select="1"]').textContent,routeCount:state.routes.length,draws:editBrowser.draws,
      startHidden:document.querySelector('#startNavBtn').classList.contains('hidden'),actionsHidden:document.querySelector('#routePointEditorActions').classList.contains('hidden'),swap:!!document.querySelector('#swapBtn')})`),
    {screen:'route-points',rows:3,empty:'경로1',routeCount:0,draws:0,startHidden:true,actionsHidden:false,swap:false});
    await evaluate(`document.querySelector('[data-route-point-select="1"]').click()`);
    await evaluate(`new Promise(resolve=>{window.addEventListener('popstate',()=>setTimeout(resolve,0),{once:true});document.querySelector('#selectOnMapBtn').click()})`);
    const selected=await evaluate(`(()=>{globalThis.editorSelection=openPlace({id:'way',name:'지도에서 고른 장소',latitude:37.005,longitude:127.005},true);return{
      screen:state.screen,place:state.routePointEditorDraft.orderedPoints[1].id,
      rows:document.querySelectorAll('#routePointEditorFields [data-route-point]').length,confirmed:state.waypoints.length,requests:editBrowser.requests.length,navigation:state.navigationSearch}})()`);
    assert.deepEqual(selected,{screen:'route-points',place:'way',rows:3,confirmed:0,requests:2,navigation:false});
    assert.deepEqual(await evaluate(`({confirmed:state.waypoints.length,routes:state.routes.length,screen:state.screen})`),{confirmed:0,routes:0,screen:'route-points'});
    assert.equal(await evaluate(`(async()=>{editBrowser.requests[1].resolve(editorReply());return await editorSelection})()`),true);
    assert.deepEqual(await evaluate(`({waypoints:state.waypoints.map(p=>p.id),routes:state.routes.length,screen:state.screen})`),{waypoints:['way'],routes:1,screen:'route'});
    await evaluate(`document.querySelector('#addWaypointBtn').click();for(let i=0;i<8;i++)document.querySelector('#routePointEditorFields [data-route-point-add]').click()`);
    for(const [width,height] of [[390,844],[844,390]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:height});
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      const layout=await evaluate(`(()=>{
        const editor=document.querySelector('#routeEditor').getBoundingClientRect(),box=document.querySelector('#routePointEditorFields');
        box.scrollTop=box.scrollHeight;
        const fields=box.getBoundingClientRect(),actions=document.querySelector('#routePointEditorActions').getBoundingClientRect();
        const blank=document.querySelector('#routePointEditorFields [data-route-point="5"]').getBoundingClientRect();
        const locate=document.querySelector('#locateBtn').getBoundingClientRect();
        const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        return {slots:state.routePointEditorDraft.orderedPoints.length-2,usesWidth:Math.abs(editor.width-fields.width)<2,
          actionsVisible:actions.bottom<=innerHeight&&actions.top>=0,editorAboveActions:fields.bottom<=actions.top,
          blankVisible:blank.top>=fields.top&&blank.bottom<=fields.bottom,locateOverlap:overlap(editor,locate),bodyOverflow:document.documentElement.scrollWidth>innerWidth,
          confirmAbsent:!document.querySelector('#confirmRoutePointEditorBtn')};
      })()`);
      assert.deepEqual(layout,{slots:5,usesWidth:true,actionsVisible:true,editorAboveActions:true,blankVisible:true,locateOverlap:false,bodyOverflow:false,confirmAbsent:true},`${width}x${height}`);
    }
    const end=await evaluate(`(async()=>{
      const count=editBrowser.requests.length;cancelRoutePointEditor();
      return{requests:editBrowser.requests.length-count,waypoints:state.waypoints.map(p=>p.id),screen:state.screen,routeCount:state.routes.length};
    })()`);
    assert.deepEqual(end,{requests:0,waypoints:['way'],screen:'route',routeCount:1});
  }});
});
