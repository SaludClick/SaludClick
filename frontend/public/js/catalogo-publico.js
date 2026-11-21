import { apiUrl } from './api.js';
import { imagenPredeterminada, imagenSegura } from './medicamento-imagen.js';

const catalogo = document.getElementById('catalogo-publico');
const lista = document.getElementById('catalogo-publico-lista');
const estado = document.getElementById('catalogo-publico-estado');
const anterior = document.getElementById('catalogo-publico-anterior');
const siguiente = document.getElementById('catalogo-publico-siguiente');
let buscar = '', pagina = 1, solicitud;

function nodo(etiqueta, texto) {
    const elemento = document.createElement(etiqueta);
    elemento.textContent = texto;
    return elemento;
}

function tarjeta(medicamento) {
    const elemento = document.createElement('article');
    const imagen = document.createElement('img');
    imagen.alt = '';
    imagen.referrerPolicy = 'no-referrer';
    imagen.loading = 'lazy';
    imagen.addEventListener('error', () => { imagen.src = imagenPredeterminada; }, { once: true });
    imagen.src = imagenSegura(medicamento.imagen);
    elemento.append(imagen, nodo('h3', medicamento.nombre));
    if (medicamento.descripcion) elemento.append(nodo('p', medicamento.descripcion));
    if (medicamento.presentacion) elemento.append(nodo('p', medicamento.presentacion));
    elemento.append(nodo('strong', medicamento.stockBajo ? 'Stock bajo' : medicamento.disponible ? 'Disponible' : 'Agotado'));
    return elemento;
}

async function cargar() {
    solicitud?.abort();
    const actual = solicitud = new AbortController();
    const query = new URLSearchParams({ buscar, pagina });
    lista.setAttribute('aria-busy', 'true');
    estado.textContent = 'Cargando medicamentos…';
    anterior.disabled = siguiente.disabled = true;
    try {
        const response = await fetch(apiUrl('/api/medicamentos/publico?' + query), { signal: actual.signal });
        if (!response.ok) throw new Error('No se pudo cargar el catálogo. Intenta buscar de nuevo.');
        const resultado = await response.json();
        if (actual !== solicitud) return;
        lista.replaceChildren(...resultado.medicamentos.map(tarjeta));
        estado.textContent = resultado.medicamentos.length ? 'Página ' + pagina : 'No se encontraron medicamentos.';
        siguiente.disabled = !resultado.siguiente;
    } catch (error) {
        if (actual !== solicitud) return;
        lista.replaceChildren();
        estado.textContent = error.message;
    } finally {
        if (actual === solicitud) {
            anterior.disabled = pagina <= 1;
            lista.setAttribute('aria-busy', 'false');
        }
    }
}

catalogo.addEventListener('buscar-medicamentos', event => { buscar = event.detail; pagina = 1; void cargar(); });
anterior.addEventListener('click', () => { pagina--; void cargar(); });
siguiente.addEventListener('click', () => { pagina++; void cargar(); });
void cargar();
