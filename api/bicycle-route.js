export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method Not Allowed'});
 const key=process.env.KAKAO_REST_API_KEY;if(!key)return res.status(500).json({error:'KAKAO_REST_API_KEY 환경변수가 없습니다.'});
 const {start_x,start_y,end_x,end_y}=req.query;if(!start_x||!start_y||!end_x||!end_y)return res.status(400).json({error:'출발/도착 좌표가 필요합니다.'});
 const coords=[+start_x,+start_y,+end_x,+end_y];if(!coords.every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[2])>180||Math.abs(coords[1])>90||Math.abs(coords[3])>90)return res.status(400).json({error:'유효한 출발/도착 좌표가 필요합니다.'});
 const defs=[['BIKE_ONLY','자전거도로 우선'],['SHORTEST','최단 경로'],['ACCESSIBLE','편안한길']];
 const errors=[];
 const one=async([mode,label])=>{
   try{
     const p=new URLSearchParams({start_x,start_y,end_x,end_y,route_mode:mode,input_coord:'WGS84',output_coord:'WGS84'});
     const r=await fetch('https://dapi.kakao.com/v2/routing/bicycle?'+p,{headers:{Authorization:'KakaoAK '+key}});
     const d=await r.json().catch(()=>({}));
     if(!r.ok||!d.route){errors.push({mode,status:r.status,message:d.message||d.msg||'route 없음'});return null}
     return {routeMode:mode,label,totalDistance:d.route.properties?.totalDistance||d.route.summary?.distance||0,totalTime:d.route.properties?.totalTime||d.route.summary?.duration||0,route:d.route}
   }catch(e){errors.push({mode,status:502,message:e.message||'경로 API 연결 실패'});return null}
 };
 const routes=(await Promise.all(defs.map(one))).filter(Boolean);
 if(!routes.length)return res.status(502).json({error:'자전거 경로 API에서 경로를 받지 못했습니다.',details:errors});
 res.status(200).json({routes,errors});
}
