function aplicarTema(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const esClaro = t === 'light';
    btn.setAttribute('aria-pressed', esClaro ? 'true' : 'false');
    btn.setAttribute('aria-label', esClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    btn.querySelector('.theme-toggle__text').textContent = esClaro ? 'Claro' : 'Oscuro';
  }
}

function obtenerTemaInicial() {
  const guardado = localStorage.getItem('ads_theme');
  if (guardado === 'light' || guardado === 'dark') return guardado;
  // Por defecto siempre arrancamos en oscuro
  return 'dark';
}

function initThemeToggle() {
  const initial = obtenerTemaInicial();
  aplicarTema(initial);

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-theme') || 'dark';
    const siguiente = actual === 'light' ? 'dark' : 'light';
    localStorage.setItem('ads_theme', siguiente);
    aplicarTema(siguiente);
  });
}

document.addEventListener('DOMContentLoaded', initThemeToggle);

