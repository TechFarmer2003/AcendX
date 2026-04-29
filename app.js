import { firebaseConfig, hasFirebaseConfig } from "./firebase-config.js";

const STORAGE_KEY = "shadowQuestUsers";
const SESSION_KEY = "shadowQuestSession";
const XP_PER_LEVEL = 100;
const CALORIE_GOAL = 2200;
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.5";
const IS_FILE_PAGE = window.location.protocol === "file:";

const defaultQuests = [
  { id: "pushups", title: "Push-ups", targetAmount: 20, unit: "reps", xp: 25, calories: 14 },
  { id: "squats", title: "Squats", targetAmount: 30, unit: "reps", xp: 25, calories: 20 },
  { id: "situps", title: "Sit-ups", targetAmount: 25, unit: "reps", xp: 25, calories: 14 },
  { id: "walk", title: "Walking", targetAmount: 4000, unit: "steps", xp: 30, calories: 160 },
  { id: "run", title: "Running", targetAmount: 3, unit: "km", xp: 40, calories: 250 },
  { id: "water", title: "Hydration", targetAmount: 2, unit: "liters", xp: 15, calories: 0 }
];

const achievements = [
  { id: "first-blood", title: "First Clear", detail: "Complete one quest.", test: user => user.completedTotal >= 1 },
  { id: "daily-clear", title: "Daily Conqueror", detail: "Complete every training quest today.", test: user => defaultQuests.every(quest => user.quests[quest.id]) },
  { id: "ranker", title: "Awakened", detail: "Reach level 5.", test: user => getLevel(user.xp) >= 5 },
  { id: "streak", title: "Iron Will", detail: "Build a 3 day streak.", test: user => user.streak >= 3 },
  { id: "fuel", title: "Fuel Master", detail: "Log at least 1800 kcal in a day.", test: user => getTodaysCalories(user) >= 1800 }
];

const authScreen = document.querySelector("#authScreen");
const appScreen = document.querySelector("#appScreen");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const loginTab = document.querySelector("#loginTab");
const signupTab = document.querySelector("#signupTab");
const authSubmit = document.querySelector("#authSubmit");
const googleButton = document.querySelector("#googleButton");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const logoutButton = document.querySelector("#logoutButton");
const hunterName = document.querySelector("#hunterName");
const rankLabel = document.querySelector("#rankLabel");
const levelLabel = document.querySelector("#levelLabel");
const xpLabel = document.querySelector("#xpLabel");
const xpFill = document.querySelector("#xpFill");
const streakCount = document.querySelector("#streakCount");
const pointsCount = document.querySelector("#pointsCount");
const calorieCount = document.querySelector("#calorieCount");
const questList = document.querySelector("#questList");
const resetDayButton = document.querySelector("#resetDayButton");
const todayLabel = document.querySelector("#todayLabel");
const habitCount = document.querySelector("#habitCount");
const searchInput = document.querySelector("#searchInput");
const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");
const calorieForm = document.querySelector("#calorieForm");
const foodInput = document.querySelector("#foodInput");
const calorieInput = document.querySelector("#calorieInput");
const calorieGoalLabel = document.querySelector("#calorieGoalLabel");
const calorieFill = document.querySelector("#calorieFill");
const foodList = document.querySelector("#foodList");
const achievementList = document.querySelector("#achievementList");

let mode = "login";
let activeUser = localStorage.getItem(SESSION_KEY);
let searchTerm = "";
let firebaseAuth = null;
let firebaseApi = null;
let firebaseReady = false;

function todayKey() {
  return dateKey(new Date());
}

function todayDisplay() {
  return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function loadUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function createUser(username, password = "") {
  return {
    username,
    password,
    xp: 0,
    points: 0,
    streak: 0,
    lastFullClear: "",
    completedTotal: 0,
    quests: {},
    questHistory: {},
    dailyCompletions: {},
    questDate: todayKey(),
    todos: [],
    foods: []
  };
}

function getCurrentUser() {
  const users = loadUsers();
  return users[activeUser];
}

function normalizeUserId(value) {
  return value.trim().toLowerCase();
}

function displayNameFromAuthUser(authUser) {
  return authUser.displayName || authUser.email?.split("@")[0] || "Hunter";
}

function ensureUserProfile(id, name, password = "") {
  const users = loadUsers();
  if (!users[id]) {
    users[id] = createUser(name, password);
  } else {
    users[id].username = users[id].username || name;
    users[id].questHistory ||= {};
    users[id].dailyCompletions ||= {};
  }
  saveUsers(users);
}

function readableAuthError(error) {
  const code = error?.code || "";
  const message = error?.message || "Something went wrong.";

  const errors = {
    "auth/internal-error": "Firebase Auth cannot run correctly from file://. Open the app from localhost or deploy it to Vercel, then try again.",
    "auth/configuration-not-found": "This Firebase project does not have Authentication fully enabled yet.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase Authentication.",
    "auth/unauthorized-domain": "This domain is not in Firebase Authentication authorized domains.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/popup-blocked": "Popup was blocked. This app now uses redirect sign-in for Google.",
    "auth/email-already-in-use": "That email already has an account.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/wrong-password": "Invalid email or password.",
    "auth/user-not-found": "No account found for that email."
  };

  return errors[code] || message.replace("Firebase: ", "");
}

async function initFirebase() {
  if (!hasFirebaseConfig()) {
    authMessage.textContent = "Firebase config missing. Email login is using local demo storage.";
    return;
  }

  if (IS_FILE_PAGE) {
    authMessage.textContent = "Opened from file://, so Firebase Auth is paused. Use localhost or Vercel for real login.";
    return;
  }

  const [{ initializeApp }, authModule] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`)
  ]);

  firebaseApi = authModule;
  firebaseAuth = authModule.getAuth(initializeApp(firebaseConfig));
  await authModule.setPersistence(firebaseAuth, authModule.browserLocalPersistence);
  firebaseReady = true;

  authMessage.textContent = "Checking sign-in...";
  authModule.getRedirectResult(firebaseAuth).then(result => {
    if (!result?.user) return;
    const id = result.user.uid;
    ensureUserProfile(id, displayNameFromAuthUser(result.user));
    activeUser = id;
    localStorage.setItem(SESSION_KEY, id);
    authMessage.textContent = "";
    showApp();
  }).catch(error => {
    authMessage.textContent = readableAuthError(error);
  });

  authModule.onAuthStateChanged(firebaseAuth, authUser => {
    if (!authUser) {
      authMessage.textContent = "";
      return;
    }
    const id = authUser.uid;
    ensureUserProfile(id, displayNameFromAuthUser(authUser));
    activeUser = id;
    localStorage.setItem(SESSION_KEY, id);
    showApp();
  });
}

async function signInWithEmail(email, password) {
  if (!firebaseAuth) {
    const users = loadUsers();
    const id = normalizeUserId(email);

    if (mode === "signup") {
      if (users[id]) {
        authMessage.textContent = "That email already exists.";
        return;
      }
      users[id] = createUser(email.split("@")[0], password);
      saveUsers(users);
    } else if (!users[id] || users[id].password !== password) {
      authMessage.textContent = "Invalid email or password.";
      return;
    }

    activeUser = id;
    localStorage.setItem(SESSION_KEY, id);
    authForm.reset();
    showApp();
    return;
  }

  if (mode === "signup") {
    await firebaseApi.createUserWithEmailAndPassword(firebaseAuth, email, password);
  } else {
    await firebaseApi.signInWithEmailAndPassword(firebaseAuth, email, password);
  }
}

function updateCurrentUser(updater) {
  const users = loadUsers();
  const user = users[activeUser];
  user.questHistory ||= {};
  user.dailyCompletions ||= {};
  updater(user);
  users[activeUser] = user;
  saveUsers(users);
  render();
}

function setMode(nextMode) {
  mode = nextMode;
  loginTab.classList.toggle("active", mode === "login");
  signupTab.classList.toggle("active", mode === "signup");
  authSubmit.textContent = mode === "login" ? "Enter Dungeon" : "Create Hunter";
  authMessage.textContent = "";
}

function showApp() {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  refreshDailyState();
  render();
}

function showAuth() {
  authScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}

function refreshDailyState() {
  const user = getCurrentUser();
  if (!user || user.questDate === todayKey()) return;
  updateCurrentUser(current => {
    current.questDate = todayKey();
    current.quests = {};
    current.dailyCompletions = {};
    current.foods = [];
  });
}

function getLevel(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function getRank(level) {
  if (level >= 20) return "S";
  if (level >= 15) return "A";
  if (level >= 10) return "B";
  if (level >= 6) return "C";
  if (level >= 3) return "D";
  return "E";
}

function getTodaysCalories(user) {
  const completions = user.dailyCompletions || {};
  const questCalories = Object.values(completions).reduce((sum, completion) => sum + (completion.calories || 0), 0);
  const foodCalories = user.foods.reduce((sum, food) => sum + food.calories, 0);
  return questCalories + foodCalories;
}

function getQuestAmount(quest) {
  const input = document.querySelector(`[data-amount="${quest.id}"]`);
  const amount = Number(input?.value);
  if (!Number.isFinite(amount) || amount <= 0) return quest.targetAmount;
  return amount;
}

function calculateQuestReward(quest, amount) {
  const ratio = amount / quest.targetAmount;
  return {
    amount,
    xp: Math.max(1, Math.round(quest.xp * ratio)),
    calories: Math.max(0, Math.round(quest.calories * ratio))
  };
}

function completeQuest(questId) {
  updateCurrentUser(user => {
    if (user.quests[questId]) return;
    const quest = defaultQuests.find(item => item.id === questId);
    const amount = getQuestAmount(quest);
    const reward = calculateQuestReward(quest, amount);
    user.quests[questId] = true;
    user.questHistory ||= {};
    user.dailyCompletions ||= {};
    user.questHistory[questId] ||= [];
    user.dailyCompletions[questId] = reward;
    if (!user.questHistory[questId].includes(todayKey())) {
      user.questHistory[questId].push(todayKey());
    }
    user.xp += reward.xp;
    user.points += reward.xp;
    user.completedTotal += 1;

    const allDone = defaultQuests.every(item => user.quests[item.id]);
    if (allDone && user.lastFullClear !== todayKey()) {
      user.streak += 1;
      user.lastFullClear = todayKey();
      user.xp += 30;
      user.points += 30;
    }
  });
}

function resetDay() {
  updateCurrentUser(user => {
    user.questDate = todayKey();
    user.quests = {};
    user.dailyCompletions = {};
    user.foods = [];
    user.questHistory ||= {};
    defaultQuests.forEach(quest => {
      user.questHistory[quest.id] = (user.questHistory[quest.id] || []).filter(date => date !== todayKey());
    });
  });
}

function renderHabitGrid(user, questId) {
  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  const today = new Date();
  const currentDay = today.getDay();
  const start = addDays(today, -currentDay - 63);
  const completedDates = new Set(user.questHistory?.[questId] || []);

  if (user.quests[questId]) {
    completedDates.add(todayKey());
  }

  return labels.map((label, row) => {
    const cells = Array.from({ length: 10 }, (_, column) => {
      const cellDate = addDays(start, column * 7 + row);
      const isFuture = cellDate > today;
      const isComplete = completedDates.has(dateKey(cellDate));
      return `<span class="heat-cell ${isComplete ? "hot" : ""} ${isFuture ? "future" : ""}"></span>`;
    }).join("");
    return `<span class="day-label">${label}</span>${cells}`;
  }).join("");
}

function renderHeader(user) {
  const level = getLevel(user.xp);
  const xpInLevel = user.xp % XP_PER_LEVEL;
  todayLabel.textContent = todayDisplay();
  hunterName.textContent = user.username;
  rankLabel.textContent = getRank(level);
  levelLabel.textContent = `Level ${level}`;
  xpLabel.textContent = `${xpInLevel} / ${XP_PER_LEVEL} XP`;
  xpFill.style.width = `${xpInLevel}%`;
  streakCount.textContent = user.streak;
  pointsCount.textContent = user.points;
  calorieCount.textContent = getTodaysCalories(user);
}

function renderQuests(user) {
  const filteredQuests = defaultQuests.filter(quest => {
    return quest.title.toLowerCase().includes(searchTerm) || quest.unit.toLowerCase().includes(searchTerm);
  });
  habitCount.textContent = `${filteredQuests.length} active habits`;
  questList.innerHTML = filteredQuests.map((quest, index) => {
    const done = Boolean(user.quests[quest.id]);
    const completion = user.dailyCompletions?.[quest.id];
    const shownAmount = completion?.amount || quest.targetAmount;
    const shownCalories = completion?.calories ?? quest.calories;
    const shownXp = completion?.xp ?? quest.xp;
    const finished = done ? 1 : 0;
    const completed = done ? 100 : Math.min(100, Math.round((shownAmount / quest.targetAmount) * 100));
    const heatRows = renderHabitGrid(user, quest.id);

    return `
      <article class="habit-card ${done ? "done" : ""}">
        <div class="habit-title">
          <span class="habit-icon">${quest.title.slice(0, 1)}</span>
          <div>
            <strong>${quest.title}</strong>
            <span>Goal : ${quest.targetAmount} ${quest.unit} | base +${quest.xp} XP</span>
          </div>
        </div>
        <label class="amount-control">
          <span>Today</span>
          <input data-amount="${quest.id}" type="number" min="0.1" step="0.1" value="${shownAmount}" ${done ? "disabled" : ""}>
          <span>${quest.unit}</span>
        </label>
        <div class="habit-stats">
          <div class="stat-box"><b>${finished} day</b><span>Finished</span></div>
          <div class="stat-box"><b data-percent-output="${quest.id}">${completed}%</b><span>Completed</span></div>
          <div class="stat-box"><b data-calorie-output="${quest.id}">${shownCalories}</b><span>kcal</span></div>
        </div>
        <div class="habit-grid" aria-label="${quest.title} progress grid">${heatRows}</div>
        <div class="habit-actions">
          <button class="done-button ${done ? "done" : ""}" type="button" data-quest="${quest.id}">
            ${done ? `Done +${shownXp} XP` : `Complete +${shownXp} XP`}
          </button>
          <button class="note-button" type="button">Add Note</button>
          <button class="mini-button" type="button" aria-label="Open ${quest.title} gallery">Img</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderTodos(user) {
  todoList.innerHTML = user.todos.length ? user.todos.map(todo => `
    <article class="stack-row ${todo.done ? "done" : ""}">
      <div class="row-main">
        <strong>${todo.text}</strong>
        <span>${todo.done ? "Cleared" : "Pending side quest"}</span>
      </div>
      <button class="mini-button" type="button" data-todo="${todo.id}">${todo.done ? "OK" : "+"}</button>
      <button class="delete-button" type="button" data-delete-todo="${todo.id}">x</button>
    </article>
  `).join("") : `<article class="stack-row"><div class="row-main"><strong>No side quests</strong><span>Add one above.</span></div></article>`;
}

function renderFood(user) {
  const calories = getTodaysCalories(user);
  calorieGoalLabel.textContent = `${calories} / ${CALORIE_GOAL}`;
  calorieFill.style.width = `${Math.min(100, (calories / CALORIE_GOAL) * 100)}%`;
  foodList.innerHTML = user.foods.length ? user.foods.map(food => `
    <article class="stack-row">
      <div class="row-main">
        <strong>${food.name}</strong>
        <span>${food.calories} kcal</span>
      </div>
      <button class="delete-button" type="button" data-delete-food="${food.id}">x</button>
    </article>
  `).join("") : `<article class="stack-row"><div class="row-main"><strong>No meals logged</strong><span>Quest calories count automatically.</span></div></article>`;
}

function renderAchievements(user) {
  achievementList.innerHTML = achievements.map(achievement => {
    const unlocked = achievement.test(user);
    return `
      <article class="stack-row achievement-row ${unlocked ? "" : "locked"}">
        <span class="badge">${unlocked ? "A" : "?"}</span>
        <div class="row-main">
          <strong>${achievement.title}</strong>
          <p>${achievement.detail}</p>
        </div>
      </article>
    `;
  }).join("");
}

function render() {
  const user = getCurrentUser();
  if (!user) return;
  renderHeader(user);
  renderQuests(user);
  renderTodos(user);
  renderFood(user);
  renderAchievements(user);
}

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

authForm.addEventListener("submit", event => {
  event.preventDefault();
  const email = usernameInput.value.trim();
  const password = passwordInput.value;

  authMessage.textContent = "";
  signInWithEmail(email, password).catch(error => {
    authMessage.textContent = readableAuthError(error);
  });
});

googleButton.addEventListener("click", () => {
  if (!firebaseAuth) {
    authMessage.textContent = IS_FILE_PAGE
      ? "Google login needs localhost or Vercel, not file://."
      : "Add Firebase config first, then Google sign-in will work.";
    return;
  }

  if (!firebaseReady) {
    authMessage.textContent = "Firebase is still loading. Try again in a second.";
    return;
  }

  authMessage.textContent = "Opening Google sign-in...";
  const provider = new firebaseApi.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  firebaseApi.signInWithRedirect(firebaseAuth, provider).catch(error => {
    authMessage.textContent = readableAuthError(error);
  });
});

logoutButton.addEventListener("click", () => {
  activeUser = "";
  localStorage.removeItem(SESSION_KEY);
  if (firebaseAuth) {
    firebaseApi.signOut(firebaseAuth);
  }
  showAuth();
});

questList.addEventListener("click", event => {
  const button = event.target.closest("[data-quest]");
  if (button) completeQuest(button.dataset.quest);
});

questList.addEventListener("input", event => {
  const input = event.target.closest("[data-amount]");
  if (!input) return;
  const quest = defaultQuests.find(item => item.id === input.dataset.amount);
  const amount = Number(input.value) || 0;
  const reward = calculateQuestReward(quest, amount || quest.targetAmount);
  const percent = Math.min(100, Math.round((amount / quest.targetAmount) * 100));
  const calorieOutput = document.querySelector(`[data-calorie-output="${quest.id}"]`);
  const percentOutput = document.querySelector(`[data-percent-output="${quest.id}"]`);
  const completeButton = document.querySelector(`[data-quest="${quest.id}"]`);

  if (calorieOutput) calorieOutput.textContent = reward.calories;
  if (percentOutput) percentOutput.textContent = `${percent}%`;
  if (completeButton) completeButton.textContent = `Complete +${reward.xp} XP`;
});

resetDayButton.addEventListener("click", resetDay);

searchInput.addEventListener("input", event => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

todoForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = todoInput.value.trim();
  if (!text) return;
  updateCurrentUser(user => {
    user.todos.unshift({ id: crypto.randomUUID(), text, done: false });
  });
  todoForm.reset();
});

todoList.addEventListener("click", event => {
  const doneButton = event.target.closest("[data-todo]");
  const deleteButton = event.target.closest("[data-delete-todo]");

  if (doneButton) {
    updateCurrentUser(user => {
      const todo = user.todos.find(item => item.id === doneButton.dataset.todo);
      if (!todo || todo.done) return;
      todo.done = true;
      user.xp += 10;
      user.points += 10;
    });
  }

  if (deleteButton) {
    updateCurrentUser(user => {
      user.todos = user.todos.filter(item => item.id !== deleteButton.dataset.deleteTodo);
    });
  }
});

calorieForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = foodInput.value.trim();
  const calories = Number(calorieInput.value);
  if (!name || !calories) return;
  updateCurrentUser(user => {
    user.foods.unshift({ id: crypto.randomUUID(), name, calories });
  });
  calorieForm.reset();
});

foodList.addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-delete-food]");
  if (!deleteButton) return;
  updateCurrentUser(user => {
    user.foods = user.foods.filter(item => item.id !== deleteButton.dataset.deleteFood);
  });
});

function switchSection(sectionName) {
  document.querySelectorAll(".filter-tab, .nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.section === sectionName);
  });
  document.querySelectorAll(".content-section").forEach(section => {
    section.classList.toggle("active", section.id === `${sectionName}Section`);
  });
}

document.querySelectorAll(".filter-tab, .nav-item").forEach(tab => {
  tab.addEventListener("click", () => {
    switchSection(tab.dataset.section);
  });
});

initFirebase().catch(error => {
  authMessage.textContent = readableAuthError(error);
});

if (activeUser && getCurrentUser()) {
  showApp();
} else {
  showAuth();
}
