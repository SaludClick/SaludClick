const panel = document.querySelector('[data-panel-menu]');

if (panel) {
    const toggle = panel.querySelector('button[aria-controls]');
    const sidebar = document.getElementById(toggle.getAttribute('aria-controls'));
    const closeButton = sidebar.querySelector('[data-panel-close]');
    const backdrop = panel.querySelector('[data-panel-backdrop]');
    const main = panel.querySelector(':scope > :is(.admin-main, .ad-main)');
    const mobile = matchMedia('(max-width: 900px), (pointer: coarse)');
    const storageKey = 'saludclick.panel-menu.' + panel.dataset.panelMenu;

    function desktopOpen() {
        try { return sessionStorage.getItem(storageKey) !== 'closed'; }
        catch { return true; }
    }

    function setOpen(open, focusToggle = false) {
        const modal = open && mobile.matches;
        const focusInSidebar = sidebar.contains(document.activeElement);

        panel.dataset.panelOpen = String(open);
        panel.dataset.panelModal = String(modal);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Cerrar men\u00fa' : 'Abrir men\u00fa');
        sidebar.inert = !open;
        if (!modal) main.inert = false;

        if (modal) {
            sidebar.setAttribute('role', 'dialog');
            sidebar.setAttribute('aria-modal', 'true');
        } else {
            sidebar.removeAttribute('role');
            sidebar.removeAttribute('aria-modal');
        }

        if (modal) {
            main.inert = true;
            requestAnimationFrame(() => {
                if (panel.dataset.panelModal === 'true' && !sidebar.contains(document.activeElement)) {
                    closeButton.focus({ preventScroll: true });
                }
            });
        } else if (focusToggle || (!open && focusInSidebar)) {
            toggle.focus({ preventScroll: true });
        }
    }

    function rememberDesktop(open) {
        if (!mobile.matches) {
            try { sessionStorage.setItem(storageKey, open ? 'open' : 'closed'); }
            catch { /* The current view still works when storage is unavailable. */ }
        }
    }

    toggle.addEventListener('click', event => {
        const open = panel.dataset.panelOpen !== 'true';
        rememberDesktop(open);
        setOpen(open, true);
        if (open && !mobile.matches && event.detail === 0) {
            const target = sidebar.querySelector('nav a[aria-current]') || sidebar.querySelector('nav a[href]');
            target?.focus({ preventScroll: true });
        }
    });

    function close() {
        rememberDesktop(false);
        setOpen(false, true);
    }

    backdrop.addEventListener('click', close);
    closeButton.addEventListener('click', close);
    sidebar.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        const primaryUnmodifiedClick = event.button === 0 &&
            !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
            (!link?.target || link.target === '_self');
        if (mobile.matches && primaryUnmodifiedClick && link) close();
    });

    document.addEventListener('click', event => {
        if (!mobile.matches && panel.dataset.panelOpen === 'true' &&
            !sidebar.contains(event.target) && !toggle.contains(event.target) &&
            !event.target.closest('dialog[open]')) {
            setOpen(false);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || panel.dataset.panelOpen !== 'true') return;
        if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
            event.preventDefault();
            close();
        }
        if (event.key !== 'Tab' || panel.dataset.panelModal !== 'true') return;

        const controls = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')]
            .filter(element => element.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    mobile.addEventListener('change', () => {
        setOpen(!mobile.matches && desktopOpen(), sidebar.contains(document.activeElement));
    });
    window.addEventListener('pageshow', event => {
        if (event.persisted) setOpen(!mobile.matches && desktopOpen());
    });
    setOpen(!mobile.matches && desktopOpen());
}
