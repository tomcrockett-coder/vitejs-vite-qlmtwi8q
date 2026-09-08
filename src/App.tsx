import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Activity, CheckCircle2, Circle, Send, Calendar, LogOut, Edit3, Zap, Sparkles, Flame, Shield, Loader2, Eye, EyeOff, Settings, Trash2, Users, Camera, Download, Palette, Moon, Sun, User } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, getDocs, deleteDoc } from 'firebase/firestore';

// --- CONFIGURE MASTER ADMIN ACCESS HERE ---
const ADMIN_EMAIL = "tom.crockett@ruralvirtual.org"; 

const firebaseConfig = {
  apiKey: "AIzaSyCHNoSv3EqxXOE06BXJvdA7YrhirCbjmbg",
  authDomain: "study-tracker-803a2.firebaseapp.com",
  projectId: "study-tracker-803a2"
};
 
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ZERO-LAG AUDIO ENGINE (Web Audio API) ---
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = {};

const fetchAudio = async (key, url) => {
  try {
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    audioBuffers[key] = await audioContext.decodeAudioData(arrayBuf);
  } catch(e) {
    console.warn("Audio load failed for", key);
  }
};

fetchAudio('click', 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
fetchAudio('unclick', 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3');
fetchAudio('ding', 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
fetchAudio('powerup', 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');

const initAudioCtx = () => {
  if (audioContext.state === 'suspended') audioContext.resume();
};
if (typeof window !== 'undefined') {
  window.addEventListener('click', initAudioCtx, { once: true });
  window.addEventListener('touchstart', initAudioCtx, { once: true });
}

const playSound = (key, volume = 1, rate = 1) => {
  if (!audioBuffers[key]) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffers[key];
  source.playbackRate.value = rate;
  const gainNode = audioContext.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  source.start(0);
};

const playClick = () => playSound('click', 1.0, 1.0);
const playUnclick = () => playSound('unclick', 1.8, 1.0);
const playDing = () => playSound('ding', 1.0, 1.0);
const playPowerup = () => playSound('powerup', 0.5, 1.0);

// --- THEME ENGINE ---
const THEMES = {
  burgundy: {
    id: 'burgundy', name: 'Classic Burgundy',
    primary: 'bg-[#8B1D3B]', hover: 'hover:bg-[#6A152C]', text: 'text-[#8B1D3B]', textDark: 'text-rose-400',
    border: 'border-[#8B1D3B]', borderDark: 'border-[#6A152C]', hex: '#8B1D3B', imageFilter: 'none'
  },
  navy: {
    id: 'navy', name: 'Midnight Navy',
    primary: 'bg-[#1E3A8A]', hover: 'hover:bg-[#172554]', text: 'text-[#1E3A8A]', textDark: 'text-blue-400',
    border: 'border-[#1E3A8A]', borderDark: 'border-[#172554]', hex: '#1E3A8A', imageFilter: 'hue-rotate(-120deg) brightness(0.9) saturate(1.2)'
  },
  forest: {
    id: 'forest', name: 'Evergreen',
    primary: 'bg-[#064E3B]', hover: 'hover:bg-[#022C22]', text: 'text-[#064E3B]', textDark: 'text-emerald-400',
    border: 'border-[#064E3B]', borderDark: 'border-[#022C22]', hex: '#064E3B', imageFilter: 'hue-rotate(170deg) brightness(0.8) saturate(1.1)'
  },
  plum: {
    id: 'plum', name: 'Royal Plum',
    primary: 'bg-[#4C1D95]', hover: 'hover:bg-[#2E1065]', text: 'text-[#4C1D95]', textDark: 'text-purple-400',
    border: 'border-[#4C1D95]', borderDark: 'border-[#2E1065]', hex: '#4C1D95', imageFilter: 'hue-rotate(-60deg) saturate(1.3)'
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // App Navigation State
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewAsStudent, setViewAsStudent] = useState(false);
  const [fireworksActive, setFireworksActive] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Photo & Theme State
  const [myPhoto, setMyPhoto] = useState(null);
  const [studentPhoto, setStudentPhoto] = useState(null);
  const [userThemeId, setUserThemeId] = useState('burgundy');

  // Dashboard Settings
  const [subjects, setSubjects] = useState(['Social Studies', 'Health', 'Language Arts', 'Math', 'Science', 'Lexia']);
  const [goalText, setGoalText] = useState('NO missing work');
  const [subjectTrackingMode, setSubjectTrackingMode] = useState('check');
  const [habits, setHabits] = useState(['Sat at my desk', 'No phone during work', '']);
  const [startingScore, setStartingScore] = useState(0);
  const [teacherAdjustment, setTeacherAdjustment] = useState(0);
  const [teacherDailyAdjustment, setTeacherDailyAdjustment] = useState(0);
  
  // Data State
  const [history, setHistory] = useState([]);
  const [replyTexts, setReplyTexts] = useState({});
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [isNoneSubjects, setIsNoneSubjects] = useState(false);
  const [isNoneHabits, setIsNoneHabits] = useState(false);
  const [todayData, setTodayData] = useState({ caughtUpSubjects: [], missingAssignments: {}, completedHabits: [], newNote: '' });
  
  const [researchData, setResearchData] = useState({
    location: { value: '', other: '', approved: false },
    distractions: { value: '', other: '', approved: false },
    stuck: { value: '', other: '', approved: false },
    extra: { value: '', approved: false }
  });

  // Admin User Management State
  const [allowedUsersList, setAllowedUsersList] = useState([]);
  const [newAllowedEmail, setNewAllowedEmail] = useState('');
  const [newAllowedRole, setNewAllowedRole] = useState('student');

  const activeHabits = habits.filter(h => h.trim() !== '');
  const activeSubjects = subjects.filter(s => s.trim() !== '');
  const currentTheme = THEMES[userThemeId] || THEMES.burgundy;

  // --- STYLING VARIABLES ---
  const isDark = isDarkMode;
  const bgPanel = isDark ? 'bg-slate-800' : 'bg-slate-200';
  const bgCard = isDark ? 'bg-slate-900' : 'bg-white';
  const bgInput = isDark ? 'bg-slate-800' : 'bg-gray-50';
  const textMain = isDark ? 'text-slate-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-gray-500';
  const borderMain = isDark ? 'border-slate-600' : 'border-black';
  const borderLight = isDark ? 'border-slate-700' : 'border-gray-200';
  const hoverCard = isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-50';
  const themeText = isDark ? currentTheme.textDark : currentTheme.text;

  // --- AUTHENTICATION & SYNC LOGIC ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          setUserRole('admin');
          setUser(currentUser);
          
          await setDoc(doc(db, 'users', currentUser.uid), {
            name: currentUser.displayName || 'Admin',
            email: currentUser.email,
            role: 'admin'
          }, { merge: true });
          
          await loadTeacherData(currentUser);
        } else {
          const allowedDocRef = doc(db, 'allowed_users', currentUser.email.toLowerCase());
          const allowedDoc = await getDoc(allowedDocRef);
          
          if (allowedDoc.exists()) {
            const role = allowedDoc.data().role || 'student';
            setUserRole(role);
            setUser(currentUser);
            
            await setDoc(doc(db, 'users', currentUser.uid), {
              name: currentUser.displayName || currentUser.email,
              email: currentUser.email,
              role: role
            }, { merge: true });

            if (role === 'student') setSelectedStudentId(currentUser.uid);
            else await loadTeacherData(currentUser);
          } else {
            setUserRole('unauthorized');
            setUser(currentUser);
          }
        }
        
        onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
            if(snap.exists()) {
              if (snap.data().photoURL) setMyPhoto(snap.data().photoURL);
              if (snap.data().theme) setUserThemeId(snap.data().theme);
              if (snap.data().darkMode !== undefined) setIsDarkMode(snap.data().darkMode);
            } else {
              setMyPhoto(currentUser.photoURL);
            }
        });

      } else {
        setUser(null);
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadTeacherData = async (currentUser) => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedStudents = [];
      
      usersSnap.forEach(d => {
        const data = d.data();
        const userEmail = data.email ? data.email.toLowerCase() : '';
        const adminEmailStr = ADMIN_EMAIL.toLowerCase();
        
        if (data.role === 'student' || (!data.role && userEmail && userEmail !== adminEmailStr)) {
          fetchedStudents.push({ 
            id: d.id, 
            name: data.name || data.email || 'Unnamed Student',
            ...data 
          });
        }
      });
      
      setStudentsList(fetchedStudents);
    } catch (error) {
      console.error("Error loading students list:", error);
    }
  };

  const fetchAllowedUsers = async () => {
    const snap = await getDocs(collection(db, 'allowed_users'));
    const users = [];
    snap.forEach(d => users.push({ email: d.id, ...d.data() }));
    setAllowedUsersList(users);
  };

  useEffect(() => {
    if (userRole === 'admin' && showAdminPanel) {
      fetchAllowedUsers();
    }
  }, [userRole, showAdminPanel]);

  useEffect(() => {
    if (!user || !selectedStudentId || userRole === 'unauthorized') return;

    const unsubUser = onSnapshot(doc(db, 'users', selectedStudentId), (docSnap) => {
      if(docSnap.exists()) setStudentPhoto(docSnap.data().photoURL || null);
    });

    const unsubHistory = onSnapshot(collection(db, 'users', selectedStudentId, 'history'), (snapshot) => {
      const fetched = [];
      snapshot.forEach(doc => fetched.push(doc.data()));
      fetched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(fetched);
    });

    const unsubSettings = onSnapshot(doc(db, 'users', selectedStudentId, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (d.goalText) setGoalText(d.goalText);
        if (d.subjectTrackingMode) setSubjectTrackingMode(d.subjectTrackingMode);
        else setSubjectTrackingMode('check');
        if (d.habits) setHabits(d.habits);
        if (d.subjects) setSubjects(d.subjects);
        if (d.startingScore !== undefined) setStartingScore(d.startingScore);
        if (d.teacherAdjustment !== undefined) setTeacherAdjustment(d.teacherAdjustment);
        if (d.teacherDailyAdjustment !== undefined) setTeacherDailyAdjustment(d.teacherDailyAdjustment);
      }
    });

    const unsubResearch = onSnapshot(doc(db, 'users', selectedStudentId, 'research', 'habits'), (docSnap) => {
      if (docSnap.exists()) setResearchData(docSnap.data());
    });

    return () => { unsubUser(); unsubHistory(); unsubSettings(); unsubResearch(); };
  }, [user, selectedStudentId, userRole]);

  const todayId = new Date().toISOString().split('T')[0];
  const todaysHistory = history.find(h => h.id === todayId);
  const isSubmittedToday = !!todaysHistory;
  const isStaff = userRole === 'admin' || userRole === 'teacher';
  const isEffectivelyStaff = isStaff && !viewAsStudent;

  useEffect(() => {
    if (isEditingToday && todaysHistory) {
      setTodayData({
        caughtUpSubjects: todaysHistory.caughtUpSubjects || [],
        missingAssignments: todaysHistory.missingAssignments || {},
        completedHabits: todaysHistory.completedHabits || [],
        newNote: ''
      });
      setIsNoneSubjects(todaysHistory.caughtUpSubjects?.length === 0);
      setIsNoneHabits(todaysHistory.completedHabits?.length === 0);
    }
  }, [isEditingToday, todaysHistory]);

  const currentStreak = useMemo(() => history.length > 0 ? (history[0].streak || 0) : 0, [history]);

  const healthScore = useMemo(() => {
    let bonus = 0;
    Object.values(researchData).forEach(item => { if (item.approved) bonus += 2; });
    let calculated = startingScore;
    if (history.length > 0) {
      let totalPossible = 0; let totalEarned = 0;
      history.forEach(day => {
        totalPossible += (day.possibleCount || (activeSubjects.length + activeHabits.length));
        const subjectEarned = day.caughtUpSubjects?.length ?? Object.values(day.missingAssignments || {}).filter(value => Number(value) === 0).length;
        totalEarned += (subjectEarned + (day.completedHabits?.length || 0));
      });
      calculated = Math.round((totalEarned / totalPossible) * 100);
    }
    return calculated + bonus + teacherAdjustment;
  }, [history, activeSubjects.length, activeHabits.length, startingScore, teacherAdjustment, researchData]);

  const todayScore = useMemo(() => {
    const possible = activeSubjects.length + activeHabits.length;
    if (possible === 0) return 0 + teacherDailyAdjustment;
    if (isSubmittedToday && !isEditingToday) {
      const subjectEarned = todaysHistory?.caughtUpSubjects?.length ?? Object.values(todaysHistory?.missingAssignments || {}).filter(value => Number(value) === 0).length;
      const earned = subjectEarned + (todaysHistory?.completedHabits?.length || 0);
      return Math.round((earned / (todaysHistory?.possibleCount || possible)) * 100) + teacherDailyAdjustment;
    }
    const liveSubjectEarned = subjectTrackingMode === 'missingCount'
      ? activeSubjects.filter(sub => Number(todayData.missingAssignments?.[sub] ?? 0) === 0).length
      : todayData.caughtUpSubjects.length;
    const earned = liveSubjectEarned + todayData.completedHabits.length;
    return Math.round((earned / possible) * 100) + teacherDailyAdjustment;
  }, [todayData, subjectTrackingMode, activeSubjects, activeHabits.length, isSubmittedToday, isEditingToday, todaysHistory, teacherDailyAdjustment]);

  const researchUnlocked = isEffectivelyStaff || (healthScore >= startingScore + 10);

  // --- ACTIONS ---
  const toggleDarkMode = async () => {
    const newVal = !isDarkMode;
    setIsDarkMode(newVal);
    if (user) {
      await setDoc(doc(db, 'users', user.uid), { darkMode: newVal }, { merge: true });
    }
  };

  const changeTheme = async (newThemeId) => {
    setUserThemeId(newThemeId);
    setShowThemeMenu(false);
    if (user) {
      await setDoc(doc(db, 'users', user.uid), { theme: newThemeId }, { merge: true });
    }
  };

  const handleLogin = async (useRedirect = false) => {
    setAuthError(null); setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (useRedirect) await signInWithRedirect(auth, provider);
      else await signInWithPopup(auth, provider);
    } catch (error) {
      setAuthError(error.message);
    } finally { setIsLoggingIn(false); }
  };

  const submitToday = async () => {
    if (!selectedStudentId) return;
    const possibleCount = activeSubjects.length + activeHabits.length;
    let newStreak = 1;
    if (history.length > 0) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (history[0].date === yesterday) newStreak = (history[0].streak || 0) + 1;
      else if (history[0].date === todayId) newStreak = history[0].streak || 1;
    }
    const subjectData = subjectTrackingMode === 'missingCount'
      ? Object.fromEntries(activeSubjects.map(sub => [sub, Math.max(0, Number(todayData.missingAssignments?.[sub] ?? 0) || 0)]))
      : (todayData.missingAssignments || {});
    const caughtUpSubjects = subjectTrackingMode === 'missingCount'
      ? activeSubjects.filter(sub => Number(subjectData[sub]) === 0)
      : todayData.caughtUpSubjects;
    const newEntry = {
      id: todayId, date: todayId,
      caughtUpSubjects, missingAssignments: subjectData, completedHabits: todayData.completedHabits,
      possibleCount, streak: newStreak, notes: todaysHistory?.notes || []
    };
    if (todayData.newNote.trim()) {
      newEntry.notes.push({ author: 'Student', text: todayData.newNote.trim(), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) });
    }
    await setDoc(doc(db, 'users', selectedStudentId, 'history', todayId), newEntry);
    playDing();
    setIsEditingToday(false);
  };

  const submitReply = async (dayId) => {
    const text = replyTexts[dayId];
    if (!text?.trim() || !selectedStudentId) return;
    const day = history.find(h => h.id === dayId);
    const updated = { ...day, notes: [...(day.notes || []), { author: 'Mr. Crockett', text: text.trim(), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }] };
    await setDoc(doc(db, 'users', selectedStudentId, 'history', dayId), updated);
    setReplyTexts({ ...replyTexts, [dayId]: '' });
  };

  const handleApproveResearch = async (category) => {
    if (!isEffectivelyStaff || !selectedStudentId) return;
    const isNowApproved = !researchData[category].approved;
    if (isNowApproved) { playPowerup(); setFireworksActive(true); setTimeout(() => setFireworksActive(false), 2000); }
    const newData = { ...researchData, [category]: { ...researchData[category], approved: isNowApproved } };
    setResearchData(newData);
    await setDoc(doc(db, 'users', selectedStudentId, 'research', 'habits'), newData);
  };

  const saveSettings = async () => {
    if (!selectedStudentId) return;
    await setDoc(doc(db, 'users', selectedStudentId, 'settings', 'config'), {
      subjects: subjects.filter(s => s.trim() !== ''),
      habits: habits.filter(h => h.trim() !== ''),
      goalText,
      subjectTrackingMode,
      startingScore: Number(startingScore) || 0,
      teacherAdjustment: Number(teacherAdjustment) || 0,
      teacherDailyAdjustment: Number(teacherDailyAdjustment) || 0
    }, { merge: true });
    playDing();
    setShowSettings(false);
  };

  const handleAddAllowedUser = async () => {
    if (!newAllowedEmail.trim()) return;
    await setDoc(doc(db, 'allowed_users', newAllowedEmail.toLowerCase().trim()), {
      role: newAllowedRole,
      addedAt: new Date().toISOString()
    });
    setNewAllowedEmail('');
    fetchAllowedUsers();
  };

  const handleDeleteAllowedUser = async (email) => {
    if(window.confirm(`Remove access for ${email}?`)) {
      await deleteDoc(doc(db, 'allowed_users', email));
      fetchAllowedUsers();
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if(window.confirm(`Are you sure you want to permanently delete all data for ${studentName}? This cannot be undone.`)) {
      await deleteDoc(doc(db, 'users', studentId));
      
      const studentObj = studentsList.find(s => s.id === studentId);
      if (studentObj && studentObj.email) {
        await deleteDoc(doc(db, 'allowed_users', studentObj.email.toLowerCase()));
      }
      
      if (selectedStudentId === studentId) setSelectedStudentId(null);
      loadTeacherData(user);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    const targetId = selectedStudentId || (user ? user.uid : null);
    if (!file || !targetId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
       const img = new Image();
       img.onload = async () => {
         const canvas = document.createElement('canvas');
         const MAX_WIDTH = 150;
         const scaleSize = MAX_WIDTH / img.width;
         canvas.width = MAX_WIDTH;
         canvas.height = img.height * scaleSize;
         const ctx = canvas.getContext('2d');
         ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
         const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
         
         if (selectedStudentId) setStudentPhoto(dataUrl);
         else setMyPhoto(dataUrl);

         await setDoc(doc(db, 'users', targetId), { photoURL: dataUrl }, { merge: true });
         playDing();
       }
       img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const uploadTargetId = selectedStudentId || (user ? user.uid : null);
  const displayPhoto = selectedStudentId ? studentPhoto : myPhoto;

  // --- DATA EXPORT LOGIC ---
  const exportToCSV = (data, fileName) => {
    if (!data || data.length === 0) return;
    const headers = ["Date", "Overall Score (%)", "Streak", "Possible Items", "Subjects Caught Up", "Habits Completed", "Notes/Comments"];
    const rows = data.map(day => {
      const score = Math.round(((day.caughtUpSubjects?.length || 0) + (day.completedHabits?.length || 0)) / (day.possibleCount || 1) * 100);
      const classes = (day.caughtUpSubjects || []).join("; ");
      const habits = (day.completedHabits || []).join("; ");
      const noteStr = (day.notes || []).map(n => `[${n.author}]: ${n.text}`).join(" | ");
      return [ day.date, score, day.streak || 0, day.possibleCount || 0, `"${classes}"`, `"${habits}"`, `"${noteStr.replace(/"/g, '""')}"` ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkExport = async () => {
    setIsExporting(true);
    let masterData = [];
    const headers = ["Student Name", "Student Email", "Date", "Overall Score (%)", "Streak", "Possible Items", "Subjects Caught Up", "Habits Completed", "Notes/Comments"];
    masterData.push(headers.join(","));

    try {
      for (const student of studentsList) {
        const hSnap = await getDocs(collection(db, 'users', student.id, 'history'));
        hSnap.forEach(d => {
          const day = d.data();
          const score = Math.round(((day.caughtUpSubjects?.length || 0) + (day.completedHabits?.length || 0)) / (day.possibleCount || 1) * 100);
          const noteStr = (day.notes || []).map(n => `[${n.author}]: ${n.text}`).join(" | ");
          const row = [ student.name, student.email || "N/A", day.date, score, day.streak || 0, day.possibleCount || 0, `"${(day.caughtUpSubjects || []).join("; ")}"`, `"${(day.completedHabits || []).join("; ")}"`, `"${noteStr.replace(/"/g, '""')}"` ];
          masterData.push(row.join(","));
        });
      }
      const csvContent = "data:text/csv;charset=utf-8," + masterData.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Equip_Master_Data_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setIsExporting(false);
    }
  };

  // --- THE FINAL LOGO COMPONENT ---
  const RVALogo = ({ large, theme, centered }) => {
    return (
      <div className={`flex items-center ${centered ? 'relative right-2 md:right-4' : ''}`}>
        <div className={`flex items-center justify-center shrink-0 relative z-0 ${large ? 'w-12 h-12 md:w-16 md:h-16 mr-2' : 'w-8 h-8 md:w-10 md:h-10 mr-2 md:mr-1.5'}`}>
          <img 
            src="image.png" 
            alt="Equip" 
            className="w-full h-full object-contain scale-[1.7] transition-all duration-700 drop-shadow-sm" 
            style={{ filter: `${theme.imageFilter} ${isDark ? 'brightness(1.5)' : ''}`.trim() }}
          />
        </div>
        
        <div className="flex flex-col items-start justify-center cursor-default relative z-10 drop-shadow-sm">
          <div className={`${large ? 'text-3xl md:text-4xl' : 'text-xl md:text-2xl'} font-black leading-none tracking-tighter ${textMain} transition-colors duration-500`}>Equip</div>
          <div className={`${large ? 'text-[7px] mt-1 pt-0.5' : 'text-[6px] md:text-[7px] mt-1 pt-0.5'} font-black ${themeText} tracking-[0.2em] uppercase opacity-90 border-t w-full transition-colors duration-500`} style={{ borderColor: currentTheme.hex + '33' }}>
            <span className="typewriter inline-block">By Rural Virtual Academy</span>
          </div>
        </div>
      </div>
    );
  };

  const getHealthColor = (s) => s >= 85 ? (isDark ? 'text-emerald-400' : 'text-[#2D6A4F]') : s >= 70 ? 'text-amber-500' : 'text-red-500';
  const getHealthBg = (s) => s >= 85 ? (isDark ? 'bg-emerald-600' : 'bg-[#2D6A4F]') : s >= 70 ? 'bg-amber-500' : 'bg-red-500';

  // --- LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-screen animated-gradient-bg flex items-center justify-center p-4">
        <style>
          {`
            :root {
              --bg-grad-top: ${isDark ? '#020617' : '#ffffff'};
              --bg-grad-mid: ${isDark ? '#1e293b' : '#f8fafc'};
              --bg-grad-bot: ${isDark ? '#0f172a' : '#cbd5e1'};
            }
            @keyframes bgFadeInUp {
              0% { background-position: 50% 100%; }
              100% { background-position: 50% 0%; }
            }
            .animated-gradient-bg {
              background: linear-gradient(to top, var(--bg-grad-bot) 0%, var(--bg-grad-mid) 40%, var(--bg-grad-top) 100%);
              background-size: 100% 250%;
              animation: bgFadeInUp 2s ease-out forwards;
            }
            @keyframes typing {
              from { width: 0; }
              to { width: 100%; }
            }
            .typewriter {
              overflow: hidden;
              white-space: nowrap;
              width: 0;
              animation: typing 1.5s steps(24, end) forwards;
              animation-delay: 0.5s;
            }
          `}
        </style>
        <div className="max-w-md w-full flex flex-col items-center text-center">
          <div className="flex justify-center mb-8">
            <RVALogo large={true} theme={currentTheme} centered={true} />
          </div>
          <p className={`${textMuted} mb-6 text-sm font-medium`}>Sign in with your Google account to access your dashboard.</p>
          <button onClick={() => handleLogin()} disabled={isLoggingIn} className={`w-full py-3 rounded-xl ${currentTheme.primary} ${currentTheme.hover} text-white font-bold text-base transition-all flex items-center justify-center gap-2 shadow-md border-2 ${borderMain} border-b-[4px] active:border-b-2 active:translate-y-[2px] disabled:opacity-50`}>
            {isLoggingIn ? <Loader2 className="animate-spin size-5" /> : "Sign in with Google"}
          </button>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD SCREEN ---
  return (
    <div className={`min-h-screen animated-gradient-bg p-2 md:p-4 font-sans ${textMain} flex flex-col items-center transition-colors duration-500`}>
      
      <style>
        {`
          :root {
            --bg-grad-top: ${isDark ? '#020617' : '#ffffff'};
            --bg-grad-mid: ${isDark ? '#1e293b' : '#f8fafc'};
            --bg-grad-bot: ${isDark ? '#0f172a' : '#cbd5e1'};
          }
          @keyframes bgFadeInUp {
            0% { background-position: 50% 100%; }
            100% { background-position: 50% 0%; }
          }
          .animated-gradient-bg {
            background: linear-gradient(to top, var(--bg-grad-bot) 0%, var(--bg-grad-mid) 40%, var(--bg-grad-top) 100%);
            background-size: 100% 250%;
            animation: bgFadeInUp 2s ease-out forwards;
          }
          @keyframes typing {
            from { width: 0; }
            to { width: 100%; }
          }
          .typewriter {
            overflow: hidden;
            white-space: nowrap;
            width: 0;
            animation: typing 1.5s steps(24, end) forwards;
            animation-delay: 0.5s;
          }
        `}
      </style>

      {/* TOP NAVIGATION BAR WITH CENTERED HEALTH STATS */}
      <div className={`w-full max-w-6xl ${bgPanel} rounded-3xl md:rounded-full px-5 md:px-6 py-2.5 md:py-3 shadow-sm border-[3px] ${currentTheme.border} mb-4 flex flex-col lg:flex-row justify-between items-center gap-4 transition-colors duration-500`}>
        
        {/* LEFT: Logo Component */}
        <div className="flex justify-center lg:justify-start lg:flex-1 shrink-0 w-full lg:w-auto">
          <RVALogo large={false} theme={currentTheme} />
        </div>
        
        {/* CENTER: Academic Health Stats */}
        {selectedStudentId && !showAdminPanel && !showSettings && (
          <div className={`flex items-center justify-center gap-4 md:gap-8 lg:flex-shrink-0 w-full lg:w-auto ${isDark ? 'bg-black/20' : 'bg-white/40'} lg:bg-transparent rounded-2xl lg:rounded-none py-2 lg:py-0 border-2 border-black/5 lg:border-transparent`}>
            
            <div className={`flex items-center gap-1.5 text-orange-500 font-black uppercase text-[10px] tracking-widest ${bgCard} px-3 py-1.5 rounded-full border-2 ${borderMain} shadow-sm`}>
              <Flame size={14} fill="currentColor" /> {currentStreak} Day Streak
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-10 h-10 font-black text-sm">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke={isDark ? "#334155" : "#d1d5db"} strokeWidth="10" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 * (1 - todayScore/100)} className={`${getHealthColor(todayScore)} transition-all duration-1000`} strokeLinecap="round" />
                </svg>
                <div className="absolute">{todayScore}</div>
              </div>
              <span className={`text-[10px] font-black uppercase ${textMuted} tracking-widest hidden md:block`}>Today</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-12 h-12 font-black text-base">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke={isDark ? "#334155" : "#d1d5db"} strokeWidth="10" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 * (1 - Math.min(healthScore, 100)/100)} className={`${getHealthColor(healthScore)} transition-all duration-1000`} strokeLinecap="round" />
                </svg>
                <div className="absolute">{healthScore}</div>
                {fireworksActive && <Sparkles size={24} className="absolute text-yellow-500 animate-bounce" />}
              </div>
              <span className={`text-[10px] font-black uppercase ${textMuted} tracking-widest hidden md:block`}>Overall</span>
            </div>
            
          </div>
        )}
        
        {/* RIGHT: Action Icons and User Controls */}
        <div className="flex items-center gap-2 flex-wrap justify-center lg:justify-end lg:flex-1 w-full lg:w-auto">
          {isStaff && selectedStudentId && !showAdminPanel && (
            <button 
              onClick={() => { setViewAsStudent(!viewAsStudent); setShowSettings(false); }} 
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full transition-all border-2 ${borderMain} ${viewAsStudent ? (isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-800') : `${bgCard} ${textMain} ${hoverCard}`}`}>
              {viewAsStudent ? <EyeOff size={14} /> : <Eye size={14} />} 
              <span className="hidden md:inline">{viewAsStudent ? 'Exit Student View' : 'View as Student'}</span>
            </button>
          )}
          
          {isStaff && !showAdminPanel && (
            <select className={`p-2 ${bgCard} border-2 ${borderMain} rounded-xl text-xs font-bold ${textMain} outline-none focus:${currentTheme.border} transition-colors`} value={selectedStudentId || ''} onChange={(e) => { setSelectedStudentId(e.target.value); setViewAsStudent(false); setShowSettings(false); }}>
              <option value="">-- Select Student --</option>
              {studentsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          
          {userRole === 'admin' && (
            <button 
              onClick={() => { setShowAdminPanel(!showAdminPanel); setSelectedStudentId(null); setShowSettings(false); }} 
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full border-2 ${borderMain} transition-colors font-bold text-xs ${showAdminPanel ? (isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700') : `${bgCard} ${textMain} ${hoverCard}`}`} 
              title="Admin Settings">
              <Shield size={14} />
              <span className="hidden md:inline">{showAdminPanel ? 'Exit Admin' : 'Admin'}</span>
            </button>
          )}

          {uploadTargetId && (
            <div className={`relative w-9 h-9 rounded-full border-2 ${borderMain} overflow-hidden group cursor-pointer shrink-0 ml-1 shadow-sm ${bgCard}`}>
              {displayPhoto ? (
                <img src={displayPhoto} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex items-center justify-center ${bgInput}`}>
                  <User size={18} className={textMuted} />
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={14} className="text-white" />
              </div>
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handlePhotoUpload} />
            </div>
          )}

          <div className="relative flex items-center">
            <button onClick={toggleDarkMode} className={`p-2 rounded-full ${bgCard} border-2 ${borderMain} ${hoverCard} transition-colors ml-1`} title="Toggle Dark Mode">
              {isDark ? <Sun size={16} className={textMain} /> : <Moon size={16} className={textMain} />}
            </button>
            <button onClick={() => setShowThemeMenu(!showThemeMenu)} className={`p-2 rounded-full ${bgCard} border-2 ${borderMain} ${hoverCard} transition-colors ml-1`} title="Color Theme">
              <Palette size={16} className={textMain} />
            </button>
            {showThemeMenu && (
              <div className={`absolute right-0 top-full mt-2 p-2 ${bgCard} border-2 ${borderMain} rounded-xl shadow-xl flex gap-2 z-50 animate-in fade-in zoom-in-95 duration-200`}>
                {Object.values(THEMES).map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => changeTheme(t.id)} 
                    className={`w-7 h-7 rounded-full border-2 ${borderMain} shadow-inner ${t.primary} transition-all ${userThemeId === t.id ? `ring-2 ring-offset-1 ${isDark ? 'ring-slate-500' : 'ring-black'} scale-110` : 'hover:scale-110 opacity-70 hover:opacity-100'}`} 
                    title={t.name} 
                  />
                ))}
              </div>
            )}
          </div>

          <button onClick={() => auth.signOut()} className={`${textMuted} ${isDark ? 'hover:text-red-400 hover:bg-red-900/50' : 'hover:text-red-700 hover:bg-red-50'} font-bold ml-1 p-2 rounded-full ${bgCard} border-2 ${borderMain} transition-colors`}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Settings Link */}
      {isStaff && selectedStudentId && !showAdminPanel && !viewAsStudent && (
        <div className="w-full max-w-6xl text-right mb-4 px-2">
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className={`${themeText} font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-end gap-1 ml-auto underline underline-offset-2 decoration-2`}>
            <Settings size={12} /> {showSettings ? 'Close Configuration' : 'Configure Student Information'}
          </button>
        </div>
      )}

      {showAdminPanel ? (
        <div className={`w-full max-w-6xl ${currentTheme.primary} rounded-[24px] p-6 md:p-8 shadow-lg border-[3px] ${currentTheme.borderDark} mt-2 text-center transition-colors duration-500`}>
          <Shield size={32} className="text-white opacity-20 mx-auto mb-2" />
          <h2 className="text-2xl font-black text-white mb-2">Admin Dashboard</h2>
          <p className="text-white/80 text-sm mb-6">Welcome to the Admin side. Global settings, configurations, and user management live here.</p>
          
          <div className={`${bgCard} p-6 rounded-2xl border-2 ${borderMain} text-left space-y-5 max-w-4xl mx-auto shadow-sm mt-4 mb-6`}>
            <div className={`flex flex-col md:flex-row justify-between items-center border-b-2 ${borderLight} pb-2 mb-3`}>
              <h3 className={`font-black text-lg flex items-center gap-2 ${themeText}`}><Users size={20} /> User Access Management</h3>
              <button 
                onClick={handleBulkExport} 
                disabled={isExporting || studentsList.length === 0}
                className={`flex items-center gap-2 px-3 py-1.5 ${isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'} ${isDark ? 'text-emerald-400' : 'text-[#2D6A4F]'} border-2 ${borderMain} rounded-lg text-[10px] font-black uppercase tracking-widest ${isDark ? 'hover:bg-emerald-900/60' : 'hover:bg-emerald-100'} transition-all disabled:opacity-50 mt-2 md:mt-0`}>
                {isExporting ? <Loader2 className="animate-spin" size={12} /> : <Download size={12} />} 
                Master Data Export
              </button>
            </div>
            
            <div className="flex flex-col md:flex-row gap-2.5">
              <input type="email" placeholder="Google Email Address..." className={`flex-1 p-2.5 text-sm border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border} ${bgInput}`} value={newAllowedEmail} onChange={e => setNewAllowedEmail(e.target.value)} />
              <select className={`p-2.5 text-sm border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border} ${bgInput}`} value={newAllowedRole} onChange={e => setNewAllowedRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher (Staff)</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleAddAllowedUser} className={`px-5 py-2.5 text-sm ${currentTheme.primary} ${currentTheme.hover} text-white font-bold rounded-xl border-2 ${borderMain} transition-colors`}>Add User</button>
            </div>

            <div className="space-y-2 mt-4 max-h-[250px] overflow-y-auto pr-2">
              {allowedUsersList.map(u => (
                <div key={u.email} className={`flex justify-between items-center p-3 border-2 ${borderMain} rounded-xl ${bgInput} ${hoverCard} transition-colors`}>
                  <div>
                    <div className={`font-bold text-sm ${textMain}`}>{u.email}</div>
                    <div className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${themeText}`}>{u.role}</div>
                  </div>
                  {u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase() && (
                    <button onClick={() => handleDeleteAllowedUser(u.email)} className={`p-2 border-2 ${borderMain} text-red-500 ${isDark ? 'hover:text-red-400 hover:bg-red-900/50' : 'hover:text-red-700 hover:bg-red-50'} rounded-lg transition-colors`}><Trash2 size={16}/></button>
                  )}
                </div>
              ))}
            </div>

            <h3 className={`font-black text-lg border-b-2 ${borderLight} pb-2 flex items-center gap-2 mt-6 ${themeText}`}><Users size={20} /> Registered Students (Data)</h3>
            <div className="space-y-2 mt-3 max-h-[250px] overflow-y-auto pr-2">
              {studentsList.map(s => (
                <div key={s.id} className={`flex justify-between items-center p-3 border-2 ${borderMain} rounded-xl ${bgInput} ${hoverCard} transition-colors`}>
                  <div>
                    <div className={`font-bold text-sm ${textMain}`}>{s.name}</div>
                    <div className={`text-[10px] font-black uppercase tracking-widest ${textMuted} mt-0.5`}>{s.email}</div>
                  </div>
                  <button onClick={() => handleDeleteStudent(s.id, s.name)} className={`p-2 border-2 ${borderMain} text-red-500 ${isDark ? 'hover:text-red-400 hover:bg-red-900/50' : 'hover:text-red-700 hover:bg-red-50'} rounded-lg transition-colors`} title="Delete Student Record"><Trash2 size={16}/></button>
                </div>
              ))}
              {studentsList.length === 0 && <div className={`${textMuted} font-bold text-sm p-3`}>No registered students found.</div>}
            </div>
          </div>

          <button onClick={() => setShowAdminPanel(false)} className={`px-6 py-3 text-sm ${bgCard} ${themeText} font-bold rounded-xl ${hoverCard} transition-all shadow-md border-2 ${borderMain}`}>
            Return to Student Selection
          </button>
        </div>
      ) : showSettings ? (
        <div className={`w-full max-w-6xl ${bgPanel} rounded-[24px] p-6 shadow-sm border-[3px] ${currentTheme.border} mt-2 transition-colors duration-500`}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Settings size={28} className={themeText} />
            <h2 className="text-2xl font-black text-gray-900">Student Configuration</h2>
          </div>
          
          <div className={`${bgCard} p-6 rounded-2xl border ${borderLight} text-left space-y-5 max-w-3xl mx-auto shadow-sm`}>
            <div className="space-y-3">
              <h3 className={`font-black text-base ${textMain} border-b-2 ${borderLight} pb-1.5 flex items-center gap-2`}><Flame size={16} className="text-orange-500"/> Scoring Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black ${textMuted} uppercase tracking-widest mb-1.5`}>Starting Health Score (Overall)</label>
                  <input type="number" className={`w-full p-2.5 text-sm ${bgInput} border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border}`} value={startingScore} onChange={e => setStartingScore(Number(e.target.value))} />
                </div>
                <div>
                  <label className={`block text-[10px] font-black ${textMuted} uppercase tracking-widest mb-1.5`}>Manually Edit Daily Score (+ / -)</label>
                  <input type="number" className={`w-full p-2.5 text-sm ${bgInput} border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border}`} value={teacherDailyAdjustment} onChange={e => setTeacherDailyAdjustment(Number(e.target.value))} />
                </div>
                <div className="md:col-span-2">
                  <label className={`block text-[10px] font-black ${textMuted} uppercase tracking-widest mb-1.5`}>Manually Edit Overall Score (+ / -)</label>
                  <input type="number" className={`w-full p-2.5 text-sm ${bgInput} border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border}`} value={teacherAdjustment} onChange={e => setTeacherAdjustment(Number(e.target.value))} />
                </div>
                <div className="md:col-span-2">
                  <label className={`block text-[10px] font-black ${textMuted} uppercase tracking-widest mb-1.5`}>Goal Text (e.g. "No missing work", "Less than 5 missing")</label>
                  <input type="text" className={`w-full p-2.5 text-sm ${bgInput} border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border}`} value={goalText} onChange={e => setGoalText(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3">
              <h3 className={`font-black text-base ${textMain} border-b-2 ${borderLight} pb-1.5 flex items-center gap-2`}><Activity size={16} className={themeText}/> Tracked Classes</h3>
              <div className={`p-3 rounded-xl border-2 ${borderMain} ${bgInput}`}>
                <label className={`block text-[10px] font-black ${textMuted} uppercase tracking-widest mb-2`}>Subject Tracking Method</label>
                <select className={`w-full p-2.5 text-sm border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border} ${bgCard}`} value={subjectTrackingMode} onChange={e => setSubjectTrackingMode(e.target.value)}>
                  <option value="check">Check each class with NO missing work</option>
                  <option value="missingCount">Enter the number of missing assignments</option>
                </select>
                <p className={`text-[10px] ${textMuted} mt-2 font-medium`}>Changing this only changes how current and future check-ins are entered. Previously saved history stays intact.</p>
              </div>
              {subjects.map((sub, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`flex-1 p-2.5 text-sm ${bgInput} border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border}`} value={sub} onChange={e => { const n = [...subjects]; n[i] = e.target.value; setSubjects(n); }} />
                  <button onClick={() => setSubjects(subjects.filter((_, idx) => idx !== i))} className={`p-2.5 border-2 ${borderMain} text-red-500 ${isDark ? 'hover:text-red-400 hover:bg-red-900/50' : 'hover:text-red-700 hover:bg-red-50'} rounded-xl transition-all`}><Trash2 size={18}/></button>
                </div>
              ))}
              <button onClick={() => setSubjects([...subjects, ''])} className={`px-4 py-2.5 ${isDark ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60' : 'bg-emerald-50 text-[#2D6A4F] hover:bg-emerald-100'} font-bold rounded-xl transition-all text-xs border-2 ${borderMain}`}>+ Add Class</button>
            </div>

            <div className="space-y-3 pt-3">
              <h3 className={`font-black text-base ${textMain} border-b-2 ${borderLight} pb-1.5 flex items-center gap-2`}><CheckCircle2 size={16} className={isDark ? "text-emerald-400" : "text-[#2D6A4F]"}/> Target Habits</h3>
              {habits.map((hab, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`flex-1 p-2.5 text-sm ${bgInput} border-2 ${borderMain} rounded-xl font-bold ${textMain} outline-none focus:${currentTheme.border}`} value={hab} onChange={e => { const n = [...habits]; n[i] = e.target.value; setHabits(n); }} />
                  <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))} className={`p-2.5 border-2 ${borderMain} text-red-500 ${isDark ? 'hover:text-red-400 hover:bg-red-900/50' : 'hover:text-red-700 hover:bg-red-50'} rounded-xl transition-all`}><Trash2 size={18}/></button>
                </div>
              ))}
              <button onClick={() => setHabits([...habits, ''])} className={`px-4 py-2.5 ${isDark ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60' : 'bg-emerald-50 text-[#2D6A4F] hover:bg-emerald-100'} font-bold rounded-xl transition-all text-xs border-2 ${borderMain}`}>+ Add Habit</button>
            </div>

            <div className={`pt-4 border-t ${borderLight} flex flex-col md:flex-row gap-3`}>
              <button onClick={saveSettings} className={`flex-1 py-3 text-sm ${currentTheme.primary} text-white font-black rounded-xl ${currentTheme.hover} transition-all shadow-md border-2 ${borderMain} border-b-[4px] active:border-b-2 active:translate-y-[2px]`}>Save Settings</button>
              <button onClick={() => setShowSettings(false)} className={`px-8 py-3 text-sm ${bgCard} border-2 ${borderMain} ${textMain} font-bold rounded-xl ${hoverCard} transition-all shadow-sm`}>Cancel</button>
            </div>
          </div>
        </div>
      ) : !selectedStudentId ? (
        <div className={`w-full max-w-3xl ${currentTheme.primary} rounded-[24px] p-8 text-center shadow-lg border-[3px] ${currentTheme.borderDark} mt-4 transition-colors duration-500`}>
          <Activity size={40} className="text-white opacity-20 mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Ready to Equip?</h2>
          <p className="text-white/80 text-sm">Select a student from the menu above to start your session.</p>
        </div>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
          <div className="lg:col-span-2 space-y-3 md:space-y-4">

            {/* Daily Submission Panel */}
            {!isEffectivelyStaff && (
              <div className={`${bgPanel} rounded-[20px] md:rounded-[24px] p-3 md:p-4 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
                {isSubmittedToday && !isEditingToday ? (
                  <div className="text-center py-6">
                    <div className={`w-16 h-16 ${isDark ? 'bg-emerald-900/40 border-emerald-800' : 'bg-emerald-50 border-emerald-100'} rounded-full flex items-center justify-center mx-auto mb-4 border-4`}><CheckCircle2 size={32} className={isDark ? "text-emerald-400" : "text-[#2D6A4F]"} /></div>
                    <h2 className={`text-xl font-black ${textMain} mb-1`}>Check-in Complete!</h2>
                    <p className={`${textMuted} text-sm mb-6`}>You've logged your progress for today.</p>
                    <button onClick={() => setIsEditingToday(true)} className={`px-5 py-2.5 text-sm ${bgCard} border-2 ${borderMain} ${textMain} font-bold rounded-xl ${hoverCard}`}><Edit3 size={16} className="inline mr-1.5" /> Edit Entry</button>
                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    
                    <div className={`${bgCard} border-2 ${borderLight} p-3 rounded-2xl shadow-sm`}>
                      {subjectTrackingMode === 'missingCount' ? (
                        <>
                          <p className={`font-bold text-sm ${textMain} mb-2`}>Enter the number of missing assignments in each class:</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {activeSubjects.map(sub => (
                              <label key={sub} className={`p-2.5 rounded-xl border-2 ${borderMain} ${bgCard} flex items-center justify-between gap-2`}>
                                <span className={`font-bold text-xs ${textMain}`}>{sub}</span>
                                <input
                                  type="number"
                                  min="0"
                                  inputMode="numeric"
                                  className={`w-16 p-1.5 text-center text-sm ${bgInput} border-2 ${borderMain} rounded-lg font-black ${textMain} outline-none focus:${currentTheme.border}`}
                                  value={todayData.missingAssignments?.[sub] ?? ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const value = raw === '' ? '' : Math.max(0, Number(raw));
                                    setTodayData({...todayData, missingAssignments: {...todayData.missingAssignments, [sub]: value}});
                                    setIsNoneSubjects(false);
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                          <p className={`text-[10px] ${textMuted} mt-2 font-medium`}>Enter 0 if there is no missing work in that class. Blank fields are treated as 0 when saved.</p>
                        </>
                      ) : (
                        <>
                          <p className={`font-bold text-sm ${textMain} mb-2`}>Select classes with <strong className={themeText}>{goalText}</strong>:</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {activeSubjects.map(sub => (
                              <button 
                                key={sub} 
                                onClick={() => { const current = todayData.caughtUpSubjects.includes(sub); setTodayData({...todayData, caughtUpSubjects: current ? todayData.caughtUpSubjects.filter(s => s !== sub) : [...todayData.caughtUpSubjects, sub]}); current ? playUnclick() : playClick(); setIsNoneSubjects(false); }} 
                                className={`p-2.5 rounded-xl border-2 font-bold text-xs transition-all text-left flex items-center gap-2 ${borderMain} ${todayData.caughtUpSubjects.includes(sub) && !isNoneSubjects ? (isDark ? 'bg-emerald-900/40 text-emerald-400 shadow-sm' : 'bg-[#E8F5E9] text-[#1B4332] shadow-sm') : `${bgCard} ${textMain} ${hoverCard}`}`}>
                                {todayData.caughtUpSubjects.includes(sub) && !isNoneSubjects ? <CheckCircle2 size={18} /> : <Circle size={18} className={textMuted} />} {sub}
                              </button>
                            ))}
                          </div>
                          <button 
                            onClick={() => { const next = !isNoneSubjects; setIsNoneSubjects(next); setTodayData({...todayData, caughtUpSubjects: []}); next ? playClick() : playUnclick(); }} 
                            className={`mt-2.5 w-full p-2.5 rounded-xl border-2 font-bold text-xs transition-all text-left flex items-center gap-2 ${borderMain} ${isNoneSubjects ? (isDark ? 'bg-emerald-900/40 text-emerald-400 shadow-sm' : 'bg-[#E8F5E9] text-[#1B4332] shadow-sm') : `${bgCard} ${textMuted} ${hoverCard}`}`}>
                            {isNoneSubjects ? <CheckCircle2 size={18} /> : <Circle size={18} className={textMuted} />} I am not fully caught up in any classes yet.
                          </button>
                        </>
                      )}
                    </div>

                    <div className={`${bgCard} border-2 ${borderLight} p-3 rounded-2xl shadow-sm`}>
                      <p className={`font-bold text-sm ${textMain} mb-2`}>Target habit goals:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {activeHabits.map(hab => (
                          <button 
                            key={hab} 
                            onClick={() => { const current = todayData.completedHabits.includes(hab); setTodayData({...todayData, completedHabits: current ? todayData.completedHabits.filter(h => h !== hab) : [...todayData.completedHabits, hab]}); current ? playUnclick() : playClick(); setIsNoneHabits(false); }} 
                            className={`p-2.5 rounded-xl border-2 font-bold text-xs transition-all text-left flex items-center gap-2 ${borderMain} ${todayData.completedHabits.includes(hab) && !isNoneHabits ? (isDark ? 'bg-emerald-900/40 text-emerald-400 shadow-sm' : 'bg-[#E8F5E9] text-[#1B4332] shadow-sm') : `${bgCard} ${textMain} ${hoverCard}`}`}>
                            {todayData.completedHabits.includes(hab) && !isNoneHabits ? <CheckCircle2 size={18} /> : <Circle size={18} className={textMuted} />} {hab}
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => { const next = !isNoneHabits; setIsNoneHabits(next); setTodayData({...todayData, completedHabits: []}); next ? playClick() : playUnclick(); }} 
                        className={`mt-2.5 w-full p-2.5 rounded-xl border-2 font-bold text-xs transition-all text-left flex items-center gap-2 ${borderMain} ${isNoneHabits ? (isDark ? 'bg-emerald-900/40 text-emerald-400 shadow-sm' : 'bg-[#E8F5E9] text-[#1B4332] shadow-sm') : `${bgCard} ${textMuted} ${hoverCard}`}`}>
                        {isNoneHabits ? <CheckCircle2 size={18} /> : <Circle size={18} className={textMuted} />} I did not meet these habit goals today.
                      </button>
                    </div>

                    {/* Student Comment Area */}
                    <div className={`${bgCard} border-2 ${borderLight} p-3 rounded-2xl shadow-sm`}>
                      <p className={`font-bold text-sm ${textMain} mb-2`}>Do you want to add a comment for your instructor?</p>
                      <textarea 
                        className={`w-full p-2.5 rounded-xl border-2 ${borderMain} font-bold text-xs ${textMain} outline-none focus:${currentTheme.border} resize-y min-h-[4.5rem] leading-normal tracking-normal whitespace-pre-wrap ${bgInput}`}
                        placeholder="Type your message here..."
                        value={todayData.newNote}
                        onChange={(e) => setTodayData({...todayData, newNote: e.target.value})}
                      />
                    </div>

                    <button onClick={submitToday} className={`w-full py-3 text-base ${currentTheme.primary} ${currentTheme.hover} text-white font-black shadow-md border-2 ${borderMain} border-b-[4px] active:border-b-2 active:translate-y-[2px] transition-all flex items-center justify-center gap-2 rounded-xl`}><Send size={18} /> Save Daily Progress</button>
                  </div>
                )}
              </div>
            )}

            {/* History Panel */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center px-2">
                <h2 className={`text-base font-black flex items-center gap-1.5 ${textMain}`}><Calendar size={18} className={textMuted} /> Submission History</h2>
                {history.length > 0 && (
                  <button 
                    onClick={() => exportToCSV(history, `Equip_Data_${studentsList.find(s=>s.id===selectedStudentId)?.name || 'Student'}_${new Date().toISOString().split('T')[0]}.csv`)} 
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${bgCard} border-2 ${borderMain} rounded-lg text-[10px] font-black uppercase tracking-widest ${hoverCard} transition-all shadow-sm`}>
                    <Download size={14} /> Export CSV
                  </button>
                )}
              </div>
              
              {history.length === 0 ? (
                <div className={`text-center py-6 px-4 border-2 border-dashed ${borderLight} rounded-2xl ${bgPanel}`}>
                  <p className={`${textMuted} font-bold text-sm`}>No entries found for this student.</p>
                </div>
              ) : (
                history.map(day => (
                  <div key={day.id} className={`${bgPanel} rounded-2xl p-4 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
                    <div className="flex justify-between mb-3">
                      <div className={`font-black text-base ${textMain}`}>{day.date}</div>
                      <div className={`px-3 py-0.5 rounded-full text-white font-black text-xs border border-black/20 flex items-center ${getHealthBg(Math.round(((day.caughtUpSubjects?.length||0) + (day.completedHabits?.length||0)) / (day.possibleCount||1) * 100))}`}>
                        {Math.round(((day.caughtUpSubjects?.length||0) + (day.completedHabits?.length||0)) / (day.possibleCount||1) * 100)}%
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {day.caughtUpSubjects?.map(s => <span key={s} className={`px-2 py-0.5 ${bgCard} ${isDark ? 'text-emerald-400' : 'text-[#2D6A4F]'} rounded-lg text-[10px] font-bold border-2 ${borderMain}`}>✓ {s}</span>)}
                      {day.completedHabits?.map(h => <span key={h} className={`px-2 py-0.5 ${bgCard} ${isDark ? 'text-emerald-400' : 'text-[#2D6A4F]'} rounded-lg text-[10px] font-bold border-2 ${borderMain}`}>✓ {h}</span>)}
                    </div>
                    
                    <div className={`${bgCard} p-3 rounded-xl space-y-2 shadow-sm border-2 ${borderMain}`}>
                      {day.notes?.map((n, i) => (
                        <div key={i} className={`flex flex-col ${n.author === 'Mr. Crockett' ? 'items-end' : 'items-start'}`}>
                          <div className={`p-2.5 rounded-xl max-w-[85%] text-xs font-bold border-2 ${borderMain} ${n.author === 'Mr. Crockett' ? `${currentTheme.primary} text-white rounded-br-none` : `${bgInput} ${textMain} rounded-bl-none`}`}>{n.text}</div>
                          <span className={`text-[9px] ${textMuted} mt-1 uppercase tracking-widest font-bold`}>{n.author} • {n.time}</span>
                        </div>
                      ))}
                      {isEffectivelyStaff && (
                        <div className={`flex gap-2 pt-2 mt-2 border-t-2 ${borderLight}`}>
                          <input type="text" placeholder="Reply..." className={`flex-1 p-2 text-xs rounded-lg border-2 ${borderMain} outline-none focus:${currentTheme.border} ${bgInput}`} value={replyTexts[day.id] || ''} onChange={e => setReplyTexts({...replyTexts, [day.id]: e.target.value})} onKeyDown={e => e.key === 'Enter' && submitReply(day.id)} />
                          <button onClick={() => submitReply(day.id)} className={`p-2 px-3 ${currentTheme.primary} border-2 ${borderMain} text-white rounded-lg ${currentTheme.hover} transition-colors`}><Send size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

          <div className="space-y-4">
            {/* Research Panel Sidebar */}
            <div className={`${bgPanel} rounded-[20px] md:rounded-[24px] p-3 md:p-5 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
              <h2 className={`text-base font-black mb-4 flex items-center gap-1.5 ${textMain}`}><Zap size={18} className="text-yellow-500" /> What Works for Me?</h2>
              {!researchUnlocked ? (
                <div className={`text-center py-8 px-4 border-2 border-dashed ${borderLight} rounded-2xl ${bgCard}`}>
                  <p className={`${textMuted} font-bold text-sm`}>Reach {startingScore + 10}% Overall Health to unlock your custom "What Works for Me?" panel!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.keys(researchData).map(cat => (
                    <div key={cat} className={`p-3 rounded-xl border-2 ${borderMain} transition-all ${researchData[cat].approved ? (isDark ? 'bg-emerald-900/40' : 'bg-emerald-50') : bgCard}`}>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className={`text-[10px] font-black ${textMuted} uppercase tracking-[0.2em]`}>{cat}</h3>
                        {isEffectivelyStaff && <button onClick={() => handleApproveResearch(cat)} className={`p-1.5 rounded-lg transition-colors border-2 ${borderMain} ${researchData[cat].approved ? 'bg-[#2D6A4F] text-white hover:bg-[#1B4332]' : `${bgCard} ${textMain} ${hoverCard}`}`}><Zap size={12} /></button>}
                        {!isEffectivelyStaff && researchData[cat].approved && <Sparkles size={12} className={isDark ? "text-emerald-400" : "text-[#2D6A4F]"} />}
                      </div>
                      {cat !== 'extra' ? (
                        <select className={`w-full p-2 text-xs font-bold rounded-lg ${bgInput} outline-none border-2 ${borderMain} ${textMain}`} disabled={isEffectivelyStaff || researchData[cat].approved}>
                          <option value="">Pending entry...</option>
                        </select>
                      ) : (
                        <textarea className={`w-full p-2 text-xs font-bold rounded-lg ${bgInput} outline-none border-2 ${borderMain} ${textMain} h-16 resize-none`} placeholder="Notes..." disabled={isEffectivelyStaff || researchData[cat].approved} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
