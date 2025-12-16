import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = "http://localhost:4000/api";

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "Hola, soy el Asistente IA del ITSVA. ¿En qué puedo ayudarte hoy?",
};

// Convierte el estilo raro con `||` en tabla Markdown válida
const formatAssistantMarkdown = (text) => {
  if (!text) return "";
  let fixed = text.trim();
  fixed = fixed.replace(/\|\|\s*/g, "\n");
  fixed = fixed.replace(/\|\s*\n/g, "|\n");
  return fixed;
};

const THEME_KEY = "itsva_theme"; // dark | light

export default function Chatbot({ user, onLogout }) {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const [theme, setTheme] = useState("dark");

  const messagesEndRef = useRef(null);

  /* ======================
     TEMA (load + toggle)
     ====================== */
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const initialTheme = saved === "light" ? "light" : "dark";
    setTheme(initialTheme);

    if (initialTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);

      if (next === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      return next;
    });
  };

  /* ======================
     HISTORIAL
     ====================== */
  const fetchConversations = async () => {
    try {
      setLoadingConversations(true);
      const res = await fetch(`${API_BASE}/chat/history`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } catch (err) {
      console.error("Error historial:", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  /* ======================
     AUTOSCROLL
     ====================== */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  /* ======================
     ENVIAR MENSAJE
     ====================== */
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
          { role: "assistant", content: data.error || "Error del servidor." },
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
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "No pude conectarme con el servidor de IA. Verifica LM Studio.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  /* ======================
     CHAT CRUD
     ====================== */
  const handleNewChat = () => {
    setConversationId(null);
    setMessages([INITIAL_MESSAGE]);
  };

  const handleOpenConversation = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversation/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (res.ok && data.conversation?.messages) {
        setConversationId(data.conversation._id);
        setMessages(data.conversation.messages);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameConversation = async (conv) => {
    const nuevoTitulo = window.prompt("Nuevo título:", conv.title || "");
    if (!nuevoTitulo?.trim()) return;

    await fetch(`${API_BASE}/chat/conversation/${conv._id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ title: nuevoTitulo }),
    });

    setConversations((prev) =>
      prev.map((c) =>
        c._id === conv._id ? { ...c, title: nuevoTitulo } : c
      )
    );
  };

  const handleDeleteConversation = async (id) => {
    if (!window.confirm("¿Eliminar este chat?")) return;

    await fetch(`${API_BASE}/chat/conversation/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user.token}` },
    });

    setConversations((prev) => prev.filter((c) => c._id !== id));

    if (conversationId === id) {
      setConversationId(null);
      setMessages([INITIAL_MESSAGE]);
    }
  };

  /* ======================
     RENDER
     ====================== */
  return (
    <div className="chat-page">
      {/* HEADER */}
      <header className="chat-top-header">
        {/* IZQUIERDA */}
        <div className="chat-top-left">
          <h2 className="chat-title">ITSVA · Chat IA</h2>
        </div>

        {/* CENTRO */}
        <div className="chat-top-center">
          <img
            src="/logo encabezado.png"
            alt="Tecnológico Nacional de México"
            className="chat-header-logo"
          />
        </div>

        {/* DERECHA */}
        <div className="chat-top-right">
          <button className="theme-button" onClick={toggleTheme}>
            {theme === "dark" ? "Claro" : "Oscuro"}
          </button>
          <button className="logout-button" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* BODY */}
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
              <div className="chat-list-empty">Cargando…</div>
            ) : conversations.length === 0 ? (
              <div className="chat-list-empty">Sin conversaciones.</div>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameConversation(conv);
                      }}
                    >
                      Renombrar
                    </button>
                    <button
                      className="chat-list-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv._id);
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* CHAT */}
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
