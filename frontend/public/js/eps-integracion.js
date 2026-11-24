import { apiFetch } from './api.js';
import { checkAuthGuard, getCurrentUser } from './auth.js';
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = String(text ?? 'Sin registrar');
  if (cls) e.className = cls;
  return e;
};
export function mountIntegration(root) {
  if (root.dataset.mounted) return;
  root.dataset.mounted = 'true';
  const user = getCurrentUser(),
    role = Number(user?.rol_id ?? user?.rol);
  if (![1, 2, 3].includes(role)) {
    root.hidden = true;
    return;
  }
  const message = node('p', ''),
    panel = node('div');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  let notificationsRoot = null,
    timer = null,
    notificationLoading = false;
  let opened = false,
    busy = false;
  const request = (path, body, method = 'PUT') =>
    apiFetch(
      '/api/integracion' + path,
      body === undefined ? {} : { method, body: JSON.stringify(body) },
    );
  const fail = (e) => {
    message.textContent = e.message;
    message.setAttribute('role', 'alert');
  };
  function button(label, fn) {
    const b = node('button', label, role === 1 ? 'ad-button' : 'btn-outline');
    b.type = 'button';
    b.addEventListener('click', async () => {
      if (!checkAuthGuard()) return;
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        fail(e);
      } finally {
        b.disabled = false;
      }
    });
    return b;
  }
  function form(title, fields, save, beforeFields) {
    const dialog = node('dialog');
    const h = node('h2', title),
      f = node('form', undefined, role === 1 ? 'ad-form' : 'profile-form'),
      error = node('p', '');
    error.setAttribute('role', 'alert');
    if (beforeFields) f.append(beforeFields);
    for (const field of fields) {
      const [name, label, type, value = '', required = true] = field,
        wrap = node('label', label);
      let input;
      if (type instanceof HTMLSelectElement) {
        input = type;
      } else if (Array.isArray(type)) {
        input = node('select');
        for (const [key, text] of type) {
          const option = node('option', text);
          option.value = key;
          input.append(option);
        }
      } else {
        input = node(type === 'textarea' ? 'textarea' : 'input');
        if (type !== 'textarea') input.type = type;
      }
      input.name = name;
      input.required = required;
      input.value = value ?? '';
      if (type === 'number') input.min = ['stock', 'minimo'].includes(name) ? '0' : '1';
      input.maxLength = type === 'textarea' ? 1000 : 255;
      wrap.append(input);
      f.append(wrap);
    }
    const submit = node('button', 'Guardar', role === 1 ? 'ad-primary' : 'btn-primary');
    submit.type = 'submit';
    f.append(error, submit);
    let saving = false;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving || !checkAuthGuard()) return;
      saving = true;
      submit.disabled = true;
      error.textContent = '';
      try {
        await save(Object.fromEntries(new FormData(f)));
        dialog.close();
        await load();
      } catch (e) {
        error.textContent = e.message;
      } finally {
        saving = false;
        submit.disabled = false;
      }
    });
    dialog.append(
      h,
      f,
      button('Cerrar', () => dialog.close()),
    );
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    root.append(dialog);
    dialog.showModal();
  }
  function group(title) {
    const section = node('section', undefined, role === 1 ? 'ad-card' : 'card');
    section.append(node('h3', title));
    panel.append(section);
    return section;
  }
  async function rows(target, path, headers, map, page = 1) {
    target.replaceChildren(node('p', 'Cargando...'));
    const data = await request(path + (path.includes('?') ? '&' : '?') + 'pagina=' + page);
    target.replaceChildren();
    if (!data.datos.length) target.append(node('p', 'No hay registros para tu cuenta o convenio.'));
    else {
      const wrap = node('div', undefined, role === 1 ? 'ad-table-wrap' : 'orders-table-wrapper'),
        table = node('table', undefined, role === 1 ? undefined : 'orders-table'),
        thead = node('thead'),
        tr = node('tr');
      for (const label of headers) {
        const th = node('th', label);
        th.scope = 'col';
        tr.append(th);
      }
      thead.append(tr);
      table.append(thead);
      const body = node('tbody');
      for (const row of data.datos) {
        const tr = node('tr');
        for (const value of map(row)) {
          const td = node('td');
          if (value instanceof Node) td.append(value);
          else td.textContent = String(value ?? 'Sin registrar');
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      wrap.append(table);
      target.append(wrap);
    }
    if (data.paginacion) {
      const p = data.paginacion,
        bar = node('div', undefined, role === 1 ? 'ad-pagination' : 'pagination');
      const prev = button('Anterior', () => rows(target, path, headers, map, p.pagina - 1)),
        next = button('Siguiente', () => rows(target, path, headers, map, p.pagina + 1));
      prev.disabled = p.pagina <= 1;
      next.disabled = p.pagina >= p.paginas;
      bar.append(
        prev,
        node('span', p.total + ' registros / ' + p.pagina + ' de ' + p.paginas),
        next,
      );
      target.append(bar);
    }
    return data;
  }
  const number = (value) => Number(value);
  const yesNo = [
    ['true', 'Activo'],
    ['false', 'Inactivo'],
  ];
  function entityForm(row) {
    const fields = [
      ...(!row ? [['id', 'Identificador EPS', 'text']] : []),
      ['nombre', 'Nombre EPS', 'text', row?.nombre],
      ['nit', 'NIT', 'text', row?.nit, false],
      ['correo', 'Correo', 'email', row?.correo, false],
      ['telefono', 'Telefono', 'tel', row?.telefono, false],
      ['direccion', 'Direccion', 'text', row?.direccion, false],
      ['ciudad', 'Ciudad', 'text', row?.ciudad],
      ...(row ? [['activa', 'Estado', yesNo, String(row.activa)]] : []),
    ];
    form(row ? 'Actualizar EPS' : 'Registrar EPS', fields, (data) =>
      request(
        '/admin/eps' + (row ? '/' + encodeURIComponent(row.id) : ''),
        { ...data, ...(row ? { activa: data.activa === 'true', version: row.version } : {}) },
        row ? 'PUT' : 'POST',
      ),
    );
  }
  async function admin() {
    const g = group('Entidades y vinculaciones EPS');
    g.append(button('Registrar entidad EPS', () => entityForm()));
    const list = node('div');
    g.append(list);
    await rows(list, '/admin/eps', ['EPS', 'Estado', 'Accesos / farmacias', 'Gestion'], (r) => {
      const actions = node('div', undefined, 'ad-actions');
      actions.append(
        button('Editar', () => entityForm(r)),
        button('Supervision', async () => {
          const detail = await request('/admin/eps/' + encodeURIComponent(r.id) + '/resumen');
          const d = node('dialog');
          d.append(node('h2', 'Supervision de ' + r.nombre));
          for (const [key, value] of Object.entries(detail.estadisticas))
            d.append(node('p', key + ': ' + value));
          for (const x of detail.accesos)
            d.append(
              node('p', 'Cuenta EPS #' + x.usuario_id + ' / ' + (x.activo ? 'Activa' : 'Inactiva')),
            );
          for (const x of detail.farmacias)
            d.append(
              node(
                'p',
                'Convenio #' + x.id + ' / Farmacia #' + x.farmacia_id + ' / version ' + x.version,
              ),
            );
          const meta = node('div');
          d.append(
            meta,
            button('Cerrar', () => d.close()),
          );
          d.addEventListener('close', () => d.remove(), { once: true });
          root.append(d);
          d.showModal();
          await rows(
            meta,
            '/admin/eps/' + encodeURIComponent(r.id) + '/autorizaciones',
            ['Autorizacion', 'Estado', 'Responsable'],
            (a) => ['#' + a.id, a.estado, '#' + a.responsable_id],
          );
        }),
        button('Cuenta EPS', () =>
          form(
            'Vincular o suspender cuenta EPS',
            [
              ['usuario_id', 'ID de cuenta EPS existente', 'number'],
              ['activo', 'Acceso', yesNo, 'true'],
            ],
            (d) =>
              request('/admin/eps/' + encodeURIComponent(r.id) + '/acceso', {
                usuario_id: number(d.usuario_id),
                activo: d.activo === 'true',
              }),
          ),
        ),
        button('Paciente', () =>
          form(
            'Vincular identidad autorizada',
            [
              ['afiliado_id', 'ID de afiliado de esta EPS', 'text'],
              ['usuario_id', 'ID de cuenta de paciente existente', 'number'],
            ],
            (d) =>
              request('/admin/eps/' + encodeURIComponent(r.id) + '/paciente', {
                afiliado_id: d.afiliado_id,
                usuario_id: number(d.usuario_id),
              }),
          ),
        ),
        button('Farmacia', () =>
          form(
            'Gestionar convenio de farmacia',
            [
              ['farmacia_id', 'ID de cuenta de farmacia', 'number'],
              ['activa', 'Convenio', yesNo, 'true'],
              ['version', 'Version actual si existe', 'number', '', false],
            ],
            (d) =>
              request('/admin/eps/' + encodeURIComponent(r.id) + '/farmacia', {
                farmacia_id: number(d.farmacia_id),
                activa: d.activa === 'true',
                ...(d.version ? { version: number(d.version) } : {}),
              }),
          ),
        ),
      );
      return [
        r.nombre + ' / ' + r.id,
        r.activa ? 'Activa' : 'Inactiva',
        r._count.accesos + ' / ' + r._count.farmacias,
        actions,
      ];
    });
  }
  async function patient() {
    const af = await request('/paciente/afiliacion'),
      g = group('Mi afiliacion');
    if (!af.afiliacion)
      g.append(
        node(
          'p',
          'No hay una cuenta de afiliacion verificada. Solicita su vinculacion a Administracion.',
        ),
      );
    else {
      const a = af.afiliacion;
      g.append(
        node(
          'p',
          (a.eps?.nombre || 'EPS sin datos de contacto') + ' / ' + a.estado + ' / ' + a.regimen,
        ),
      );
    }
    const link = node('a', 'Crear solicitud con el proceso existente', 'btn-outline');
    link.href = '/pages/medicamentos.html';
    g.append(link);
    const auth = group('Mis autorizaciones');
    await rows(
      auth,
      '/paciente/autorizaciones',
      ['Autorizacion', 'Estado', 'Concepto / motivo', 'Farmacia'],
      (r) => [
        '#' + r.id,
        r.estado,
        r.concepto + ' / ' + r.motivo,
        r.farmacia_vinculo?.farmacia.nombre || 'Sin asignar',
      ],
    );
    const orders = group('Mis solicitudes y resultados');
    await rows(orders, '/paciente/solicitudes', ['Solicitud', 'Estado', 'Autorizaciones'], (r) => [
      '#' + r.id,
      r.estado,
      r.autorizaciones_eps.map((a) => '#' + a.id + ' ' + a.estado).join(', ') ||
        'Sin autorizacion EPS',
    ]);
  }
  function catalogPicker() {
    const controls = node('div');
    const label = node('label', 'Buscar por medicamento, principio activo o registro sanitario');
    const search = node('input');
    search.type = 'search';
    search.maxLength = 100;
    label.append(search);
    const select = node('select');
    const status = node('p');
    status.setAttribute('role', 'status');
    let page = 1;
    let term = '';
    const find = node('button', 'Buscar en catálogo', 'btn-outline');
    const previous = node('button', 'Anterior', 'btn-outline');
    const next = node('button', 'Siguiente', 'btn-outline');
    for (const control of [find, previous, next]) control.type = 'button';
    find.addEventListener('click', () => void load(1, search.value.trim()));
    previous.addEventListener('click', () => void load(page - 1));
    next.addEventListener('click', () => void load(page + 1));
    search.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      find.click();
    });
    controls.append(label, find, previous, next, status);
    async function load(target, query = term) {
      const placeholder = node('option', 'Selecciona un medicamento');
      placeholder.value = '';
      select.replaceChildren(placeholder);
      previous.disabled = next.disabled = find.disabled = true;
      status.textContent = 'Cargando catálogo...';
      try {
        const params = new URLSearchParams({ pagina: String(target), buscar: query });
        const { datos, paginacion } = await request('/farmacia/catalogo?' + params);
        page = paginacion.pagina;
        term = query;
        for (const item of datos) {
          const details = [item.nombre, item.concentracion, item.presentacion, item.registro_sanitario, '#' + item.id];
          const option = node('option', details.filter(Boolean).join(' / '));
          option.value = String(item.id);
          select.append(option);
        }
        previous.disabled = page <= 1;
        next.disabled = page >= paginacion.paginas;
        status.textContent = paginacion.total
          ? 'Página ' + page + ' de ' + paginacion.paginas
          : 'No se encontraron medicamentos en el catálogo.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        find.disabled = false;
      }
    }
    return { controls, select, load };
  }

  async function pharmacy() {
    const [{ datos: convenios }, { operacionHabilitada }] = await Promise.all([
      request('/farmacia/convenios'),
      apiFetch('/api/farmacia/verificar-acceso'),
    ]);
    const g = group('Existencias de mis convenios EPS');
    g.append(
      node(
        'p',
        operacionHabilitada
          ? 'Registra cantidades reales del convenio.'
          : 'Las existencias y solicitudes del convenio est?n disponibles para consulta.',
      ),
    );
    const saveStock = (row) => {
      const catalog = row ? null : catalogPicker();
      form(
        'Existencias del convenio',
        [
          [
            'vinculo_id',
            'Convenio EPS',
            convenios.filter(c => !row || c.id === row.vinculo_id)
              .map(c => [String(c.id), c.eps.nombre]),
            String(row?.vinculo_id || convenios[0]?.id || ''),
          ],
          [
            'medicamento_id',
            'Medicamento del catálogo general',
            row ? [[String(row.medicamento_id), row.medicamento.nombre]] : catalog.select,
            row?.medicamento_id || '',
          ],
          ['stock', 'Existencias reales', 'number', row?.stock ?? ''],
          ['minimo', 'Umbral de alerta', 'number', row?.minimo ?? ''],
        ],
        (d) =>
          request('/farmacia/existencias', {
            vinculo_id: number(d.vinculo_id),
            medicamento_id: number(d.medicamento_id),
            stock: number(d.stock),
            minimo: number(d.minimo),
            ...(row ? { actualizado_at: row.actualizado_at } : {}),
          }),
        catalog?.controls,
      );
      if (catalog) void catalog.load(1);
    };
    if (!convenios.length) g.append(node('p', 'No tienes convenios EPS activos.'));
    if (operacionHabilitada && convenios.length) {
      g.append(button('Registrar existencias', () => saveStock()));
    }
    const stock = node('div');
    g.append(stock);
    await rows(
      stock,
      '/farmacia/existencias',
      ['Medicamento', 'EPS', 'Stock / minimo', 'Accion'],
      (r) => [
        r.medicamento.nombre,
        r.vinculo.eps.nombre,
        r.stock + ' / ' + r.minimo,
        operacionHabilitada ? button('Actualizar', () => saveStock(r)) : 'Consulta',
      ],
    );
    const auth = group('Autorizaciones EPS asignadas');
    await rows(
      auth,
      '/farmacia/autorizaciones',
      ['Autorizacion / EPS', 'Paciente', 'Solicitud / estado', 'Medicamentos', 'Proceso'],
      (r) => {
        const next = r.solicitud?.operacion?.siguienteEstado;
        const labels = {
          PAGO_REAL_NO_APROBADO: 'No hay un pago aprobado habilitado para este entorno',
          PAGO_REAL_INSUFICIENTE: 'El pago real aprobado no cubre la solicitud',
          SIN_MEDICAMENTOS: 'Solicitud sin medicamentos',
          VALIDACION_FARMACEUTICA_PENDIENTE: 'Validaci?n farmac?utica pendiente',
          REQUISITO_FORMULA_DESCONOCIDO: 'Requisito de f?rmula desconocido',
        };
        const bloqueos = r.solicitud?.operacion?.bloqueos.map(code => labels[code]).filter(Boolean);
        return [
          '#' + r.id + ' / ' + r.eps.nombre,
          r.afiliado.nombres + ' ' + r.afiliado.apellidos,
          r.solicitud_id + ' / ' + (r.solicitud?.estado || 'Sin solicitud'),
          r.solicitud?.detalles.map((d) => d.medicamento.nombre + ' x' + d.cantidad).join(', '),
          next && operacionHabilitada
            ? button('Avanzar a ' + next, async () => {
                const path = '/farmacia/solicitudes/' + r.solicitud_id + '/estado';
                const transicion = { estadoActual: r.solicitud.estado, estado: next };
                if (next === 'ENTREGADA') {
                  form('Confirmar entrega', [['recepcion', 'Persona que recibió la solicitud', 'text']],
                    ({ recepcion }) => request(path, { ...transicion, recepcion }, 'PATCH'));
                  return;
                }
                await request(path, transicion, 'PATCH');
                await load();
              })
            : bloqueos?.length ? bloqueos.join('. ') : 'Sin transici?n pendiente',
        ];
      },
    );
  }
  async function notifications() {
    const g = notificationsRoot?.isConnected
      ? notificationsRoot
      : (notificationsRoot = group('Notificaciones del proceso EPS'));
    g.replaceChildren(node('h3', 'Notificaciones del proceso EPS'));
    const result = await request('/notificaciones?estado=PENDIENTE');
    g.append(node('p', 'Pendientes: ' + result.paginacion.total));
    const list = node('div');
    g.append(list);
    await rows(list, '/notificaciones', ['Aviso', 'Fecha', 'Estado', 'Accion'], (r) => [
      r.titulo,
      new Date(r.created_at).toLocaleString('es-CO'),
      r.leida_at ? 'Leida' : 'Pendiente',
      r.leida_at
        ? ''
        : button('Marcar leida', async () => {
            await request('/notificaciones/' + r.id + '/leida', {}, 'PATCH');
            await load();
          }),
    ]);
  }
  async function load() {
    if (busy || !opened || !checkAuthGuard()) return;
    busy = true;
    message.textContent = 'Cargando...';
    panel.setAttribute('aria-busy', 'true');
    panel.replaceChildren();
    notificationsRoot = null;
    try {
      await notifications();
      if (role === 1) await admin();
      if (role === 2) await patient();
      if (role === 3) await pharmacy();
      message.textContent = 'Datos de integracion actualizados.';
      message.setAttribute('role', 'status');
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
      panel.setAttribute('aria-busy', 'false');
    }
  }
  const open = button('Abrir integracion EPS', async () => {
    opened = true;
    open.textContent = 'Actualizar integracion EPS';
    await load();
    timer ??= setInterval(async () => {
      if (
        document.hidden ||
        !opened ||
        busy ||
        notificationLoading ||
        !notificationsRoot?.isConnected
      )
        return;
      notificationLoading = true;
      try {
        await notifications();
      } catch (e) {
        fail(e);
      } finally {
        notificationLoading = false;
      }
    }, 45000);
  });
  root.append(open, message, panel);
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    timer = null;
    panel.replaceChildren();
    opened = false;
  });
  window.addEventListener('storage', () => {
    if (!getCurrentUser()) {
      panel.replaceChildren();
      opened = false;
      root.querySelectorAll('dialog').forEach((d) => d.close());
    }
  });
}
function start() {
  for (const root of document.querySelectorAll('[data-eps-integration]')) mountIntegration(root);
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
