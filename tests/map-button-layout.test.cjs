const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./profile-browser-flow.cjs');

test('swapped map and navigation buttons preserve placement, actions and other screens', { timeout: 30000 }, async t => {
  await run({ check: async (evaluate, client) => {
    await evaluate(`(async()=>{
      profileController.selectProfile(profileRepository.getProfiles()[0].id);await profileController.confirmSelection();
      globalThis.buttonQA={pans:0,followCalls:0};
      navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:37.55,longitude:127.02}});
      state.map.panTo=point=>{buttonQA.pans++;state.map.center=point};
      followNavigationPosition=()=>{buttonQA.followCalls++};
      globalThis.buttonRect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    })()`);
    for (const screen of ['map','racing']) await t.test(`${screen}: menu top-right, location bottom-right, same click actions`, async () => {
      const result=await evaluate(`(async()=>{
        renderScreen('${screen}',false);await new Promise(resolve=>requestAnimationFrame(resolve));
        const menu=buttonRect('menuBtn'),location=buttonRect('locateBtn'),before=buttonQA.pans;
        document.getElementById('menuBtn').click();const menuOpened=!document.getElementById('mainMenu').classList.contains('hidden');closeMainMenu(true);
        document.getElementById('locateBtn').click();await new Promise(resolve=>setTimeout(resolve,0));
        return{menu,location,width:innerWidth,height:innerHeight,menuOpened,moved:buttonQA.pans>before,
          names:[document.getElementById('menuBtn').getAttribute('aria-label'),document.getElementById('locateBtn').getAttribute('aria-label')]};
      })()`);
      assert.equal(result.menuOpened,true);assert.equal(result.moved,true);assert.deepEqual(result.names,['메뉴','현재 위치']);
      assert.equal(result.menu.right,result.location.right);assert.ok(result.menu.top<30);
      assert.ok(result.location.top>result.height/2);assert.ok(result.location.bottom<=result.height);
      assert.ok(result.menu.right<=result.width);
    });

    await t.test('active racing hides and restores both swapped controls', async () => {
      const result=await evaluate(`(async()=>{
        state.racingPhase='active';document.body.classList.add('racing-controls-hidden');
        await new Promise(resolve=>setTimeout(resolve,250));
        const hidden=getComputedStyle(document.querySelector('.right-controls')).opacity==='0';
        const before=[buttonRect('menuBtn').top,buttonRect('locateBtn').top];
        showRacingControlsTemporarily();await new Promise(resolve=>setTimeout(resolve,250));
        const shown=getComputedStyle(document.querySelector('.right-controls')).opacity==='1';
        const same=JSON.stringify(before)===JSON.stringify([buttonRect('menuBtn').top,buttonRect('locateBtn').top]);
        state.racingPhase='idle';return{hidden,shown,same};
      })()`);
      assert.deepEqual(result,{hidden:true,shown:true,same:true});
    });

    await t.test('navigation keeps search above menu and location in the right HUD cell', async () => {
      const result=await evaluate(`(()=>{
        renderScreen('navigation',false);state.nav.follow=false;
        const search=buttonRect('navSearchBtn'),menu=buttonRect('navMenuBtn'),location=buttonRect('navLocateBtn'),hud=buttonRect('navHud');
        document.getElementById('navMenuBtn').click();const menuOpened=!document.getElementById('navMenu').classList.contains('hidden');document.getElementById('navMenu').classList.add('hidden');
        const before=buttonQA.followCalls;document.getElementById('navLocateBtn').click();
        return{search,menu,location,hud,menuOpened,following:state.nav.follow,followCalled:buttonQA.followCalls>before,
          names:[document.getElementById('navSearchBtn').getAttribute('aria-label'),document.getElementById('navLocateBtn').getAttribute('aria-label')],
          tools:[...document.querySelector('.nav-tools').children].map(node=>node.id),hudItems:[...document.getElementById('navHud').children].map(node=>node.id)};
      })()`);
      assert.equal(result.menuOpened,true);assert.equal(result.following,true);assert.equal(result.followCalled,true);
      assert.deepEqual(result.names,['검색','현재 위치 추적']);
      assert.deepEqual(result.tools,['navSearchBtn','navMenuBtn']);assert.deepEqual(result.hudItems,['navRecalcBtn','navInfoToggle','navLocateBtn']);
      assert.ok(result.menu.top>=result.search.bottom);assert.equal(result.search.right,result.menu.right);
      assert.ok(result.location.top>=result.hud.top&&result.location.bottom<=result.hud.bottom);assert.ok(result.location.left>result.hud.right-result.hud.width/3);
      assert.equal(result.location.width,42);assert.equal(result.location.height,42);
    });

    await t.test('route choice and waypoint editing retain their original top-right location control in both orientations', async () => {
      for (const [width,height] of [[390,844],[844,390]]) {
        await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:height});
        for (const screen of ['route','route-points']) {
          const result=await evaluate(`(async()=>{
            renderScreen('${screen}',false);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const locate=buttonRect('locateBtn'),editor=buttonRect('routeEditor');
            return{locate,editor,menuHidden:getComputedStyle(document.getElementById('menuBtn')).display==='none',
              overlap:locate.left<editor.right&&locate.right>editor.left&&locate.top<editor.bottom&&locate.bottom>editor.top};
          })()`);
          assert.equal(result.menuHidden,true);assert.equal(result.overlap,false,`${screen}/${width}`);assert.ok(result.locate.top<30);
        }
      }
    });
  }});
});
