/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { 
  LogOut, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Baby, 
  ClipboardCheck, 
  PenSquare, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  X,
  Minus,
  MessageCircle,
  Settings,
  CalendarDays
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---

type Preference = 'snack' | 'drink' | 'both' | 'none';

interface KidData {
  id: string;
  name: string;
  nameLower: string;
  group: 'UPK AM' | 'UPK PM' | 'K-5AM' | 'K-5PM';
  schedule: string[];
}

interface RecordData {
  id: string;
  date: string;
  name: string;
  nameLower: string;
  preference: Preference;
  strikes: number;
  notes: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

// --- Helpers ---

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const getFormattedDateKey = (dateObj: Date) => {
  const offset = dateObj.getTimezoneOffset() * 60000;
  return (new Date(dateObj.getTime() - offset)).toISOString().slice(0, 10);
};

const formatDateFriendly = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const PREFERENCE_CONFIG = {
  snack: { icon: '🥨', text: 'Snack Only', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
  drink: { icon: '🧃', text: 'Drink Only', color: 'text-sky-700', bg: 'bg-sky-100', border: 'border-sky-200' },
  both: { icon: '🥨+🧃', text: 'Both', color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  none: { icon: '🚫', text: 'None', color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' },
};

// --- Components ---

export default function App() {
  const [userType, setUserType] = useState<'none' | 'parent' | 'staff'>('none');
  const [childName, setChildName] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState<RecordData[]>([]);
  const [kids, setKids] = useState<KidData[]>([]);
  const [parentHistory, setParentHistory] = useState<RecordData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isKidModalOpen, setIsKidModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordData | null>(null);
  const [editingKid, setEditingKid] = useState<KidData | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Sync auth state
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
  }, []);

  const dateKey = useMemo(() => getFormattedDateKey(selectedDate), [selectedDate]);
  
  const currentDayOfWeek = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[selectedDate.getDay()];
  }, [selectedDate]);

  // Listen for kids and staff records
  useEffect(() => {
    if (userType !== 'staff') return;

    // Listen for all kids
    const kidsQ = query(collection(db, 'kids'));
    const unsubKids = onSnapshot(kidsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KidData));
      setKids(data.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'kids');
    });

    const recordsQ = query(collection(db, 'records'), where('date', '==', dateKey));
    const unsubRecords = onSnapshot(recordsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecordData));
      setRecords(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'records');
    });

    return () => {
      unsubKids();
      unsubRecords();
    };
  }, [userType, dateKey]);

  // Listen for parent history
  useEffect(() => {
    if (userType !== 'parent' || !childName) return;

    const q = query(collection(db, 'records'), where('nameLower', '==', childName.toLowerCase()));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecordData));
      setParentHistory(data.sort((a, b) => b.date.localeCompare(a.date)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'records');
    });

    return () => unsubscribe();
  }, [userType, childName]);

  const handleStaffLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const user = formData.get('user') as string;
    const pass = formData.get('pass') as string;

    if (user === 'YMCACAYUGA' && pass === 'YMCACAYUGA_?!') {
      const email = 'YMCACAYUGA@ymca.app';
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        setUserType('staff');
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          try {
            await createUserWithEmailAndPassword(auth, email, pass);
            setUserType('staff');
          } catch (createErr: any) {
            if (createErr.code === 'auth/operation-not-allowed') {
              alert('CRITICAL: Please enable "Email/Password" Authentication provider in your Firebase Console.');
            } else {
              alert('Setup failed: ' + createErr.message);
            }
          }
        } else if (err.code === 'auth/operation-not-allowed') {
          alert('CRITICAL: Please enable "Email/Password" Authentication provider in your Firebase Console.');
        } else {
          alert('Login failed: ' + err.message);
        }
      }
    } else {
      alert('Invalid Username or Password');
    }
  };

  const handleParentLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('childName') as string;
    if (name.trim()) {
      setChildName(name.trim());
      setUserType('parent');
    }
  };

  const handleLogout = async () => {
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('signOut failed', err);
      }
    }
    setUserType('none');
    setChildName('');
    setRecords([]);
    setParentHistory([]);
    setKids([]);
  };

  const handleSaveKid = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const group = formData.get('group') as KidData['group'];
    const schedule = formData.getAll('schedule') as string[];

    const data = {
      name,
      nameLower: name.toLowerCase(),
      group,
      schedule,
    };

    try {
      if (editingKid && editingKid.id) {
        await updateDoc(doc(db, 'kids', editingKid.id), data);
      } else {
        await addDoc(collection(db, 'kids'), data);
      }
      setIsKidModalOpen(false);
      setEditingKid(null);
    } catch (error) {
      handleFirestoreError(error, editingKid && editingKid.id ? OperationType.UPDATE : OperationType.CREATE, 'kids');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKid = async (id: string) => {
    if (!confirm('Are you sure you want to completely remove this kid from the roster?')) return;
    try {
      await deleteDoc(doc(db, 'kids', id));
      setIsKidModalOpen(false);
      setEditingKid(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'kids');
    }
  };

  const handleSaveRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const preference = formData.get('preference') as Preference;
    const rawStrikes = parseInt(formData.get('strikes') as string, 10);
    const strikes = Number.isNaN(rawStrikes) ? 0 : Math.max(0, rawStrikes);
    const notes = formData.get('notes') as string;

    const data = {
      date: dateKey,
      name,
      nameLower: name.toLowerCase(),
      preference,
      strikes,
      notes,
    };

    try {
      if (editingRecord) {
        await updateDoc(doc(db, 'records', editingRecord.id), data);
      } else {
        await addDoc(collection(db, 'records'), data);
      }
      setIsRecordModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      handleFirestoreError(error, editingRecord ? OperationType.UPDATE : OperationType.CREATE, 'records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Are you sure you want to delete this daily record?')) return;
    try {
      await deleteDoc(doc(db, 'records', id));
      setIsRecordModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'records');
    }
  };

  const updateStrikes = async (id: string, currentStrikes: number, delta: number) => {
    const newStrikes = Math.max(0, currentStrikes + delta);
    try {
      await updateDoc(doc(db, 'records', id), { strikes: newStrikes });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'records');
    }
  };

  // Derive the display list for the current day
  const displayedRoster = useMemo(() => {
    const scheduledKids = kids.filter(k => k.schedule.includes(currentDayOfWeek));
    const items = scheduledKids.map(kid => {
      const record = records.find(r => r.nameLower === kid.nameLower);
      return { kid, record };
    });
    // Add any records that exist for today but aren't scheduled (e.g. drop-ins)
    records.forEach(r => {
      if (!items.find(i => i.kid.nameLower === r.nameLower)) {
        // Find if this kid exists in roster but wasn't scheduled today
        const existingKid = kids.find(k => k.nameLower === r.nameLower);
        if (existingKid) {
            items.push({ kid: existingKid, record: r });
        } else {
            // Drop-in completely unregistered
            items.push({ 
                kid: { id: `dropin-${r.id}`, name: r.name, nameLower: r.nameLower, group: 'UPK AM', schedule: [] }, 
                record: r 
            });
        }
      }
    });

    return items.sort((a, b) => a.kid.name.localeCompare(b.kid.name));
  }, [kids, records, currentDayOfWeek]);

  if (userType === 'none') {
    return <LoginView onStaffLogin={handleStaffLogin} onParentLogin={handleParentLogin} />;
  }

  if (userType === 'staff') {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
        <header className="bg-blue-600 text-white p-4 sticky top-0 z-10 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">Staff Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-inner">
              {records.length} Kids
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-blue-500 rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto p-4">
          <div className="bg-white rounded-2xl shadow-sm p-2 mb-6 flex items-center justify-between border border-slate-200">
            <button 
              onClick={() => setSelectedDate(d => new Date(d.setDate(d.getDate() - 1)))}
              className="p-3 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
            <div className="text-center">
              <div className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-0.5">
                {dateKey === getFormattedDateKey(new Date()) ? 'Today' : 'Date'}
              </div>
              <div className="text-lg font-bold text-slate-800">
                {formatDateFriendly(dateKey)}
              </div>
            </div>
            <button 
              onClick={() => setSelectedDate(d => new Date(d.setDate(d.getDate() + 1)))}
              className="p-3 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {displayedRoster.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 text-slate-400"
                >
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-slate-100 mb-4">
                    <Baby className="w-10 h-10 text-slate-200" />
                  </div>
                  <p className="text-lg font-bold">No kids scheduled</p>
                  <p className="text-sm">Manage roster to add kids for {currentDayOfWeek}.</p>
                </motion.div>
              ) : (
                displayedRoster.map(({ kid, record }) => (
                  <StaffRecordCard 
                    key={kid.id} 
                    kid={kid}
                    record={record} 
                    onLogRecord={() => {
                      setEditingRecord(record || {
                        id: '', date: dateKey, name: kid.name, nameLower: kid.nameLower,
                        preference: 'none', strikes: 0, notes: ''
                      });
                      setIsRecordModalOpen(true);
                    }}
                    onUpdateStrikes={async (delta) => {
                      if (record) {
                        await updateStrikes(record.id, record.strikes, delta);
                      } else {
                        if (delta <= 0) return;
                        const data = {
                          date: dateKey, name: kid.name, nameLower: kid.nameLower,
                          preference: 'none' as Preference, strikes: delta, notes: ''
                        };
                        try {
                          await addDoc(collection(db, 'records'), data);
                        } catch (error) {
                          handleFirestoreError(error, OperationType.CREATE, 'records');
                        }
                      }
                    }}
                    onEditKid={() => {
                       if (kid.id.startsWith('dropin')) {
                         setEditingKid({ 
                           id: '', 
                           name: kid.name, 
                           nameLower: kid.nameLower, 
                           group: 'UPK AM', 
                           schedule: [currentDayOfWeek] 
                         });
                       } else {
                         setEditingKid(kid);
                       }
                       setIsKidModalOpen(true);
                    }}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </main>

        <div className="fixed bottom-8 right-8 flex flex-col gap-4">
          <button 
            onClick={() => {
              setEditingKid(null);
              setIsKidModalOpen(true);
            }}
            className="w-14 h-14 bg-white text-blue-600 rounded-full shadow-lg border border-slate-100 flex items-center justify-center hover:bg-slate-50 hover:scale-110 active:scale-95 transition-all z-20 group relative"
          >
            <Users className="w-6 h-6" />
            <span className="absolute right-full mr-4 bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Add to Roster
            </span>
          </button>
        </div>

        <AnimatePresence>
          {isRecordModalOpen && (
            <RecordModal 
              isOpen={isRecordModalOpen}
              onClose={() => {
                setIsRecordModalOpen(false);
                setEditingRecord(null);
              }}
              record={editingRecord}
              onSave={handleSaveRecord}
              onDelete={handleDeleteRecord}
              isLoading={isLoading}
            />
          )}

          {isKidModalOpen && (
            <KidModal 
              isOpen={isKidModalOpen}
              onClose={() => {
                setIsKidModalOpen(false);
                setEditingKid(null);
              }}
              kid={editingKid}
              onSave={handleSaveKid}
              onDelete={handleDeleteKid}
              isLoading={isLoading}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50 font-sans text-slate-900">
      <header className="bg-emerald-600 text-white p-4 sticky top-0 z-10 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
            <Baby className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-medium opacity-80 leading-tight">Parent Portal</h1>
            <div className="text-lg font-bold leading-tight uppercase tracking-tight">{childName}</div>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2 hover:bg-emerald-500 rounded-full transition-colors bg-emerald-700/50"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <AnimatePresence mode="popLayout">
          {parentHistory.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-slate-400"
            >
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-slate-100 mb-4">
                <Info className="w-10 h-10 text-slate-200" />
              </div>
              <p className="text-lg font-bold">No Records Found</p>
              <p className="text-sm text-center">There are no records available for {childName}.</p>
            </motion.div>
          ) : (
            parentHistory.map(record => (
              <ParentRecordCard key={record.id} record={record} />
            ))
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function LoginView({ onStaffLogin, onParentLogin }: { 
  onStaffLogin: (e: FormEvent<HTMLFormElement>) => void,
  onParentLogin: (e: FormEvent<HTMLFormElement>) => void 
}) {
  const [activeTab, setActiveTab] = useState<'parent' | 'staff'>('parent');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-900 p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-slate-50 p-8 text-center border-b border-slate-100">
          <div className="w-20 h-20 bg-red-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-100 transform -rotate-3">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">YMCA Tracker</h1>
          <p className="text-slate-500 mt-2 font-medium">Daily child tracking management</p>
        </div>

        <div className="flex bg-slate-100 p-1 m-4 rounded-2xl">
          <button 
            onClick={() => setActiveTab('parent')}
            className={cn(
              "flex-1 py-3 font-bold text-sm rounded-xl transition-all duration-200",
              activeTab === 'parent' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Parent Portal
          </button>
          <button 
            onClick={() => setActiveTab('staff')}
            className={cn(
              "flex-1 py-3 font-bold text-sm rounded-xl transition-all duration-200",
              activeTab === 'staff' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Staff Portal
          </button>
        </div>

        <div className="p-8 pt-4">
          <AnimatePresence mode="wait">
            {activeTab === 'parent' ? (
              <motion.form 
                key="parent"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={onParentLogin}
                className="space-y-6"
              >
                <p className="text-sm text-slate-600 text-center leading-relaxed">
                  Enter your child's full name to view their daily behavior and snack records.
                </p>
                <div>
                  <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
                    Child's Full Name
                  </label>
                  <input 
                    name="childName"
                    required 
                    type="text" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 focus:outline-none transition-colors text-lg font-medium"
                    placeholder="e.g. Alice Jones"
                  />
                </div>
                <button className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all text-lg">
                  Access Records
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="staff"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={onStaffLogin}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
                      Staff ID / User
                    </label>
                    <input 
                      name="user"
                      required 
                      type="text" 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="Username"
                    />
                  </div>
                  <div>
                    <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
                      Password
                    </label>
                    <input 
                      name="pass"
                      required 
                      type="password" 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <button className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-200 hover:bg-red-700 active:scale-95 transition-all text-lg flex items-center justify-center gap-3">
                  <LogInIcon className="w-5 h-5" />
                  Staff Login
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function StaffRecordCard({ kid, record, onLogRecord, onUpdateStrikes, onEditKid }: { 
  kid: KidData,
  record?: RecordData, 
  onLogRecord: () => void,
  onUpdateStrikes: (delta: number) => Promise<void>,
  onEditKid: () => void
}) {
  const pref = record ? PREFERENCE_CONFIG[record.preference] : null;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden group"
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-xl text-slate-900 group-hover:text-blue-600 transition-colors">
                {kid.name}
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">{kid.group}</span>
            </div>
          </div>
          <button 
            onClick={onEditKid}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all border border-slate-100"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Snack Status</span>
            {pref ? (
              <button onClick={onLogRecord} className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-bold shadow-sm hover:opacity-80 transition-opacity",
                pref.bg, pref.color, pref.border
              )}>
                <span className="text-lg">{pref.icon}</span>
                {pref.text}
              </button>
            ) : (
                <button 
                  onClick={onLogRecord}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm font-bold bg-slate-50 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors"
                >
                    <Plus className="w-4 h-4"/> Log Snack / Notes
                </button>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Daily Strikes</span>
            <div className={cn(
              "flex items-center rounded-2xl border-2 px-2 py-1 shadow-sm",
              (record?.strikes ?? 0) >= 3 ? "bg-red-50 text-red-700 border-red-200" : 
              (record?.strikes ?? 0) >= 1 ? "bg-orange-50 text-orange-700 border-orange-200" :
              "bg-slate-50 text-slate-600 border-slate-100"
            )}>
              <button 
                onClick={() => onUpdateStrikes(-1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/50 active:scale-90 transition-transform"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="font-black text-2xl w-10 text-center">{record?.strikes ?? 0}</span>
              <button 
                onClick={() => onUpdateStrikes(1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/50 active:scale-90 transition-transform"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {record?.notes && (
          <div className="mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-600 flex gap-3 items-start italic shadow-inner">
            <MessageCircle className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">{record.notes}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ParentRecordCard({ record }: { record: RecordData, key?: string }) {
  const pref = PREFERENCE_CONFIG[record.preference];
  const isToday = record.date === getFormattedDateKey(new Date());

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden"
    >
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
        <div className="font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-slate-400" />
          {formatDateFriendly(record.date)}
        </div>
        {isToday && (
          <span className="bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg shadow-emerald-100">
            Current
          </span>
        )}
      </div>
      
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Snack Info</div>
            <div className={cn(
              "inline-flex items-center gap-3 px-5 py-3 rounded-2xl border-2 text-sm font-bold shadow-sm w-full",
              pref.bg, pref.color, pref.border
            )}>
              <span className="text-2xl">{pref.icon}</span>
              {pref.text}
            </div>
          </div>

          <div className="space-y-2 text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Behavior</div>
            <div className={cn(
              "inline-flex items-center gap-2 px-5 py-3 rounded-2xl border-2 text-sm font-bold shadow-sm w-full justify-center",
              record.strikes === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              record.strikes < 3 ? "bg-amber-50 text-amber-700 border-amber-200" :
              "bg-red-50 text-red-700 border-red-200"
            )}>
              {record.strikes === 0 ? <CheckCircle2 className="w-5 h-5" /> : 
               record.strikes < 3 ? <AlertCircle className="w-5 h-5" /> : 
               <Info className="w-5 h-5" />}
              {record.strikes === 0 ? 'Excellent' : 
               `${record.strikes} Strike${record.strikes > 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        {record.notes && (
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Staff Insights</div>
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-slate-700 flex gap-4 items-start shadow-inner">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="leading-relaxed text-sm font-medium pt-1 italic">
                "{record.notes}"
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function RecordModal({ isOpen, onClose, record, onSave, onDelete, isLoading }: {
  isOpen: boolean;
  onClose: () => void;
  record: RecordData | null;
  onSave: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading: boolean;
}) {
  const [pref, setPref] = useState<Preference>(record?.preference || 'none');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {record ? 'Edit Record' : 'Add to Roster'}
            </h2>
            <button 
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={onSave} className="space-y-8">
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Child's Name
              </label>
              <input 
                name="name"
                defaultValue={record?.name}
                required
                readOnly
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-500 font-bold opacity-60 cursor-not-allowed text-lg"
                placeholder="Full Name"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Daily Snack Preference
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(PREFERENCE_CONFIG) as [Preference, typeof PREFERENCE_CONFIG['both']][]).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPref(key)}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-200",
                      pref === key 
                        ? "bg-white border-blue-500 text-blue-600 shadow-lg shadow-blue-50 -translate-y-1" 
                        : "bg-slate-50 border-slate-100 text-slate-400 grayscale opacity-60"
                    )}
                  >
                    <span className="text-2xl mb-1">{config.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{config.text}</span>
                  </button>
                ))}
                <input type="hidden" name="preference" value={pref} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Strikes Recorded
              </label>
              <div className="flex bg-slate-50 rounded-2xl p-2 border-2 border-slate-100 items-center">
                <input 
                  type="number" 
                  name="strikes"
                  defaultValue={record?.strikes || 0}
                  className="flex-1 bg-transparent text-center text-4xl font-black focus:outline-none py-2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Specific Notes
              </label>
              <textarea 
                name="notes"
                defaultValue={record?.notes}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 transition-colors min-h-[100px] font-medium"
                placeholder="Anything notable about today?"
              />
            </div>

            <div className="flex gap-4 pt-4">
              {record && (
                <button 
                  type="button"
                  onClick={() => onDelete(record.id)}
                  className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              )}
              <button 
                disabled={isLoading}
                className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all text-lg"
              >
                {isLoading ? 'Saving...' : 'Keep Record'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function KidModal({ isOpen, onClose, kid, onSave, onDelete, isLoading }: {
  isOpen: boolean;
  onClose: () => void;
  kid: KidData | null;
  onSave: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {kid ? 'Edit Kid' : 'Add New Kid'}
            </h2>
            <button 
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={onSave} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Child's Name
              </label>
              <input 
                name="name"
                defaultValue={kid?.name}
                required
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 transition-colors text-lg font-bold"
                placeholder="Full Name"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Program Group
              </label>
              <select 
                name="group"
                defaultValue={kid?.group || 'UPK AM'}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-700 font-bold focus:border-blue-500 transition-colors"
              >
                <option value="UPK AM">UPK AM</option>
                <option value="UPK PM">UPK PM</option>
                <option value="K-5AM">K-5AM</option>
                <option value="K-5PM">K-5PM</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-1">
                Weekly Schedule
              </label>
              <div className="grid grid-cols-5 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                   <label key={day} className="flex flex-col items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        name="schedule" 
                        value={day}
                        defaultChecked={kid?.schedule?.includes(day) ?? true}
                        className="peer sr-only"
                      />
                      <div className="w-full text-center py-2 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-400 bg-slate-50 peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-600 transition-all peer-active:scale-95">
                         {day}
                      </div>
                   </label>
                ))}
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              {kid && (
                <button 
                  type="button"
                  onClick={() => onDelete(kid.id)}
                  className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              )}
              <button 
                disabled={isLoading}
                className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all text-lg"
              >
                {isLoading ? 'Saving...' : 'Save Kid'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function LogInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 17L15 12L10 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3.5 9.08984H20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.9955 13.7002H12.0045" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.29431 13.7002H8.30329" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.29431 16.7002H8.30329" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
