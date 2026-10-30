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
    copy.accidents=copy.accidents||[];copy.exitedVehicles=copy.exitedVehicles||[];copy.deletedVehicles=copy.deletedVehicles||[];copy.schema=2;return copy;
  }
  function validate(data){
    const fail=()=>{throw new Error('Sauvegarde invalide ou incompatible.');};
    const strings=(o,keys)=>o&&keys.every(k=>typeof o[k]==='string');
    const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isInteger(v);
    const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
    if(!data||![1,2].includes(data.schema)||!Array.isArray(data.vehicles)||!Array.isArray(data.maintenance)||!Array.isArray(data.reservations))fail();
    for(const v of data.vehicles){
      if(v.photo!==undefined&&v.photo!==''&&(typeof v.photo!=='string'||v.photo.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.photo)))fail();
      if(!strings(v,['id','name','plate','category','person','status','image'])||!validId(v.id)||!v.name.trim()||!v.plate.trim()||!['Affecté','Disponible','En entretien','À vérifier','Accidenté / Immobilisé'].includes(v.status)||(v.km!==null&&!nonnegative(v.km))||!['sedan','suv','white-suv','grey-suv'].includes(v.image)||v.insurance&&!isDate(v.insurance))fail();
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
    if(data.exitedVehicles!==undefined){
      if(!Array.isArray(data.exitedVehicles)||data.exitedVehicles.length>10000)fail();
      const exitIds=new Set(),plates=new Set();
      for(const item of data.exitedVehicles){
        if(!item||!validId(item.id)||exitIds.has(item.id)||!item.vehicle||!Array.isArray(item.maintenance)||!Array.isArray(item.reservations)||!validExitMeta(item)||typeof item.cancelledAt!=='string'||typeof item.cancellationReason!=='string'||item.cancellationReason.length>1000||item.cancelledAt&&(!isDate(item.cancelledAt)||!item.cancellationReason.trim()))fail();
        exitIds.add(item.id);validate({schema:2,vehicles:[item.vehicle],maintenance:item.maintenance,reservations:item.reservations});
        if(!item.cancelledAt){const key=plateKey(item.vehicle.plate);if(plates.has(key)||data.vehicles.some(v=>v.id===item.vehicle.id||plateKey(v.plate)===key))fail();plates.add(key);}
      }
    }
    if(data.accidents!==undefined){
      if(!Array.isArray(data.accidents)||data.accidents.length>10000)fail();
      const ids=new Set(),open=new Set();
      for(const a of data.accidents){
        if(!a||!validId(a.id)||ids.has(a.id)||!validAccident(a)||!a.vehicle||!Array.isArray(a.history)||!a.history.length||a.history.length>1000)fail();
        ids.add(a.id);validate({schema:2,vehicles:[a.vehicle],maintenance:[],reservations:[]});
        if(a.history.some(h=>!h||!isDate(h.date)||!accidentStages.includes(h.stage)||typeof h.note!=='string'||h.note.length>2000))fail();
        if(a.closedAt){if(!isDate(a.closedAt)||a.closedAt<a.date||!['Remis en service','Irréparable'].includes(a.outcome)||a.stage!=='Clôturé')fail();}
        else{const v=data.vehicles.find(v=>v.id===a.vehicle.id);if(open.has(a.vehicle.id)||!v||v.status!=='Accidenté / Immobilisé'||a.stage==='Clôturé')fail();open.add(a.vehicle.id);}
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
      if(previous.exitedVehicles.some(e=>!e.cancelledAt&&plateKey(e.vehicle.plate)===key))fail('Ce véhicule est déjà sorti du parc : '+values.plate+'. Consultez Sorties du parc.');
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
    if(data.accidents.some(a=>!a.closedAt&&a.vehicle.id===id))throw Error('Clôturez le sinistre avant de supprimer ce véhicule.');
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
  const exitReasons=['Vente / cession','Mise au rebut','Restitution','Transfert hors parc'];
  function validAttachment(a){return a===null||a&&typeof a.name==='string'&&a.name.length<=200&&typeof a.data==='string'&&((a.type==='image/jpeg'&&a.data.length<=65000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.data))||(a.type==='application/pdf'&&a.data.length<=410000&&/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.data)));}
  function validExitMeta(m){return m&&exitReasons.includes(m.reason)&&isDate(m.date)&&typeof m.beneficiary==='string'&&m.beneficiary.length<=200&&(m.reason==='Mise au rebut'||m.beneficiary.trim())&&typeof m.notes==='string'&&m.notes.length<=2000&&typeof m.reference==='string'&&m.reference.length<=120&&(m.amount===null||Number.isSafeInteger(m.amount)&&m.amount>=0)&&(m.km===null||Number.isSafeInteger(m.km)&&m.km>=0)&&validAttachment(m.attachment);}
  function recordExit(current,vehicleId,meta,limit=new Date().toISOString().slice(0,10)){
    const data=validate(current),v=data.vehicles.find(v=>v.id===vehicleId);
    if(!v)throw Error('Ce véhicule n’est plus dans le parc actif.');
    if(data.accidents.some(a=>!a.closedAt&&a.vehicle.id===vehicleId))throw Error('Clôturez le sinistre avant la sortie du parc.');
    if(!validExitMeta(meta))throw Error('Vérifiez le motif, le bénéficiaire, les dates, les montants et le justificatif.');
    if(meta.date>limit)throw Error('La sortie ne peut pas être datée dans le futur.');
    if(v.firstRegistration&&meta.date<v.firstRegistration)throw Error('La sortie ne peut pas précéder la mise en circulation.');
    if(meta.km!==null&&v.km!==null&&meta.km<v.km)throw Error('Le kilométrage de sortie ne peut pas être inférieur au kilométrage enregistré.');
    const entry={...meta,id:'exit-'+Date.now()+'-'+data.exitedVehicles.length,vehicle:{...v,km:meta.km??v.km},maintenance:data.maintenance.filter(m=>m.vehicle===v.id),reservations:data.reservations.filter(r=>r.vehicle===v.id),cancelledAt:'',cancellationReason:''};
    data.exitedVehicles.push(entry);data.vehicles=data.vehicles.filter(x=>x.id!==v.id);data.maintenance=data.maintenance.filter(m=>m.vehicle!==v.id);data.reservations=data.reservations.filter(r=>r.vehicle!==v.id);
    return validate(data);
  }
  function cancelExit(current,exitId,reason,date=new Date().toISOString().slice(0,10)){
    const data=validate(current),entry=data.exitedVehicles.find(e=>e.id===exitId&&!e.cancelledAt);
    if(!entry)throw Error('Cette sortie est introuvable ou déjà annulée.');
    if(typeof reason!=='string'||!reason.trim()||reason.length>1000||!isDate(date)||date<entry.date)throw Error('Indiquez un motif d’annulation et une date valide.');
    const v=entry.vehicle;
    if(data.vehicles.some(x=>x.id===v.id||plateKey(x.plate)===plateKey(v.plate)))throw Error('Cette immatriculation existe déjà dans le parc actif.');
    if(entry.maintenance.some(m=>data.maintenance.some(x=>x.id===m.id))||entry.reservations.some(r=>data.reservations.some(x=>x.id===r.id)))throw Error('Un historique utilise déjà les mêmes identifiants.');
    data.vehicles.push(v);data.maintenance.push(...entry.maintenance);data.reservations.push(...entry.reservations);entry.cancelledAt=date;entry.cancellationReason=reason.trim();return validate(data);
  }

  const accidentStages=['Déclaré','En expertise','En réparation','Clôturé'];
  function validAccident(a){return isDate(a.date)&&['location','driver','circumstances','garage','insurer','reference','notes','outcome','closedAt'].every(k=>typeof a[k]==='string'&&a[k].length<=2000)&&a.location.trim()&&a.circumstances.trim()&&accidentStages.includes(a.stage)&&(a.cost===null||Number.isSafeInteger(a.cost)&&a.cost>=0)&&Array.isArray(a.documents)&&a.documents.length<=5&&a.documents.every(d=>d!==null&&validAttachment(d));}
  function recordAccident(current,vehicleId,meta,limit=new Date().toISOString().slice(0,10)){
    const data=validate(current),v=data.vehicles.find(v=>v.id===vehicleId);
    if(!v)throw Error('Véhicule introuvable.');
    if(data.accidents.some(a=>a.vehicle.id===vehicleId&&!a.closedAt))throw Error('Un sinistre est déjà ouvert pour ce véhicule.');
    const entry={...meta,id:'acc-'+Date.now()+'-'+data.accidents.length,vehicle:{...v},stage:'Déclaré',closedAt:'',outcome:'',history:[{date:meta.date,stage:'Déclaré',note:'Déclaration du sinistre'}]};
    if(!validAccident(entry)||entry.date>limit||v.firstRegistration&&entry.date<v.firstRegistration)throw Error('Vérifiez la date, le lieu, les circonstances et les documents.');
    v.status='Accidenté / Immobilisé';data.accidents.push(entry);return validate(data);
  }
  function updateAccident(current,id,patch,limit=new Date().toISOString().slice(0,10)){
    const data=validate(current),a=data.accidents.find(a=>a.id===id&&!a.closedAt);
    if(!a)throw Error('Ce sinistre est introuvable ou clôturé.');
    const v=data.vehicles.find(v=>v.id===a.vehicle.id),when=patch.updateDate;
    if(!isDate(when)||when<a.date||when<a.history[a.history.length-1].date||when>limit)throw Error('La date de suivi doit suivre la dernière étape et ne pas être future.');
    for(const k of ['garage','insurer','reference','cost','notes','documents','stage'])if(k in patch)a[k]=patch[k];
    if(a.stage==='Clôturé'){
      if(!['Remis en service','Irréparable'].includes(patch.outcome))throw Error('Choisissez l’issue du sinistre.');
      a.closedAt=when;a.outcome=patch.outcome;
      if(a.outcome==='Remis en service'){
        if(!['Disponible','Affecté'].includes(patch.returnStatus)||patch.returnStatus==='Affecté'&&!v.userName.trim())throw Error('Vérifiez le statut de remise en service et l’utilisateur dans la fiche véhicule.');
        v.status=patch.returnStatus;
        if(v.status==='Disponible'){v.person='';v.userName='';v.usedBy='';}
      }
    }
    a.history.push({date:when,stage:a.stage,note:patch.note||a.outcome||'Mise à jour du suivi'});
    if(!validAccident(a))throw Error('Montant ou document invalide.');return validate(data);
  }
  return {accidentStages,recordAccident,updateAccident,textKeys,dateKeys,numberKeys,isDate,upgrade,validate,serviceAlerts,plateKey,planImport,archiveVehicle,restoreVehicle,emptyTrash,exitReasons,recordExit,cancelExit};
})();
if(typeof module!=='undefined')module.exports=Fleet;
