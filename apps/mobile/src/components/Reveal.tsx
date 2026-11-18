import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

/**
 * Brings a part of the page into view inside the nearest `Screen`: a field that gets the keyboard, a section that
 * was just opened. `where`: 'center' (fields: above the keyboard) or 'start' (an opened section: its heading at the top).
 */
export type Reveal = (node: unknown, where?: 'center' | 'start') => void;
export const RevealContext = createContext<Reveal>(() => {});
export const useReveal = () => useContext(RevealContext);

/** A TextInput that brings itself (or `revealRef`, e.g. its whole row) into view when it gets the keyboard. */
export function RevealInput({ revealRef, onFocus, ...props }: TextInputProps & { revealRef?: RefObject<View | null> }) {
  const self = useRef<TextInput>(null);
  const reveal = useReveal();
  return <TextInput ref={self} {...props} onFocus={(e) => { reveal(revealRef?.current ?? self.current); onFocus?.(e); }} />;
}

/** Brings `ref` into view (heading at the top) when `open` turns true: a section the user just expanded. */
export function useRevealOnOpen(open: boolean) {
  const ref = useRef<View>(null);
  const reveal = useReveal();
  // Only when the user opens it: a section that starts open does not move the page.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && open) reveal(ref.current, 'start');
    mounted.current = true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** A View that, mounted inside a Screen, scrolls its heading to the top when `open` turns true. */
export function RevealOnOpen({ open, children, style }: { open: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRevealOnOpen(open);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}
