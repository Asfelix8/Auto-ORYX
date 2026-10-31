/* AUTO ORYX : export du parc actif, sans appel réseau contenant les données. */
(() => {
 'use strict';
 const columns=[
  ['brand','Marque',19],['model','Modèle',24],['fuel','Carburant',14],['plate','Immatriculation',21],
  ['color','Couleur',16],['purchasedBy','Acheté par',20],['usedBy','Utilisé par',22],
  ['firstRegistration','Date de mise en circulation',22,'date'],['age','Âge (ans)',13,'age'],
  ['department','Département',32],['userName','Nom de l’utilisateur',38],['entity','ENTITÉ',22],
  ['year','Année de fabrication',18,'number'],['category','Catégorie',17],['status','Statut',26],
  ['km','Kilométrage actuel',20,'number'],['nextOilKm','Prochaine vidange (km)',23,'number'],
  ['nextOilDate','Prochaine vidange (date)',23,'date'],['serviceIntervalKm','Fréquence entretien (km)',23,'number'],
  ['serviceIntervalMonths','Fréquence entretien (mois)',23,'number'],
  ['lastInspection','Dernière visite technique',23,'date'],['nextInspection','Prochaine visite technique',23,'date'],
  ['insurance','Échéance assurance',23,'date']
 ];
 const parseDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const d=new Date(value+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?d:null;
 };
 function buildWorkbook(ExcelJS,vehicles,asOf){
  const date=parseDate(asOf);if(!date)throw Error('Date d’extraction invalide.');
  const wb=new ExcelJS.Workbook();wb.creator='AUTO ORYX';wb.created=date;wb.modified=date;
  wb.calcProperties.fullCalcOnLoad=true;
  const ws=wb.addWorksheet('Parc automobile',{views:[{state:'frozen',xSplit:4,ySplit:4,topLeftCell:'E5',showGridLines:false}],pageSetup:{orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:2,fitToHeight:0,printTitlesRow:'1:4'}});
  ws.columns=columns.map(([key,,width])=>({key,width}));
  ws.mergeCells('A1:W1');ws.getCell('A1').value='AUTO ORYX — État du parc automobile';
  ws.getCell('A1').font={name:'Calibri',size:18,bold:true,color:{argb:'FF17324D'}};ws.getRow(1).height=34;
  ws.mergeCells('A2:G2');ws.getCell('A2').value='Source : données du parc actif enregistrées dans AUTO ORYX';
  ws.getCell('H2').value='Extraction au';ws.getCell('I2').value=date;ws.getCell('I2').numFmt='dd/mm/yyyy';
  ws.mergeCells('J2:K2');ws.getCell('J2').value=vehicles.length+' véhicule(s)';ws.getRow(2).height=24;
  ws.mergeCells('A3:W3');ws.getCell('A3').value='Les cellules vides correspondent aux informations non renseignées. Les véhicules sortis et la corbeille sont exclus. Âge calculé à la date d’extraction.';
  ws.getCell('A3').font={name:'Calibri',size:10,color:{argb:'FF52677D'}};ws.getRow(3).height=23;
  ws.getRow(4).values=columns.map(c=>c[1]);ws.getRow(4).height=42;
  ws.getRow(4).eachCell(c=>{c.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF386857'}};c.alignment={vertical:'middle',horizontal:'center',wrapText:true};});
  vehicles.forEach((v,index)=>{
   const r=index+5;
   const row=ws.addRow(columns.map(([key,,width,type])=>{
    const val=v[key];
    if(type==='age'){
     const start=parseDate(v.firstRegistration);if(!start||start>date)return null;
     let years=date.getUTCFullYear()-start.getUTCFullYear();
     if(date.getUTCMonth()<start.getUTCMonth()||date.getUTCMonth()===start.getUTCMonth()&&date.getUTCDate()<start.getUTCDate())years--;
     return {formula:`IF(H${r}="","",IF(H${r}>$I$2,"",DATEDIF(H${r},$I$2,"Y")))`,result:years};
    }
    if(type==='date')return parseDate(val);
    if(type==='number')return typeof val==='number'&&Number.isFinite(val)?val:null;
    // Une chaîne reste une cellule texte, même lorsqu’elle commence par = ou +.
    return val==null||val===''?null:String(val).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').slice(0,32767);
   }));
   row.height=48;
   row.eachCell({includeEmpty:true},(cell,col)=>{
    cell.font={name:'Calibri',size:11,color:{argb:'FF17324D'}};
    cell.alignment={vertical:'middle',wrapText:true,horizontal:columns[col-1][3]?'center':'left'};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFEAF1F5':'FFFFFFFF'}};
    cell.border={bottom:{style:'hair',color:{argb:'FFD4DFE5'}}};
    if(columns[col-1][3]==='date')cell.numFmt='dd/mm/yyyy';
    else if(columns[col-1][3])cell.numFmt='#,##0';
   });
  });
  ws.autoFilter={from:'A4',to:{row:Math.max(4,vehicles.length+4),column:columns.length}};
  ws.pageSetup.printArea='A1:W'+Math.max(4,vehicles.length+4);
  ws.headerFooter.oddFooter='&CAUTO ORYX — &P / &N';
  return wb;
 }
 let loading;
 function engine(){
  if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
  if(!loading)loading=new Promise((resolve,reject)=>{
   const s=document.createElement('script');s.src='exceljs-vendor.min.js?v=4.4.0';
   s.onload=()=>window.ExcelJS?resolve(window.ExcelJS):reject(Error('Module Excel indisponible.'));
   s.onerror=()=>{s.remove();reject(Error('Module Excel absent. Vérifiez exceljs-vendor.min.js dans le dépôt.'));};
   document.head.append(s);
  }).catch(error=>{loading=null;throw error;});
  return loading;
 }
 let exporting=false;
 async function exportFleet(button){
  if(exporting||!window.CloudBridge?.status.ready)return;
  const snapshot=JSON.parse(JSON.stringify(state.vehicles)),asOf=today();
  if(!snapshot.length)return toast('Aucun véhicule actif à exporter.');
  exporting=true;button.disabled=true;button.textContent='Préparation Excel…';
  try{
   const E=await engine();const wb=buildWorkbook(E,snapshot,asOf);const bytes=await wb.xlsx.writeBuffer();
   if(!window.CloudBridge?.status.ready)return;
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const link=document.createElement('a');link.href=url;link.download='AUTO_ORYX_Parc_'+asOf+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   toast(snapshot.length+' véhicule(s) exporté(s) en Excel.');
  }catch(error){toast(error.message||'L’export Excel a échoué.');}
  finally{exporting=false;button.disabled=false;button.textContent='Exporter Excel (.xlsx)';}
 }
 // Ce module arrive après cloud.js et respecte la même barrière de connexion.
 const before=render;
 render=function(){
  before();if(!window.CloudBridge?.status.ready||!['vehicles','reports'].includes(page))return;
  const target=document.querySelector('#main .page-head');if(!target||target.querySelector('[data-excel-export]'))return;
  const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.excelExport='true';b.textContent='Exporter Excel (.xlsx)';
  b.title='Télécharger tous les véhicules actifs, indépendamment des filtres de recherche';b.onclick=()=>exportFleet(b);target.append(b);
 };
 window.FleetExcel={buildWorkbook};
 if(window.CloudBridge?.status.ready)render();
})();
