/* AUTO ORYX — Modèle de données et compatibilité des sauvegardes. */
const Fleet = (() => {
  const textKeys=['brand','model','entity','purchasedBy','usedBy','department','userName'];
  const dateKeys=['firstRegistration','lastInspection','nextInspection','nextOilDate'];
  const numberKeys=['year','nextOilKm','serviceIntervalKm','serviceIntervalMonths'];
  const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  function splitName(name){
    const known=['Mercedes-Benz','Land Rover','Alfa Romeo','Toyota','Hyundai','Peugeot','Kia','Renault','Honda','Nissan','Ford','Suzuki','Mitsubishi','Volkswagen','BMW','Audi','Isuzu','Dacia','Chevrolet'];
    const brand=known.find(b=>name.toLowerCase().startsWith(b.toLowerCase()+' '));
    return brand?[name.slice(0,brand.length),name.slice(brand.length).trim()]:['',name];
  }
  function upgrade(data){
    const copy=JSON.parse(JSON.stringify(data));
    copy.vehicles=copy.vehicles.map(v=>{
      const [b,m]=splitName(v.name||'');
      const out={...v,photo:v.photo||''};
      for(const k of textKeys)out[k]=typeof v[k]==='string'?v[k]:'';
      for(const k of dateKeys)out[k]=v[k]||'';
      for(const k of numberKeys)out[k]=v[k]??null;
      if(data.schema===1){out.brand=b;out.model=m;out.userName=v.person||'';}
      return out;
    });
    copy.schema=2;return copy;
  }
  function validate(data){
    const fail=()=>{throw new Error('Sauvegarde invalide ou incompatible.');};
    const strings=(o,keys)=>o&&keys.every(k=>typeof o[k]==='string');
    const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isInteger(v);
    const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
    if(!data||![1,2].includes(data.schema)||!Array.isArray(data.vehicles)||!Array.isArray(data.maintenance)||!Array.isArray(data.reservations))fail();
    for(const v of data.vehicles){
      if(v.photo!==undefined&&v.photo!==''&&(typeof v.photo!=='string'||v.photo.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.photo)))fail();
      if(!strings(v,['id','name','plate','category','person','status','image'])||!validId(v.id)||!v.name.trim()||!v.plate.trim()||!['Affecté','Disponible','En entretien'].includes(v.status)||!nonnegative(v.km)||!['sedan','suv','white-suv','grey-suv'].includes(v.image)||v.insurance&&!isDate(v.insurance))fail();
      if(data.schema===2){
        if(!strings(v,textKeys)||dateKeys.some(k=>v[k]!==''&&!isDate(v[k]))||numberKeys.some(k=>v[k]!==null&&!nonnegative(v[k])))fail();
        if(v.year!==null&&(v.year<1900||v.year>new Date().getFullYear()+1))fail();
        if(v.lastInspection&&v.nextInspection&&v.nextInspection<v.lastInspection)fail();
        if(['serviceIntervalKm','serviceIntervalMonths'].some(k=>v[k]!==null&&v[k]<=0))fail();
      }
    }
    if(new Set(data.vehicles.map(v=>v.id)).size!==data.vehicles.length||new Set(data.vehicles.map(v=>v.plate.trim().toUpperCase())).size!==data.vehicles.length)fail();
    const hasVehicle=id=>data.vehicles.some(v=>v.id===id);
    for(const m of data.maintenance)if(!strings(m,['id','vehicle','title','date'])||!validId(m.id)||!hasVehicle(m.vehicle)||!isDate(m.date)||!nonnegative(m.cost)||typeof m.done!=='boolean')fail();
    for(const r of data.reservations)if(!strings(r,['id','vehicle','person','start','end','reason'])||!validId(r.id)||!hasVehicle(r.vehicle)||!isDate(r.start)||!isDate(r.end)||r.end<r.start)fail();
    return upgrade(data);
  }
  function dateDiff(a,b){return Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000)}
  function serviceAlerts(vehicles,now){
    const alerts=[];
    for(const v of vehicles){
      if(v.nextInspection){let n=dateDiff(v.nextInspection,now);alerts.push({vehicle:v.id,type:'inspection',label:'Visite technique',date:v.nextInspection,level:n<0?'late':n<=30?'soon':'normal',remaining:n});}
      if(v.nextOilDate||v.nextOilKm!==null){
        const d=v.nextOilDate?dateDiff(v.nextOilDate,now):null,k=v.nextOilKm!==null?v.nextOilKm-v.km:null;
        alerts.push({vehicle:v.id,type:'oil',label:'Prochaine vidange',date:v.nextOilDate,km:v.nextOilKm,remainingKm:k,remaining:d,level:(d!==null&&d<0)||(k!==null&&k<=0)?'late':(d!==null&&d<=30)||(k!==null&&k<=1000)?'soon':'normal'});
      }
    }
    return alerts.sort((a,b)=>['late','soon','normal'].indexOf(a.level)-['late','soon','normal'].indexOf(b.level)||(a.date||'9999').localeCompare(b.date||'9999'));
  }
  return {textKeys,dateKeys,numberKeys,isDate,upgrade,validate,serviceAlerts};
})();
if(typeof module!=='undefined')module.exports=Fleet;
