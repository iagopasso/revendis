import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Revendis Mobile</Text>
      <Text style={styles.subtitle}>Stub inicial para fluxos de venda e estoque.</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f7f7',
    padding: 24
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1f2933',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#52616b',
    textAlign: 'center'
  }
});
