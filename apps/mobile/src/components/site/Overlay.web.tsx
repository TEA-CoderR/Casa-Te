import type { PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';

/** Web: render into <body>, above every navigator layer (menus, popovers). */
export function Overlay({ children }: PropsWithChildren) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
