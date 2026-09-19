
const toast=document.getElementById("toast"); let map;
function showToast(m){toast.textContent=m;toast.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>toast.classList.remove("show"),1300)}
(async()=>{try{await RideMate.loadKakao();let loc={lat:37.5665,lng:126.9780};try{loc=await RideMate.locate()}catch{}map=new kakao.maps.Map(document.getElementById('kakaoMap'),{center:new kakao.maps.LatLng(loc.lat,loc.lng),level:5});new kakao.maps.Marker({map,position:new kakao.maps.LatLng(loc.lat,loc.lng)});RideMate.save({currentLocation:loc})}catch(e){showToast(e.message)}})();
document.getElementById("searchBtn").onclick=()=>location.href="/search/";
document.getElementById("menuBtn").onclick=()=>showToast("메뉴");
document.querySelectorAll(".quick-actions button").forEach(b=>b.onclick=()=>showToast(`${b.innerText.trim()}은 주소 등록 후 연결됩니다.`));
document.getElementById("compassBtn").onclick=()=>{if(map)map.setLevel(map.getLevel())};
document.getElementById("zoomIn").onclick=()=>map&&map.setLevel(Math.max(1,map.getLevel()-1));
document.getElementById("zoomOut").onclick=()=>map&&map.setLevel(map.getLevel()+1);
document.getElementById("currentLocationBtn").onclick=async()=>{try{const l=await RideMate.locate();map.panTo(new kakao.maps.LatLng(l.lat,l.lng));RideMate.save({currentLocation:l})}catch(e){showToast("현재 위치를 가져오지 못했습니다.")}};
document.querySelectorAll(".nav-item").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));btn.classList.add("active");showToast(btn.innerText.trim())});
