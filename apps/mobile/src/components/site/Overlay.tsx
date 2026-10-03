import type { PropsWithChildren } from 'react';

/** Native: the desktop overlays never render there; pass children through. */
export function Overlay({ children }: PropsWithChildren) {
  return <>{children}</>;
}
