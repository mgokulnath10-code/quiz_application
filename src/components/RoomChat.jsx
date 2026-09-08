import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { FiSend } from "react-icons/fi";

const API = "https://brain-race.onrender.com";

const getAuth = () => ({
  headers: {
    Authorization: localStorage.getItem("token") || "",
  },
});

function RoomChat({ roomId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const chatBoxRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  const mergeMessages = (incoming) => {
    const fresh = incoming.filter(
      (m) => !seenIdsRef.current.has(m._id)
    );

    if (fresh.length === 0) return;

    fresh.forEach((m) => seenIdsRef.current.add(m._id));

    setMessages((prev) => {
      const merged = [...prev, ...fresh];

      // Chat is capped at 200 server-side; keep
      // the newest 200 locally as well.
      return merged.slice(-200);
    });
  };

  useEffect(() => {
    seenIdsRef.current = new Set();
    setMessages([]);
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;

    const fetchChat = async () => {
      try {
        const res = await axios.get(
          `${API}/api/rooms/${roomId}/chat?after=0`,
          getAuth()
        );

        if (!cancelled) {
          mergeMessages(res.data);
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchChat();

    const timer = setInterval(fetchChat, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

  useEffect(() => {
    const box = chatBoxRef.current;

    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const message = text.trim();

    if (!message || sending) return;

    setSending(true);

    try {
      const res = await axios.post(
        `${API}/api/rooms/${roomId}/chat`,
        { message },
        getAuth()
      );

      setText("");

      // Render the sender's message instantly;
      // mergeMessages de-duplicates it later.

      if (res.data.chatMessage) {
        mergeMessages([res.data.chatMessage]);
      }
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Could not send message"
      );
    } finally {
      setSending(false);
    }
  };

  const myId =
    (JSON.parse(localStorage.getItem("user")) || {})._id;

  return (
    <div>
      <div className="chat-box" ref={chatBoxRef}>
        {messages.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", margin: "auto" }}>
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg._id}
              className={`chat-msg ${msg.userId === myId ? "own" : ""}`}
            >
              <div className="chat-name">{msg.name}</div>

              <div className="chat-bubble">{msg.message}</div>
            </div>
          ))
        )}
      </div>

      <div className="chat-input-row">
        <input
          className="input"
          type="text"
          placeholder="Type a message..."
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
        />

        <button
          className="btn btn-primary"
          disabled={sending}
          onClick={sendMessage}
        >
          <FiSend />
          Send
        </button>
      </div>
    </div>
  );
}

export default RoomChat;
