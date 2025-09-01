// =============================
// Data & State
// =============================
const LS_KEY = "todo.tasks.v1";
const THEME_KEY = "todo.theme";
/** @type {Array<{id:string,text:string,completed:boolean,createdAt:number, due?:string, order:number}>} */
let tasks = [];
let filter = "all"; // all | active | completed
let searchTerm = "";

// =============================
// Elements
// =============================
const app = document.getElementById("app");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const taskInput = document.getElementById("taskInput");
const dateInput = document.getElementById("dateInput");
const addBtn = document.getElementById("addBtn");
const chips = [...document.querySelectorAll(".chip")];
const searchInput = document.getElementById("searchInput");
const countEl = document.getElementById("count");
const activeCountEl = document.getElementById("activeCount");
const clearCompletedBtn = document.getElementById("clearCompleted");
const exportBtn = document.getElementById("exportBtn");
const importFile = document.getElementById("importFile");

const tpl = document.getElementById("taskTemplate");

const themeKey = "todo-theme";
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

// =============================
// Init
// =============================
load();
applyTheme(loadTheme());
render();

// =============================
// Event Listeners
// =============================
addBtn.addEventListener("click", onAdd);
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") onAdd();
});

chips.forEach((ch) =>
  ch.addEventListener("click", () => {
    filter = ch.dataset.filter;
    updateFilterChips();
    render();
  })
);

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  render();
});

clearCompletedBtn.addEventListener("click", () => {
  tasks = tasks.filter((t) => !t.completed);
  save();
  render();
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tasks.json";
  a.click();
  URL.revokeObjectURL(url);
});

importFile.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)) {
        // Normalize imported array
        tasks = data
          .map((t, i) => ({
            id: String(t.id ?? crypto.randomUUID()),
            text: String(t.text ?? "").trim(),
            completed: Boolean(t.completed),
            createdAt: Number(t.createdAt ?? Date.now()),
            due: t.due ? String(t.due) : undefined,
            order: Number(t.order ?? i),
          }))
          .filter((t) => t.text.length);
        save();
        render();
      }
    } catch (err) {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
  // reset input to allow re-importing same file
  importFile.value = "";
});
// Load thee from storage
const savedTheme = localStorage.getItem(themeKey) || "dark";
document.body.classList.toggle("theme-light", savedTheme === "light");
themeIcon.textContent = savedTheme === "light" ? "☀️" : "🌙";
themeToggle.setAttribute("aria-pressed", savedTheme === "light");

//Toggle on click
themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("theme-light");
  themeIcon.textContent = isLight ? "☀️" : "🌙";
  themeToggle.setAttribute("aria-pressed", String(isLight));
  localStorage.setItem(themeKey, isLight ? "light" : "dark");
});

// Delegated events on list
listEl.addEventListener("click", (e) => {
  const target = e.target.closest('button, input[type="checkbox"]');
  if (!target) return;
  const item = e.target.closest(".task");
  if (!item) return;
  const id = item.dataset.id;

  if (target.classList.contains("delete")) {
    tasks = tasks.filter((t) => t.id !== id);
    save();
    render();
    return;
  }
  if (target.classList.contains("edit")) {
    startEdit(item, id);
    return;
  }
  if (target.matches("input.check")) {
    const t = tasks.find((t) => t.id === id);
    if (!t) return;
    t.completed = target.checked;
    save();
    render();
    return;
  }
});
listEl.addEventListener("dblclick", (e) => {
  const item = e.target.closest(".task");
  if (!item) return;
  const id = item.dataset.id;
  startEdit(item, id);
});

listEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cancelAllEditing();
});

// Drag and drop for reordering
let dragSrc = null;
listEl.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".task");
  if (!item) return;
  dragSrc = item;
  item.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});
listEl.addEventListener("dragend", (e) => {
  const item = e.target.closest(".task");
  if (item) item.classList.remove("dragging");
  document
    .querySelectorAll(".drop-target")
    .forEach((el) => el.classList.remove("drop-target"));
  dragSrc = null;
  persistOrderFromDOM();
});
listEl.addEventListener("dragover", (e) => {
  if (!dragSrc) return;
  e.preventDefault();
  const item = e.target.closest(".task");
  if (!item || item === dragSrc) return;
  item.classList.add("drop-target");
  const rect = item.getBoundingClientRect();
  const before = e.clientY - rect.top < rect.height / 2;
  item.parentNode.insertBefore(dragSrc, before ? item : item.nextSibling);
});
listEl.addEventListener("dragleave", (e) => {
  const item = e.target.closest(".task");
  if (item) item.classList.remove("drop-target");
});

// =============================
// Functions
// =============================
function onAdd() {
  const text = taskInput.value.trim();
  const due = dateInput.value || undefined;
  if (!text) return;
  const order = tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0;
  tasks.push({
    id: crypto.randomUUID(),
    text,
    completed: false,
    createdAt: Date.now(),
    due,
    order,
  });
  taskInput.value = "";
  dateInput.value = "";
  save();
  render();
  taskInput.focus();
}

function updateFilterChips() {
  chips.forEach((ch) =>
    ch.setAttribute("aria-pressed", String(ch.dataset.filter === filter))
  );
}

function render() {
  listEl.innerHTML = "";
  const q = searchTerm;
  const filtered = tasks
    .filter((t) =>
      filter === "active"
        ? !t.completed
        : filter === "completed"
        ? t.completed
        : true
    )
    .filter((t) => (q ? t.text.toLowerCase().includes(q) : true))
    .sort((a, b) => a.order - b.order);

  if (!filtered.length) {
    emptyEl.style.display = "block";
    listEl.appendChild(emptyEl);
  } else emptyEl.style.display = "none";

  for (const t of filtered) {
    listEl.appendChild(renderTask(t));
  }

  countEl.textContent = String(tasks.length);
  activeCountEl.textContent = `${
    tasks.filter((t) => !t.completed).length
  } active`;
}

function renderTask(t) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = t.id;
  node.querySelector(".check").checked = t.completed;
  const title = node.querySelector(".title");
  title.textContent = t.text;
  title.classList.toggle("completed", t.completed);
  const created = node.querySelector(".created");
  created.textContent = formatCreated(t.createdAt);
  const due = node.querySelector(".due");
  if (t.due) {
    due.hidden = false;
    due.textContent = `Due ${formatDate(t.due)}`;
  } else {
    due.hidden = true;
  }
  // drag handle accessible: only allow dragging via the whole card
  node.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".drag-handle"))
      e.target.closest(".task").draggable = false;
    else e.target.closest(".task").draggable = true;
  });
  return node;
}

function startEdit(item, id) {
  cancelAllEditing();
  item.classList.add("editing");
  const input = item.querySelector(".edit-input");
  const current = tasks.find((t) => t.id === id);
  if (!current) return;
  input.value = current.text;
  input.focus();
  input.setSelectionRange(current.text.length, current.text.length);
  input.addEventListener(
    "keydown",
    function onKey(e) {
      if (e.key === "Enter") {
        finishEdit();
      }
      if (e.key === "Escape") {
        cancelAllEditing();
      }
    },
    { once: false }
  );
  input.addEventListener(
    "blur",
    () => {
      finishEdit();
    },
    { once: true }
  );

  function finishEdit() {
    const val = input.value.trim();
    if (!val) {
      // empty → delete
      tasks = tasks.filter((t) => t.id !== id);
    } else {
      current.text = val;
    }
    save();
    render();
  }
}

function cancelAllEditing() {
  document
    .querySelectorAll(".task.editing")
    .forEach((el) => el.classList.remove("editing"));
}

function persistOrderFromDOM() {
  const ids = [...document.querySelectorAll(".task")].map(
    (el) => el.dataset.id
  );
  const orderMap = new Map(ids.map((id, idx) => [id, idx]));
  tasks.forEach((t) => {
    if (orderMap.has(t.id)) t.order = orderMap.get(t.id);
  });
  save();
}

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(tasks));
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    tasks = raw ? JSON.parse(raw) : [];
    // Ensure required fields exist
    tasks = tasks
      .map((t, i) => ({
        id: t.id || crypto.randomUUID(),
        text: String(t.text ?? "").trim(),
        completed: Boolean(t.completed),
        createdAt: Number(t.createdAt ?? Date.now()),
        due: t.due ? String(t.due) : undefined,
        order: Number(t.order ?? i),
      }))
      .filter((t) => t.text.length);
  } catch {
    tasks = [];
  }
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

function applyTheme(mode) {
  const light = mode === "light";
  document.body.classList.toggle("theme-light", light);
  themeIcon.textContent = light ? "☀️" : "🌙";
  themeToggle.setAttribute("aria-pressed", String(light));
}

// Helpers
function formatCreated(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `Today • ${d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Seed (optional) – uncomment to preview UI quickly
// if(!tasks.length){
//   tasks = [
//     {id:crypto.randomUUID(), text:'Design stand‑up at 9am', completed:false, createdAt:Date.now()-3600e3, due:new Date().toISOString().slice(0,10), order:0},
//     {id:crypto.randomUUID(), text:'Wireframe dashboard screens', completed:true, createdAt:Date.now()-86400e3, order:1},
//     {id:crypto.randomUUID(), text:'Reply to feedback', completed:false, createdAt:Date.now()-2*86400e3, due:new Date(Date.now()+86400e3*2).toISOString().slice(0,10), order:2},
//   ]; save(); render();
// }
