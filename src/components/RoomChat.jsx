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

  const chatBoxRef = useRef(null);
  const countRef = useRef(0);

  useEffect(() => {
    countRef.current = 0;
    setMessages([]);
  }, [roomId]);

  useEffect(() => {
    const fetchChat = async () => {
      try {
        const res = await axios.get(
          `${API}/api/rooms/${roomId}/chat?after=${countRef.current}`,
          getAuth()
        );

        if (res.data.length > 0) {
          countRef.current += res.data.length;

          setMessages((prev) => [...prev, ...res.data]);
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchChat();

    const timer = setInterval(fetchChat, 3000);

    return () => clearInterval(timer);
  }, [roomId]);

  useEffect(() => {
    const box = chatBoxRef.current;

    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!text.trim()) return;

    const message = text;

    setText("");

    try {
      await axios.post(
        `${API}/api/rooms/${roomId}/chat`,
        { message },
        getAuth()
      );
    } catch (error) {
      alert(
        error.response?.data?.message || "Could not send message"
      );
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
          messages.map((msg, index) => (
            <div
              key={index}
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
        />

        <button className="btn btn-primary" onClick={sendMessage}>
          <FiSend />
          Send
        </button>
      </div>
    </div>
  );
}

export default RoomChat;
