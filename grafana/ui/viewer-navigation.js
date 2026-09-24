/* Cosmetic navigation restrictions, not authorization: all groups share one identity. */
(() => {
    const boot = window.grafanaBootData;
    if (
        boot?.user?.login !== 'user' ||
        boot.user.orgRole !== 'Viewer' ||
        boot.user.isGrafanaAdmin
    ) {
        return;
    }

    const root = document.documentElement;
    root.classList.add('governify-viewer');
    const base = (boot.settings?.appSubUrl || '').replace(/\/$/, '');
    const message = document.createElement('main');
    message.id = 'governify-group-entry';
    message.textContent = 'Abre el enlace de tu grupo para ver su dashboard.';
    document.body.appendChild(message);

    const updateRoute = () => {
        const path = window.location.pathname.slice(base.length).replace(/\/$/, '') || '/';
        const discovery = path === '/' || /^\/(dashboards|bookmarks|search)(\/|$)/.test(path);
        root.classList.toggle('governify-group-entry', discovery);
        message.hidden = !discovery;
    };
    updateRoute();
    window.addEventListener('popstate', updateRoute);
    // Grafana uses client-side navigation; observe rendered route changes as well.
    new MutationObserver(updateRoute).observe(document.getElementById('reactRoot'), {
        childList: true,
        subtree: true,
    });

    window.addEventListener(
        'keydown',
        (event) => {
            if (
                event.target?.closest?.(
                    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
                )
            ) {
                return;
            }
            const key = event.key.toLowerCase();
            if (
                ((event.ctrlKey || event.metaKey) && key === 'k') ||
                (!event.ctrlKey && !event.metaKey && !event.altKey && (key === 'f' || key === '/'))
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        true,
    );
})();
