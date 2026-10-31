import type { JSX } from 'preact';

type IconProps = { size?: number };

// Se pasa una función: cada render crea vnodes nuevos en lugar de compartir uno.
/** Íconos de trazo 24×24 en `currentColor`; decorativos (el botón lleva el `aria-label`). */
const icon = (body: () => JSX.Element) =>
  function Icon({ size = 24 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {body()}
      </svg>
    );
  };

export const IconSearch = icon(() => <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></>);
export const IconDots = icon(() =>
  <g fill="currentColor"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></g>,
);
export const IconPlus = icon(() => <path d="M12 5v14M5 12h14" />);
export const IconBack = icon(() => <path d="M19 12H5M12 19l-7-7 7-7" />);
export const IconClose = icon(() => <path d="M18 6 6 18M6 6l12 12" />);
export const IconSettings = icon(() =>
  <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
  </>,
);
export const IconPlay = icon(() => <path d="M7 4v16l13-8Z" fill="currentColor" />);
export const IconCheck = icon(() => <path d="M20 6 9 17l-5-5" />);
export const IconHash = icon(() => <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />);
export const IconFolderMove = icon(() =>
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM9 13h7M13 10l3 3-3 3" />,
);
export const IconTrash = icon(() =>
  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />,
);
export const IconPencil = icon(() => <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5ZM15 5l4 4" />);
export const IconUpload = icon(() => <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />);
export const IconBooks = icon(() =>
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />,
);
export const IconLogout = icon(() => <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const IconDirection = icon(() => <path d="M4 7h16M16 3l4 4-4 4M20 17H4M8 13l-4 4 4 4" />);
export const IconColumns = icon(() => <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>);
export const IconVertical = icon(() => <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M7 9h10M7 15h10" /></>);
export const IconRestart = icon(() => <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8M3 3v5h5" />);
export const IconFullscreen = icon(() =>
  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
);
export const IconPrev = icon(() => <path d="M19 20 9 12l10-8ZM5 19V5" />);
export const IconNext = icon(() => <path d="m5 4 10 8-10 8ZM19 5v14" />);
