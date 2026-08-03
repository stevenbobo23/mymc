window.addEventListener('error', function(e){
  var d = document.getElementById('errbox') || (function(){
    var x = document.createElement('div'); x.id='errbox';
    x.style.cssText='position:fixed;left:8px;bottom:8px;z-index:99999;max-width:90%;background:rgba(180,0,0,.9);color:#fff;font:12px monospace;padding:8px 10px;border-radius:6px;white-space:pre-wrap;';
    document.body.appendChild(x); return x; })();
  d.textContent += (e.message||e.error) + '\n';
});
