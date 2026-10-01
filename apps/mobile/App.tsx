import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, SafeAreaView, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { MobileApiClient } from './src/services/api';
import { MobileStorage } from './src/services/storage';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('customer@proteinbowl.in');
  const [password, setPassword] = useState('Password123!');
  const [activeTab, setActiveTab] = useState<'home' | 'mess' | 'diets' | 'orders' | 'kds'>('home');
  const [loading, setLoading] = useState(false);

  // Home state
  const [products, setProducts] = useState<any[]>([]);
  const [messPlans, setMessPlans] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [kots, setKots] = useState<any[]>([]);

  // Kerala Mess state
  const [walletBalance, setWalletBalance] = useState<number>(450);

  useEffect(() => {
    fetchPublicData();
  }, []);

  const fetchPublicData = async () => {
    const prodRes = await MobileApiClient.request('/products');
    if (prodRes.success && prodRes.data) setProducts(prodRes.data);

    const messRes = await MobileApiClient.request('/mess/plans');
    if (messRes.success && messRes.data) setMessPlans(messRes.data);
  };

  const handleLogin = async () => {
    setLoading(true);
    const res = await MobileApiClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setLoading(false);

    if (res.success && res.data) {
      await MobileStorage.setItem('access_token', res.data.accessToken);
      setUser(res.data.user);
      Alert.alert('Success', `Welcome back, ${res.data.user.email}!`);
      fetchUserData();
    } else {
      Alert.alert('Login Failed', res.message || 'Invalid credentials');
    }
  };

  const fetchUserData = async () => {
    const ordersRes = await MobileApiClient.request('/orders/my-orders');
    if (ordersRes.success && ordersRes.data) setOrders(ordersRes.data);

    const kdsRes = await MobileApiClient.request('/kds/tickets');
    if (kdsRes.success && kdsRes.data) setKots(kdsRes.data);
  };

  const handlePauseMeal = async () => {
    setLoading(true);
    const res = await MobileApiClient.request('/mess/pause-meal', {
      method: 'POST',
      body: JSON.stringify({
        subscriptionId: 'sub-test-01',
        pauseDate: new Date().toISOString().split('T')[0],
        slot: 'LUNCH'
      })
    });
    setLoading(false);

    if (res.success && res.data) {
      setWalletBalance(res.data.newWalletBalance);
      Alert.alert('Meal Paused', 'Your meal has been paused and ₹85 refund credited to your wallet ledger!');
    } else {
      Alert.alert('Notice', res.message || 'Pause request processed');
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#090D16" />
        <View style={styles.authContainer}>
          <Text style={styles.brandTitle}>🥗 PROTEIN BOWL</Text>
          <Text style={styles.brandSubtitle}>Enterprise Food-Tech Platform Mobile</Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email..."
              placeholderTextColor="#64748B"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password..."
              placeholderTextColor="#64748B"
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#090D16" /> : <Text style={styles.primaryBtnText}>Sign In to Account</Text>}
            </TouchableOpacity>

            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>Demo Quick Logins:</Text>
              <TouchableOpacity onPress={() => { setEmail('customer@proteinbowl.in'); setPassword('Password123!'); }}>
                <Text style={styles.demoLink}>• Customer: customer@proteinbowl.in</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEmail('student@proteinbowl.in'); setPassword('Password123!'); }}>
                <Text style={styles.demoLink}>• Mess Student: student@proteinbowl.in</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEmail('chef.kochi@nutrifitkitchen.in'); setPassword('Password123!'); }}>
                <Text style={styles.demoLink}>• Kitchen Chef: chef.kochi@nutrifitkitchen.in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>PROTEIN BOWL</Text>
          <Text style={styles.headerUser}>{user.email} ({user.roles?.[0]})</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => setUser(null)}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'home' && (
          <View>
            <Text style={styles.sectionTitle}>🔥 Chef-Crafted Bowls & Store</Text>
            {products.map((item: any) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
                <Text style={styles.cardPrice}>₹{item.basePrice} • ⭐ {item.rating}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'mess' && (
          <View>
            <Text style={styles.sectionTitle}>🍛 Kerala Student Mess Portal</Text>
            <View style={styles.walletCard}>
              <Text style={styles.walletTitle}>Student Wallet Balance</Text>
              <Text style={styles.walletAmount}>₹{walletBalance.toFixed(2)}</Text>
              <Text style={styles.walletSub}>Atomic double-entry ledger enabled</Text>

              <TouchableOpacity style={styles.pauseBtn} onPress={handlePauseMeal}>
                <Text style={styles.pauseBtnText}>Pause Today's Lunch (+₹85 Wallet Credit)</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Active Mess Plans</Text>
            {messPlans.map((plan: any) => (
              <View key={plan.id} style={styles.card}>
                <Text style={styles.cardTitle}>{plan.name}</Text>
                <Text style={styles.cardDesc}>{plan.durationDays} Days • {plan.mealsPerDay} Meals Daily</Text>
                <Text style={styles.cardPrice}>₹{plan.basePrice}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'orders' && (
          <View>
            <Text style={styles.sectionTitle}>📦 My Orders & Live Tracking</Text>
            {orders.length === 0 ? (
              <Text style={styles.emptyText}>No past orders found.</Text>
            ) : (
              orders.map((ord: any) => (
                <View key={ord.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{ord.orderNumber}</Text>
                  <Text style={styles.cardDesc}>Status: {ord.status} • Total: ₹{ord.netAmount}</Text>
                  <Text style={styles.cardPrice}>Address: {ord.deliveryAddress}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'kds' && (
          <View>
            <Text style={styles.sectionTitle}>👨‍🍳 Chef KDS Station Queue</Text>
            {kots.length === 0 ? (
              <Text style={styles.emptyText}>No KOT tickets queued.</Text>
            ) : (
              kots.map((kot: any) => (
                <View key={kot.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{kot.kotNumber}</Text>
                  <Text style={styles.cardDesc}>Status: {kot.status} • Priority: {kot.priority}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
          <Text style={[styles.navIcon, activeTab === 'home' && styles.navActive]}>🏠 Menu</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('mess')}>
          <Text style={[styles.navIcon, activeTab === 'mess' && styles.navActive]}>🍛 Mess</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('orders')}>
          <Text style={[styles.navIcon, activeTab === 'orders' && styles.navActive]}>📦 Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('kds')}>
          <Text style={[styles.navIcon, activeTab === 'kds' && styles.navActive]}>👨‍🍳 KDS</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  brandTitle: { fontSize: 28, fontWeight: '900', color: '#10B981', textAlign: 'center' },
  brandSubtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 32 },
  formCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  label: { color: '#E2E8F0', marginBottom: 6, fontWeight: '600', fontSize: 13 },
  input: { backgroundColor: '#0F172A', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  primaryBtn: { backgroundColor: '#10B981', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#090D16', fontWeight: '800', fontSize: 15 },
  demoBox: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#334155' },
  demoTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  demoLink: { color: '#38BDF8', fontSize: 12, marginBottom: 4 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  headerBrand: { color: '#10B981', fontWeight: '900', fontSize: 18 },
  headerUser: { color: '#94A3B8', fontSize: 11 },
  logoutBtn: { backgroundColor: '#EF444422', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 12 },

  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 16 },
  card: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardDesc: { color: '#94A3B8', fontSize: 13, marginBottom: 8 },
  cardPrice: { color: '#10B981', fontWeight: '800', fontSize: 14 },
  emptyText: { color: '#64748B', fontStyle: 'italic' },

  walletCard: { backgroundColor: '#047857', padding: 20, borderRadius: 16, marginBottom: 16 },
  walletTitle: { color: '#A7F3D0', fontSize: 13, fontWeight: '700' },
  walletAmount: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginVertical: 4 },
  walletSub: { color: '#6EE7B7', fontSize: 11 },
  pauseBtn: { backgroundColor: '#090D16', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  pauseBtnText: { color: '#10B981', fontWeight: '800', fontSize: 13 },

  bottomNav: { flexDirection: 'row', backgroundColor: '#1E293B', borderTopWidth: 1, borderTopColor: '#334155', paddingVertical: 12 },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  navActive: { color: '#10B981' }
});
