// ========== HELPERS ==========
const escapeHTML = str => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

const getLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const getLocalDateFromDate = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};

const showToast = (msg, type = 'info') => {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
};

// ========== CONSTANTS ==========
const STORAGE_KEY = 'fitnessProData';
const EXERCISE_COOLDOWN = 60000;
const DAILY_XP_CAP = 430;
const QUESTS = { WEIGHT: 'weight', EXERCISE: 'exercise', CALORIES: 'calories', SLEEP: 'sleep' };
const ACHIEVEMENTS = [
  { id: 'first_weight', title: 'أول وزن', icon: '⚖️', desc: 'سجل وزنك لأول مرة', cond: d => d.weightHistory.length > 0 },
  { id: 'level5', title: 'المستوى 5', icon: '⭐', desc: 'وصل إلى المستوى 5', cond: d => d.level >= 5 },
  { id: 'streak7', title: 'أسبوع من الالتزام', icon: '🔥', desc: 'حقق 7 أيام متتالية', cond: d => d.streak && d.streak.best >= 7 },
  { id: 'total_xp_1000', title: 'خبير XP', icon: '⚡', desc: 'اجمع 1000 نقطة خبرة', cond: d => d.totalXP >= 1000 }
];
const XP_REWARDS = { EXERCISE: 50, CALORIES: 100, SLEEP: 30, ALL_QUESTS: 200 };

// ========== DEFAULT DATA ==========
function getDefaultData() {
  return {
    level: 1,
    xp: 0,
    totalXP: 0,
    currentWeight: null,
    dailyCalorieGoal: 2500,
    weightHistory: [],
    exercises: [],
    meals: [],
    sleepLogs: [],
    goals: [],
    lastCalorieBonusDate: null,
    lastSleepBonusDate: null,
    lastAllQuestsBonusDate: null,
    lastXPResetDate: null,
    activityDates: [],
    lastExerciseTimestamp: 0,
    xpToday: 0,
    unlockedAchievements: [],
    streak: { current: 0, best: 0, lastActiveDate: null },
    completedQuestsToday: []
  };
}

let appData = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(getDefaultData(), JSON.parse(raw));
  } catch (e) {
    const backup = localStorage.getItem(STORAGE_KEY + '_backup');
    if (backup) {
      try { return Object.assign(getDefaultData(), JSON.parse(backup)); } catch (e2) {}
    }
  }
  return getDefaultData();
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    localStorage.setItem(STORAGE_KEY + '_backup', JSON.stringify(appData));
    updateStorageSize();
  } catch (e) {
    showToast('فشل حفظ البيانات', 'info');
  }
}

// ========== STORAGE HELPERS ==========
function exportData() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitness-backup-${getLocalDate()}.json`;
  a.click();
  showToast('تم تصدير البيانات', 'success');
}

function importDataPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      appData = Object.assign(getDefaultData(), JSON.parse(text));
      saveData();
      updateAllUI();
      showToast('تم استيراد البيانات', 'success');
    } catch (err) {
      showToast('ملف غير صالح', 'info');
    }
  };
  input.click();
}

function resetData() {
  if (confirm('هل أنت متأكد من مسح جميع البيانات؟')) {
    appData = getDefaultData();
    saveData();
    updateAllUI();
    showToast('تم مسح البيانات', 'info');
  }
}

function updateStorageSize() {
  const size = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
  const el = document.getElementById('storageSize');
  if (el) el.textContent = (size / 1024).toFixed(1) + ' ك.ب';
}

// ========== GAMIFICATION ==========
function getXPForNextLevel(level) {
  return level * 250 + 50;
}

function addXP(amount, reason = '') {
  if ((appData.xpToday + amount) > DAILY_XP_CAP) {
    showToast('وصلت للحد الأقصى اليومي من XP', 'info');
    return false;
  }
  appData.xpToday += amount;
  appData.xp += amount;
  appData.totalXP += amount;

  let leveledUp = false;
  while (appData.xp >= getXPForNextLevel(appData.level)) {
    appData.xp -= getXPForNextLevel(appData.level);
    appData.level++;
    leveledUp = true;
  }

  saveData();

  if (leveledUp) {
    showLevelUpModal();
    showToast(`🎉 وصلت للمستوى ${appData.level}!`, 'levelup');
  } else {
    showToast(`+${amount} XP ${reason}`, 'info');
  }

  checkAchievements();
  updateAllUI();
  return true;
}

function showLevelUpModal() {
  document.getElementById('levelUpMsg').textContent = `المستوى الجديد: ${appData.level} 🏆`;
  document.getElementById('levelUpModal').style.display = 'flex';
}

function closeLevelUpModal() {
  document.getElementById('levelUpModal').style.display = 'none';
}

// ========== STREAK ==========
function updateStreakIfNewDay() {
  const today = getLocalDate();
  if (appData.streak.lastActiveDate === today) return;

  if (appData.streak.lastActiveDate) {
    const last = new Date(appData.streak.lastActiveDate);
    const cur = new Date(today);
    const diff = Math.floor((cur - last) / 86400000);
    appData.streak.current = (diff === 1) ? appData.streak.current + 1 : 1;
  } else {
    appData.streak.current = 1;
  }

  appData.streak.lastActiveDate = today;
  if (appData.streak.current > appData.streak.best) {
    appData.streak.best = appData.streak.current;
  }

  if (appData.streak.current === 7) showToast('🏆 أسبوع كامل من الالتزام!', 'success');
  if (appData.streak.current === 30) showToast('🌟 شهر كامل! أنت بطل!', 'success');
}

function recordActivity() {
  const today = getLocalDate();
  if (!appData.activityDates.includes(today)) {
    appData.activityDates.push(today);
    if (appData.activityDates.length > 30) appData.activityDates = appData.activityDates.slice(-30);
    updateStreakIfNewDay();
    saveData();
  }
}

// ========== DAILY QUESTS ==========
function checkQuests() {
  const today = getLocalDate();
  const hasWeight = appData.weightHistory.some(wh => wh.date === today);
  const hasExercise = appData.exercises.some(ex => ex.date === today);
  const todayCals = appData.meals.filter(m => m.date === today).reduce((s, m) => s + m.calories, 0);
  const hasCalories = todayCals >= appData.dailyCalorieGoal;
  const hasSleep = appData.sleepLogs.some(sl => sl.date === today);

  if (hasWeight && hasExercise && hasCalories && hasSleep && appData.lastAllQuestsBonusDate !== today) {
    appData.lastAllQuestsBonusDate = today;
    saveData();
    addXP(XP_REWARDS.ALL_QUESTS, 'إكمال جميع المهام');
  }
}

function renderDailyQuests() {
  const today = getLocalDate();
  const todayCals = appData.meals.filter(m => m.date === today).reduce((s, m) => s + m.calories, 0);
  const quests = [
    { label: 'تسجيل الوزن', done: appData.weightHistory.some(wh => wh.date === today) },
    { label: 'تسجيل تمرين', done: appData.exercises.some(ex => ex.date === today) },
    { label: 'هدف السعرات', done: todayCals >= appData.dailyCalorieGoal },
    { label: 'تسجيل النوم', done: appData.sleepLogs.some(sl => sl.date === today) }
  ];

  const container = document.getElementById('dailyQuestsContainer');
  if (!container) return;
  container.innerHTML = quests.map(q => `
    <div style="background:var(--dark-card2);border-radius:12px;padding:12px;border:1px solid rgba(42,42,42,0.5);display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">${q.done ? '✅' : '⬜'}</span>
      <span style="font-size:13px;color:${q.done ? 'var(--neon-green)' : '#9ca3af'}">${q.label}</span>
    </div>
  `).join('');

  const allDone = quests.every(q => q.done);
  const msg = document.getElementById('questsBonusMsg');
  if (msg) msg.textContent = allDone ? '🏆 تم إكمال جميع المهام اليومية!' : '';
}

// ========== ACHIEVEMENTS ==========
function checkAchievements() {
  let updated = false;
  ACHIEVEMENTS.forEach(ach => {
    if (appData.unlockedAchievements.includes(ach.id)) return;
    if (ach.cond(appData)) {
      appData.unlockedAchievements.push(ach.id);
      updated = true;
      showToast(`🏅 إنجاز جديد: ${ach.title}`, 'success');
    }
  });
  if (updated) saveData();
}

function renderAchievements() {
  const container = document.getElementById('achievementsList');
  if (!container) return;
  container.innerHTML = ACHIEVEMENTS.map(ach => {
    const unlocked = appData.unlockedAchievements.includes(ach.id);
    return `
      <div style="background:var(--dark-card2);border-radius:12px;padding:16px;border:1px solid rgba(42,42,42,0.5);display:flex;align-items:center;gap:12px;opacity:${unlocked ? '1' : '0.5'}">
        <span style="font-size:32px">${ach.icon}</span>
        <div style="flex:1">
          <div style="font-weight:700;color:#fff">${ach.title}</div>
          <div style="font-size:12px;color:#9ca3af">${ach.desc}</div>
        </div>
        <span style="font-size:24px">${unlocked ? '✅' : '🔒'}</span>
      </div>
    `;
  }).join('');
}

// ========== STATUS BARS ==========
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(now);
  mon.setDate(diff);
  return getLocalDateFromDate(mon);
}

function renderStatusBars() {
  const weekStart = getWeekStart();
  const weekEx = appData.exercises.filter(e => e.date >= weekStart).length;
  const power = Math.min(100, Math.round((weekEx / 7) * 100));

  const weekSleep = appData.sleepLogs.filter(s => s.date >= weekStart);
  const avgSleep = weekSleep.length ? weekSleep.reduce((sum, sl) => sum + sl.hours, 0) / weekSleep.length : 0;
  const stamina = Math.min(100, Math.round((avgSleep / 8) * 100));

  const activeDays = appData.activityDates.filter(d => d >= weekStart).length;
  const consistency = Math.min(100, Math.round((activeDays / 7) * 100));

  const pb = document.getElementById('powerBar'); if (pb) pb.style.width = power + '%';
  const pv = document.getElementById('powerVal'); if (pv) pv.textContent = power + '%';
  const sb = document.getElementById('staminaBar'); if (sb) sb.style.width = stamina + '%';
  const sv = document.getElementById('staminaVal'); if (sv) sv.textContent = stamina + '%';
  const cb = document.getElementById('consistencyBar'); if (cb) cb.style.width = consistency + '%';
  const cv = document.getElementById('consistencyVal'); if (cv) cv.textContent = consistency + '%';
}

// ========== WEIGHT ==========
function saveWeight() {
  const input = document.getElementById('weightInput');
  const weight = parseFloat(input.value);
  if (isNaN(weight) || weight <= 0 || weight > 300) {
    return showToast('⚠️ الرجاء إدخال وزن صحيح', 'info');
  }

  const today = getLocalDate();
  appData.currentWeight = weight;

  const existing = appData.weightHistory.find(wh => wh.date === today);
  if (existing) { existing.weight = weight; }
  else { appData.weightHistory.push({ date: today, weight }); }
  appData.weightHistory.sort((a, b) => a.date.localeCompare(b.date));

  recordActivity();
  saveData();
  checkQuests();
  updateAllUI();

  const note = document.getElementById('lastWeightNote');
  if (note) note.textContent = `✅ آخر تسجيل: ${weight} كجم - ${today}`;
  input.value = '';
  showToast(`⚖️ تم تسجيل الوزن: ${weight} كجم`, 'success');
}

// ========== EXERCISES ==========
function addExercise() {
  const name = document.getElementById('exName').value.trim();
  const weight = parseFloat(document.getElementById('exWeight').value);
  const sets = parseInt(document.getElementById('exSets').value);
  const reps = parseInt(document.getElementById('exReps').value);

  if (!name) { showToast('⚠️ أدخل اسم التمرين', 'info'); return; }
  if (isNaN(weight) || weight < 0) { showToast('⚠️ وزن غير صحيح', 'info'); return; }
  if (isNaN(sets) || sets < 1) { showToast('⚠️ مجموعات غير صحيحة', 'info'); return; }
  if (isNaN(reps) || reps < 1) { showToast('⚠️ تكرارات غير صحيحة', 'info'); return; }

  if (Date.now() - appData.lastExerciseTimestamp < EXERCISE_COOLDOWN) {
    return showToast('⏳ انتظر قليلاً بين التمارين', 'info');
  }
  appData.lastExerciseTimestamp = Date.now();

  appData.exercises.unshift({ id: Date.now(), name, weight, sets, reps, date: getLocalDate() });
  recordActivity();
  saveData();
  addXP(XP_REWARDS.EXERCISE, 'تمرين جديد');
  checkQuests();
  updateAllUI();

  document.getElementById('exName').value = '';
  document.getElementById('exWeight').value = '';
  document.getElementById('exSets').value = '3';
  document.getElementById('exReps').value = '10';
  showToast('✅ تمت إضافة التمرين', 'success');
}

function deleteExercise(id) {
  appData.exercises = appData.exercises.filter(ex => ex.id !== id);
  saveData();
  updateAllUI();
  showToast('🗑️ تم حذف التمرين', 'info');
}

function renderExerciseTable() {
  const searchTerm = (document.getElementById('exSearch')?.value || '').trim().toLowerCase();
  let filtered = appData.exercises;
  if (searchTerm) filtered = filtered.filter(ex => ex.name.toLowerCase().includes(searchTerm));

  const tbody = document.getElementById('exerciseTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#6b7280">لا توجد نتائج</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(ex => `
    <tr style="border-bottom:1px solid rgba(42,42,42,0.5)">
      <td style="padding:10px 8px;color:#9ca3af;font-size:12px">${ex.date}</td>
      <td style="padding:10px 8px;font-weight:600;color:#fff">${escapeHTML(ex.name)}</td>
      <td style="padding:10px 8px;color:var(--neon-blue);font-weight:700">${ex.weight}كجم</td>
      <td style="padding:10px 8px">${ex.sets}</td>
      <td style="padding:10px 8px">${ex.reps}</td>
      <td style="padding:10px 8px">
        <button onclick="deleteExercise(${ex.id})" style="color:#f87171;font-size:18px;background:none;border:none;cursor:pointer">🗑️</button>
      </td>
    </tr>
  `).join('');
}

// ========== NUTRITION ==========
function addMeal() {
  const name = document.getElementById('mealName').value.trim();
  const calories = parseInt(document.getElementById('mealCalories').value);

  if (!name) { showToast('⚠️ أدخل اسم الوجبة', 'info'); return; }
  if (isNaN(calories) || calories <= 0) { showToast('⚠️ سعرات غير صحيحة', 'info'); return; }

  appData.meals.unshift({ id: Date.now(), name, calories, date: getLocalDate() });
  recordActivity();
  saveData();
  checkCalorieGoal();
  checkQuests();
  updateAllUI();

  document.getElementById('mealName').value = '';
  document.getElementById('mealCalories').value = '';
  showToast(`🍽️ تمت إضافة "${name}"`, 'success');
}

function quickAddCalories(amount) {
  appData.meals.unshift({
    id: Date.now(),
    name: amount === 500 ? 'وجبة خفيفة' : 'وجبة كبيرة',
    calories: amount,
    date: getLocalDate()
  });
  recordActivity();
  saveData();
  checkCalorieGoal();
  checkQuests();
  updateAllUI();
  showToast(`+${amount} سعرة 🔥`, 'info');
}

function checkCalorieGoal() {
  const today = getLocalDate();
  const total = appData.meals.filter(m => m.date === today).reduce((s, m) => s + m.calories, 0);
  if (total >= appData.dailyCalorieGoal && appData.lastCalorieBonusDate !== today) {
    appData.lastCalorieBonusDate = today;
    saveData();
    addXP(XP_REWARDS.CALORIES, 'إكمال هدف السعرات');
  }
}

function updateNutritionUI() {
  const today = getLocalDate();
  const total = appData.meals.filter(m => m.date === today).reduce((s, m) => s + m.calories, 0);
  const goal = appData.dailyCalorieGoal;
  const percent = Math.min(100, Math.round((total / goal) * 100));

  const bar = document.getElementById('calorieProgressBar');
  if (bar) {
    bar.style.width = percent + '%';
    bar.style.background = percent >= 100
      ? 'linear-gradient(90deg,#22c55e,#10b981)'
      : percent >= 75
        ? 'linear-gradient(90deg,#f59e0b,#f97316)'
        : 'linear-gradient(90deg,#3b82f6,#06b6d4)';
  }

  const c = document.getElementById('calConsumed'); if (c) c.textContent = `${total} سعرة`;
  const r = document.getElementById('calRemaining'); if (r) r.textContent = `متبقي: ${Math.max(0, goal - total)}`;
  const g = document.getElementById('calGoalDisplay'); if (g) g.textContent = `الهدف: ${goal}`;
}

function renderMealList() {
  const container = document.getElementById('mealList');
  if (!container) return;
  const today = getLocalDate();
  const meals = appData.meals.filter(m => m.date === today);

  if (meals.length === 0) {
    container.innerHTML = '<p style="color:#6b7280;text-align:center;padding:24px">لا توجد وجبات مسجلة اليوم</p>';
    return;
  }

  container.innerHTML = meals.map(m => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--dark-card2);border-radius:12px;padding:12px 16px;border:1px solid rgba(42,42,42,0.5)">
      <span style="color:#fff;font-weight:500">${escapeHTML(m.name)}</span>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="color:var(--neon-blue);font-weight:700">${m.calories} سعرة</span>
        <button onclick="deleteMeal(${m.id})" style="color:#f87171;font-size:16px;background:none;border:none;cursor:pointer">🗑️</button>
      </div>
    </div>
  `).join('');
}

function deleteMeal(id) {
  appData.meals = appData.meals.filter(m => m.id !== id);
  saveData();
  updateAllUI();
  showToast('🗑️ تم حذف الوجبة', 'info');
}

// ========== SLEEP ==========
function setSleepQuality(q) {
  document.getElementById('sleepQualityVal').value = q;
  document.querySelectorAll('#qualityStars .quality-star').forEach((btn, i) => {
    if (i < q) {
      btn.style.borderColor = '#eab308';
      btn.style.background = 'rgba(234,179,8,0.2)';
    } else {
      btn.style.borderColor = 'var(--dark-border)';
      btn.style.background = 'var(--dark-card2)';
    }
  });
}

function logSleep() {
  const hours = parseFloat(document.getElementById('sleepHours').value);
  const quality = parseInt(document.getElementById('sleepQualityVal').value) || 3;

  if (isNaN(hours) || hours <= 0 || hours > 24) {
    return showToast('⚠️ أدخل ساعات نوم صحيحة', 'info');
  }

  const today = getLocalDate();
  const entry = { id: Date.now(), hours, quality, date: today };
  const idx = appData.sleepLogs.findIndex(sl => sl.date === today);

  if (idx >= 0) {
    appData.sleepLogs[idx] = entry;
    showToast('🔄 تم تحديث سجل النوم', 'info');
  } else {
    appData.sleepLogs.unshift(entry);
    showToast(`💤 تم تسجيل ${hours} ساعة`, 'success');
  }

  recordActivity();
  saveData();

  if (appData.lastSleepBonusDate !== today) {
    appData.lastSleepBonusDate = today;
    addXP(XP_REWARDS.SLEEP, 'تسجيل النوم');
  }

  checkQuests();
  updateAllUI();
  document.getElementById('sleepHours').value = '';
}

function renderSleepHistory() {
  const container = document.getElementById('sleepHistory');
  if (!container) return;
  const logs = appData.sleepLogs.slice(0, 10);

  if (logs.length === 0) {
    container.innerHTML = '<p style="color:#6b7280;text-align:center;padding:16px">لا يوجد سجل نوم</p>';
    return;
  }

  container.innerHTML = logs.map(sl => {
    const stars = '⭐'.repeat(sl.quality) + '☆'.repeat(5 - sl.quality);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--dark-card2);border-radius:12px;padding:10px 14px;border:1px solid rgba(42,42,42,0.5);font-size:13px">
        <span style="color:#9ca3af">${sl.date}</span>
        <span style="color:#fff;font-weight:600">${sl.hours} ساعة</span>
        <span>${stars}</span>
      </div>
    `;
  }).join('');
}

// ========== GOALS ==========
function addGoal() {
  const name = document.getElementById('goalName').value.trim();
  const target = parseInt(document.getElementById('goalTarget').value);

  if (!name) { showToast('⚠️ أدخل اسم الهدف', 'info'); return; }
  if (isNaN(target) || target < 1) { showToast('⚠️ قيمة غير صحيحة', 'info'); return; }

  appData.goals.push({ id: Date.now(), name, target, current: 0, unit: 'وحدة' });
  saveData();
  updateAllUI();
  document.getElementById('goalName').value = '';
  document.getElementById('goalTarget').value = '';
  showToast(`🎯 تمت إضافة "${name}"`, 'success');
}

function updateGoalProgress(id, delta) {
  const goal = appData.goals.find(g => g.id === id);
  if (!goal) return;
  goal.current = Math.max(0, Math.min(goal.target, goal.current + delta));
  saveData();
  recordActivity();
  updateAllUI();
  if (goal.current >= goal.target) showToast(`🏆 تم إكمال "${goal.name}"!`, 'success');
}

function deleteGoal(id) {
  appData.goals = appData.goals.filter(g => g.id !== id);
  saveData();
  updateAllUI();
  showToast('🗑️ تم حذف الهدف', 'info');
}

function renderGoalsList() {
  const container = document.getElementById('goalsList');
  if (!container) return;

  if (appData.goals.length === 0) {
    container.innerHTML = '<p style="color:#6b7280;text-align:center;padding:24px">لا توجد أهداف بعد</p>';
    return;
  }

  container.innerHTML = appData.goals.map(g => {
    const percent = Math.round((g.current / g.target) * 100);
    const complete = percent >= 100;
    return `
      <div style="background:var(--dark-card2);border-radius:12px;padding:16px;border:1px solid rgba(42,42,42,0.5)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:#fff;font-weight:600">${escapeHTML(g.name)}</span>
          <span style="font-size:12px;font-weight:700;color:${complete ? 'var(--neon-green)' : 'var(--neon-blue)'}">${percent}%</span>
        </div>
        <div style="background:var(--dark-border);border-radius:9999px;height:10px;overflow:hidden;margin-bottom:8px">
          <div style="height:100%;width:${percent}%;border-radius:9999px;background:${complete ? 'linear-gradient(90deg,#22c55e,#10b981)' : 'linear-gradient(90deg,#3b82f6,#06b6d4)'};transition:width 0.5s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6b7280">
          <span>${g.current} / ${g.target} ${g.unit}</span>
          <div style="display:flex;gap:4px">
            <button onclick="updateGoalProgress(${g.id},-1)" style="background:var(--dark-border);border:none;color:#e5e7eb;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:14px">−</button>
            <button onclick="updateGoalProgress(${g.id},1)" style="background:var(--dark-border);border:none;color:#e5e7eb;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:14px">+</button>
            <button onclick="deleteGoal(${g.id})" style="background:var(--dark-border);border:none;color:#f87171;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:14px;margin-right:4px">🗑</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ========== WEIGHT CHART ==========
let weightChartInstance = null;

function updateWeightChart() {
  const canvas = document.getElementById('weightChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');

  const dates = [], weights = [];
  const now = new Date();

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateFromDate(d);
    dates.push(dateStr);
    const entry = appData.weightHistory.filter(wh => wh.date <= dateStr).sort((a, b) => b.date.localeCompare(a.date))[0];
    weights.push(entry ? entry.weight : null);
  }

  const hasData = weights.some(w => w !== null);
  const emptyMsg = document.getElementById('chartEmptyMsg');
  if (emptyMsg) emptyMsg.style.display = hasData ? 'none' : 'block';

  const allW = weights.filter(w => w !== null);
  const yMin = allW.length ? Math.floor(Math.min(...allW) - 3) : 60;
  const yMax = allW.length ? Math.ceil(Math.max(...allW) + 3) : 90;

  if (weightChartInstance) weightChartInstance.destroy();

  weightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; }),
      datasets: [{
        label: 'الوزن (كجم)',
        data: weights,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: weights.map(w => w !== null ? 5 : 0),
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        spanGaps: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ctx.raw !== null ? `${ctx.raw} كجم` : 'لا بيانات' } }
      },
      scales: {
        x: { ticks: { color: '#777', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#777', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, min: yMin, max: yMax }
      }
    }
  });
}

// ========== STAT CARDS ==========
function renderStatCards() {
  const xpNeeded = getXPForNextLevel(appData.level);
  const today = getLocalDate();
  const calToday = appData.meals.filter(m => m.date === today).reduce((s, m) => s + m.calories, 0);
  const xpPercent = Math.min(100, (appData.xp / xpNeeded) * 100);

  const html = `
    <div style="background:var(--dark-card);border:1px solid var(--dark-border);border-radius:16px;padding:20px;position:relative;overflow:hidden">
      <div style="position:absolute;top:12px;left:12px;font-size:36px;opacity:0.15">⭐</div>
      <p style="color:#6b7280;font-size:13px;margin-bottom:4px">المستوى</p>
      <h3 style="font-size:28px;font-weight:700;color:var(--neon-blue);text-shadow:0 0 10px rgba(59,130,246,0.5)">${appData.level}</h3>
      <div style="background:var(--dark-border);border-radius:9999px;height:6px;overflow:hidden;margin-top:8px">
        <div style="height:100%;width:${xpPercent}%;border-radius:9999px;background:linear-gradient(90deg,#3b82f6,#06b6d4)"></div>
      </div>
      <p style="font-size:11px;color:#6b7280;margin-top:6px">${appData.xp} / ${xpNeeded} XP</p>
    </div>
    <div style="background:var(--dark-card);border:1px solid var(--dark-border);border-radius:16px;padding:20px;position:relative;overflow:hidden">
      <div style="position:absolute;top:12px;left:12px;font-size:36px;opacity:0.15">⚡</div>
      <p style="color:#6b7280;font-size:13px;margin-bottom:4px">إجمالي XP</p>
      <h3 style="font-size:28px;font-weight:700;color:var(--neon-green);text-shadow:0 0 10px rgba(34,197,94,0.5)">${appData.totalXP}</h3>
      <p style="font-size:11px;color:#6b7280;margin-top:14px">استمر!</p>
    </div>
    <div style="background:var(--dark-card);border:1px solid var(--dark-border);border-radius:16px;padding:20px;position:relative;overflow:hidden">
      <div style="position:absolute;top:12px;left:12px;font-size:36px;opacity:0.15">🔥</div>
      <p style="color:#6b7280;font-size:13px;margin-bottom:4px">سعرات اليوم</p>
      <h3 style="font-size:28px;font-weight:700;color:#fff">${calToday}</h3>
      <p style="font-size:11px;color:#6b7280;margin-top:14px">الهدف: ${appData.dailyCalorieGoal}</p>
    </div>
    <div style="background:var(--dark-card);border:1px solid var(--dark-border);border-radius:16px;padding:20px;position:relative;overflow:hidden">
      <div style="position:absolute;top:12px;left:12px;font-size:36px;opacity:0.15">⚖️</div>
      <p style="color:#6b7280;font-size:13px;margin-bottom:4px">الوزن</p>
      <h3 style="font-size:28px;font-weight:700;color:#fff">${appData.currentWeight ? appData.currentWeight : '--'}</h3>
      <p style="font-size:11px;color:#6b7280;margin-top:14px">كجم</p>
    </div>
  `;
  const el = document.getElementById('statCardsContainer');
  if (el) el.innerHTML = html;
}

// ========== UPDATE ALL UI ==========
function updateAllUI() {
  renderStatCards();
  renderStatusBars();
  renderDailyQuests();
  renderExerciseTable();
  updateNutritionUI();
  renderMealList();
  renderSleepHistory();
  renderGoalsList();
  renderAchievements();
  const dash = document.getElementById('section-dashboard');
  if (dash && !dash.classList.contains('hidden')) updateWeightChart();
  updateStorageSize();
}

// ========== NAVIGATION ==========
function navigateTo(sectionName, linkElement) {
  document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
  const section = document.getElementById('section-' + sectionName);
  if (section) section.classList.remove('hidden');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (linkElement) linkElement.classList.add('active');

  if (window.innerWidth < 1024) toggleSidebar(true);
  if (sectionName === 'dashboard') setTimeout(updateWeightChart, 100);
  updateAllUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSidebar(forceClose = false) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (forceClose) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  } else {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  }
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  const today = getLocalDate();

  if (appData.lastXPResetDate !== today) {
    appData.xpToday = 0;
    appData.lastXPResetDate = today;
    saveData();
  }

  checkQuests();
  checkAchievements();
  updateAllUI();

  document.getElementById('levelUpModal').addEventListener('click', function(e) {
    if (e.target === this) closeLevelUpModal();
  });

  setSleepQuality(3);

  if (appData.currentWeight) {
    const note = document.getElementById('lastWeightNote');
    if (note) note.textContent = `آخر وزن مسجل: ${appData.currentWeight} كجم`;
  }
});

// Expose to global
window.navigateTo = navigateTo;
window.toggleSidebar = toggleSidebar;
window.saveWeight = saveWeight;
window.addExercise = addExercise;
window.deleteExercise = deleteExercise;
window.addMeal = addMeal;
window.quickAddCalories = quickAddCalories;
window.deleteMeal = deleteMeal;
window.setSleepQuality = setSleepQuality;
window.logSleep = logSleep;
window.addGoal = addGoal;
window.updateGoalProgress = updateGoalProgress;
window.deleteGoal = deleteGoal;
window.exportData = exportData;
window.importDataPrompt = importDataPrompt;
window.resetData = resetData;
window.closeLevelUpModal = closeLevelUpModal;
