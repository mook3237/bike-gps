class MapManager {
  constructor(){this.map=null;this.currentMarker=null;this.polyline=null;this.pathCoords=[];this.currentLocation=null}
  hasKakao(){return !!(window.kakao&&kakao.maps)}
  initMap(center){
    if(!this.hasKakao()){this.showMapMessage('카카오 지도 키를 config.js에 입력하세요.');return false}
    const el=document.getElementById('map'); if(!el)return false;
    const c=center||{lat:APP_CONFIG.MAP.centerLat,lng:APP_CONFIG.MAP.centerLng};
    if(!this.map){this.map=new kakao.maps.Map(el,{center:new kakao.maps.LatLng(c.lat,c.lng),level:APP_CONFIG.MAP.initialLevel});this.setupClick()}
    else this.map.relayout();
    return true;
  }
  setupClick(){kakao.maps.event.addListener(this.map,'click',e=>{if(window.bikeNav)bikeNav.setDestination(e.latLng.getLat(),e.latLng.getLng(),'지도에서 선택')})}
  showMapMessage(msg){const el=document.getElementById('map'); if(el)el.innerHTML=`<div class="map-message">${msg}</div>`}
  updateCurrentMarker(coords){
    if(!this.map)return; this.currentLocation=coords; const p=new kakao.maps.LatLng(coords.latitude,coords.longitude);
    if(!this.currentMarker)this.currentMarker=new kakao.maps.Marker({map:this.map,position:p,title:'현재 위치'}); else this.currentMarker.setPosition(p);
    if(this.pathCoords.length===0)this.map.setCenter(p); this.pathCoords.push(p); this.updatePolyline();
  }
  updatePolyline(){if(!this.map||this.pathCoords.length<2)return;if(!this.polyline)this.polyline=new kakao.maps.Polyline({map:this.map,path:this.pathCoords,strokeWeight:4,strokeColor:'#00a8ff',strokeOpacity:.8});else this.polyline.setPath(this.pathCoords)}
  reset(){this.pathCoords=[];if(this.polyline){this.polyline.setMap(null);this.polyline=null}}
  fitBounds(){if(!this.map||!this.pathCoords.length)return;const b=new kakao.maps.LatLngBounds();this.pathCoords.forEach(p=>b.extend(p));this.map.setBounds(b)}
  centerOnCurrent(){if(this.map&&this.currentLocation)this.map.setCenter(new kakao.maps.LatLng(this.currentLocation.latitude,this.currentLocation.longitude))}
}
window.mapManager=new MapManager();
