import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../grafana/ui/viewer-navigation.js', import.meta.url), 'utf8');

function mount(login = 'user', orgRole = 'Viewer', isGrafanaAdmin = false, path = '/', base = '') {
    const classes = new Set<string>();
    const listeners = new Map<string, (event?: unknown) => void>();
    const message = { hidden: false, id: '', textContent: '' };
    const boot = {
        user: { login, orgRole, isGrafanaAdmin },
        settings: { appSubUrl: base },
        navTree: ['dashboards'],
    };
    const location = { pathname: path };
    runInNewContext(source, {
        window: {
            grafanaBootData: boot,
            location,
            addEventListener: (key: string, fn: () => void) => listeners.set(key, fn),
        },
        document: {
            documentElement: {
                classList: {
                    add: (key: string) => classes.add(key),
                    toggle: (key: string, on: boolean) =>
                        on ? classes.add(key) : classes.delete(key),
                },
            },
            createElement: () => message,
            body: { appendChild: () => undefined },
            getElementById: () => ({}),
        },
        MutationObserver: class {
            observe() {}
        },
    });
    return { classes, listeners, message, boot, location };
}

describe('shared Grafana viewer navigation', () => {
    it.each([
        ['admin', 'Admin', true],
        ['user', 'Admin', false],
        ['user', 'Viewer', true],
        ['another', 'Viewer', false],
    ])('preserves navigation for %s / %s / server admin %s', (login, role, admin) => {
        const state = mount(login as string, role as string, admin as boolean);
        expect(state.classes.size).toBe(0);
        expect(state.boot.navTree).toEqual(['dashboards']);
        expect(state.listeners.size).toBe(0);
    });
    it.each(['/', '/dashboards', '/dashboards/f/group/name', '/bookmarks', '/search'])(
        'hides discovery at %s',
        (path) => {
            const state = mount('user', 'Viewer', false, '/grafana' + path, '/grafana');
            expect(state.classes.has('governify-group-entry')).toBe(true);
            expect(state.boot.navTree).toEqual(['dashboards']);
            state.location.pathname = '/grafana/d/group/report';
            state.listeners.get('popstate')?.();
            expect(state.classes.has('governify-group-entry')).toBe(false);
            expect(state.message.hidden).toBe(true);
        },
    );
    it('blocks search shortcuts without intercepting typing or date shortcuts', () => {
        const state = mount();
        const fire = (key: string, editing = false, ctrlKey = false) => {
            let blocked = false;
            state.listeners.get('keydown')?.({
                key,
                ctrlKey,
                target: { closest: () => editing },
                preventDefault: () => {
                    blocked = true;
                },
                stopImmediatePropagation: () => undefined,
            });
            return blocked;
        };
        expect(fire('f')).toBe(true);
        expect(fire('k', false, true)).toBe(true);
        expect(fire('f', true)).toBe(false);
        expect(fire('t')).toBe(false);
    });
});
