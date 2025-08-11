import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getDatabase, ref, push, query, limitToLast, onChildAdded, set, onValue } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// 🔹 Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCgHojFMtxO0_FbONRMYdfCt8gxFpJMZxg",
  authDomain: "chatweb-7d65a.firebaseapp.com",
  databaseURL: "https://chatweb-7d65a-default-rtdb.firebaseio.com",
  projectId: "chatweb-7d65a",
  storageBucket: "chatweb-7d65a.firebasestorage.app",
  messagingSenderId: "741436207771",
  appId: "1:741436207771:web:707ee44969271b25fb4c3e",
  measurementId: "G-7L7N83H41N"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 🔹 Guardar nombre una sola vez
let username = localStorage.getItem("username");
if (!username) {
    username = prompt("Ingresa tu nombre:");
    localStorage.setItem("username", username);
}

// 🔹 Solicitar permiso de notificaciones
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typing-indicator");

const mensajesRef = ref(db, "mensajes");
const mensajesOrdenados = query(mensajesRef, limitToLast(50));
const typingRef = ref(db, "typing/" + username);

// 🔹 Enviar mensaje
sendBtn.addEventListener("click", () => {
    const message = messageInput.value.trim();
    if (!message) return;

    push(mensajesRef, {
        usuario: username,
        texto: message,
        fecha: Date.now()
    });

    messageInput.value = "";
    set(typingRef, false); // deja de escribir al enviar
});

// 🔹 Mostrar mensajes y enviar notificación
onChildAdded(mensajesOrdenados, (snapshot) => {
    const data = snapshot.val();
    const fecha = new Date(data.fecha);
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement("div");
    div.classList.add("message");
    div.innerHTML = `<strong>${data.usuario}</strong>: ${data.texto} <br><small>${hora}</small>`;

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (data.usuario !== username && Notification.permission === "granted") {
        new Notification(`${data.usuario} dice:`, { body: data.texto });
    }
});

// 🔹 Aviso de "escribiendo..."
let typingTimeout;
messageInput.addEventListener("input", () => {
    set(typingRef, true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        set(typingRef, false);
    }, 500);
});

// 🔹 Escuchar cuando otros usuarios escriben
const globalTypingRef = ref(db, "typing");
onValue(globalTypingRef, (snapshot) => {
    const typingData = snapshot.val() || {};
    const othersTyping = Object.keys(typingData).filter(user => typingData[user] && user !== username);

    if (othersTyping.length > 0) {
        typingIndicator.textContent = `${othersTyping.join(", ")} está escribiendo...`;
    } else {
        typingIndicator.textContent = "";
    }
});
