function initHamburgerMenu() {
  const btn = document.getElementById('hamburger-btn');
  const menu = document.getElementById('topbar-menu');
  if (!btn || !menu) return;

  function cerrar() {
    menu.classList.remove('menu--open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    const abierto = menu.classList.toggle('menu--open');
    btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  }

  btn.addEventListener('click', toggle);
  menu.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) cerrar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
  });

  // Cierra el menú si pasamos a desktop
  const mq = window.matchMedia('(min-width: 901px)');
  mq.addEventListener('change', (e) => {
    if (e.matches) cerrar();
  });
}

function initCollapsibles() {
  const panels = document.querySelectorAll('.panel[data-collapsible="true"]');
  panels.forEach((panel) => {
    const body = panel.querySelector('.panel__body');
    const btn = panel.querySelector('.collapse-toggle');
    if (!body || !btn) return;

    const collapsedDefault = panel.getAttribute('data-collapsed-default') === 'true';

    function applyState(collapsed) {
      if (collapsed) {
        body.classList.add('panel__body--collapsed');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = btn.textContent.includes('filtros')
          ? 'Mostrar filtros'
          : 'Mostrar';
      } else {
        body.classList.remove('panel__body--collapsed');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = btn.textContent.includes('filtros')
          ? 'Ocultar filtros'
          : 'Ocultar';
      }
    }

    // Estado inicial
    applyState(collapsedDefault);

    btn.addEventListener('click', () => {
      const isCollapsed = body.classList.contains('panel__body--collapsed');
      applyState(!isCollapsed);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initHamburgerMenu();
  initCollapsibles();
});

