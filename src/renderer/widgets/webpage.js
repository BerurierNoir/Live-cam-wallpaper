/**
 * Widget Webpage — iframe URL
 */
export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;';

  if (!cc.url) {
    wrap.innerHTML = '<div class="widget-empty"><div>🌐</div><div>Configurer une URL</div></div>';
    return wrap;
  }

  const iframe = document.createElement('iframe');
  iframe.src = cc.url;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  wrap.appendChild(iframe);
  return wrap;
}
