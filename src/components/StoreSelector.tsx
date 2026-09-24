import { Pressable, Text, View } from 'react-native';
import { stores } from '@/config/stores';
import { colors } from '@/config/theme';
import { usePreferences } from '@/store/preferences';

export function StoreSelector() {
  const selected = usePreferences((s) => s.store);
  const setStore = usePreferences((s) => s.setStore);
  return <View style={{ marginVertical: 12, gap: 8 }}>
    <Text style={{ fontWeight: '700' }}>Negozio preferito</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {stores.map((store) => <Pressable key={store} accessibilityRole="radio"
        accessibilityState={{ checked: selected === store }} aria-checked={selected === store} onPress={() => setStore(store)}
        style={{ padding: 12, minHeight: 44, borderWidth: 1, borderRadius: 10,
          borderColor: colors.green, backgroundColor: selected === store ? colors.green : colors.surface }}>
        <Text style={{ color: selected === store ? '#fff' : colors.green }}>{store}</Text>
      </Pressable>)}
    </View>
  </View>;
}

