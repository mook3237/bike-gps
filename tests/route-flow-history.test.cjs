const test=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('./profile-browser-flow.cjs');

test('route flows keep real browser history, visible actions, route pins and mode consistent', {timeout:45000},async t=>{
  await run({check:async(evaluate)=>{
    await evaluate(`(async()=>{
      profileController.selectProfile(profileRepository.getProfiles()[0].id);await profileController.confirmSelection();
      globalThis.flowQA={notices:[],fits:0};toast=message=>flowQA.notices.push(message);
      kakao.maps.Polyline=class{constructor(options){Object.assign(this,options)}setMap(map){this.map=map}setOptions(options){Object.assign(this,options)}setZIndex(z){this.zIndex=z}};
      kakao.maps.LatLngBounds.prototype.isEmpty=()=>false;state.map.setBounds=()=>{flowQA.fits++};
      globalThis.flowPoint=(id,n)=>({id,name:id,latitude:37+n/111195,longitude:127});
      globalThis.flowRaw=(from,to)=>({label:'BIKE_ONLY',routeMode:'BIKE_ONLY',totalDistance:1000,totalTime:200,route:{coordinates:[[from.longitude,from.latitude],[to.longitude,to.latitude]]}});
      fetchRoutes=async(from,to)=>[flowRaw(from,to)];locate=async()=>flowPoint('실제 출발',0);
      state.currentLocation=null;
      globalThis.flowBack=action=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('route popstate not received')),1500);
        window.addEventListener('popstate',()=>{clearTimeout(timer);setTimeout(resolve,0)},{once:true});action();
      });
      globalThis.flowVisible=id=>{const node=document.getElementById(id);return !!node&&getComputedStyle(node).display!=='none'&&!!node.getClientRects().length};
      globalThis.flowSnapshot=()=>({screen:state.screen,history:history.state.screen,hash:location.hash,routes:state.routes.length,destination:state.destination?.id||null,waypoints:state.waypoints.map(p=>p.id),setup:state.racingCourseSetup?.stage||null});
      state.departure=flowPoint('출발 A',0);state.destination=flowPoint('도착 B',1000);state.waypoints=[flowPoint('경유 C',500)];await loadRoutes();
      globalThis.flowOriginal={routes:state.routes,pins:state.routeEndpointMarkers.slice(),destination:state.destination,waypoints:state.waypoints};
    })()`);

    await t.test('general route address card pushes history and back restores the same route and pins',async()=>{
      const result=await evaluate(`(async()=>{
        kakao.maps.services.Geocoder=class{coord2Address(x,y,callback){callback([{address:{address_name:'다른 장소'}}],'OK')}};
        const length=history.length;openMapAddress(new kakao.maps.LatLng(37.003,127));
        const card={change:flowVisible('changeNavDestination'),add:flowVisible('addNavWaypoint'),start:flowVisible('setStart'),pushed:history.length===length+1,pinsUnchanged:flowOriginal.pins.every((p,i)=>state.routeEndpointMarkers[i]===p&&p.map===state.map)};
        await flowBack(()=>history.back());
        return{card,...flowSnapshot(),sameRoute:state.routes===flowOriginal.routes,fields:document.getElementById('routeSelectionFields').textContent};
      })()`);
      assert.deepEqual(result.card,{change:true,add:true,start:false,pushed:true,pinsUnchanged:true});
      assert.equal(result.screen,'route');assert.equal(result.history,'route');assert.equal(result.hash,'#route');
      assert.equal(result.sameRoute,true);assert.equal(result.destination,'도착 B');assert.deepEqual(result.waypoints,['경유 C']);
      assert.match(result.fields,/출발 A/);assert.match(result.fields,/도착 B/);
    });
    await t.test('general cancel rewinds the selection history and the next place has general map actions',async()=>{
      const result=await evaluate(`(async()=>{
        await flowBack(()=>document.getElementById('cancelRoutePreviewBtn').click());const root=flowSnapshot();
        openPlace(flowPoint('새 장소',300),true);
        const card={start:flowVisible('setStart'),end:flowVisible('setEnd'),change:flowVisible('changeNavDestination'),trip:flowVisible('racingOneWayChoiceBtn')};
        await flowBack(()=>handleMapClick({point:{x:10,y:10}}));return{root,card,closed:flowSnapshot()};
      })()`);
      const root={screen:'map',history:'map',hash:'#map',routes:0,destination:null,waypoints:[],setup:null};
      assert.deepEqual(result.root,root);assert.deepEqual(result.closed,root);
      assert.deepEqual(result.card,{start:true,end:true,change:false,trip:false});
    });
    for(const trip of ['one-way','round'])await t.test(`racing ${trip} has endpoints and card dismissal preserves the candidate`,async()=>{
      const result=await evaluate(`(async()=>{
        resumeRacingScreen();openPlace(flowPoint('레이싱 목적지',1000),true);
        const initial={oneWay:flowVisible('racingOneWayChoiceBtn'),round:flowVisible('racingRoundTripChoiceBtn'),start:flowVisible('setStart'),change:flowVisible('changeNavDestination')};
        await confirmRacingDestination(state.selectedPlace,'${trip}');
        const fields=document.getElementById('routeSelectionFields').textContent,route=state.routes,setup=state.racingCourseSetup,pins=state.routeEndpointMarkers.slice();
        const routeVisible=flowVisible('routeEditor'),headerHidden=!flowVisible('mapHeader');
        openPlace(flowPoint('새 레이싱 목적지',2000),true);
        const candidate={oneWay:flowVisible('racingOneWayChoiceBtn'),round:flowVisible('racingRoundTripChoiceBtn'),unchanged:state.routes===route&&pins.every((p,i)=>p===state.routeEndpointMarkers[i])};
        await flowBack(()=>handleMapClick({point:{x:10,y:10}}));
        const restored={...flowSnapshot(),sameRoute:state.routes===route,sameSetup:state.racingCourseSetup===setup};
        const noOverflow=document.documentElement.scrollWidth<=innerWidth;
        const editor=document.getElementById('routeEditor').getBoundingClientRect(),menu=document.getElementById('menuBtn').getBoundingClientRect();
        const menuClear=editor.right<=menu.left;
        await flowBack(()=>document.getElementById('cancelRoutePreviewBtn').click());
        return{initial,fields,routeVisible,headerHidden,candidate,restored,noOverflow,menuClear,cancelled:flowSnapshot()};
      })()`);
      assert.deepEqual(result.initial,{oneWay:true,round:true,start:false,change:false});
      assert.equal(result.routeVisible,true);assert.equal(result.headerHidden,true);assert.match(result.fields,/실제 출발/);assert.match(result.fields,/레이싱 목적지/);
      assert.match(result.fields,trip==='round'?/왕복/:/편도/);
      assert.deepEqual(result.candidate,{oneWay:true,round:true,unchanged:true});
      assert.equal(result.restored.screen,'racing-route');assert.equal(result.restored.history,'racing-route');assert.equal(result.restored.hash,'#racing-route');
      assert.equal(result.restored.sameRoute,true);assert.equal(result.restored.sameSetup,true);assert.equal(result.noOverflow,true);assert.equal(result.menuClear,true);
      assert.deepEqual(result.cancelled,{screen:'racing',history:'racing',hash:'#racing',routes:0,destination:null,waypoints:[],setup:null});
    });
    for(const mode of ['map','racing'])await t.test(`${mode} initial route calculation restarts after real browser back without adding history`,async()=>{
      const result=await evaluate(`(async()=>{
        discardRouteFlow('${mode}');const originalFetch=fetchRoutes,requests=[];
        fetchRoutes=(a,b)=>new Promise(resolve=>requests.push({a,b,resolve}));
        const a=flowPoint('A',0),b=flowPoint('B',1000);
        if('${mode}'==='map'){state.departure=a;state.destination=b}else state.racingCourseSetup={stage:'destination-discovery',origin:a,destination:b};
        const first='${mode}'==='map'?loadRoutes():loadRacingCourseAlternatives();
        const depth=history.state.routeDepth,length=history.length;
        openPlace(flowPoint('inspect loading',500),true);await flowBack(()=>history.back());
        const returned={screen:state.screen,history:history.state.screen,hash:location.hash,requests:requests.length,startHidden:!flowVisible('startNavBtn'),sameDepth:history.state.routeDepth===depth,extraHistory:history.length>length+1};
        requests[0].resolve([{...flowRaw(requests[0].a,requests[0].b),id:'obsolete'}]);await first;
        const staleIgnored=state.routes.length===0&&!flowVisible('startNavBtn');
        if(requests[1]){requests[1].resolve([{...flowRaw(requests[1].a,requests[1].b),id:'resumed'}]);await new Promise(resolve=>setTimeout(resolve,0))}
        const finished={id:state.routes[0]?.id||null,lines:state.routeLines.filter(l=>l.map===state.map).length,startVisible:flowVisible('startNavBtn'),loading:document.getElementById('routeCards').textContent.includes('경로를 찾는 중')};
        fetchRoutes=originalFetch;
        await flowBack(()=>document.getElementById('cancelRoutePreviewBtn').click());
        return{returned,staleIgnored,finished};
      })()`);
      const screen=mode==='map'?'route':'racing-route';
      assert.deepEqual(result,{returned:{screen,history:screen,hash:'#'+screen,requests:2,startHidden:true,sameDepth:true,extraHistory:false},staleIgnored:true,finished:{id:'resumed',lines:1,startVisible:true,loading:false}});
    });
    await t.test('confirmed racing course survives repeated place inspection with matching history and visible geometry',async()=>{
      const result=await evaluate(`(async()=>{
        resumeRacingScreen();openPlace(flowPoint('B',1000),true);await confirmRacingDestination(state.selectedPlace,'one-way');
        document.getElementById('startNavBtn').click();
        const course=state.racingCourse,route=state.routes[0];
        const confirmed={screen:state.screen,history:history.state.screen,hash:location.hash,lines:state.routeLines.filter(l=>l.map===state.map).length};
        const inspections=[];
        for(let i=0;i<2;i++){
          const length=history.length;openPlace(flowPoint('inspect '+i,2000+i),true);
          await flowBack(()=>history.back());
          inspections.push({screen:state.screen,history:history.state.screen,hash:location.hash,sameCourse:state.racingCourse===course,sameRoute:state.routes[0]===route,
            routes:state.routes.length,lines:state.routeLines.filter(l=>l.map===state.map).length,pins:state.routeEndpointMarkers.filter(p=>p.map===state.map).length,setup:state.racingCourseSetup,
            startVisible:flowVisible('racingStartBtn'),startEnabled:!document.getElementById('racingStartBtn').disabled,extraHistory:history.length>length+1});
        }
        return{confirmed,inspections};
      })()`);
      assert.deepEqual(result.confirmed,{screen:'racing',history:'racing',hash:'#racing',lines:1});
      for(const inspection of result.inspections)assert.deepEqual(inspection,{screen:'racing',history:'racing',hash:'#racing',sameCourse:true,sameRoute:true,routes:1,lines:1,pins:2,setup:null,startVisible:true,startEnabled:true,extraHistory:false});
    });
    await t.test('browser back cannot revive an obsolete racing entry in general map mode',async()=>{
      const result=await evaluate(`(async()=>{
        document.getElementById('mapTabBtn').click();
        history.pushState({screen:'racing-route',racingSetup:true},'','#racing-route');history.pushState({screen:'map'},'','#map');
        await flowBack(()=>history.back());return flowSnapshot();
      })()`);
      assert.deepEqual(result,{screen:'map',history:'map',hash:'#map',routes:0,destination:null,waypoints:[],setup:null});
    });
  }});
});
