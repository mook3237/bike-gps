class GPSTracker {
  constructor(){this.watchId=null;this.positions=[];this.lastUpdateTime=null;this.lastTimestamp=null;this.speeds=[];this.targetSpeedReached=false;}
  startTracking(onUpdate,onError){
    if(!navigator.geolocation){onError('이 브라우저는 GPS를 지원하지 않습니다.');return false}
    this.stopTracking();
    const opt={enableHighAccuracy:APP_CONFIG.GPS.enableHighAccuracy,timeout:APP_CONFIG.GPS.timeout,maximumAge:APP_CONFIG.GPS.maximumAge};
    this.watchId=navigator.geolocation.watchPosition(pos=>{
      const c={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy||999,speed:pos.coords.speed,altitude:pos.coords.altitude,timestamp:pos.timestamp||Date.now()};
      if(c.accuracy>100) return;
      const now=c.timestamp; this.lastUpdateTime=this.lastTimestamp?Math.max(.2,(now-this.lastTimestamp)/1000):null; this.lastTimestamp=now;
      this.positions.push(c); if(this.positions.length>2000)this.positions.shift();
      onUpdate(c);
    },err=>onError(this.errorMessage(err)),opt);
    return true;
  }
  stopTracking(){if(this.watchId!==null){navigator.geolocation.clearWatch(this.watchId);this.watchId=null}}
  errorMessage(e){return e.code===1?'위치 권한이 거부되었습니다.':e.code===2?'현재 위치를 확인할 수 없습니다.':e.code===3?'GPS 응답 시간이 초과되었습니다.':'GPS 오류가 발생했습니다.'}
  reset(){this.positions=[];this.lastUpdateTime=null;this.lastTimestamp=null;this.speeds=[];this.targetSpeedReached=false}
}
window.gpsTracker=new GPSTracker();
