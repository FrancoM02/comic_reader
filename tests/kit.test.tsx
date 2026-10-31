import { act, fireEvent, render, screen } from '@testing-library/preact';
import { expect, test, vi } from 'vitest';
import { Menu, useDialog, type DialogOpts } from '../src/ui/kit';

function DialogHost({ opts, onResult }: { opts: DialogOpts; onResult: (r: { action: string | null; text: string }) => void }) {
  const [dialog, open] = useDialog();
  return (
    <>
      {dialog}
      <button type="button" onClick={() => open(opts).then(onResult)}>abrir</button>
    </>
  );
}

const confirmOpts: DialogOpts = { title: '¿Borrar?', actions: [{ label: 'Borrar', value: 'del', kind: 'danger' }] };

async function openDialog(opts: DialogOpts) {
  const onResult = vi.fn();
  render(<DialogHost opts={opts} onResult={onResult} />);
  fireEvent.click(screen.getByText('abrir'));
  expect(await screen.findByRole('dialog', { name: opts.title })).toBeTruthy();
  return onResult;
}

test('useDialog: Esc cancela', async () => {
  const onResult = await openDialog(confirmOpts);
  // El foco inicial queda en la primera acción.
  expect(document.activeElement?.textContent).toBe('Borrar');
  await act(async () => {
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  });
  expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ action: null }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('useDialog: tocar el fondo cancela', async () => {
  const onResult = await openDialog(confirmOpts);
  await act(async () => {
    fireEvent.click(document.querySelector('.backdrop')!);
  });
  expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ action: null }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('useDialog: "Cancelar" siempre está al final y cancela', async () => {
  const onResult = await openDialog(confirmOpts);
  const buttons = screen.getByRole('dialog').querySelectorAll('button');
  expect(buttons[buttons.length - 1].textContent).toBe('Cancelar');
  await act(async () => {
    fireEvent.click(screen.getByText('Cancelar'));
  });
  expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ action: null }));
});

test('useDialog: Enter en el input elige la acción primaria y devuelve el texto', async () => {
  const onResult = await openDialog({
    title: 'Renombrar',
    input: { value: 'Nuevo', label: 'Nombre' },
    actions: [
      { label: 'Otra', value: 'other' },
      { label: 'Guardar', value: 'ok', kind: 'primary' },
    ],
  });
  const input = screen.getByLabelText('Nombre') as HTMLInputElement;
  expect(input.value).toBe('Nuevo');
  expect(document.activeElement).toBe(input);
  fireEvent.input(input, { target: { value: 'Otro' } });
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  expect(onResult).toHaveBeenCalledWith({ action: 'ok', text: 'Otro' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('Menu: elegir un ítem llama onSelect y onClose', () => {
  const calls: string[] = [];
  render(
    <Menu
      open
      title="Tomo 1"
      onClose={() => calls.push('close')}
      items={[{ label: 'Marcar como leído', onSelect: () => calls.push('select') }]}
    />,
  );
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar como leído' }));
  expect(calls).toEqual(['select', 'close']);
});

test('Menu: Esc llama onClose y no se propaga a window', () => {
  const onClose = vi.fn();
  const onWindowKey = vi.fn();
  addEventListener('keydown', onWindowKey);
  try {
    render(<Menu open onClose={onClose} items={[{ label: 'Borrar tomo', danger: true, onSelect: () => {} }]} />);
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onWindowKey).not.toHaveBeenCalled();
  } finally {
    removeEventListener('keydown', onWindowKey);
  }
});

test('Menu: tocar afuera llama onClose', () => {
  const onClose = vi.fn();
  render(<Menu open onClose={onClose} items={[{ label: 'Renombrar', onSelect: () => {} }]} />);
  fireEvent.click(document.querySelector('.backdrop')!);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Menu: en PC con ancla se posiciona como desplegable bajo el botón', () => {
  const anchor = document.createElement('button');
  anchor.getBoundingClientRect = () => ({ top: 10, bottom: 46, left: 900, right: 940 }) as DOMRect;
  render(<Menu open anchor={anchor} onClose={() => {}} items={[{ label: 'Renombrar', onSelect: () => {} }]} />);
  const menu = screen.getByRole('menu');
  expect(menu.className).toBe('dropdown');
  expect(menu.style.top).toBe('50px');
  expect(menu.style.right).toBe(`${innerWidth - 940}px`);
});
