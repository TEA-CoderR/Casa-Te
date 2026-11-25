// What app code gets when it imports 'react-native' (metro.config.js redirects it here; this file and libraries
// get the real one): the same module, with Text and TextInput capped at 1.3× the system font size, so tickets,
// labels and the tab bar keep their shape when the phone's text is set very large (plan v3 L8).
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

export * from 'react-native';

export const MAX_FONT_SCALE = 1.3;

export function Text(props: TextProps & { ref?: React.Ref<RNText> }) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export function TextInput(props: TextInputProps & { ref?: React.Ref<RNTextInput> }) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}
// Static members (TextInput.State …) stay reachable.
Object.assign(TextInput, RNTextInput);
