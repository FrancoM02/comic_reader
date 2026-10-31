import type { JSX, RefObject } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { IconBooks, IconLogout, IconPlay, IconUpload } from './icons';

/** Corte celular/PC: ancho >= 900 px, sin importar la orientación. */
export function useWide(): boolean {
  const [wide, setWide] = useState(() => innerWidth >= 900);
  useEffect(() => {
    const f = () => setWide(innerWidth >= 900);
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  return wide;
}

// Capas abiertas (diálogos y menús), la última es la de arriba: Esc cierra solo esa.
const layers: object[] = [];

/** Esc cierra la capa sin que el lector ni otras vistas la vean; foco adentro al abrir y de vuelta al cerrar. */
function useLayer(ref: RefObject<HTMLElement | null>, onEsc: () => void) {
  const esc = useRef(onEsc);
  esc.current = onEsc;
  useEffect(() => {
    const me = {};
    layers.push(me);
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (layers[layers.length - 1] === me) esc.current();
    };
    addEventListener('keydown', f, true);
    return () => {
      removeEventListener('keydown', f, true);
      layers.splice(layers.indexOf(me), 1);
      if (before?.isConnected) before.focus();
    };
  }, []);
}

const outside = (fn: () => void) => (e: MouseEvent) => e.target === e.currentTarget && fn();

export interface DialogAction {
  label: string;
  value: string;
  kind?: 'primary' | 'danger';
}

export interface DialogOpts {
  title: string;
  message?: string;
  input?: { value: string; type?: 'text' | 'number'; label: string };
  actions: DialogAction[];
}

type DialogResult = { action: string | null; text: string };

function Dialog({ opts, done }: { opts: DialogOpts; done: (action: string | null, text: string) => void }) {
  const [text, setText] = useState(opts.input?.value ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const cancel = () => done(null, text);
  useLayer(ref, cancel);
  const primary = opts.actions.find((a) => a.kind === 'primary');
  return (
    <div class="backdrop" onClick={outside(cancel)}>
      <div ref={ref} class="dialog" role="dialog" aria-modal="true" aria-label={opts.title}>
        <h2>{opts.title}</h2>
        {opts.message && <p>{opts.message}</p>}
        {opts.input && (
          <label>
            {opts.input.label}
            <input
              {...(opts.input.type === 'number' ? { type: 'number', step: 'any' } : { type: 'text' })}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && primary) {
                  e.preventDefault();
                  done(primary.value, text);
                }
              }}
            />
          </label>
        )}
        <div class="dialog-actions">
          {opts.actions.map((a) => (
            <button type="button" key={a.value} class={`btn${a.kind ? ` ${a.kind}` : ''}`} onClick={() => done(a.value, text)}>
              {a.label}
            </button>
          ))}
          <button type="button" class="btn ghost" onClick={cancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reemplazo de `prompt`/`confirm`: renderizar el elemento y esperar la promesa de `open`. */
export function useDialog(): [JSX.Element | null, (o: DialogOpts) => Promise<DialogResult>] {
  const [cur, setCur] = useState<{ opts: DialogOpts; n: number } | null>(null);
  const pending = useRef<((r: DialogResult) => void) | null>(null);
  const count = useRef(0);
  const open = useCallback(
    (opts: DialogOpts) =>
      new Promise<DialogResult>((resolve) => {
        pending.current?.({ action: null, text: '' });
        pending.current = resolve;
        setCur({ opts, n: ++count.current });
      }),
    [],
  );
  const done = (action: string | null, text: string) => {
    pending.current?.({ action, text });
    pending.current = null;
    setCur(null);
  };
  return [cur && <Dialog key={cur.n} opts={cur.opts} done={done} />, open];
}

export interface MenuItem {
  label: string;
  icon?: JSX.Element;
  danger?: boolean;
  onSelect: () => void;
}

type MenuProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  items?: MenuItem[];
  children?: preact.ComponentChildren;
  anchor?: HTMLElement | null;
};

/** Celular: panel desde abajo. PC: desplegable bajo `anchor`, o panel centrado si no hay ancla. */
export function Menu(props: MenuProps) {
  return props.open ? <MenuPanel {...props} /> : null;
}

function MenuPanel({ onClose, title, items, children, anchor }: MenuProps) {
  const wide = useWide();
  const ref = useRef<HTMLDivElement>(null);
  useLayer(ref, onClose);
  const drop = wide && anchor;
  let style: Record<string, string> | undefined;
  if (drop) {
    const r = anchor.getBoundingClientRect();
    // En la mitad de abajo de la pantalla abre hacia arriba para no salirse.
    const right = `${Math.max(8, innerWidth - r.right)}px`;
    style = r.bottom > innerHeight / 2 ? { right, bottom: `${innerHeight - r.top + 4}px` } : { right, top: `${r.bottom + 4}px` };
  }
  return (
    <div class={drop ? 'backdrop clear' : 'backdrop'} onClick={outside(onClose)}>
      <div ref={ref} class={drop ? 'dropdown' : wide ? 'dialog' : 'sheet'} role="menu" aria-label={title} style={style}>
        {title && <div class="menu-title ellipsis">{title}</div>}
        {items?.map((it) => (
          <button
            type="button"
            role="menuitem"
            key={it.label}
            class={it.danger ? 'menu-item danger' : 'menu-item'}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
          >
            {it.icon}
            <span class="ellipsis">{it.label}</span>
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" key={o.value} aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// shortcut: espera hasta 5 s a que la biblioteca cargue y aparezca #seguir; si Home avisa al montar, usar eso.
function scrollToSeguir(e: MouseEvent) {
  e.preventDefault();
  if (location.hash !== '#/') location.hash = '#/';
  let tries = 0;
  const go = () => {
    const el = document.getElementById('seguir');
    if (el) el.scrollIntoView({ block: 'start' });
    else if (tries++ < 50) setTimeout(go, 100);
  };
  go();
}

/** PC: barra lateral fija con la navegación; celular: solo el contenido (cada pantalla trae su barra). */
export function Shell({ children, onSignOut }: { children: preact.ComponentChildren; onSignOut: () => void }) {
  const wide = useWide();
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  if (!wide) return <>{children}</>;
  const home = hash === '' || hash === '#/';
  return (
    <div class="shell">
      <nav class="sidebar" aria-label="Principal">
        <div class="brand ellipsis">Comic Reader</div>
        <a href="#/" aria-current={home ? 'page' : undefined}>
          <IconBooks size={20} />
          Biblioteca
        </a>
        <a href="#/" onClick={scrollToSeguir}>
          <IconPlay size={20} />
          Seguir leyendo
        </a>
        <a href="#/upload" aria-current={hash === '#/upload' ? 'page' : undefined}>
          <IconUpload size={20} />
          Subir
        </a>
        <button type="button" class="sidebar-out" onClick={onSignOut}>
          <IconLogout size={20} />
          Salir
        </button>
      </nav>
      <div class="shell-main">{children}</div>
    </div>
  );
}
