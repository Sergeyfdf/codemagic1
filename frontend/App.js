import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Platform, ImageBackground, Image, ScrollView, TouchableOpacity, Modal, Animated, TextInput, KeyboardAvoidingView, Dimensions, RefreshControl, Linking } from 'react-native';
import Svg, { Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

Notifications.setNotificationCategoryAsync('DEBT_CATEGORY', [
  {
    identifier: 'CONFIRM_DEBT',
    buttonTitle: 'Отметить',
    options: {
      opensAppToForeground: true,
    },
  },
]);

const API_URL = 'http://100.127.18.63:8000';

import NixieDisplay from './NixieDisplay';

const SwipeRow = ({ onDelete, onCancel, children, style }) => {
  const scrollRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const hasCancel = !!onCancel;
  const initialOffset = hasCancel ? 80 : 0;
  const snapOffsets = hasCancel ? [0, 80, 160] : [0, 80];

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      contentOffset={{ x: initialOffset, y: 0 }}
      snapToOffsets={snapOffsets}
      snapToEnd={false}
      decelerationRate="fast"
      directionalLockEnabled={true}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={style}
    >
      {/* Левая кнопка — Отменить (свайп вправо) */}
      {hasCancel && (
        <TouchableOpacity
          style={{
            width: 70,
            marginRight: 10,
            backgroundColor: 'rgba(245, 158, 11, 0.9)',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 12,
          }}
          onPress={() => {
            scrollRef.current?.scrollTo({ x: initialOffset, animated: true });
            onCancel && onCancel();
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-undo-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Контент */}
      <View style={{ width: containerWidth || 300 }}>
        {children}
      </View>

      {/* Правая кнопка — Удалить (свайп влево) */}
      <TouchableOpacity
        style={{
          width: 70,
          marginLeft: 10,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 12,
        }}
        onPress={() => {
          scrollRef.current?.scrollTo({ x: initialOffset, animated: true });
          onDelete && onDelete();
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="trash-outline" size={24} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );
};

export default function App() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [historyType, setHistoryType] = useState('card');
  const [activeScreen, setActiveScreen] = useState('main');
  const [cashBalance, setCashBalance] = useState(0);
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const [cashModalType, setCashModalType] = useState('add');
  const [cashInputValue, setCashInputValue] = useState('');
  const [cashReason, setCashReason] = useState('');
  const screenAnim = useRef(new Animated.Value(0)).current; // Для второго меню
  const screenAnim3 = useRef(new Animated.Value(0)).current; // Для третьего меню
  const horizontalScrollRef = useRef(null); // Ссылка на скролл кошельков
  const [wallets, setWallets] = useState([]);
  const [activeWalletIndex, setActiveWalletIndex] = useState(0);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletCurrency, setNewWalletCurrency] = useState('UAH');
  const [newWalletIsGoal, setNewWalletIsGoal] = useState(false);
  const [newWalletTarget, setNewWalletTarget] = useState('');
  const [newWalletPhoto, setNewWalletPhoto] = useState(null);
  const screenWidth = Dimensions.get('window').width;

  const [menu3Tab, setMenu3Tab] = useState('wishlist');
  const [menu3Data, setMenu3Data] = useState({ folders: [], subscriptions: [], debts: [], goals: [] });
  const [expandedFolderId, setExpandedFolderId] = useState(null);

  const [isCardSelectionVisible, setIsCardSelectionVisible] = useState(false);
  const [activeCardDesignIndex, setActiveCardDesignIndex] = useState(0);
  const cardDesigns = [
    require('./assets/card1.png'),
    require('./assets/card2.png'),
    require('./assets/card3.png')
  ];

  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingItem, setMovingItem] = useState(null);

  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  const [isAddingSub, setIsAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubAmount, setNewSubAmount] = useState('');
  const [newSubDate, setNewSubDate] = useState('');

  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [newDebtPerson, setNewDebtPerson] = useState('');
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [newDebtType, setNewDebtType] = useState('owed_to_me'); // 'owed_to_me' or 'i_owe'
  const [newDebtDeadline, setNewDebtDeadline] = useState('');
  const [newDebtIsRecurring, setNewDebtIsRecurring] = useState(false);
  const [newDebtRecurringPeriod, setNewDebtRecurringPeriod] = useState('Месяц');
  const [summaryMonthOffset, setSummaryMonthOffset] = useState(0);
  const [isSummaryListVisible, setIsSummaryListVisible] = useState(false);
  const [debtToProcess, setDebtToProcess] = useState(null);

  const [showDebugTab, setShowDebugTab] = useState(false);
  const [debugMerchant, setDebugMerchant] = useState('');
  const [debugDay, setDebugDay] = useState('');
  const [debugMonth, setDebugMonth] = useState('');
  const [debugYear, setDebugYear] = useState('');
  const [debugTime, setDebugTime] = useState('');
  const [debugAmount, setDebugAmount] = useState('');
  const [debugBalance, setDebugBalance] = useState('');
  const debugMonthRef = useRef(null);
  const debugYearRef = useRef(null);
  const debugTimeRef = useRef(null);
  const debugAmountRef = useRef(null);

  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalAmount, setNewGoalAmount] = useState('');

  const [goalProgressId, setGoalProgressId] = useState(null);
  const [goalProgressAmount, setGoalProgressAmount] = useState('');

  const [isReady, setIsReady] = useState(false);
  const lastSubsRef = useRef('');

  useEffect(() => {
    // Unblock first render
    requestAnimationFrame(() => {
      setIsReady(true);
    });
  }, []);

  // 3 animated values - одна на каждый блок главного экрана
  const elem0 = useRef(new Animated.Value(0)).current; // баланс
  const elem1 = useRef(new Animated.Value(0)).current; // карточка
  const elem2 = useRef(new Animated.Value(0)).current; // транзакции
  // 0 = на месте, -1 = улетел вверх, 1 = прилетел снизу

  const makeElemStyle = (anim) => ({
    opacity: anim.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [-1, 0, 1], outputRange: [-60, 0, 60] }) }],
  });

  const switchScreen = (target) => {
    if (target === activeScreen) {
      target = 'main';
    }

    const elems = [elem0, elem1, elem2];

    if (target === 'menu2' || target === 'menu3') {
      const animTarget = target === 'menu2' ? screenAnim : screenAnim3;
      const animOut = target === 'menu2' ? screenAnim3 : screenAnim;

      if (activeScreen === 'menu2' || activeScreen === 'menu3') {
        setActiveScreen(target);
        Animated.parallel([
          Animated.timing(animOut, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(animTarget, { toValue: 1, duration: 250, useNativeDriver: true })
        ]).start();
      } else {
        Animated.stagger(60, elems.map(e =>
          Animated.timing(e, { toValue: -1, duration: 200, useNativeDriver: true })
        )).start(() => {
          setActiveScreen(target);
          Animated.timing(animTarget, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        });
      }
    } else {
      const activeAnim = activeScreen === 'menu2' ? screenAnim : (activeScreen === 'menu3' ? screenAnim3 : null);
      if (activeAnim) {
        Animated.timing(activeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setActiveScreen('main');
          elems.forEach(e => e.setValue(1));
          Animated.stagger(60, elems.map(e =>
            Animated.timing(e, { toValue: 0, duration: 220, useNativeDriver: true })
          )).start();
        });
      }
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedIndex = await AsyncStorage.getItem('cardDesignIndex');
        if (savedIndex !== null) {
          setActiveCardDesignIndex(parseInt(savedIndex, 10));
        }
      } catch (e) {
        console.log('Error loading card index', e);
      }
    };
    loadSettings();

    // Задержка SplashScreen на 3 секунды
    setTimeout(async () => {
      await SplashScreen.hideAsync();
    }, 3000);
  }, []);

  const updateCardDesignIndex = async (index) => {
    setActiveCardDesignIndex(index);
    setIsCardSelectionVisible(false);
    try {
      await AsyncStorage.setItem('cardDesignIndex', index.toString());
    } catch (e) {
      console.log('Error saving card index', e);
    }
  };

  const fetchBalance = async () => {
    try {
      const response = await fetch(`${API_URL}/balance`, {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });
      const data = await response.json();
      setBalance(data.balance);
      if (data.cash_balance !== undefined) setCashBalance(data.cash_balance);
      if (data.wallets) setWallets(data.wallets);
      setTransactions(data.transactions || []);
    } catch (error) {
      console.error('Ошибка загрузки баланса:', error);
    }
  };

  const deleteTransaction = async (id) => {
    try {
      await fetch(`${API_URL}/transaction/${id}`, { method: 'DELETE' });
      fetchBalance();
    } catch (error) {
      console.error('Ошибка удаления:', error);
    }
  };

  const cancelTransaction = async (id) => {
    try {
      await fetch(`${API_URL}/transaction/${id}/cancel`, { method: 'DELETE' });
      fetchBalance();
    } catch (error) {
      console.error('Ошибка отмены:', error);
    }
  };

  const updateCashBalance = async (newVal, diff, reason) => {
    const activeWallet = wallets[activeWalletIndex] || (wallets.length > 0 ? wallets[0] : null);
    const wallet_id = activeWallet ? activeWallet.id : 1;
    try {
      await fetch(`${API_URL}/update_cash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: newVal, diff, reason, wallet_id })
      });
      fetchBalance();
    } catch (error) {
      console.error('Ошибка обновления наличных:', error);
    }
  };

  const createWallet = async () => {
    if (!newWalletName) return;
    try {
      await fetch(`${API_URL}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWalletName,
          currency: newWalletCurrency,
          is_goal: newWalletIsGoal ? 1 : 0,
          target_amount: parseFloat(newWalletTarget.replace(',', '.')) || 0,
          photo_uri: newWalletPhoto
        })
      });
      setNewWalletName('');
      setNewWalletTarget('');
      setNewWalletPhoto(null);
      setNewWalletIsGoal(false);
      fetchBalance();
      switchScreen('main');
    } catch (error) {
      console.error('Ошибка создания кошелька:', error);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      setNewWalletPhoto(result.assets[0].uri);
    }
  };

  const deleteWallet = async (id) => {
    if (id === 1) return;
    try {
      const response = await fetch(`${API_URL}/wallet/${id}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (response.ok) {
        horizontalScrollRef.current?.scrollTo({ x: 0, animated: true });
        fetchBalance();
        setActiveWalletIndex(0);
      } else {
        console.error('Ошибка удаления кошелька:', await response.text());
      }
    } catch (error) {
      console.error('Ошибка сети при удалении кошелька:', error);
    }
  };

  const isDebtAlreadyPaidThisPeriod = (debt) => {
    if (!debt.is_recurring || !debt.last_paid_date) return false;
    const lastPaid = new Date(debt.last_paid_date);
    const now = new Date();
    if (debt.recurring_period === 'День') {
      return lastPaid.toDateString() === now.toDateString();
    } else if (debt.recurring_period === 'Неделя') {
      const diff = now - lastPaid;
      return diff < 7 * 24 * 60 * 60 * 1000 && lastPaid.getDay() <= now.getDay();
    } else if (debt.recurring_period === 'Месяц') {
      return lastPaid.getMonth() === now.getMonth() && lastPaid.getFullYear() === now.getFullYear();
    }
    return false;
  };

  const getNextPeriodText = (debt) => {
    if (!debt.is_recurring) return '';
    const now = new Date();
    let target = new Date();

    if (debt.recurring_period === 'День') {
      target.setDate(target.getDate() + 1);
    } else if (debt.recurring_period === 'Неделя') {
      const day = target.getDay();
      const diff = day === 0 ? 1 : 8 - day;
      target.setDate(target.getDate() + diff);
    } else if (debt.recurring_period === 'Месяц') {
      target.setMonth(target.getMonth() + 1);
      target.setDate(1);
    } else {
      return debt.recurring_period;
    }

    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

    const dStr = target.getDate().toString().padStart(2, '0');
    const mStr = (target.getMonth() + 1).toString().padStart(2, '0');
    const yStr = target.getFullYear();
    const dateStr = `${dStr}.${mStr}.${yStr}`;

    return `Осталось ${diffDays} дн. (до ${dateStr})`;
  };

  const handleDebtTransaction = (debt) => {
    setDebtToProcess(debt);
  };

  const processDebtWithWallet = async (debt, wallet) => {
    try {
      const response = await fetch(`${API_URL}/balance`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await response.json();

      let currentBal = 0;
      let targetWalletId = wallet.id;
      if (data.wallets && data.wallets.length > 0) {
        const w = data.wallets.find(w => w.id === targetWalletId);
        if (w) currentBal = w.balance;
      } else {
        currentBal = data.cash_balance; // fallback for very old DB
      }

      const diff = debt.type === 'owed_to_me' ? debt.amount : -debt.amount;
      const newBal = currentBal + diff;
      const reason = debt.type === 'owed_to_me' ? `От ${debt.person}` : `Для ${debt.person}`;

      await fetch(`${API_URL}/update_cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: newBal,
          diff: diff,
          reason: reason,
          wallet_id: targetWalletId
        })
      });

      await fetch(`${API_URL}/debts/${debt.id}/pay`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_paid_date: new Date().toISOString() })
      });

      fetchBalance();
      fetchMenu3Data();
      setDebtToProcess(null);
    } catch (e) {
      console.error('Error processing debt transaction', e);
    }
  };

  const scheduleAllNotifications = async (subscriptions, debts) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

      for (const sub of subscriptions) {
        if (!sub.next_payment_date) continue;

        const parts = sub.next_payment_date.split('.');
        if (parts.length !== 3) continue;

        let year = parts[2];
        if (year.length === 2) year = '20' + year;

        // Schedule at 10:00 AM local time
        const paymentDate = new Date(`${year}-${parts[1]}-${parts[0]}T10:00:00`);
        if (isNaN(paymentDate.getTime())) continue;

        const now = new Date();

        // 3 days before
        const threeDaysBefore = new Date(paymentDate);
        threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
        if (threeDaysBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `💳 Скоро оплата: ${sub.name}`,
              body: `Через 3 дня спишется ${sub.amount}. Не забудьте пополнить счет!`,
            },
            trigger: { type: 'date', date: threeDaysBefore, channelId: 'default' },
          });
        }

        // 1 day before
        const oneDayBefore = new Date(paymentDate);
        oneDayBefore.setDate(oneDayBefore.getDate() - 1);
        if (oneDayBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `⚠️ Завтра оплата: ${sub.name}`,
              body: `Завтра спишется ${sub.amount}!`,
            },
            trigger: { type: 'date', date: oneDayBefore, channelId: 'default' },
          });
        }

        // On the day
        if (paymentDate > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `💸 Сегодня оплата: ${sub.name}`,
              body: `Сегодня будет списано ${sub.amount}.`,
            },
            trigger: { type: 'date', date: paymentDate, channelId: 'default' },
          });
        }
      }

      for (const debt of debts) {
        if (debt.is_recurring && debt.recurring_period) {
          const isMeOwed = debt.type === 'owed_to_me';
          const title = isMeOwed ? 'Возврат долга' : 'Оплата долга';
          const body = isMeOwed
            ? `Вы получили ${debt.amount} ₴ от ${debt.person}?`
            : `Вы отдали ${debt.amount} ₴ для ${debt.person}?`;

          let trigger = null;
          if (debt.recurring_period === 'День') {
            trigger = { type: 'daily', hour: 10, minute: 0, channelId: 'default' };
          } else if (debt.recurring_period === 'Неделя') {
            trigger = { type: 'weekly', weekday: 2, hour: 10, minute: 0, channelId: 'default' };
          } else if (debt.recurring_period === 'Месяц') {
            trigger = { type: 'monthly', day: 1, hour: 10, minute: 0, channelId: 'default' };
          }

          if (trigger) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                categoryIdentifier: 'DEBT_CATEGORY',
                data: { debt }
              },
              trigger,
            });
          }
        }
      }
    } catch (e) {
      console.log('Error scheduling notifications', e);
    }
  };

  const fetchMenu3Data = async () => {
    try {
      const response = await fetch(`${API_URL}/menu3_data`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await response.json();
      if (data.status === 'success') {
        setMenu3Data({
          folders: data.folders || [],
          subscriptions: data.subscriptions || [],
          debts: data.debts || [],
          goals: data.goals || []
        });

        const notifsString = JSON.stringify({ s: data.subscriptions, d: data.debts });
        if (lastSubsRef.current !== notifsString) {
          lastSubsRef.current = notifsString;
          scheduleAllNotifications(data.subscriptions, data.debts);
        }
      }
    } catch (e) {
      console.error('Ошибка загрузки menu3_data:', e);
    }
  };

  const submitDebugTransaction = async () => {
    try {
      const formattedTime = `${debugDay}.${debugMonth}.${debugYear.length === 4 ? debugYear.substring(2) : debugYear} ${debugTime}`;
      await fetch(`${API_URL}/manual_tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: formattedTime,
          amount: parseFloat(debugAmount.replace(',', '.')) || 0,
          merchant: debugMerchant,
          balance: parseFloat(debugBalance.replace(',', '.')) || 0
        })
      });
      setDebugMerchant(''); setDebugDay(''); setDebugMonth(''); setDebugYear(''); setDebugTime(''); setDebugAmount(''); setDebugBalance('');
      setMenu3Tab('summary');
      setShowDebugTab(false);
    } catch (e) {
      console.error('Ошибка дебаг транзакции:', e);
    }
  };

  const createFolder = async () => {
    if (!newFolderName) return;
    await fetch(`${API_URL}/wishlist/folder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName, parent_id: expandedFolderId })
    });
    setNewFolderName('');
    setIsAddingFolder(false);
    fetchMenu3Data();
  };
  const deleteFolder = async (id) => {
    await fetch(`${API_URL}/wishlist/folder/${id}`, { method: 'DELETE' });
    fetchMenu3Data();
  };
  const createItem = async () => {
    if (!newItemTitle || !expandedFolderId) return;
    await fetch(`${API_URL}/wishlist/item`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: expandedFolderId, title: newItemTitle, url: newItemUrl, price: parseFloat(newItemPrice) || 0 })
    });
    setNewItemTitle(''); setNewItemUrl(''); setNewItemPrice('');
    setIsAddingItem(false);
    fetchMenu3Data();
  };
  const deleteItem = async (id) => {
    await fetch(`${API_URL}/wishlist/item/${id}`, { method: 'DELETE' });
    fetchMenu3Data();
  };

  const moveItemTo = async (targetFolderId) => {
    if (!movingItem) return;
    try {
      if (movingItem.type === 'item') {
        await fetch(`${API_URL}/wishlist/item/${movingItem.id}/move`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_folder_id: targetFolderId })
        });
      } else if (movingItem.type === 'folder') {
        if (targetFolderId === movingItem.id) {
          setMovingItem(null);
          return;
        }
        await fetch(`${API_URL}/wishlist/folder/${movingItem.id}/move`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_parent_id: targetFolderId })
        });
      }
      setMovingItem(null);
      fetchMenu3Data();
    } catch (e) {
      console.error('Ошибка перемещения:', e);
    }
  };

  const getFolderTotal = (folderId) => {
    const folder = menu3Data.folders.find(f => f.id === folderId);
    if (!folder) return 0;

    let total = 0;
    if (folder.items) {
      total += folder.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
    }

    return total;
  };
  const handleDateChange = (text) => {
    let val = text.replace(/[^0-9]/g, '');
    if (val.length > 2) val = val.substring(0, 2) + '.' + val.substring(2);
    if (val.length > 5) val = val.substring(0, 5) + '.' + val.substring(5);
    setNewSubDate(val.substring(0, 10));
  };

  const handleDebtDateChange = (text) => {
    let val = text.replace(/[^0-9]/g, '');
    if (val.length > 2) val = val.substring(0, 2) + '.' + val.substring(2);
    if (val.length > 5) val = val.substring(0, 5) + '.' + val.substring(5);
    setNewDebtDeadline(val.substring(0, 10));
  };

  const createSub = async () => {
    if (!newSubName || !newSubAmount || !newSubDate) return;
    const amountVal = parseFloat(newSubAmount.replace(',', '.')) || 0;
    await fetch(`${API_URL}/subscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSubName, amount: amountVal, next_payment_date: newSubDate })
    });
    setNewSubName(''); setNewSubAmount(''); setNewSubDate('');
    setIsAddingSub(false);
    fetchMenu3Data();
  };
  const deleteSub = async (id) => {
    await fetch(`${API_URL}/subscription/${id}`, { method: 'DELETE' });
    fetchMenu3Data();
  };

  const createDebt = async () => {
    if (!newDebtPerson || !newDebtAmount) return;
    const amountVal = parseFloat(newDebtAmount.replace(',', '.')) || 0;
    await fetch(`${API_URL}/debts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person: newDebtPerson, amount: amountVal, type: newDebtType, deadline: newDebtDeadline, is_recurring: newDebtIsRecurring ? 1 : 0, recurring_period: newDebtRecurringPeriod })
    });
    setNewDebtPerson(''); setNewDebtAmount(''); setNewDebtDeadline('');
    setNewDebtIsRecurring(false); setNewDebtRecurringPeriod('Месяц');
    setIsAddingDebt(false);
    fetchMenu3Data();
  };
  const deleteDebt = async (id) => {
    await fetch(`${API_URL}/debts/${id}`, { method: 'DELETE' });
    fetchMenu3Data();
  };

  const createGoal = async () => {
    if (!newGoalName || !newGoalAmount) return;
    const amountVal = parseFloat(newGoalAmount.replace(',', '.')) || 0;
    await fetch(`${API_URL}/goals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGoalName, target_amount: amountVal })
    });
    setNewGoalName(''); setNewGoalAmount('');
    setIsAddingGoal(false);
    fetchMenu3Data();
  };
  const addGoalProgress = async (id, amount) => {
    if (!amount) return;
    const amountVal = parseFloat(amount.replace(',', '.')) || 0;
    await fetch(`${API_URL}/goals/${id}/add`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountVal })
    });
    setGoalProgressId(null);
    setGoalProgressAmount('');
    fetchMenu3Data();
  };
  const deleteGoal = async (id) => {
    await fetch(`${API_URL}/goals/${id}`, { method: 'DELETE' });
    fetchMenu3Data();
  };

  const getDaysLeftText = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('.');
    let target;
    if (parts.length === 3) {
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      target = new Date(`${year}-${parts[1]}-${parts[0]}`);
    } else {
      target = new Date(dateStr);
    }
    if (isNaN(target.getTime())) return '';
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Просрочено';
    if (diffDays === 0) return 'Сегодня!';
    if (diffDays <= 3) return `Скоро оплата (${diffDays} дн.)`;
    return `Через ${diffDays} дн.`;
  };

  useEffect(() => {
    if (!isReady) return;

    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
      }
    };
    requestPermissions();

    fetchBalance();
    fetchMenu3Data();
    const interval = setInterval(() => { fetchBalance(); fetchMenu3Data(); }, 10000);

    let ws;
    let reconnectTimer;
    const connectWS = () => {
      const wsUrl = API_URL.replace('http', 'ws') + '/ws';
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        if (e.data === 'update') {
          fetchBalance();
          fetchMenu3Data();
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWS, 5000);
      };
    };
    connectWS();

    const responseListener = Notifications.addNotificationResponseReceivedListener(async response => {
      if (response.actionIdentifier === 'CONFIRM_DEBT' || response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        const data = response.notification.request.content.data;
        if (data && data.debt) {
          handleDebtTransaction(data.debt);
        }
      }
    });

    return () => {
      clearInterval(interval);
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, [isReady]);

  const formatBalance = (amount) => {
    if (amount === null || amount === undefined) return '0.00';
    return new Intl.NumberFormat('ua-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getCurrencySymbol = (currency) => {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'CNY': return '¥';
      case 'UAH':
      default: return '₴';
    }
  };

  const formattedBalance = `${formatBalance(balance)} ₴`;
  const activeWallet = wallets[activeWalletIndex] || (wallets.length > 0 ? wallets[0] : null);
  const currentCashBalance = activeWallet ? activeWallet.balance : cashBalance;
  const formattedCash = `${formatBalance(currentCashBalance)} ${activeWallet ? activeWallet.currency : '₴'}`;

  const cardTransactions = transactions.filter(tx => tx.raw !== 'Операция с наличными');
  const cashTransactions = transactions.filter(tx => tx.raw === 'Операция с наличными' && (!activeWallet || tx.wallet_id === activeWallet.id));
  const displayTransactions = historyType === 'card' ? cardTransactions : cashTransactions;

  const onLayoutRootView = useCallback(async () => {
    if (isReady) {
      await SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ImageBackground
        source={require('./assets/background.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* --- MAIN SCREEN --- */}
        <Animated.View
          style={[styles.overlay, { opacity: activeScreen === 'menu2' ? 0 : 1 }]}
          pointerEvents={activeScreen === 'menu2' ? 'none' : 'auto'}
        >
          <StatusBar style="light" />

          {/* Top Arrow Buttons (Left: Menu2, Right: Menu3) */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={() => switchScreen('menu2')}>
              <Image source={require('./assets/menu_icon.png')} style={styles.menuIcon} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => switchScreen('menu3')}>
              <Image source={require('./assets/menu_icon.png')} style={styles.menuIcon} />
            </TouchableOpacity>
          </View>

          <View style={styles.container}>

            {/* Liquid Glass TEXT (Balance) */}
            <Animated.View style={[styles.textContainer, makeElemStyle(elem0)]}>

              <Text style={[styles.balanceText, styles.shadowLayer]}>
                {formattedBalance}
              </Text>

              {Platform.OS === 'web' ? (
                <Text style={[styles.balanceText, styles.webLiquidGlass]}>
                  {formattedBalance}
                </Text>
              ) : (
                <Svg height="100" width="100%" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <LinearGradient id="glassGradient" x1="0" y1="0" x2="0" y2="100%">
                      <Stop offset="0%" stopColor="rgba(255,255,255,1)" />
                      <Stop offset="40%" stopColor="rgba(255,255,255,0.1)" />
                      <Stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
                    </LinearGradient>
                  </Defs>
                  <SvgText
                    fill="url(#glassGradient)"
                    fontSize="58"
                    fontWeight="800"
                    fontFamily={Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium'}
                    letterSpacing="-1"
                    x="50%"
                    y="90%"
                    textAnchor="middle"
                  >
                    {formattedBalance}
                  </SvgText>
                </Svg>
              )}

              <Text style={[styles.balanceText, styles.innerHighlight]}>
                {formattedBalance}
              </Text>

            </Animated.View>

            {/* Standard Flat Card */}
            <Animated.View style={[styles.cardShadow, makeElemStyle(elem1)]}>
              <TouchableOpacity activeOpacity={0.9} style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }} onPress={() => setIsCardSelectionVisible(true)}>
                <Image
                  source={cardDesigns[activeCardDesignIndex]}
                  style={styles.card}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </Animated.View>

            {/* Recent Transactions Snippet */}
            <Animated.View style={[makeElemStyle(elem2), { width: '100%', alignItems: 'center' }]}>
              <TouchableOpacity
                style={styles.transactionsContainer}
                activeOpacity={0.8}
                onPress={() => { setHistoryType('card'); setIsHistoryVisible(true); }}
              >
                <View style={styles.transactionsHeader}>
                  <Text style={styles.transactionsTitle}>Последние операции</Text>
                  <Text style={styles.seeAllText}>Все</Text>
                </View>

                <View style={styles.transactionsList}>
                  {cardTransactions.length === 0 ? (
                    <Text style={styles.noTransactionsText}>Нет транзакций</Text>
                  ) : (
                    cardTransactions.slice(0, 3).map((tx, index) => (
                      <View key={tx.id || index} style={[styles.transactionItem, index === 2 && { borderBottomWidth: 0 }]}>
                        <View style={styles.txLeft}>
                          <Text style={styles.txMerchant}>{tx.merchant}</Text>
                          <Text style={styles.txTime}>{tx.time}</Text>
                        </View>
                        <Text style={[styles.txAmount, tx.amount > 0 && { color: '#4ade80' }]}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount} ₴
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>

          </View>
        </Animated.View>

        {/* Card Selection Modal */}
        <Modal visible={isCardSelectionVisible} transparent={true} animationType="fade" onRequestClose={() => setIsCardSelectionVisible(false)}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setIsCardSelectionVisible(false)} />

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '600', marginBottom: 30 }}>Выберите карту</Text>

              <View style={{ height: screenWidth * 0.85 * 0.63 + 40 }}>
                <ScrollView
                  horizontal
                  pagingEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ alignItems: 'center', paddingHorizontal: screenWidth * 0.075 }}
                  snapToInterval={screenWidth * 0.85 + 20}
                  decelerationRate="fast"
                >
                  {cardDesigns.map((design, index) => (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.9}
                      onPress={() => updateCardDesignIndex(index)}
                      style={{
                        width: screenWidth * 0.85,
                        height: (screenWidth * 0.85) * 0.63,
                        marginHorizontal: 10,
                        borderRadius: 24,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.5,
                        shadowRadius: 15,
                        elevation: 10,
                        backgroundColor: 'rgba(0,0,0,0.1)'
                      }}
                    >
                      <Image
                        source={design}
                        style={{ width: '100%', height: '100%', borderRadius: 24 }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <TouchableOpacity style={{ marginTop: 40, padding: 15 }} onPress={() => setIsCardSelectionVisible(false)}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Modal>

        {/* Full History Modal */}
        <Modal
          visible={isHistoryVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsHistoryVisible(false)}
        >
          <BlurView intensity={70} tint="dark" style={styles.modalOverlay}>
            <View style={styles.modalContent}>

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>История операций</Text>
                <TouchableOpacity onPress={() => setIsHistoryVisible(false)}>
                  <Text style={styles.closeBtnText}>Закрыть</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {displayTransactions.length === 0 ? (
                  <Text style={styles.noTransactionsText}>Нет транзакций</Text>
                ) : (
                  displayTransactions.map((tx, index) => (
                    <SwipeRow
                      key={tx.id || index}
                      onDelete={() => deleteTransaction(tx.id)}
                      onCancel={() => cancelTransaction(tx.id)}
                    >
                      <View style={styles.transactionItem}>
                        <View style={styles.txLeft}>
                          <Text style={styles.txMerchant}>
                            {historyType === 'cash' ? tx.merchant.replace('Наличные: ', '') : tx.merchant}
                          </Text>
                          <Text style={styles.txTime}>{tx.time}</Text>
                        </View>
                        <Text style={[styles.txAmount, tx.amount > 0 && { color: '#4ade80' }]}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount} {historyType === 'card' ? '₴' : getCurrencySymbol(activeWallet?.currency)}
                        </Text>
                      </View>
                    </SwipeRow>
                  ))
                )}
              </ScrollView>

            </View>
          </BlurView>
        </Modal>

        {/* Cash Input Modal */}
        <Modal
          visible={cashModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setCashModalVisible(false)}
        >
          <BlurView intensity={70} tint="dark" style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%', alignItems: 'center' }}
            >
              <View style={styles.inputModalContent}>
                <Text style={styles.inputModalTitle}>
                  {cashModalType === 'add' ? 'Добавить наличные' : 'Потратить наличные'}
                </Text>

                <TextInput
                  style={styles.cashInput}
                  keyboardType="numeric"
                  value={cashInputValue}
                  onChangeText={setCashInputValue}
                  placeholder={`Сумма (${getCurrencySymbol(activeWallet?.currency)})`}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoFocus={true}
                />

                <TextInput
                  style={[styles.cashInput, { fontSize: 18, marginBottom: 24 }]}
                  value={cashReason}
                  onChangeText={setCashReason}
                  placeholder="Причина (по желанию)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                <View style={styles.inputModalButtons}>
                  <TouchableOpacity style={styles.inputModalBtnCancel} onPress={() => {
                    setCashModalVisible(false);
                    setCashInputValue('');
                    setCashReason('');
                  }}>
                    <Text style={styles.inputModalBtnText}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.inputModalBtnSubmit, cashModalType === 'add' ? styles.btnGreen : styles.btnRed]} onPress={() => {
                    const val = parseFloat(cashInputValue) || 0;
                    if (val > 0) {
                      const diff = cashModalType === 'add' ? val : -val;
                      const newBal = currentCashBalance + diff;

                      // Update active wallet locally
                      setWallets(ws => {
                        const nw = [...ws];
                        if (nw[activeWalletIndex]) nw[activeWalletIndex].balance = newBal;
                        return nw;
                      });

                      if (activeWalletIndex === 0) {
                        setCashBalance(newBal);
                      }

                      updateCashBalance(newBal, diff, cashReason);
                    }
                    setCashModalVisible(false);
                    setCashInputValue('');
                    setCashReason('');
                  }}>
                    <Text style={styles.inputModalBtnText}>
                      {cashModalType === 'add' ? 'Добавить' : 'Убавить'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </BlurView>
        </Modal>

        {/* --- MENU 2 SCREEN --- */}
        <Animated.View
          pointerEvents={activeScreen === 'menu2' ? 'auto' : 'none'}
          style={[styles.overlay, styles.menu2Container, StyleSheet.absoluteFill, {
            opacity: screenAnim,
            transform: [{ scale: screenAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
          }]}
        >
          <StatusBar style="light" />

          {/* Top Arrow Buttons (Left: Menu2, Right: Menu3) */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={() => switchScreen('menu2')}>
              <Image source={require('./assets/menu_icon.png')} style={styles.menuIcon} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => switchScreen('menu3')}>
              <Image source={require('./assets/menu_icon.png')} style={styles.menuIcon} />
            </TouchableOpacity>
          </View>

          <View style={[styles.container, { paddingHorizontal: 0 }]}>

            <ScrollView
              ref={horizontalScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ width: '100%', transform: [{ scaleX: -1 }] }}
              onMomentumScrollEnd={(e) => {
                const page = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setActiveWalletIndex(page);
              }}
            >
              {wallets.map((wallet) => (
                <ScrollView
                  key={wallet.id}
                  style={{ width: screenWidth, transform: [{ scaleX: -1 }] }}
                  contentContainerStyle={{ alignItems: 'center', flexGrow: 1 }}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    wallet.id !== 1 ? (
                      <RefreshControl
                        refreshing={false}
                        onRefresh={() => deleteWallet(wallet.id)}
                        tintColor="#ef4444"
                        colors={['#ef4444']}
                      />
                    ) : undefined
                  }
                >

                  {/* Goal Photo (if goal) */}
                  {wallet.is_goal === 1 && wallet.photo_uri ? (
                    <View style={{ alignItems: 'center', marginTop: 30, marginBottom: 10 }}>
                      <Image source={{ uri: wallet.photo_uri }} style={{ width: 140, height: 140, borderRadius: 30 }} />
                    </View>
                  ) : null}

                  {/* Nixie Tubes 3D Display for this wallet */}
                  <View style={{ width: '100%', height: 120, marginTop: wallet.is_goal ? 10 : 120, marginBottom: 10 }}>
                    <NixieDisplay balance={wallet.balance} />
                  </View>

                  {!!wallet.name && (
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, marginTop: 15, marginBottom: 10, fontWeight: '600' }}>
                      {wallet.name}
                    </Text>
                  )}

                  {/* Goal Progress (if goal) */}
                  {wallet.is_goal === 1 && wallet.target_amount > 0 ? (
                    <View style={{ width: '80%', marginTop: 5, marginBottom: 20, alignSelf: 'center' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)' }}>Прогресс</Text>
                        <Text style={{ color: '#4ade80' }}>{wallet.balance} / {wallet.target_amount} {getCurrencySymbol(wallet.currency)}</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.min((wallet.balance / wallet.target_amount) * 100, 100)}%`, backgroundColor: '#4ade80' }} />
                      </View>
                    </View>
                  ) : null}

                  {/* Action Buttons */}
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => { setCashModalType('sub'); setCashModalVisible(true); }} activeOpacity={0.7}>
                      <Text style={styles.actionButtonText}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.actionButtonAdd]} onPress={() => { setCashModalType('add'); setCashModalVisible(true); }} activeOpacity={0.7}>
                      <Text style={styles.actionButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Cash Transactions Snippet */}
                  <View style={{ width: '100%', alignItems: 'center', marginTop: 20 }}>
                    <TouchableOpacity
                      style={styles.transactionsContainer}
                      activeOpacity={0.8}
                      onPress={() => { setHistoryType('cash'); setIsHistoryVisible(true); }}
                    >
                      <View style={styles.transactionsHeader}>
                        <Text style={styles.transactionsTitle}>История</Text>
                        <Text style={styles.seeAllText}>Все</Text>
                      </View>

                      <View style={styles.transactionsList}>
                        {cashTransactions.length === 0 ? (
                          <Text style={styles.noTransactionsText}>Нет транзакций</Text>
                        ) : (
                          cashTransactions.slice(0, 3).map((tx, index) => (
                            <View key={tx.id || index} style={[styles.transactionItem, index === 2 && { borderBottomWidth: 0 }]}>
                              <View style={styles.txLeft}>
                                <Text style={styles.txMerchant}>{tx.merchant.replace('Наличные: ', '')}</Text>
                                <Text style={styles.txTime}>{tx.time}</Text>
                              </View>
                              <Text style={[styles.txAmount, tx.amount > 0 && { color: '#4ade80' }]}>
                                {tx.amount > 0 ? '+' : ''}{tx.amount} {getCurrencySymbol(wallet.currency)}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ))}

              {/* Create Wallet View */}
              <View style={{ width: screenWidth, alignItems: 'center', paddingHorizontal: 20, transform: [{ scaleX: -1 }], paddingBottom: 100 }}>
                <Text style={{ color: '#fff', fontSize: 24, marginTop: 80, marginBottom: 30, fontWeight: '600' }}>Новый кошелек</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', width: '85%', marginBottom: 15, justifyContent: 'space-between' }}>
                  <Text style={{ color: '#fff', fontSize: 16 }}>Это кошелек-цель?</Text>
                  <TouchableOpacity
                    style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: newWalletIsGoal ? '#4ade80' : 'rgba(255,255,255,0.2)', justifyContent: 'center', padding: 2 }}
                    onPress={() => setNewWalletIsGoal(!newWalletIsGoal)}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: newWalletIsGoal ? 'flex-end' : 'flex-start' }} />
                  </TouchableOpacity>
                </View>

                {newWalletIsGoal && (
                  <View style={{ width: '85%', alignItems: 'center', marginBottom: 20 }}>
                    <TouchableOpacity
                      style={{ width: 100, height: 100, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
                      onPress={pickImage}
                    >
                      {newWalletPhoto ? (
                        <Image source={{ uri: newWalletPhoto }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text style={{ color: '#4ade80', fontSize: 32 }}>+</Text>
                      )}
                    </TouchableOpacity>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8, fontSize: 12 }}>Выбрать фото</Text>
                  </View>
                )}

                <TextInput
                  style={[styles.cashInput, { width: '85%' }]}
                  value={newWalletName}
                  onChangeText={setNewWalletName}
                  placeholder={newWalletIsGoal ? "Название цели" : "Название кошелька"}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                {newWalletIsGoal && (
                  <TextInput
                    style={[styles.cashInput, { width: '85%' }]}
                    value={newWalletTarget}
                    onChangeText={setNewWalletTarget}
                    placeholder="Сумма цели"
                    keyboardType="numeric"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                  />
                )}

                <View style={{ flexDirection: 'row', width: '85%', justifyContent: 'space-between', marginBottom: 24 }}>
                  {['UAH', 'USD', 'EUR', 'CNY'].map(cur => (
                    <TouchableOpacity
                      key={cur}
                      style={{
                        flex: 1, marginHorizontal: 4, paddingVertical: 12,
                        backgroundColor: newWalletCurrency === cur ? 'rgba(74, 222, 128, 0.4)' : 'rgba(255,255,255,0.1)',
                        borderRadius: 8, alignItems: 'center'
                      }}
                      onPress={() => setNewWalletCurrency(cur)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{cur}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={{ width: '85%', paddingVertical: 14, backgroundColor: 'rgba(74, 222, 128, 0.4)', borderRadius: 12, alignItems: 'center' }}
                  onPress={createWallet}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Создать</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </Animated.View>

        {/* --- MENU 3 SCREEN --- */}
        <Animated.View
          pointerEvents={activeScreen === 'menu3' ? 'auto' : 'none'}
          style={[styles.overlay, StyleSheet.absoluteFill, {
            opacity: screenAnim3,
            transform: [{ scale: screenAnim3.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
          }]}
        >
          <StatusBar style="light" />

          {/* Top Arrow Buttons (Left: Menu2, Right: Menu3) */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={() => switchScreen('menu2')}>
              <Image source={require('./assets/menu_icon.png')} style={styles.menuIcon} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => switchScreen('menu3')}>
              <Image source={require('./assets/menu_icon.png')} style={styles.menuIcon} />
            </TouchableOpacity>
          </View>

          <View style={[styles.container, { paddingHorizontal: 20 }]}>
            <View style={{ marginTop: 100, marginBottom: 20, width: '100%' }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  if (contentOffset.x + layoutMeasurement.width > contentSize.width + 30) {
                    setShowDebugTab(true);
                  }
                }}
              >
                {(showDebugTab ? ['wishlist', 'subs', 'debts', 'summary', 'debug'] : ['wishlist', 'subs', 'debts', 'summary']).map((tab) => {
                  const labels = {
                    'wishlist': 'Хотелки',
                    'subs': 'Подписки',
                    'debts': 'Долги',
                    'summary': 'Сводка',
                    'debug': 'Дебаг'
                  };
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={{
                        paddingVertical: 8, paddingHorizontal: 16,
                        backgroundColor: menu3Tab === tab ? (tab === 'debug' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(74, 222, 128, 0.4)') : 'rgba(255,255,255,0.1)',
                        borderRadius: 20, marginRight: 8
                      }}
                      onPress={() => setMenu3Tab(tab)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{labels[tab]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
              {menu3Tab === 'wishlist' && (
                <>
                  {!expandedFolderId ? (
                    <>
                      {menu3Data.folders.filter(f => !f.parent_id).map(f => {
                        const total = getFolderTotal(f.id);
                        return (
                          <SwipeRow key={f.id} onDelete={() => deleteFolder(f.id)} style={{ marginBottom: 12 }}>
                            <TouchableOpacity
                              style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, width: screenWidth - 40, flexDirection: 'row', justifyContent: 'space-between' }}
                              onPress={() => setExpandedFolderId(f.id)}
                              onLongPress={() => setMovingItem({ id: f.id, type: 'folder', name: f.name })}
                            >
                              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>{f.name} ({f.items ? f.items.length : 0})</Text>
                              {total > 0 && (
                                <Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '600' }}>{total} ₴</Text>
                              )}
                            </TouchableOpacity>
                          </SwipeRow>
                        );
                      })}

                      <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 12, marginTop: 10, alignItems: 'center' }}>
                        <TextInput style={[styles.cashInput, { flex: 1, marginBottom: 0, height: 40, padding: 8, fontSize: 16 }]} value={newFolderName} onChangeText={setNewFolderName} placeholder="Новая папка" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <TouchableOpacity style={{ paddingHorizontal: 15 }} onPress={createFolder}><Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '600' }}>Создать</Text></TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity style={{ marginBottom: 16 }} onPress={() => {
                        const folder = menu3Data.folders.find(f => f.id === expandedFolderId);
                        setExpandedFolderId(folder?.parent_id || null);
                      }}>
                        <Text style={{ color: '#4ade80', fontSize: 16 }}>← Назад</Text>
                      </TouchableOpacity>

                      {(() => {
                        const folder = menu3Data.folders.find(f => f.id === expandedFolderId);
                        if (!folder) return null;
                        const subFolders = menu3Data.folders.filter(f => f.parent_id === expandedFolderId);

                        return (
                          <View style={{ paddingBottom: 100 }}>
                            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 20 }}>{folder.name}</Text>

                            {/* Подпапки */}
                            {subFolders.map(f => {
                              const total = getFolderTotal(f.id);
                              return (
                                <SwipeRow key={f.id} onDelete={() => deleteFolder(f.id)} style={{ marginBottom: 12 }}>
                                  <TouchableOpacity
                                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, width: screenWidth - 40, flexDirection: 'row', justifyContent: 'space-between' }}
                                    onPress={() => setExpandedFolderId(f.id)}
                                    onLongPress={() => setMovingItem({ id: f.id, type: 'folder', name: f.name })}
                                  >
                                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>📁 {f.name} ({f.items ? f.items.length : 0})</Text>
                                    {total > 0 && (
                                      <Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '600' }}>{total} ₴</Text>
                                    )}
                                  </TouchableOpacity>
                                </SwipeRow>
                              );
                            })}

                            {/* Товары */}
                            {folder.items && folder.items.map(item => (
                              <SwipeRow key={item.id} onDelete={() => deleteItem(item.id)} style={{ marginBottom: 12 }}>
                                <TouchableOpacity
                                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, width: screenWidth - 40 }}
                                  onPress={() => {
                                    if (item.url) {
                                      let targetUrl = item.url;
                                      if (!targetUrl.startsWith('http')) targetUrl = 'http://' + targetUrl;
                                      Linking.openURL(targetUrl).catch(() => { });
                                    }
                                  }}
                                  onLongPress={() => setMovingItem({ id: item.id, type: 'item', name: item.title })}
                                  activeOpacity={item.url ? 0.7 : 1}
                                >
                                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500' }}>{item.title}</Text>
                                  {item.price > 0 && <Text style={{ color: '#4ade80', marginTop: 4 }}>{item.price} ₴</Text>}
                                  <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 4, fontSize: 12 }} numberOfLines={1}>{item.url}</Text>
                                </TouchableOpacity>
                              </SwipeRow>
                            ))}

                            {/* Добавление подпапки */}
                            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 12, marginTop: 10, alignItems: 'center' }}>
                              <TextInput style={[styles.cashInput, { flex: 1, marginBottom: 0, height: 40, padding: 8, fontSize: 16 }]} value={newFolderName} onChangeText={setNewFolderName} placeholder="Новая подпапка" placeholderTextColor="rgba(255,255,255,0.3)" />
                              <TouchableOpacity style={{ paddingHorizontal: 15 }} onPress={createFolder}><Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '600' }}>Создать</Text></TouchableOpacity>
                            </View>

                            {/* Добавление товара */}
                            {isAddingItem ? (
                              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, marginTop: 10 }}>
                                <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newItemTitle} onChangeText={setNewItemTitle} placeholder="Название товара" placeholderTextColor="rgba(255,255,255,0.3)" />
                                <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newItemUrl} onChangeText={setNewItemUrl} placeholder="Ссылка" placeholderTextColor="rgba(255,255,255,0.3)" />
                                <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newItemPrice} onChangeText={setNewItemPrice} placeholder="Цена (по желанию)" keyboardType="numeric" placeholderTextColor="rgba(255,255,255,0.3)" />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                  <TouchableOpacity style={{ padding: 10, flex: 1, alignItems: 'center' }} onPress={() => setIsAddingItem(false)}><Text style={{ color: '#ef4444' }}>Отмена</Text></TouchableOpacity>
                                  <TouchableOpacity style={{ padding: 10, flex: 1, alignItems: 'center' }} onPress={createItem}><Text style={{ color: '#4ade80' }}>Добавить</Text></TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                              <TouchableOpacity style={{ padding: 16, alignItems: 'center', marginTop: 10 }} onPress={() => setIsAddingItem(true)}>
                                <Text style={{ color: '#4ade80', fontSize: 16 }}>+ Добавить товар</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })()}
                    </>
                  )}
                  {/* Moving Item Modal */}
                  <Modal
                    visible={!!movingItem}
                    transparent={true}
                    animationType="slide"
                  >
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' }}>
                      <View style={{ backgroundColor: '#1c1c1e', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
                          Переместить "{movingItem?.name}"
                        </Text>

                        <ScrollView showsVerticalScrollIndicator={false}>
                          <TouchableOpacity
                            style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}
                            onPress={() => moveItemTo(null)}
                          >
                            <Text style={{ color: '#4ade80', fontSize: 18, fontWeight: '600' }}>В корень (Главная страница)</Text>
                          </TouchableOpacity>

                          {menu3Data.folders.map(f => {
                            if (movingItem?.type === 'folder' && f.id === movingItem.id) return null;
                            const isSub = f.parent_id !== null;
                            return (
                              <TouchableOpacity
                                key={f.id}
                                style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingLeft: isSub ? 30 : 15 }}
                                onPress={() => moveItemTo(f.id)}
                              >
                                <Text style={{ color: '#fff', fontSize: 18 }}>{isSub ? '↳ ' : ''}📁 {f.name}</Text>
                              </TouchableOpacity>
                            )
                          })}
                        </ScrollView>

                        <TouchableOpacity
                          style={{ marginTop: 20, padding: 15, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 12, alignItems: 'center' }}
                          onPress={() => setMovingItem(null)}
                        >
                          <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Отмена</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                </>
              )}

              {menu3Tab === 'subs' && (
                <View style={{ paddingBottom: 100 }}>
                  {menu3Data.subscriptions.map(sub => {
                    const daysLeft = getDaysLeftText(sub.next_payment_date);
                    const isSoon = daysLeft.includes('Скоро') || daysLeft.includes('Сегодня') || daysLeft.includes('Просрочено');
                    return (
                      <SwipeRow key={sub.id} onDelete={() => deleteSub(sub.id)} style={{ marginBottom: 12 }}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, width: screenWidth - 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>{sub.name}</Text>
                            <Text style={{ color: isSoon ? '#ef4444' : 'rgba(255,255,255,0.6)', marginTop: 6, fontWeight: '500' }}>
                              {daysLeft} ({sub.next_payment_date})
                            </Text>
                          </View>
                          <Text style={{ color: '#4ade80', fontSize: 18, fontWeight: '600' }}>{sub.amount} ₴</Text>
                        </View>
                      </SwipeRow>
                    );
                  })}

                  {isAddingSub ? (
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, marginTop: 10 }}>
                      <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newSubName} onChangeText={setNewSubName} placeholder="Название (например, Netflix)" placeholderTextColor="rgba(255,255,255,0.3)" />
                      <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newSubAmount} onChangeText={setNewSubAmount} placeholder="Сумма" keyboardType="numeric" placeholderTextColor="rgba(255,255,255,0.3)" />
                      <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newSubDate} onChangeText={handleDateChange} placeholder="Дата (ДД.ММ.ГГГГ)" keyboardType="number-pad" placeholderTextColor="rgba(255,255,255,0.3)" />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <TouchableOpacity style={{ padding: 10, flex: 1, alignItems: 'center' }} onPress={() => setIsAddingSub(false)}><Text style={{ color: '#ef4444' }}>Отмена</Text></TouchableOpacity>
                        <TouchableOpacity style={{ padding: 10, flex: 1, alignItems: 'center' }} onPress={createSub}><Text style={{ color: '#4ade80' }}>Добавить</Text></TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity style={{ padding: 16, alignItems: 'center', marginTop: 10 }} onPress={() => setIsAddingSub(true)}>
                      <Text style={{ color: '#4ade80', fontSize: 16 }}>+ Добавить подписку</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {menu3Tab === 'debts' && (
                <View style={{ paddingBottom: 100 }}>
                  {menu3Data.debts.map(debt => (
                    <SwipeRow key={debt.id} onDelete={() => deleteDebt(debt.id)} style={{ marginBottom: 12 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, width: screenWidth - 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>{debt.person}</Text>
                          <Text style={{ color: debt.type === 'owed_to_me' ? '#4ade80' : '#ef4444', marginTop: 4, fontSize: 12, fontWeight: '500' }}>
                            {debt.type === 'owed_to_me' ? 'Мне должны' : 'Я должен'}
                            {debt.deadline ? ` до ${debt.deadline}` : ''}
                            {debt.is_recurring ? ` (${getNextPeriodText(debt)})` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: debt.type === 'owed_to_me' ? '#4ade80' : '#ef4444', fontSize: 18, fontWeight: '600', marginBottom: 6 }}>
                            {debt.type === 'owed_to_me' ? '+' : '-'}{debt.amount} ₴
                          </Text>
                          {debt.is_recurring && !isDebtAlreadyPaidThisPeriod(debt) && (
                            <TouchableOpacity
                              style={{ backgroundColor: debt.type === 'owed_to_me' ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                              onPress={() => handleDebtTransaction(debt)}
                            >
                              <Text style={{ color: debt.type === 'owed_to_me' ? '#4ade80' : '#ef4444', fontSize: 14, fontWeight: '600' }}>Отметить</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </SwipeRow>
                  ))}

                  {isAddingDebt ? (
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                        <TouchableOpacity style={{ flex: 1, padding: 10, alignItems: 'center', backgroundColor: newDebtType === 'owed_to_me' ? 'rgba(74,222,128,0.3)' : 'transparent', borderRadius: 8 }} onPress={() => setNewDebtType('owed_to_me')}>
                          <Text style={{ color: '#4ade80' }}>Мне должны</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flex: 1, padding: 10, alignItems: 'center', backgroundColor: newDebtType === 'i_owe' ? 'rgba(239,68,68,0.3)' : 'transparent', borderRadius: 8 }} onPress={() => setNewDebtType('i_owe')}>
                          <Text style={{ color: '#ef4444' }}>Я должен</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newDebtPerson} onChangeText={setNewDebtPerson} placeholder="Имя (кому/кто)" placeholderTextColor="rgba(255,255,255,0.3)" />
                      <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newDebtAmount} onChangeText={setNewDebtAmount} placeholder="Сумма" keyboardType="numeric" placeholderTextColor="rgba(255,255,255,0.3)" />
                      <TextInput style={[styles.cashInput, { marginBottom: 10 }]} value={newDebtDeadline} onChangeText={handleDebtDateChange} placeholder="Дедлайн (ДД.ММ.ГГГГ)" keyboardType="number-pad" placeholderTextColor="rgba(255,255,255,0.3)" />
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
                        onPress={() => setNewDebtIsRecurring(!newDebtIsRecurring)}
                      >
                        <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#4ade80', marginRight: 10, backgroundColor: newDebtIsRecurring ? '#4ade80' : 'transparent' }} />
                        <Text style={{ color: '#fff', fontSize: 16 }}>Постоянный долг</Text>
                      </TouchableOpacity>
                      {newDebtIsRecurring && (
                        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                          {['День', 'Неделя', 'Месяц'].map(period => (
                            <TouchableOpacity
                              key={period}
                              style={{ flex: 1, padding: 8, alignItems: 'center', backgroundColor: newDebtRecurringPeriod === period ? 'rgba(74,222,128,0.3)' : 'transparent', borderRadius: 8 }}
                              onPress={() => setNewDebtRecurringPeriod(period)}
                            >
                              <Text style={{ color: newDebtRecurringPeriod === period ? '#4ade80' : '#fff', fontWeight: '600' }}>{period}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <TouchableOpacity style={{ padding: 10, flex: 1, alignItems: 'center' }} onPress={() => setIsAddingDebt(false)}><Text style={{ color: '#ef4444' }}>Отмена</Text></TouchableOpacity>
                        <TouchableOpacity style={{ padding: 10, flex: 1, alignItems: 'center' }} onPress={createDebt}><Text style={{ color: '#4ade80' }}>Сохранить</Text></TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity style={{ padding: 16, alignItems: 'center', marginTop: 10 }} onPress={() => setIsAddingDebt(true)}>
                      <Text style={{ color: '#4ade80', fontSize: 16 }}>+ Добавить долг</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {menu3Tab === 'summary' && (() => {
                if (isSummaryListVisible) {
                  return (
                    <View style={{ paddingBottom: 100 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                        <TouchableOpacity onPress={() => setIsSummaryListVisible(false)}>
                          <Text style={{ color: '#4ade80', fontSize: 18, marginRight: 10 }}>← Назад</Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '600' }}>Выбор месяца</Text>
                      </View>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(offset => {
                        const d = new Date();
                        d.setMonth(d.getMonth() - offset);
                        const mName = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'][d.getMonth()];
                        return (
                          <TouchableOpacity
                            key={offset}
                            style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 16, marginBottom: 15 }}
                            onPress={() => { setSummaryMonthOffset(offset); setIsSummaryListVisible(false); }}
                          >
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>{mName} {d.getFullYear()}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  );
                }

                const now = new Date();
                now.setMonth(now.getMonth() - summaryMonthOffset);
                const curMonth = now.getMonth();
                const curYear = now.getFullYear();
                let spent = 0;
                let earned = 0;
                cardTransactions.forEach(tx => {
                  let txDate = new Date();
                  if (tx.time) {
                    const parts = tx.time.split(' ')[0].split('.');
                    if (parts.length === 3) {
                      const d = parseInt(parts[0], 10);
                      const m = parseInt(parts[1], 10) - 1;
                      let y = parseInt(parts[2], 10);
                      y = y < 100 ? 2000 + y : y;
                      txDate = new Date(y, m, d);
                    }
                  }
                  if (txDate.getMonth() === curMonth && txDate.getFullYear() === curYear) {
                    if (tx.amount < 0) spent += Math.abs(tx.amount);
                    else earned += tx.amount;
                  }
                });
                const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

                return (
                  <View style={{ paddingBottom: 100 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '600' }}>Сводка за {monthNames[curMonth]}</Text>
                      <TouchableOpacity onPress={() => setIsSummaryListVisible(true)}>
                        <Text style={{ color: '#4ade80', fontSize: 16 }}>Все</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 16, marginBottom: 15 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 }}>Заработано</Text>
                      <Text style={{ color: '#4ade80', fontSize: 28, fontWeight: '700' }}>+{earned.toFixed(2)} ₴</Text>
                    </View>

                    <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 16, marginBottom: 15 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 }}>Потрачено</Text>
                      <Text style={{ color: '#ef4444', fontSize: 28, fontWeight: '700' }}>-{spent.toFixed(2)} ₴</Text>
                    </View>

                    <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 16 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 }}>Итог месяца</Text>
                      <Text style={{ color: earned >= spent ? '#4ade80' : '#ef4444', fontSize: 24, fontWeight: '700' }}>
                        {earned >= spent ? '+' : ''}{(earned - spent).toFixed(2)} ₴
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {menu3Tab === 'debug' && (
                <View style={{ paddingBottom: 100 }}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 20 }}>Добавить транзакцию вручную</Text>

                  <TextInput style={[styles.cashInput, { marginBottom: 10, fontSize: 18, height: 50, padding: 10 }]} value={debugMerchant} onChangeText={setDebugMerchant} placeholder="Название транзакции" placeholderTextColor="rgba(255,255,255,0.3)" />

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <TextInput style={[styles.cashInput, { flex: 1, marginBottom: 0, textAlign: 'center', fontSize: 18, height: 50, padding: 10 }]} value={debugDay} onChangeText={(t) => { setDebugDay(t); if (t.length === 2) debugMonthRef.current.focus(); }} placeholder="ДД" keyboardType="number-pad" maxLength={2} />
                    <Text style={{ color: '#fff', fontSize: 24, marginHorizontal: 5 }}>.</Text>
                    <TextInput ref={debugMonthRef} style={[styles.cashInput, { flex: 1, marginBottom: 0, textAlign: 'center', fontSize: 18, height: 50, padding: 10 }]} value={debugMonth} onChangeText={(t) => { setDebugMonth(t); if (t.length === 2) debugYearRef.current.focus(); }} placeholder="ММ" keyboardType="number-pad" maxLength={2} />
                    <Text style={{ color: '#fff', fontSize: 24, marginHorizontal: 5 }}>.</Text>
                    <TextInput ref={debugYearRef} style={[styles.cashInput, { flex: 1, marginBottom: 0, textAlign: 'center', fontSize: 18, height: 50, padding: 10 }]} value={debugYear} onChangeText={(t) => { setDebugYear(t); if (t.length === 4 || t.length === 2) debugTimeRef.current.focus(); }} placeholder="ГГ" keyboardType="number-pad" maxLength={4} />
                  </View>

                  <TextInput ref={debugTimeRef} style={[styles.cashInput, { marginBottom: 10, textAlign: 'center', fontSize: 18, height: 50, padding: 10 }]} value={debugTime} onChangeText={(t) => { setDebugTime(t); if (t.length === 5) debugAmountRef.current.focus(); }} placeholder="Время (04:26)" keyboardType="numbers-and-punctuation" maxLength={5} />

                  <TextInput ref={debugAmountRef} style={[styles.cashInput, { marginBottom: 10, fontSize: 18, height: 50, padding: 10 }]} value={debugAmount} onChangeText={setDebugAmount} placeholder="Сколько сняли/дали (например, +100 или -50)" keyboardType="numbers-and-punctuation" placeholderTextColor="rgba(255,255,255,0.3)" />

                  <TextInput style={[styles.cashInput, { marginBottom: 20, fontSize: 18, height: 50, padding: 10 }]} value={debugBalance} onChangeText={setDebugBalance} placeholder="Баланс сейчас" keyboardType="numeric" placeholderTextColor="rgba(255,255,255,0.3)" />

                  <TouchableOpacity style={{ backgroundColor: 'rgba(239, 68, 68, 0.4)', padding: 15, borderRadius: 12, alignItems: 'center' }} onPress={submitDebugTransaction}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>Принудительно закинуть</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Debt Wallet Selection Modal */}
        <Modal
          visible={!!debtToProcess}
          transparent={true}
          animationType="slide"
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#1c1c1e', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
                {debtToProcess?.type === 'owed_to_me' ? 'Куда зачислить?' : 'Откуда списать?'}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                {wallets.map(w => (
                  <TouchableOpacity
                    key={w.id}
                    style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', justifyContent: 'space-between' }}
                    onPress={() => processDebtWithWallet(debtToProcess, w)}
                  >
                    <Text style={{ color: '#fff', fontSize: 18 }}>{w.name || 'Наличные'}</Text>
                    <Text style={{ color: '#4ade80', fontSize: 16 }}>{formatBalance(w.balance)} {getCurrencySymbol(w.currency)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={{ marginTop: 20, padding: 15, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 12, alignItems: 'center' }}
                onPress={() => setDebtToProcess(null)}
              >
                <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </ImageBackground>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  topHeader: {
    position: 'absolute',
    top: 50,
    width: '100%',
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  menuIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 80,
  },
  textContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    height: 100,
    width: '100%',
    marginBottom: 20,
  },
  cardShadow: {
    width: '85%',
    aspectRatio: 1.586,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 25,
    borderRadius: 24,
    marginBottom: 20,
  },
  card: {
    width: '102%',
    height: '102%',
    marginLeft: '-1%',
    marginTop: '-1%',
    borderRadius: 24,
  },
  balanceText: {
    fontFamily: Platform.select({
      ios: 'Helvetica Neue',
      android: 'sans-serif-medium',
      web: 'system-ui',
    }),
    fontSize: 58,
    fontWeight: '800',
    letterSpacing: -1,
  },
  shadowLayer: {
    position: 'absolute',
    color: Platform.OS === 'web' ? 'rgba(0,0,0,0.01)' : 'transparent',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 12 },
    textShadowRadius: 15,
  },
  innerHighlight: {
    position: 'absolute',
    color: Platform.OS === 'web' ? 'rgba(255,255,255,0.01)' : 'transparent',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: -1.5, height: -1.5 },
    textShadowRadius: 1,
    opacity: 0.8,
  },
  webLiquidGlass: {
    position: 'absolute',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.6) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },

  // Transactions Snippet Styles
  transactionsContainer: {
    width: '90%',
    marginTop: 30, // Сдвигаем ниже
    paddingHorizontal: 10, // Оставляем только боковые отступы
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  transactionsTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
  },
  seeAllText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    fontWeight: '500',
  },
  transactionsList: {
  },
  noTransactionsText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  txLeft: {
    flex: 1,
  },
  txMerchant: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  txTime: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
  },
  txAmount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', // Let BlurView handle the dimming
  },
  modalContent: {
    backgroundColor: 'rgba(28, 28, 30, 0.65)', // Semi-transparent glass color
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: '75%',
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  closeBtnText: {
    color: 'rgba(255, 255, 255, 0.5)', // Серый цвет вместо синего
    fontSize: 17,
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
  },
  deleteBtn: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Second Menu Styles
  menu2Container: {
    backgroundColor: 'transparent',
  },
  nixieContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  nixieTube: {
    width: 60,
    height: 120,
    marginHorizontal: -2, // Tubes slightly overlap or tight fit
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: 40,
    width: '80%',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionButtonAdd: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderColor: 'rgba(74, 222, 128, 0.5)',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 36, // To center text visually
  },

  // Cash Input Modal Styles
  inputModalContent: {
    width: '85%',
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  inputModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  cashInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 15,
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 24,
  },
  inputModalButtons: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  inputModalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    marginRight: 10,
  },
  inputModalBtnSubmit: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginLeft: 10,
  },
  btnGreen: {
    backgroundColor: 'rgba(74, 222, 128, 0.4)',
  },
  btnRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
  },
  inputModalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
