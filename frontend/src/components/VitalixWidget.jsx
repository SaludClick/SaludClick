import { useRef, useState } from "react";
import Chat from "./Chat.jsx";

export default function VitalixWidget() {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);

  function show() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    setOpen(true);
  }

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function keepFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll('button, input, summary, a[href], [tabindex="0"]')]
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <aside className="vitalix-widget" aria-label="Asistente VITALIX">
      <button ref={trigger} type="button" className="vitalix-launcher"
        aria-label="Abrir asistente VITALIX" aria-haspopup="dialog"
        aria-controls="vitalix-dialog" aria-expanded={open}
        title="VITALIX" onClick={show}>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
          <path d="M3 12h4l2-4 4 8 2-4h6" />
        </svg>
      </button>
      <dialog ref={dialog} id="vitalix-dialog" className="vitalix-dialog"
        onKeyDown={keepFocus}
        onCancel={(event) => { event.preventDefault(); close(); }}
        aria-labelledby="vitalix-widget-title" aria-describedby="vitalix-widget-subtitle"
        onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>
        <header className="vitalix-widget-header">
          <div><h2 id="vitalix-widget-title">VITALIX</h2>
            <p id="vitalix-widget-subtitle">Asistente virtual de SaludClick</p></div>
          <button type="button" autoFocus onClick={close} aria-label="Cerrar asistente VITALIX">×</button>
        </header>
        <div className="vitalix-widget-body"><Chat embedded /></div>
      </dialog>
    </aside>
  );
}
