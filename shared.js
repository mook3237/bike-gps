
window.RideMate = {
  state: JSON.parse(sessionStorage.getItem('ridemate.state') || '{}'),
  save(patch){ this.state={...this.state,...patch}; sessionStorage.setItem('ridemate.state',JSON.stringify(this.state)); return this.state; },
  async config(){ const r=await fetch('/api/config'); if(!r.ok) throw new Error((await r.json()).error||'설정을 불러오지 못했습니다.'); return r.json(); },
  async loadKakao(){
    if(window.kakao?.maps) return window.kakao;
    const c=await this.config();
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(c.kakaoJsKey)}&autoload=false`;
      s.onload=()=>kakao.maps.load(resolve); s.onerror=()=>reject(new Error('Kakao Maps SDK 로드 실패')); document.head.appendChild(s);
    });
    return window.kakao;
  },
  async locate(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation) return reject(new Error('GPS를 사용할 수 없습니다.'));
      navigator.geolocation.getCurrentPosition(p=>resolve({name:'현재 위치',source:'gps',lat:p.coords.latitude,lng:p.coords.longitude}),reject,{enableHighAccuracy:true,timeout:7000,maximumAge:15000});
    });
  },
  async search(q, origin){
    const u=new URL('/api/place-search',location.origin); u.searchParams.set('query',q); u.searchParams.set('size','15');
    if(origin?.lng!=null&&origin?.lat!=null){u.searchParams.set('x',origin.lng);u.searchParams.set('y',origin.lat)}
    const r=await fetch(u); const d=await r.json(); if(!r.ok) throw new Error(d.error||'장소 검색 실패'); return d.results||[];
  },
  async routes(a,b){
    const u=new URL('/api/bicycle-route',location.origin);
    [['start_x',a.lng],['start_y',a.lat],['end_x',b.lng],['end_y',b.lat]].forEach(([k,v])=>u.searchParams.set(k,v));
    const r=await fetch(u); const d=await r.json(); if(!r.ok) throw new Error(d.error||'경로 검색 실패'); return d.routes||[];
  }
};
