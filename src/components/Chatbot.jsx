import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const API_BASE = "http://localhost:4000/api";

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "Hola, soy el Asistente IA del ITSVA. ¿En qué puedo ayudarte hoy?",
};

// 🧩 Arreglo: convertir el estilo raro con `||` en tabla Markdown válida
const formatAssistantMarkdown = (text) => {
  if (!text) return "";

  let fixed = text.trim();

  // 1) Cada vez que el modelo pone "||" lo tomamos como "salto de línea + |"
  // Ej: "| Col1 | Col2 || --- | --- || fila1 | fila2 |"
  fixed = fixed.replace(/\|\|\s*/g, "\n|");

  // 2) Opcional: aseguramos que no queden cosas tipo "| --- | --- | --- ||"
  // (si queda doble barra final la limpiamos un poco)
  fixed = fixed.replace(/\|\s*\n/g, "|\n");

  return fixed;
};

export default function Chatbot({ user, onLogout }) {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // para autoscroll al último mensaje
  const messagesEndRef = useRef(null);

  // --------- Cargar historial ----------
  const fetchConversations = async () => {
    try {
      setLoadingConversations(true);
      const res = await fetch(`${API_BASE}/chat/history`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setConversations(data.conversations || []);
      } else {
        console.error("Error al obtener historial:", data.error);
      }
    } catch (err) {
      console.error("Error al obtener historial:", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [user.id]);

  // 🔽 autoscroll cuando cambian los mensajes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // --------- Enviar mensaje ----------
  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          message: text,
          history: newMessages,
          conversationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              data.error ||
              "Ocurrió un error al comunicarme con el modelo de IA.",
          },
        ]);
        return;
      }

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);

      fetchConversations();
    } catch (err) {
      console.error("Error en el chat frontend:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "No pude conectarme con el servidor de IA. Verifica que LM Studio esté encendido.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // --------- Nuevo chat ----------
  const handleNewChat = () => {
    setConversationId(null);
    setMessages([INITIAL_MESSAGE]);
  };

  // --------- Abrir chat ----------
  const handleOpenConversation = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversation/${id}`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Error al cargar conversación:", data.error);
        return;
      }

      if (data.conversation && Array.isArray(data.conversation.messages)) {
        setConversationId(data.conversation._id);
        setMessages(data.conversation.messages);
      }
    } catch (err) {
      console.error("Error al cargar conversación:", err);
    }
  };

  // --------- Renombrar ----------
  const handleRenameConversation = async (conv) => {
    const nuevoTitulo = window.prompt(
      "Nuevo título para este chat:",
      conv.title || ""
    );
    if (!nuevoTitulo || !nuevoTitulo.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/chat/conversation/${conv._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ title: nuevoTitulo }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Error al renombrar conversación:", data.error);
        return;
      }

      setConversations((prev) =>
        prev.map((c) => (c._id === conv._id ? { ...c, title: nuevoTitulo } : c))
      );
    } catch (err) {
      console.error("Error al renombrar conversación:", err);
    }
  };

  // --------- Eliminar ----------
  const handleDeleteConversation = async (id) => {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar este chat? Esta acción no se puede deshacer."
    );
    if (!confirmar) return;

    try {
      const res = await fetch(`${API_BASE}/chat/conversation/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Error al eliminar conversación:", data.error);
        return;
      }

      setConversations((prev) => prev.filter((c) => c._id !== id));

      if (conversationId === id) {
        setConversationId(null);
        setMessages([INITIAL_MESSAGE]);
      }
    } catch (err) {
      console.error("Error al eliminar conversación:", err);
    }
  };

  // --------- Render ----------
  return (
    <div className="chat-page">
      {/* HEADER SUPERIOR */}
      <header className="chat-top-header">
        <div className="chat-top-left">
          {/* LOGO ITSVA */}
          <div className="chat-logo-placeholder">
            <img
              src="/itsva-logo.png"
              alt="Instituto Tecnológico Superior de Valladolid"
            />
          </div>

          <h2 className="chat-title">ITSVA · Chat IA</h2>
        </div>

        <button className="logout-button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </header>

      {/* LAYOUT PRINCIPAL */}
      <div className="chat-layout">
        {/* SIDEBAR */}
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <span className="chat-sidebar-title">Tus chats</span>
            <button className="chat-newchat-button" onClick={handleNewChat}>
              + Nuevo
            </button>
          </div>

          <div className="chat-list">
            {loadingConversations ? (
              <div className="chat-list-empty">Cargando chats…</div>
            ) : conversations.length === 0 ? (
              <div className="chat-list-empty">
                Aún no tienes conversaciones guardadas.
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv._id}
                  className={
                    "chat-list-item" +
                    (conversationId === conv._id ? " active" : "")
                  }
                  onClick={() => handleOpenConversation(conv._id)}
                >
                  <div className="chat-list-item-title">{conv.title}</div>

                  <div className="chat-list-item-actions">
                    <button
                      className="chat-list-icon"
                      title="Renombrar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameConversation(conv);
                      }}
                    >
                      ✏️
                    </button>

                    <button
                      className="chat-list-icon"
                      title="Eliminar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv._id);
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ZONA DE CHAT */}
        <div className="chat-main">
          <main className="chat-body">
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`chat-message ${
                    msg.role === "user" ? "user" : "assistant"
                  }`}
                >
                  <div className="chat-bubble">
                    {msg.role === "assistant" ? (
                      <ReactMarkdown>
                        {formatAssistantMarkdown(msg.content)}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="chat-message assistant">
                  <div className="chat-bubble">
                    El asistente está escribiendo…
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </main>

          {/* INPUT */}
          <form className="chat-input-area" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="Escribe tu mensaje…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={!input.trim() || isSending}>
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
