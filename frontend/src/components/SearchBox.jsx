import React from "react";

/** Buscador de portada. Conserva los IDs usados por el JS original para mantener la navegación. */
export default function SearchBox() {
  return (
    <div className="buscador">
      <input id="busquedaInicio" type="text" placeholder="Buscar medicamento..." aria-label="Buscar medicamento" />
      <button id="buscarInicio" type="button"><i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Buscar</button>
    </div>
  );
}
