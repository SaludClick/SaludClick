import React from "react";

/** Identidad visual reutilizable de SaludClick. Mantiene el HTML/clases del diseño original. */
export default function Brand({ className = "logo" }) {
  return (
    <div className={className}>
      <i className="fa-solid fa-heart-pulse" aria-hidden="true"></i>
      <span>SaludClick</span>
    </div>
  );
}
