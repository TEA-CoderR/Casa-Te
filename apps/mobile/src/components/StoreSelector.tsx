import { Pressable, Text, View } from 'react-native';
import { colors } from '@/config/theme';
import { useStores } from '@/lib/hooks';
import { usePreferences } from '@/store/preferences';

export function StoreSelector({ title = 'Il tuo negozio', filter }: { title?: string; filter?: 'pickup' | 'ships' }) {
  const { stores, selected } = useStores();
  const setStoreId = usePreferences((s) => s.setStoreId);
  const visible = stores.filter((s) => filter === 'pickup' ? s.pickup_enabled : filter === 'ships' ? s.ships_orders : true);
  return <View style={{ marginVertical: 12, gap: 8 }} accessibilityRole="radiogroup">
    <Text style={{ fontWeight: '700', color: colors.text }}>{title}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {visible.map((store) => {
        const on = selected?.id === store.id;
        return <Pressable key={store.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setStoreId(store.id)}
          style={{ paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, borderWidth: 1, borderRadius: 12, justifyContent: 'center',
            borderColor: colors.green, backgroundColor: on ? colors.green : colors.surface }}>
          <Text style={{ color: on ? '#fff' : colors.green, fontWeight: '600', fontSize: 13 }}>{store.name.replace(/^CASA & TE\s*/, '')}</Text>
          {!!store.address && <Text style={{ color: on ? '#E6EFE0' : colors.muted, fontSize: 10, marginTop: 2 }}>{store.address}</Text>}
        </Pressable>;
      })}
    </View>
    {!!selected?.opening_hours && <Text style={{ color: colors.muted, fontSize: 11 }}>Orari: {selected.opening_hours}</Text>}
  </View>;
}
