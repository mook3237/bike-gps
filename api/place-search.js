function norm(s=''){return String(s).replace(/\s+/g,'').toLowerCase()}
function transit(c=''){return /(지하철|철도|기차|역사|교통|수도권전철)/.test(c)}
function score(x,q){const n=norm(x.place_name),z=norm(q);return (n===z?100000:0)+(/역$/.test(z)&&transit(x.category_name)?20000:0)+(n.startsWith(z)?5000:0)+(n.includes(z)?1000:0)}
const CATEGORY_CODES=['MT1','CS2','PS3','SC4','AC5','PK6','OL7','SW8','BK9','CT1','AG2','PO3','AT4','AD5','FD6','CE7','HP8','PM9'];
function place(x){return{id:x.id,name:x.place_name,category:x.category_name||'',address:x.road_address_name||x.address_name||'',latitude:+x.y,longitude:+x.x,distance:x.distance?+x.distance:null,phone:x.phone||''}}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method Not Allowed'});
 const key=process.env.KAKAO_REST_API_KEY;if(!key)return res.status(500).json({error:'KAKAO_REST_API_KEY 환경변수가 없습니다.'});
 const query=String(req.query.query||'').trim(),nearby=req.query.nearby==='1';if(!query&&!nearby)return res.status(400).json({error:'검색어가 필요합니다.'});
 const size=req.query.size==null||req.query.size===''?15:Number(req.query.size);if(!Number.isInteger(size)||size<1||size>15)return res.status(400).json({error:'size는 1~15 사이의 정수여야 합니다.'});
 const hasX=req.query.x!=null&&req.query.x!=='',hasY=req.query.y!=null&&req.query.y!=='';if(hasX!==hasY)return res.status(400).json({error:'x와 y 좌표를 함께 입력해야 합니다.'});
 if(hasX){const x=+req.query.x,y=+req.query.y;if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90)return res.status(400).json({error:'유효한 x와 y 좌표가 필요합니다.'})}
 if(nearby){const radius=Number(req.query.radius);if(!hasX||!Number.isInteger(radius)||radius<1||radius>50)return res.status(400).json({error:'좌표와 1~50m 반경이 필요합니다.'});try{const lists=await Promise.all(CATEGORY_CODES.map(async category=>{const p=new URLSearchParams({category_group_code:category,x:req.query.x,y:req.query.y,radius:String(radius),sort:'distance',size:'3'}),r=await fetch('https://dapi.kakao.com/v2/local/search/category.json?'+p,{headers:{Authorization:'KakaoAK '+key}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||'카카오 주변 장소검색 실패');return d.documents||[]}));const unique=new Map();lists.flat().forEach(item=>{if(!unique.has(item.id))unique.set(item.id,item)});const docs=[...unique.values()].sort((a,b)=>(+a.distance||Infinity)-(+b.distance||Infinity));return res.status(200).json({results:docs.map(place)})}catch(e){return res.status(502).json({error:'카카오 주변 장소검색 API에 연결하지 못했습니다.'})}}
 const p=new URLSearchParams({query,size:String(size)});if(hasX){p.set('x',req.query.x);p.set('y',req.query.y)}
 try{
   const r=await fetch('https://dapi.kakao.com/v2/local/search/keyword.json?'+p,{headers:{Authorization:'KakaoAK '+key}});
   const d=await r.json().catch(()=>({}));if(!r.ok)return res.status(r.status||502).json({error:d.msg||'카카오 장소검색 실패'});
   const docs=(d.documents||[]).map((x,i)=>({...x,_i:i})).sort((a,b)=>score(b,query)-score(a,query)||a._i-b._i);
   return res.status(200).json({results:docs.map(place)});
 }catch(e){return res.status(502).json({error:'카카오 장소검색 API에 연결하지 못했습니다.'})}
}
