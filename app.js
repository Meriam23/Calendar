// app.js
'use strict';

console.log("app.js chargé ");

// Elements auth
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userLabel = document.getElementById('userLabel');

let currentUser = null;

// --- Firebase (safe) ---
const fb = window._fb;

if (!fb) {
  console.warn("Firebase non chargé: window._fb est undefined. Auth désactivé.");

  // On garde les boutons visibles, mais on les désactive
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.title = "Firebase pas prêt (clés / serveur local)";
    loginBtn.style.opacity = "0.6";
    loginBtn.style.pointerEvents = "auto";
  }

  if (logoutBtn) {
    logoutBtn.disabled = true;
    logoutBtn.style.opacity = "0.6";
  }

  if (userLabel) userLabel.textContent = "mode local";
} else {
  const {
    getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged
  } = fb;

  const auth = getAuth();

  loginBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      await signInWithRedirect(auth, provider);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;

    loginBtn.style.display = user ? 'none' : 'inline-flex';
    logoutBtn.style.display = user ? 'inline-flex' : 'none';
    userLabel.textContent = user ? user.email : 'mode local';

    await loadTasksFromCloudOrLocal();
    renderAll();
  });
}





/**
 * Pastel Todo Calendar
 * - tasks stored in localStorage
 * - tasks appear on correct day cell
 * - list view with filters
 */

const STORAGE_KEY = 'pastel_todo_calendar_v1';

// Elements
const taskForm = document.getElementById('taskForm');
const titleInput = document.getElementById('titleInput');
const dateInput = document.getElementById('dateInput');
const notesInput = document.getElementById('notesInput');
const colorInput = document.getElementById('colorInput');

const calendarGrid = document.getElementById('calendarGrid');
const monthTitle = document.getElementById('monthTitle');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');

const taskList = document.getElementById('taskList');
const countChip = document.getElementById('countChip');

const clearAllBtn = document.getElementById('clearAllBtn');
const toast = document.getElementById('toast');

const toggleViewBtn = document.getElementById('toggleViewBtn');
const calendarPanel = document.getElementById('calendarPanel');
const listPanel = document.getElementById('listPanel');

const filterBtns = Array.from(document.querySelectorAll('.pill'));
let activeDateFilter = null;


const gridEl = document.querySelector('.grid');
const toggleFormBtn = document.getElementById('toggleFormBtn');

let isFormHidden = false;

function setFormHidden(hidden){
  isFormHidden = hidden;
  gridEl.classList.toggle('isFormHidden', hidden);

  // Si le bouton existe, on met à jour son texte
  if (toggleFormBtn){
    toggleFormBtn.setAttribute('aria-pressed', String(!hidden));
    toggleFormBtn.textContent = hidden ? 'New task' : 'Hide';
  }
}

// click bouton
if (toggleFormBtn){
  toggleFormBtn.addEventListener('click', () => {
    setFormHidden(!isFormHidden);
  });
}


taskForm.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
});



// State
let tasks = loadTasks();
let current = new Date();
current.setHours(0,0,0,0);

let viewMode = 'calendar'; // 'calendar' | 'list'
let listFilter = 'all';    // 'all' | 'open' | 'done'


// Utilities
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function yyyyMmDd(d) {
  // local date to YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYyyyMmDd(str) {
  // Create local date safely
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatPretty(strYmd) {
  const d = parseYyyyMmDd(strYmd);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 1300);
}

function saveTasks() {
  localStorage.setItem(getStorageKey(), JSON.stringify(tasks));
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getStorageKey() {
  // un espace de stockage par user
  return currentUser ? `${STORAGE_KEY}_${currentUser.uid}` : STORAGE_KEY;
}

async function loadTasksFromCloudOrLocal() {
  tasks = loadTasks();     // loadTasks va lire avec la bonne clé (voir étape 2)
  return tasks;
}

// CRUD
function addTask({ title, date, notes, color }) {
  tasks.unshift({
    id: uid(),
    title: title.trim(),
    date, // YYYY-MM-DD
    notes: (notes || '').trim(),
    color,
    done: false,
    createdAt: Date.now()
  });
  saveTasks();
  showMascot();  
}






function toggleDone(id) {
  tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
  saveTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
}

function openTask(id){
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  // switch vers la liste
  setView('list');
  renderAll();

  // attendre que le DOM soit à jour, puis scroll + highlight
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-task-id="${id}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('isActive');
    window.setTimeout(() => el.classList.remove('isActive'), 1100);
  });

  showToast('Tâche ouverte');
}


function clearAll() {
  tasks = [];
  saveTasks();
}

// Calendar rendering
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function mondayIndex(jsDay) {
  // JS: Sun=0..Sat=6, convert to Mon=0..Sun=6
  return (jsDay + 6) % 7;
}

function tasksByDateMap() {
  const map = new Map();
  for (const t of tasks) {
    if (!map.has(t.date)) map.set(t.date, []);
    map.get(t.date).push(t);
  }
  // sort inside each day: open first, then createdAt
  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.createdAt - b.createdAt;
    });
    map.set(k, arr);
  }
  return map;
}

function renderCalendar() {
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);

  monthTitle.textContent = monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const firstCellOffset = mondayIndex(monthStart.getDay()); // 0..6
  const totalDays = monthEnd.getDate();

  // We show 42 cells (6 weeks) for stable layout
  const cells = 42;

  const map = tasksByDateMap(); 
  calendarGrid.innerHTML = '';

  // date of first cell:
  const firstCellDate = new Date(monthStart);
  firstCellDate.setDate(monthStart.getDate() - firstCellOffset);

  const todayYmd = yyyyMmDd(new Date());

  for (let i = 0; i < cells; i++) {
    const cellDate = new Date(firstCellDate);
    cellDate.setDate(firstCellDate.getDate() + i);

    const ymd = yyyyMmDd(cellDate);
    const isOutside = cellDate.getMonth() !== current.getMonth();
    const isToday = ymd === todayYmd;

    const dayEl = document.createElement('div');
    dayEl.className = `day${isOutside ? ' isOutside' : ''}${isToday ? ' isToday' : ''}`;
    dayEl.dataset.date = ymd;
    dayEl.title = `Cliquer pour choisir ${ymd}`;

    const num = document.createElement('div');
    num.className = 'dayNum';
    num.textContent = String(cellDate.getDate());
    dayEl.appendChild(num);

    const badgeRow = document.createElement('div');
    badgeRow.className = 'badgeRow';

    const dayTasks = map.get(ymd) || [];
    // show up to 3 tasks; then +N
    const visible = dayTasks.slice(0, 3);
    for (const t of visible) {
  const badge = document.createElement('div');
  badge.className = `badge c-${t.color}`;
  badge.title = t.notes ? `${t.title} — ${t.notes}` : t.title;

  const left = document.createElement('div');
  left.className = 'badgeTitle';
  left.textContent = t.done ? `✓ ${t.title}` : t.title;

  // Texte dans le badge
  badge.appendChild(left);

  // Click = ouvrir la tâche (et ne pas remplir la date du jour)
  badge.style.cursor = 'pointer';
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof openTask === 'function') openTask(t.id);
  });

  badgeRow.appendChild(badge);
}

    if (dayTasks.length > 3) {
      const more = document.createElement('div');
      more.className = 'badge';
      more.textContent = `+ ${dayTasks.length - 3} autre(s)`;
      badgeRow.appendChild(more);
    }

    dayEl.appendChild(badgeRow);

    dayEl.addEventListener('click', () => {
  enterDayMode(ymd);
  showToast('Ajoute une tâche pour ce jour');
});

    calendarGrid.appendChild(dayEl);
  }
}

// List rendering
function filteredTasks() {
  let base = tasks;

  // Filtre par jour si actif
  if (activeDateFilter) base = base.filter(t => t.date === activeDateFilter);

  if (listFilter === 'open') return base.filter(t => !t.done);
  if (listFilter === 'done') return base.filter(t => t.done);
  return base;
}

function renderList() {
  // Titre dynamique
  const listTitleEl = listPanel.querySelector('h2');
  if (listTitleEl){
    listTitleEl.textContent = activeDateFilter
      ? `Tâches du ${formatPretty(activeDateFilter)}`
      : 'Toutes les tâches';
  }

  const list = filteredTasks()
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.createdAt - b.createdAt;
    });

  countChip.textContent = String(tasks.length);

  taskList.innerHTML = '';

  // ✅ Cas "aucune tâche"
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'taskCard';

    if (activeDateFilter) {
      li.innerHTML = `
        <div>
          <div class="taskTitle">Rien de prévu ici! ✨</div>
          <div class="taskDate">Ajoute une tâche juste en dessous 💛</div>
        </div>
      `;
    } else {
      li.innerHTML = `
        <div>
          <div class="taskTitle">Aucune tâche</div>
          <div class="taskDate">Ajoute-en une avec une date</div>
        </div>
      `;
    }

    taskList.appendChild(li);
    return; // ✅ IMPORTANT
  }

  // ✅ Cas "il y a des tâches"
  for (const t of list) {
    const li = document.createElement('li');
    li.className = `taskCard${t.done ? ' isDone' : ''}`;
    li.dataset.taskId = t.id;

    const left = document.createElement('div');

    const meta = document.createElement('div');
    meta.className = 'taskMeta';

    const dot = document.createElement('div');
    dot.className = `dot c-${t.color}`;
    meta.appendChild(dot);

    const title = document.createElement('div');
    title.className = 'taskTitle';
    title.textContent = t.title;
    meta.appendChild(title);

    const date = document.createElement('div');
    date.className = 'taskDate';
    date.textContent = formatPretty(t.date);
    meta.appendChild(date);

    left.appendChild(meta);

    if (t.notes) {
      const notes = document.createElement('div');
      notes.className = 'taskNotes';
      notes.textContent = t.notes;
      left.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'taskActions';

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'smallBtn done';
    doneBtn.textContent = t.done ? 'Undone' : 'Done';
    doneBtn.addEventListener('click', () => {
      toggleDone(t.id);
      renderAll();
    });

    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'smallBtn';
    goBtn.textContent = 'Voir';
    goBtn.addEventListener('click', () => {
      const d = parseYyyyMmDd(t.date);
      current = new Date(d.getFullYear(), d.getMonth(), 1);
      setView('calendar');
      renderAll();
      showToast('Calendrier positionné');
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'smallBtn';
    delBtn.textContent = 'Suppr.';
    delBtn.addEventListener('click', () => {
      deleteTask(t.id);
      renderAll();
      showToast('Tâche supprimée');
    });

    actions.appendChild(doneBtn);
    actions.appendChild(goBtn);
    actions.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(actions);

    taskList.appendChild(li);
  }
}











function enterDayMode(ymd){
  activeDateFilter = ymd;

  setView('list');          // on passe en liste
  setFormHidden(false);     // on affiche le form
  gridEl.classList.add('dayMode'); // layout 1 colonne

  dateInput.value = ymd;    // pré-remplir la date
  titleInput.focus();

  renderList();             // re-render la liste filtrée
}

function exitDayMode(){
  activeDateFilter = null;
  gridEl.classList.remove('dayMode');

  renderList();
}






function setView(mode) {
  viewMode = mode;
  const isCal = mode === 'calendar';

  calendarPanel.style.display = isCal ? 'block' : 'none';
  listPanel.style.display = isCal ? 'none' : 'block';

  if (isCal) {
    setFormHidden(true);
  } else {
    setFormHidden(isFormHidden);
  }

  toggleViewBtn.textContent = isCal ? 'Vue liste' : 'Vue calendrier';
  toggleViewBtn.setAttribute('aria-pressed', String(!isCal));
}


// Render all
function renderAll() {
  renderCalendar();
  renderList();
}

// Events
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = titleInput.value.trim();
  const date = dateInput.value;
  const notes = notesInput.value.trim();
  const color = colorInput.value;

  if (!title || !date) {
    showToast('Titre et date requis');
    return;
  }

  addTask({ title, date, notes, color });
  taskForm.reset();

  // keep date as today-ish convenience
  dateInput.value = date;

  renderAll();
  showToast('Tâche ajoutée');
});

prevMonthBtn.addEventListener('click', () => {
  current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  renderCalendar();
});

clearAllBtn.addEventListener('click', () => {
  const ok = window.confirm('Tout supprimer ?');
  if (!ok) return;
  clearAll();
  renderAll();
  showToast('Tout effacé');
});

toggleViewBtn.addEventListener('click', () => {
  const next = viewMode === 'calendar' ? 'list' : 'calendar';

  if (next === 'calendar') {
    exitDayMode();      // enlève dayMode + filtre
    setFormHidden(true);
  }

  setView(next);
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    listFilter = btn.dataset.filter;
    renderList();
  });
});


// Quotes

const QUOTES = [
  "After all, tomorrow is another day.", 
  "Hope is a good thing, maybe the best of things.", 
  "Just keep swimming.", 
  "Life finds a way.", 
  "It’s only after we’ve lost everything that we’re free to do anything.", 
  "Even the smallest person can change the course of the future.", 
  "All we have to decide is what to do with the time that is given to us.", 
  "Happiness can be found, even in the darkest of times, if one only remembers to turn on the light.", 
  "You are braver than you believe, stronger than you seem, and smarter than you think.", 
  "The past can hurt. But the way I see it, you can either run from it or learn from it.", 
  "To infinity… and beyond!", 
  "Sometimes the right path is not the easiest one.", 
  "Carpe diem. Seize the day, boys. Make your lives extraordinary.", 
  "There’s no place like home."
];

function setDailyQuote() {
  const el = document.getElementById("dailyQuote");
  if (!el) return;

  const randomIndex = Math.floor(Math.random() * QUOTES.length);
  el.textContent = `“${QUOTES[randomIndex]}”`;
}






// Init
(function init() {
  // default date = today
  dateInput.value = yyyyMmDd(new Date());
  setView('calendar');
  setDailyQuote();
  renderAll();
})();



// Mascot animation :D :D


const mascotOverlay = document.querySelector("#mascotOverlay");
const mascot = document.querySelector("#mascot");
const mascotCard = document.querySelector(".mascot-card");

function showMascot(){
  if (!mascotOverlay || !mascot) return;

  mascotOverlay.setAttribute("aria-hidden", "false");

  mascot.classList.remove("is-dancing");
  mascotOverlay.classList.add("is-visible");

  void mascot.offsetWidth; // relance l’anim
  mascot.classList.add("is-dancing");

  setTimeout(() => {
    mascotOverlay.classList.remove("is-visible");
    mascotOverlay.setAttribute("aria-hidden", "true");
  }, 1400);
}