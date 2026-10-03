import type { PropsWithChildren } from 'react';
import { View, type PressableStateCallbackType, type ViewStyle } from 'react-native';
import type { CategoryRow } from '@casa-te/shared';

/** Desktop page measure: content never runs wider than this, with a 40 px gutter. */
export const SITE_WIDTH = 1360;
export const GUTTER = 40;

/** Centred column at the desktop measure (full-bleed sections put their colour outside it). */
export function Wrap({ children, style }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  return <View style={[{ width: '100%', maxWidth: SITE_WIDTH, alignSelf: 'center', paddingHorizontal: GUTTER }, style as ViewStyle]}>{children}</View>;
}

/** Up to 8 departments chosen in the admin ("Mostra in home"); the first 8 when none is chosen. */
export function homeDepartments(categories: CategoryRow[] | null | undefined): CategoryRow[] {
  const top = (categories ?? []).filter((c) => !c.parent_id);
  const chosen = top.filter((c) => c.show_on_home);
  return (chosen.length ? chosen : top).slice(0, 8);
}

/** react-native-web passes CSS transitions through; native ignores them. */
export const transition = (properties: string, ms = 220) =>
  ({ transitionProperty: properties, transitionDuration: `${ms}ms`, transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }) as object;

/** Pressable state on the web shop: react-native-web adds `hovered`. */
export type WebState = PressableStateCallbackType & { hovered?: boolean };
