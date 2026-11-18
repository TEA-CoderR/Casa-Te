import { useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { RevealContext, type Reveal } from './Reveal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/config/theme';

type Props = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  footer?: ReactNode;
  stack?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Max content width on the web shop (desktop). */
  maxWidth?: number;
  /** Full-width content after the page column (the desktop footer). */
  after?: ReactNode;
  /** Horizontal page padding the `after` content bleeds through (it runs edge to edge). */
  bleed?: number;
  /** Fixed band above the scrolling content (the phone's green brand header); it handles the top inset. */
  header?: ReactNode;
  /** Page ground behind the content (phone pages use the light ground under white cards). */
  ground?: string;
  /**
   * Full-bleed band at the top of the scrolling content (the awning with a card hanging from it). It scrolls
   * with the page, so cards can overlap it; `header` then only paints the status bar area.
   */
  top?: ReactNode;
  /** Style of the column that holds the children (padding and gaps when `top` needs a bleed-free scroll content). */
  bodyStyle?: ViewStyle;
}>;

/** True while the user types (keyboard up): the page's footer steps aside so it never covers the field. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
        && !['checkbox', 'radio', 'button', 'submit'].includes((t as HTMLInputElement).type);
      const on = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
      const off = (e: FocusEvent) => { if (isField(e.target) && !isField(e.relatedTarget)) setTyping(false); };
      document.addEventListener('focusin', on); document.addEventListener('focusout', off);
      return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
    }
    const a = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return typing;
}

export function Screen({ children, contentContainerStyle, footer, stack = false, refreshing, onRefresh, maxWidth = 1120, after, bleed = 20, header, ground, top, bodyStyle }: Props) {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const typing = useTyping();
  // Scrolls so the node is in view: centred for a field (after the keyboard has come up), at the top for an opened section.
  const reveal = useCallback<Reveal>((node, where = 'center') => {
    if (!node) return;
    setTimeout(() => {
      const target = node as { scrollIntoView?: (o: object) => void; measureLayout?: (rel: unknown, ok: (x: number, y: number) => void, fail: () => void) => void };
      if (Platform.OS === 'web' && target.scrollIntoView) { target.scrollIntoView({ block: where, behavior: 'smooth' }); return; }
      target.measureLayout?.(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, where === 'start' ? y - 12 : y - 160), animated: true }), () => {});
    }, where === 'center' ? 320 : 60);
  }, []);
  return <RevealContext.Provider value={reveal}><SafeAreaView style={[styles.safe, ground ? { backgroundColor: ground } : null]} edges={stack ? ['bottom'] : header ? [] : ['top']}>
    {header}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={stack ? 88 : 0}>
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, contentContainerStyle]}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        // Web: react-native-web blurs the focused field on ANY scroll with "on-drag" (also when the page scrolls the field into view).
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.green} /> : undefined}>
        <View ref={content} collapsable={false}>
          {top}
          <View style={[{ width: '100%', maxWidth, alignSelf: 'center' }, bodyStyle]}>{children}</View>
          {after && <View style={{ marginHorizontal: -bleed, marginBottom: -40 }}>{after}</View>}
        </View>
      </ScrollView>
      {footer && <View style={[styles.footer, typing && { display: 'none' }]}><View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>{footer}</View></View>}
    </KeyboardAvoidingView>
  </SafeAreaView></RevealContext.Provider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  // Phone pages: a white sheet with rounded top corners over the ivory ground (design F).
  footer: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#18201A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
});
