import { checkAuthGuard, getCurrentUser, logout } from './auth.js';
import { paginaInicio } from './roles.js';
import { apiFetch } from './api.js';
const titles = {
  dashboard: 'Dashboard',
  afiliados: 'Afiliados',
  pacientes: 'Pacientes',
  farmacias: 'Farmacias',
  inventario: 'Inventario',
  autorizaciones: 'Autorizaciones',
  solicitudes: 'Solicitudes',
  notificaciones: 'Notificaciones',
  perfil: 'Perfil EPS',
};
const states = {
  afiliados: ['ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'RETIRADO'],
  pacientes: ['ACTIVO', 'INACTIVO'],
  farmacias: ['ACTIVA', 'INACTIVA'],
  inventario: ['DISPONIBLE', 'AGOTADO', 'BAJO'],
  autorizaciones: ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
  solicitudes: ['PENDIENTE', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA', 'CANCELADA'],
  notificaciones: ['PENDIENTE', 'LEIDA'],
};
const user = getCurrentUser();
if (checkAuthGuard()) {
  if (Number(user?.rol_id ?? user?.rol) !== 4) location.replace(paginaInicio(user));
  else if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = String(text ?? '--');
  if (cls) n.className = cls;
  return n;
}
function button(text, fn) {
  const b = el('button', text, 'btn-outline');
  b.type = 'button';
  b.addEventListener('click', () =>
    Promise.resolve()
      .then(() => fn(b))
      .catch(showError),
  );
  return b;
}
function showError(e) {
  const n = document.getElementById('epsMessage');
  n.textContent = e.message || 'No se pudo completar la operacion.';
  n.setAttribute('role', 'alert');
}
const fmt = (value) => (value ? new Date(value).toLocaleString('es-CO') : '--');
function init() {
  const workspace = document.getElementById('epsWorkspace'),
    dialog = document.getElementById('epsDialog'),
    content = document.getElementById('epsDialogContent');
  let view = 'dashboard',
    pagina = 1,
    filters = {},
    serial = 0,
    closing = false,
    timer;
  document.getElementById('epsUserName').textContent = user.nombre || 'EPS';
  document.getElementById('epsCloseDialog').addEventListener('click', () => dialog.close());
  document.getElementById('refreshEps').addEventListener('click', () => load());
  document.getElementById('epsBell').addEventListener('click', () => navigate('notificaciones'));
  document.getElementById('logout').addEventListener('click', async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    serial++;
    workspace.replaceChildren();
    try {
      await apiFetch('/api/eps/v1/logout', { method: 'POST' });
    } catch (e) {
      showError(e);
    } finally {
      logout();
    }
  });
  for (const a of document.querySelectorAll('[data-eps-view]'))
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.epsView);
    });
  window.addEventListener('hashchange', () => {
    const target = location.hash.slice(1);
    if (titles[target] && target !== view) navigate(target);
  });
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    workspace.replaceChildren();
    serial++;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && checkAuthGuard()) {
      load();
      startTimer();
    }
  });
  window.addEventListener('storage', () => {
    if (!getCurrentUser()) {
      workspace.replaceChildren();
      dialog.close();
      clearInterval(timer);
      serial++;
    }
  });
  function navigate(target, extra = {}) {
    view = titles[target] ? target : 'dashboard';
    pagina = 1;
    filters = { ...extra };
    history.replaceState(null, '', '#' + view);
    for (const a of document.querySelectorAll('[data-eps-view]')) {
      a.classList.toggle('active', a.dataset.epsView === view);
      if (a.dataset.epsView === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    dialog.close();
    load();
  }
  async function unread() {
    if (closing || !checkAuthGuard()) return;
    const data = await apiFetch('/api/eps/v1/notificaciones?estado=PENDIENTE');
    document.getElementById('epsUnread').textContent = String(data.paginacion.total);
    document
      .getElementById('epsBell')
      .setAttribute('aria-label', data.paginacion.total + ' notificaciones sin leer');
  }
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) unread().catch(showError);
    }, 45000);
  }
  async function load() {
    if (closing || !checkAuthGuard()) return;
    const ticket = ++serial,
      current = view;
    workspace.replaceChildren(el('p', 'Cargando datos...'));
    workspace.setAttribute('aria-busy', 'true');
    document.getElementById('epsTitle').textContent = titles[view];
    document.getElementById('epsMessage').textContent = '';
    const query = new URLSearchParams({
      pagina: String(pagina),
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined)),
    });
    try {
      const data = await apiFetch(
        '/api/eps/v1/' + view + (['dashboard', 'perfil'].includes(view) ? '' : '?' + query),
      );
      if (ticket !== serial || closing) return;
      workspace.replaceChildren();
      document.getElementById('epsAccess').textContent = 'Acceso EPS verificado';
      document.getElementById('epsAccess').setAttribute('aria-busy', 'false');
      if (current === 'dashboard') dashboard(data.estadisticas);
      else if (current === 'perfil') profile(data.perfil);
      else {
        toolbar();
        table(data.datos);
        pagination(data.paginacion);
      }
      unread().catch(showError);
    } catch (e) {
      if (ticket !== serial) return;
      workspace.replaceChildren(
        el(
          'p',
          'No se pudieron cargar los datos. Puedes volver a intentar con Actualizar.',
          'eps-empty',
        ),
      );
      document.getElementById('epsAccess').textContent =
        'No se pudo verificar o cargar el modulo EPS';
      document.getElementById('epsAccess').setAttribute('aria-busy', 'false');
      showError(e);
    } finally {
      if (ticket === serial) workspace.setAttribute('aria-busy', 'false');
    }
  }
  function dashboard(stats) {
    const box = el('section', undefined, 'admin-stats');
    for (const [k, label] of Object.entries({
      pacientes: 'Pacientes vinculados',
      afiliados: 'Afiliados',
      farmacias: 'Farmacias activas',
      autorizaciones: 'Autorizaciones',
      pendientes: 'Autorizaciones pendientes',
      solicitudes: 'Solicitudes',
      inventario: 'Productos por farmacia',
      agotados: 'Productos agotados',
      stock_bajo: 'Stock bajo',
      notificaciones: 'Notificaciones sin leer',
    })) {
      const card = el('article', undefined, 'admin-stat');
      card.append(el('strong', stats[k]), el('span', label));
      box.append(card);
    }
    workspace.append(
      box,
      el(
        'p',
        'Las existencias corresponden a registros por farmacia vinculada. Las solicitudes muestran el estado operativo y un seguimiento EPS independiente.',
      ),
    );
  }
  function toolbar() {
    const f = el('form', undefined, 'eps-toolbar'),
      search = field(f, 'buscar', 'Buscar', 'text', filters.buscar || '');
    search.maxLength = 100;
    select(f, 'estado', 'Estado', ['', ...(states[view] || [])], filters.estado || '');
    if (view === 'inventario')
      field(f, 'farmacia', 'ID de farmacia', 'number', filters.farmacia || '', false);
    const submit = el('button', 'Buscar', 'btn-outline');
    submit.type = 'submit';
    f.append(submit);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      filters = { ...filters, ...Object.fromEntries(new FormData(f)) };
      pagina = 1;
      load();
    });
    f.append(
      button('Limpiar filtros', () => {
        filters = {};
        pagina = 1;
        load();
      }),
    );
    if (view === 'afiliados') f.append(button('Registrar afiliado', () => affiliateForm()));
    if (view === 'farmacias') f.append(button('Vincular farmacia', () => pharmacyForm()));
    if (view === 'autorizaciones')
      f.append(button('Crear autorizacion', () => authorizationForm()));
    workspace.append(f);
    if (filters.paciente)
      workspace.append(
        el(
          'p',
          'Mostrando registros del paciente seleccionado. Usa Limpiar filtros para ver todos.',
        ),
      );
  }
  function pagination(p) {
    pagina = p.pagina;
    const n = el('div', undefined, 'eps-pages');
    const prev = button('Anterior', () => {
        pagina--;
        load();
      }),
      next = button('Siguiente', () => {
        pagina++;
        load();
      });
    prev.disabled = pagina <= 1;
    next.disabled = pagina >= p.paginas;
    n.append(
      prev,
      el('span', p.total + ' registros / Pagina ' + p.pagina + ' de ' + p.paginas),
      next,
    );
    workspace.append(n);
  }
  function table(rows) {
    if (!rows.length) {
      workspace.append(
        el(
          'p',
          view === 'inventario' && !Object.values(filters).some(Boolean)
            ? 'Todavia no hay existencias registradas para las farmacias vinculadas a esta EPS.'
            : view === 'pacientes' && !Object.values(filters).some(Boolean)
              ? 'No hay cuentas de pacientes vinculadas y verificadas para esta EPS. Los afiliados sin cuenta se consultan en Afiliados.'
              : 'No hay registros para los filtros seleccionados.',
          'eps-empty',
        ),
      );
      return;
    }
    const headers = {
      afiliados: ['Nombre / ID', 'Documento', 'Regimen / Estado', 'Acciones'],
      pacientes: ['Paciente', 'Documento', 'Afiliacion', 'Acciones'],
      farmacias: ['Farmacia / ID', 'Contacto', 'Vinculacion', 'Acciones'],
      inventario: ['Medicamento', 'Farmacia', 'Existencias', 'Actualizado'],
      autorizaciones: ['Autorizacion', 'Paciente', 'Estado / Fecha', 'Acciones'],
      solicitudes: ['Solicitud', 'Paciente', 'Estado operativo / EPS', 'Acciones'],
      notificaciones: ['Notificacion', 'Tipo / Fecha', 'Estado', 'Acciones'],
    }[view];
    const scroll = el('div', undefined, 'eps-table-scroll'),
      t = el('table'),
      head = el('tr');
    for (const h of headers) {
      const th = el('th', h);
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    t.append(thead);
    const body = el('tbody');
    for (const r of rows) {
      const tr = el('tr'),
        actions = el('div', undefined, 'eps-actions');
      let values = [];
      if (view === 'afiliados') {
        values = [
          r.nombres + ' ' + r.apellidos + ' / ' + r.id,
          r.tipo_documento + ' ' + r.documento,
          r.regimen + ' / ' + r.estado,
        ];
        actions.append(
          button('Ver datos', () => details('Afiliado', r)),
          button('Actualizar', () => affiliateForm(r)),
          button('Historial', () => showHistory('AFILIADO', r.id)),
        );
      }
      if (view === 'pacientes') {
        values = [
          r.nombre + ' ' + r.apellido + ' / ' + r.id,
          r.tipo_documento + ' ' + r.cedula,
          r.afiliado.estado,
        ];
        actions.append(
          button('Ver datos autorizados', async () =>
            details('Paciente', (await apiFetch('/api/eps/v1/pacientes/' + r.id)).paciente),
          ),
          button('Solicitudes', () => navigate('solicitudes', { paciente: String(r.id) })),
          button('Autorizaciones', () => navigate('autorizaciones', { paciente: r.afiliado.id })),
        );
      }
      if (view === 'farmacias') {
        values = [
          r.farmacia.nombre + ' ' + r.farmacia.apellido + ' / ' + r.farmacia_id,
          [r.farmacia.correo, r.farmacia.telefono, r.farmacia.ciudad].filter(Boolean).join(' / '),
          (r.activa ? 'ACTIVA' : 'INACTIVA') + ' / Cuenta ' + r.farmacia.estado,
        ];
        actions.append(
          button('Medicamentos', () => navigate('inventario', { farmacia: String(r.farmacia_id) })),
          button('Gestionar vinculo', () => pharmacyForm(r)),
        );
      }
      if (view === 'inventario') {
        values = [
          r.medicamento.nombre +
            ' / ' +
            (r.medicamento.concentracion || '') +
            ' / ' +
            (r.medicamento.principio_activo || ''),
          r.vinculo.farmacia.nombre + ' / ' + r.vinculo.farmacia.id,
          r.stock +
            ' unidades / minimo ' +
            r.minimo +
            (r.stock === 0 ? ' / AGOTADO' : r.stock <= r.minimo ? ' / STOCK BAJO' : ''),
          fmt(r.actualizado_at),
        ];
      }
      if (view === 'autorizaciones') {
        values = [
          '#' + r.id + ' / ' + r.concepto,
          r.afiliado.nombres + ' ' + r.afiliado.apellidos + ' / ' + r.afiliado.documento,
          r.estado + ' / ' + fmt(r.updated_at) + ' / Responsable #' + r.responsable_id,
        ];
        actions.append(
          button('Ver motivo', () => details('Autorizacion', r)),
          button('Historial', () => showHistory('AUTORIZACION', r.id)),
        );
        if (r.estado === 'APROBADA' && r.solicitud_id)
          actions.append(
            button('Asignar farmacia', () => {
              const f = form('Asignar farmacia autorizada', (data) =>
                apiFetch('/api/integracion/eps/autorizaciones/' + r.id + '/farmacia', {
                  method: 'PUT',
                  body: JSON.stringify({
                    farmacia_id: Number(data.farmacia_id),
                    version: r.version,
                  }),
                }),
              );
              field(f, 'farmacia_id', 'ID de farmacia vinculada a esta EPS', 'number');
              f.finish();
            }),
          );
        if (r.estado === 'PENDIENTE') actions.append(button('Resolver', () => decisionForm(r)));
      }
      if (view === 'solicitudes') {
        const seg = r.seguimientos_eps[0];
        values = [
          '#' + r.id + ' / ' + fmt(r.fecha),
          r.usuario.nombre + ' ' + r.usuario.apellido + ' / ' + r.usuario.cedula,
          r.estado + ' / ' + (seg?.estado || 'ABIERTA'),
        ];
        actions.append(
          button('Ver medicamentos', () => details('Medicamentos solicitados', r.detalles)),
          button('Seguimiento', () => followupForm(r)),
          button('Historial', () => showHistory('SOLICITUD', r.id)),
        );
      }
      if (view === 'notificaciones') {
        values = [
          r.titulo + ' / #' + r.registro_id,
          r.tipo + ' / ' + fmt(r.created_at),
          r.lecturas.length ? 'LEIDA' : 'PENDIENTE',
        ];
        if (!r.lecturas.length)
          actions.append(
            button('Marcar leida', async (b) => {
              b.disabled = true;
              await apiFetch('/api/eps/v1/notificaciones/' + r.id + '/leida', { method: 'PATCH' });
              await load();
            }),
          );
      }
      for (const value of values) tr.append(el('td', value));
      if (values.length < headers.length) {
        const td = el('td');
        td.append(actions);
        tr.append(td);
      }
      body.append(tr);
    }
    t.append(body);
    scroll.append(t);
    workspace.append(scroll);
  }
  function open(title) {
    content.replaceChildren();
    const h = el('h2', title);
    h.id = 'epsDialogTitle';
    content.append(h);
    if (!dialog.open) dialog.showModal();
  }
  function details(title, data) {
    open(title);
    const list = el('dl');
    function walk(value, prefix = '') {
      if (Array.isArray(value)) {
        value.forEach((x, i) => walk(x, prefix + (i + 1) + '. '));
        if (!value.length) list.append(el('dd', 'Sin registros.'));
      } else if (value && typeof value === 'object') {
        for (const [k, x] of Object.entries(value)) {
          if (x && typeof x === 'object') walk(x, prefix + k + ' / ');
          else list.append(el('dt', prefix + k.replaceAll('_', ' ')), el('dd', x));
        }
      } else list.append(el('dd', value));
    }
    walk(data);
    content.append(list);
  }
  async function showHistory(type, id, page = 1) {
    const r = await apiFetch(
      '/api/eps/v1/historial/' + type + '/' + encodeURIComponent(id) + '?pagina=' + page,
    );
    details('Historial de cambios', r.datos);
    const paging = el('div', undefined, 'eps-pages');
    const prev = button('Anterior', () => showHistory(type, id, r.paginacion.pagina - 1));
    const next = button('Siguiente', () => showHistory(type, id, r.paginacion.pagina + 1));
    prev.disabled = r.paginacion.pagina <= 1;
    next.disabled = r.paginacion.pagina >= r.paginacion.paginas;
    paging.append(
      prev,
      el('span', 'Pagina ' + r.paginacion.pagina + ' de ' + r.paginacion.paginas),
      next,
    );
    content.append(paging);
  }
  function field(form, name, label, type = 'text', value = '', required = true) {
    const wrap = el('label', label),
      input = el(type === 'textarea' ? 'textarea' : 'input');
    input.name = name;
    if (type !== 'textarea') input.type = type;
    input.value = value ?? '';
    input.required = required;
    if (type === 'number') input.min = '1';
    wrap.append(input);
    form.append(wrap);
    return input;
  }
  function select(form, name, label, options, value) {
    const wrap = el('label', label),
      input = el('select');
    input.name = name;
    for (const item of options) {
      const opt = el('option', item || 'Todos');
      opt.value = item;
      input.append(opt);
    }
    if (value && !options.includes(value)) {
      const original = el('option', value);
      original.value = value;
      input.append(original);
    }
    input.value = value ?? options[0];
    wrap.append(input);
    form.append(wrap);
    return input;
  }
  function form(title, onSubmit) {
    open(title);
    const f = el('form');
    content.append(f);
    const error = el('p', undefined, 'eps-wide');
    error.setAttribute('role', 'alert');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.dataset.busy) return;
      f.dataset.busy = '1';
      const submit = f.querySelector('[type=submit]');
      submit.disabled = true;
      error.textContent = '';
      try {
        await onSubmit(Object.fromEntries(new FormData(f)));
        dialog.close();
        await load();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        delete f.dataset.busy;
        submit.disabled = false;
      }
    });
    f.finish = () => {
      const b = el('button', 'Guardar', 'btn-primary');
      b.type = 'submit';
      f.append(error, b);
    };
    return f;
  }
  function affiliateForm(row) {
    const f = form(row ? 'Actualizar afiliado' : 'Registrar afiliado', (data) =>
      apiFetch('/api/eps/v1/afiliados' + (row ? '/' + encodeURIComponent(row.id) : ''), {
        method: row ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...data, ...(row ? { version: row.eps_version } : {}) }),
      }),
    );
    for (const [key, label, type, max] of [
      ['nombres', 'Nombres', 'text', 100],
      ['apellidos', 'Apellidos', 'text', 100],
      ['fecha_nacimiento', 'Fecha de nacimiento', 'date', 10],
      ['telefono', 'Telefono', 'tel', 20],
      ['correo', 'Correo', 'email', 150],
      ['direccion', 'Direccion', 'text', 255],
      ['ciudad', 'Ciudad', 'text', 100],
    ])
      field(
        f,
        key,
        label,
        type,
        row?.[key] || '',
        !['telefono', 'direccion'].includes(key),
      ).maxLength = max;
    if (!row) {
      select(
        f,
        'tipo_documento',
        'Tipo de documento',
        ['CC', 'TI', 'CE', 'RC', 'PA', 'PEP', 'PPT'],
        'CC',
      );
      field(f, 'documento', 'Documento', 'text', '').maxLength = 30;
    }
    select(
      f,
      'regimen',
      'Regimen',
      ['CONTRIBUTIVO', 'SUBSIDIADO', 'ESPECIAL'],
      row?.regimen || 'CONTRIBUTIVO',
    );
    select(f, 'estado', 'Estado', states.afiliados, row?.estado || 'ACTIVO');
    f.finish();
  }
  function pharmacyForm(row) {
    const f = form('Vinculacion autorizada de farmacia', (data) =>
      apiFetch('/api/eps/v1/farmacias/vinculo', {
        method: 'PUT',
        body: JSON.stringify({
          farmacia_id: Number(data.farmacia_id),
          activa: data.activa === 'ACTIVA',
          ...(row ? { version: row.version } : {}),
        }),
      }),
    );
    field(
      f,
      'farmacia_id',
      'ID de la cuenta de farmacia autorizada',
      'number',
      row?.farmacia_id || '',
    ).readOnly = Boolean(row);
    select(
      f,
      'activa',
      'Vinculacion',
      ['ACTIVA', 'INACTIVA'],
      row?.activa === false ? 'INACTIVA' : 'ACTIVA',
    );
    f.append(
      el(
        'p',
        'Vincula unicamente farmacias con convenio autorizado para esta EPS. No modifica la cuenta ni el inventario.',
        'eps-wide',
      ),
    );
    f.finish();
  }
  function authorizationForm() {
    const f = form('Crear autorizacion medica', (data) =>
      apiFetch('/api/eps/v1/autorizaciones', { method: 'POST', body: JSON.stringify(data) }),
    );
    field(f, 'afiliado_id', 'ID del afiliado (visible en Afiliados)');
    field(f, 'solicitud_id', 'ID de solicitud (opcional)', 'number', '', false);
    field(f, 'concepto', 'Concepto autorizado', 'textarea').maxLength = 1000;
    field(f, 'motivo', 'Motivo', 'textarea').maxLength = 1000;
    f.finish();
  }
  function decisionForm(row) {
    const f = form('Resolver autorizacion #' + row.id, (data) =>
      apiFetch('/api/eps/v1/autorizaciones/' + row.id, {
        method: 'PATCH',
        body: JSON.stringify({ ...data, version: row.version }),
      }),
    );
    select(f, 'estado', 'Decision', ['APROBADA', 'RECHAZADA'], 'APROBADA');
    field(f, 'motivo', 'Motivo obligatorio', 'textarea').maxLength = 1000;
    f.finish();
  }
  function followupForm(row) {
    const seg = row.seguimientos_eps[0],
      current = seg?.estado || 'ABIERTA',
      next = {
        ABIERTA: ['EN_REVISION'],
        EN_REVISION: ['RESUELTA'],
        RESUELTA: ['EN_REVISION', 'CERRADA'],
        CERRADA: [],
      }[current];
    if (!next.length) {
      details('Seguimiento cerrado', seg);
      return;
    }
    const f = form('Seguimiento de solicitud #' + row.id, (data) =>
      apiFetch('/api/eps/v1/solicitudes/' + row.id + '/seguimiento', {
        method: 'PATCH',
        body: JSON.stringify({ ...data, version: seg?.version || 0 }),
      }),
    );
    f.append(
      el(
        'p',
        'Estado actual EPS: ' +
          current +
          '. El estado de preparacion y entrega lo mantiene farmacia.',
        'eps-wide',
      ),
    );
    select(f, 'estado', 'Nuevo estado EPS', next, next[0]);
    field(f, 'motivo', 'Nota de seguimiento', 'textarea').maxLength = 1000;
    f.finish();
  }
  function profile(row) {
    const f = el('form', undefined, 'eps-profile');
    f.append(el('p', 'Entidad: ' + row.id + ' / NIT: ' + (row.nit || 'Sin registrar')));
    for (const [key, label, max] of [
      ['nombre', 'Nombre EPS', 150],
      ['correo', 'Correo', 150],
      ['telefono', 'Telefono', 20],
      ['direccion', 'Direccion', 255],
      ['ciudad', 'Ciudad', 100],
    ])
      field(
        f,
        key,
        label,
        key === 'correo' ? 'email' : 'text',
        row[key],
        ['nombre', 'ciudad'].includes(key),
      ).maxLength = max;
    const b = el('button', 'Guardar perfil EPS', 'btn-primary');
    b.type = 'submit';
    f.append(b);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      b.disabled = true;
      try {
        await apiFetch('/api/eps/v1/perfil', {
          method: 'PUT',
          body: JSON.stringify({ ...Object.fromEntries(new FormData(f)), version: row.version }),
        });
        await load();
        document.getElementById('epsMessage').textContent = 'Perfil actualizado.';
      } catch (err) {
        showError(err);
      } finally {
        b.disabled = false;
      }
    });
    workspace.append(f);
  }
  navigate(location.hash.slice(1) || 'dashboard');
  startTimer();
}
