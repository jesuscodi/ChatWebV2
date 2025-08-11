import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import {
  getDatabase, ref, push, query, limitToLast,
  onChildAdded, onChildChanged, set, onValue, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// --- CONFIG: pega tus datos reales de Firebase aqui ---
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://TU_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
// -------------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Usuario (guardado solo 1 vez) ---
let username = localStorage.getItem("username");
let userId = localStorage.getItem("userId"); // id único por sesión
if (!username) {
  username = prompt("Ingresa tu nombre:");
  localStorage.setItem("username", username);
}
if (!userId) {
  userId = (username || "user") + "_" + Math.random().toString(36).slice(2,8);
  localStorage.setItem("userId", userId);
}

// --- Permisos de notificación (opcional) ---
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// --- Elementos DOM ---
const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typing-indicator");
const onlineUsersDiv = document.getElementById("onlineUsers");

// --- References DB ---
const mensajesRef = ref(db, "mensajes");
const mensajesQuery = query(mensajesRef, limitToLast(200));
const presenceRef = ref(db, "presence/" + userId);
const connectedRef = ref(db, ".info/connected");

// --- PRESENCIA: setear online y onDisconnect ---
onValue(connectedRef, (snap) => {
  if (snap.val() === true) {
    // estamos conectados -> marcamos presencia
    set(presenceRef, { username, online: true, last_active: Date.now() });
    // cuando se desconecte el cliente, marcar offline
    onDisconnect(presenceRef).set({ username, online: false, last_active: Date.now() });
  }
});

// Escuchar lista de presencia para mostrar quien está en línea
onValue(ref(db, "presence"), (snap) => {
  const val = snap.val() || {};
  const online = Object.values(val).filter(u => u && u.online).map(u => u.username);
  onlineUsersDiv.textContent = online.length ? `En línea: ${[...new Set(online)].join(", ")}` : "En línea: nadie";
});

// --- MAPA local de elementos para actualizar vistos ---
const messageEls = {}; // messageId -> { containerEl, seenEl }

// --- FUNCIONES ---
function createMessageElement(id, data) {
  const hora = data && data.fecha ? new Date(data.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "";
  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  wrapper.dataset.id = id;
  wrapper.classList.add(data.usuario === username ? "my-message" : "other-message");

  const textDiv = document.createElement("div");
  textDiv.classList.add("text");
  textDiv.textContent = `${data.usuario}: ${data.texto}`;

  const metaDiv = document.createElement("div");
  metaDiv.classList.add("meta");

  const timeSmall = document.createElement("small");
  timeSmall.textContent = hora;

  const seenSpan = document.createElement("span");
  seenSpan.classList.add("seen");
  seenSpan.textContent = ""; // se actualizará

  metaDiv.appendChild(timeSmall);
  metaDiv.appendChild(seenSpan);

  wrapper.appendChild(textDiv);
  wrapper.appendChild(metaDiv);

  // guardar referencias
  messageEls[id] = { containerEl: wrapper, seenEl: seenSpan };

  return wrapper;
}

function markMessageAsSeen(messageId) {
  if (!messageId) return;
  const seenRef = ref(db, `mensajes/${messageId}/vistoPor/${userId}`);
  set(seenRef, { username, ts: Date.now() }).catch(err => console.error("Error marcando visto:", err));
}

function updateSeenUI(messageId, vistoPorObj) {
  const entry = messageEls[messageId];
  if (!entry) return;
  const names = vistoPorObj ? Object.values(vistoPorObj).map(v => v.username) : [];
  // quitar duplicados y mostrar
  const uniq = [...new Set(names)];
  entry.seenEl.textContent = uniq.length ? `Visto por: ${uniq.join(", ")}` : "";
}

// --- Enviar mensaje ---
sendBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (!text) return;
  push(mensajesRef, {
    usuario: username,
    texto: text,
    fecha: Date.now()
  }).catch(err => console.error("Error al enviar:", err));
  messageInput.value = "";
});

// --- "Escribiendo..." (ya lo tenías) ---
let typingTimeout;
const typingRef = ref(db, "typing/" + userId);
messageInput.addEventListener("input", () => {
  set(typingRef, { username, typing: true, ts: Date.now() });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    set(typingRef, { username, typing: false, ts: Date.now() });
  }, 500);
});

onValue(ref(db, "typing"), (snap) => {
  const data = snap.val() || {};
  const othersTyping = Object.values(data)
    .filter(t => t && t.typing && t.username !== username)
    .map(t => t.username);
  typingIndicator.textContent = othersTyping.length ? `${[...new Set(othersTyping)].join(", ")} está escribiendo...` : "";
});

// --- Escuchar mensajes nuevos ---
onChildAdded(mensajesQuery, (snap) => {
  const id = snap.key;
  const data = snap.val();
  // Si por alguna razón data.fecha es inválido, usar ahora
  if (!data.fecha) data.fecha = Date.now();

  // Crear y mostrar
  const el = createMessageElement(id, data);
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;

  // MARCAR como visto por este usuario
  markMessageAsSeen(id);

  // Si no es tu propio mensaje, notificar (opcional)
  if (data.usuario !== username && "Notification" in window && Notification.permission === "granted") {
    new Notification(`${data.usuario} dice:`, { body: data.texto });
  }

  // Si ya tiene vistoPor, actualizar UI
  if (data.vistoPor) updateSeenUI(id, data.vistoPor);
});

// --- Escuchar cambios (vistoPor u otros cambios) ---
onChildChanged(mensajesRef, (snap) => {
  const id = snap.key;
  const data = snap.val();
  if (data && data.vistoPor) {
    updateSeenUI(id, data.vistoPor);
  }
});
