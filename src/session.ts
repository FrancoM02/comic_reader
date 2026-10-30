import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { SessionDeps } from './upload';

/** { drive, store, volumesId } de la sesión iniciada. Lo provee App. */
export const SessionContext = createContext<SessionDeps | null>(null);

export function useSession(): SessionDeps {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession fuera de SessionContext');
  return s;
}
