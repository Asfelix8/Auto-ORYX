/* Affichage local uniquement : aucune lecture ni transmission de la valeur saisie. */
window.PasswordVisibility=(()=>{
 let sequence=0;
 const icon=(hidden)=>'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(hidden?'<path d="M3 3l18 18"/>':'')+'</svg>';
 function mask(button){const input=document.getElementById(button.getAttribute('aria-controls'));if(!input)return;input.type='password';button.innerHTML=icon(false);button.setAttribute('aria-label','Afficher le mot de passe');button.setAttribute('aria-pressed','false');}
 function attach(root){
  root.querySelectorAll('input[type="password"]').forEach(input=>{
   if(input.dataset.visibilityReady)return;input.dataset.visibilityReady='true';if(!input.id)input.id='oryx-password-'+(++sequence);
   const wrap=document.createElement('span');wrap.style.cssText='display:block;position:relative;width:100%';input.before(wrap);wrap.append(input);input.style.paddingRight='48px';
   const button=document.createElement('button');button.type='button';button.dataset.passwordToggle='true';button.innerHTML=icon(false);button.setAttribute('aria-label','Afficher le mot de passe');button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');button.style.cssText='position:absolute;right:5px;top:5px;bottom:5px;width:36px;min-width:36px;padding:0;display:flex;align-items:center;justify-content:center;border:1px solid #d4dfed;background:#edf3fa;color:#175dab;border-radius:6px;font:600 12px system-ui;cursor:pointer';
   button.onclick=()=>{if(input.type==='password'){input.type='text';button.innerHTML=icon(true);button.setAttribute('aria-label','Masquer le mot de passe');button.setAttribute('aria-pressed','true');}else mask(button);};wrap.append(button);
  });
  const hide=()=>root.querySelectorAll('[data-password-toggle]').forEach(mask);root.addEventListener('reset',hide);root.addEventListener('submit',hide);
 }
 const hideAll=()=>document.querySelectorAll('[data-password-toggle]').forEach(mask);
 window.addEventListener('blur',hideAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)hideAll()});
 return {attach};
})();
