/* AUTO ORYX — Modèle de données et compatibilité des sauvegardes. */
const Fleet = (() => {
  const textKeys=['brand','model','entity','purchasedBy','usedBy','department','userName'];
  const optionalTextKeys=['fuel','color'];
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
      for(const k of [...textKeys,...optionalTextKeys])out[k]=typeof v[k]==='string'?v[k]:'';
      for(const k of dateKeys)out[k]=v[k]||'';
      for(const k of numberKeys)out[k]=v[k]??null;
      if(data.schema===1){out.brand=b;out.model=m;out.userName=v.person||'';}
      return out;
    });
    copy.deletedVehicles=copy.deletedVehicles||[];copy.schema=2;return copy;
  }
  function validate(data){
    const fail=()=>{throw new Error('Sauvegarde invalide ou incompatible.');};
    const strings=(o,keys)=>o&&keys.every(k=>typeof o[k]==='string');
    const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isInteger(v);
    const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
    if(!data||![1,2].includes(data.schema)||!Array.isArray(data.vehicles)||!Array.isArray(data.maintenance)||!Array.isArray(data.reservations))fail();
    for(const v of data.vehicles){
      if(v.photo!==undefined&&v.photo!==''&&(typeof v.photo!=='string'||v.photo.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.photo)))fail();
      if(!strings(v,['id','name','plate','category','person','status','image'])||!validId(v.id)||!v.name.trim()||!v.plate.trim()||!['Affecté','Disponible','En entretien','À vérifier'].includes(v.status)||(v.km!==null&&!nonnegative(v.km))||!['sedan','suv','white-suv','grey-suv'].includes(v.image)||v.insurance&&!isDate(v.insurance))fail();
      if(data.schema===2){
        if(optionalTextKeys.some(k=>v[k]!==undefined&&typeof v[k]!=='string')||!strings(v,textKeys)||dateKeys.some(k=>v[k]!==''&&!isDate(v[k]))||numberKeys.some(k=>v[k]!==null&&!nonnegative(v[k])))fail();
        if(v.year!==null&&(v.year<1900||v.year>new Date().getFullYear()+1))fail();
        if(v.lastInspection&&v.nextInspection&&v.nextInspection<v.lastInspection)fail();
        if(['serviceIntervalKm','serviceIntervalMonths'].some(k=>v[k]!==null&&v[k]<=0))fail();
      }
    }
    if(new Set(data.vehicles.map(v=>v.id)).size!==data.vehicles.length||new Set(data.vehicles.map(v=>plateKey(v.plate))).size!==data.vehicles.length)fail();
    const hasVehicle=id=>data.vehicles.some(v=>v.id===id);
    for(const m of data.maintenance)if(!strings(m,['id','vehicle','title','date'])||!validId(m.id)||!hasVehicle(m.vehicle)||!isDate(m.date)||!nonnegative(m.cost)||typeof m.done!=='boolean')fail();
    for(const r of data.reservations)if(!strings(r,['id','vehicle','person','start','end','reason'])||!validId(r.id)||!hasVehicle(r.vehicle)||!isDate(r.start)||!isDate(r.end)||r.end<r.start)fail();
    if(data.deletedVehicles!==undefined){
      if(!Array.isArray(data.deletedVehicles)||data.deletedVehicles.length>10000)fail();
      const ids=new Set();
      for(const item of data.deletedVehicles){
        if(!item||!validId(item.id)||ids.has(item.id)||typeof item.deletedAt!=='string'||Number.isNaN(Date.parse(item.deletedAt))||!item.vehicle||!Array.isArray(item.maintenance)||!Array.isArray(item.reservations))fail();
        ids.add(item.id);
        validate({schema:2,vehicles:[item.vehicle],maintenance:item.maintenance,reservations:item.reservations});
      }
    }
    return upgrade(data);
  }
  function dateDiff(a,b){return Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000)}
  function serviceAlerts(vehicles,now){
    const alerts=[];
    for(const v of vehicles){
      if(v.nextInspection){let n=dateDiff(v.nextInspection,now);alerts.push({vehicle:v.id,type:'inspection',label:'Visite technique',date:v.nextInspection,level:n<0?'late':n<=30?'soon':'normal',remaining:n});}
      if(v.nextOilDate||v.nextOilKm!==null){
        const d=v.nextOilDate?dateDiff(v.nextOilDate,now):null,k=v.nextOilKm!==null&&v.km!==null?v.nextOilKm-v.km:null;
        alerts.push({vehicle:v.id,type:'oil',label:'Prochaine vidange',date:v.nextOilDate,km:v.nextOilKm,remainingKm:k,remaining:d,level:(d!==null&&d<0)||(k!==null&&k<=0)?'late':(d!==null&&d<=30)||(k!==null&&k<=1000)?'soon':'normal'});
      }
    }
    return alerts.sort((a,b)=>['late','soon','normal'].indexOf(a.level)-['late','soon','normal'].indexOf(b.level)||(a.date||'9999').localeCompare(b.date||'9999'));
  }
  const plateKey=value=>String(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const importKeys=['brand','model','plate','fuel','color','purchasedBy','usedBy','firstRegistration','department','userName'];
  function planImport(data,current){
    const fail=message=>{throw Error(message)};
    if(!data||data.kind!=='auto-oryx-fleet-import'||data.version!==1||!Array.isArray(data.vehicles)||!data.vehicles.length||data.vehicles.length>2000)fail('Ce fichier n’est pas un import AUTO ORYX compatible.');
    const previous=validate(current),seen=new Set(),items=[];
    for(const row of data.vehicles){
      if(!row||importKeys.some(k=>typeof row[k]!=='string'||row[k].length>200))fail('Une ligne contient un champ invalide.');
      const values=Object.fromEntries(importKeys.map(k=>[k,row[k].trim()]));
      if(!values.brand||!values.model||!values.plate||!plateKey(values.plate)||values.firstRegistration&&!isDate(values.firstRegistration))fail('Vérifiez marque, modèle, immatriculation et date de mise en circulation.');
      const key=plateKey(values.plate);if(seen.has(key))fail('Immatriculation en double dans le fichier : '+values.plate);seen.add(key);
      const old=previous.vehicles.find(v=>plateKey(v.plate)===key);
      const name=values.brand+' '+values.model;
      const changed=old&&importKeys.some(k=>(old[k]||'')!==values[k]);
      const record=old?{...old,...values,name,person:values.userName}:{id:'import-'+key,...values,name,person:values.userName,status:'À vérifier',category:'Non renseignée',km:null,image:'sedan',photo:'',insurance:'',entity:'',year:null,nextOilKm:null,nextOilDate:'',serviceIntervalKm:null,serviceIntervalMonths:null,lastInspection:'',nextInspection:''};
      if(!old&&previous.vehicles.some(v=>v.id===record.id))fail('Identifiant déjà utilisé pour '+values.plate);
      items.push({action:old?(changed?'update':'unchanged'):'add',record});
    }
    const candidate={...previous,vehicles:previous.vehicles.map(v=>items.find(i=>i.record.id===v.id)?.record||v)};
    candidate.vehicles.push(...items.filter(i=>i.action==='add').map(i=>i.record));
    return {items,candidate:validate(candidate),added:items.filter(i=>i.action==='add').length,updated:items.filter(i=>i.action==='update').length,unchanged:items.filter(i=>i.action==='unchanged').length};
  }
  function archiveVehicle(current,id,deletedAt=new Date().toISOString()){
    const data=validate(current),v=data.vehicles.find(v=>v.id===id);
    if(!v)throw Error('Véhicule introuvable.');
    const entry={id:'trash-'+deletedAt.replace(/[^0-9]/g,'')+'-'+data.deletedVehicles.length,deletedAt,vehicle:v,maintenance:data.maintenance.filter(m=>m.vehicle===id),reservations:data.reservations.filter(r=>r.vehicle===id)};
    data.deletedVehicles.push(entry);data.vehicles=data.vehicles.filter(v=>v.id!==id);data.maintenance=data.maintenance.filter(m=>m.vehicle!==id);data.reservations=data.reservations.filter(r=>r.vehicle!==id);
    return validate(data);
  }
  function restoreVehicle(current,trashId){
    const data=validate(current),entry=data.deletedVehicles.find(e=>e.id===trashId);
    if(!entry)throw Error('Cette fiche n’est plus dans la corbeille.');
    if(data.vehicles.some(v=>v.id===entry.vehicle.id||plateKey(v.plate)===plateKey(entry.vehicle.plate)))throw Error('Un véhicule avec cette immatriculation existe déjà. Modifiez sa fiche avant de restaurer.');
    if(entry.maintenance.some(m=>data.maintenance.some(x=>x.id===m.id))||entry.reservations.some(r=>data.reservations.some(x=>x.id===r.id)))throw Error('Un historique utilise déjà les mêmes identifiants. La restauration est bloquée pour éviter un doublon.');
    data.vehicles.push(entry.vehicle);data.maintenance.push(...entry.maintenance);data.reservations.push(...entry.reservations);data.deletedVehicles=data.deletedVehicles.filter(e=>e.id!==trashId);
    return validate(data);
  }
  function emptyTrash(current){const data=validate(current);return {...data,deletedVehicles:[]};}
  return {textKeys,dateKeys,numberKeys,isDate,upgrade,validate,serviceAlerts,plateKey,planImport,archiveVehicle,restoreVehicle,emptyTrash};
})();
if(typeof module!=='undefined')module.exports=Fleet;
