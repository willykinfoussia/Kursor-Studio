import { useState, useEffect } from "react";

type Todo = {
  id: number;
  text: string;
  done: boolean;
};

type Filter = "all" | "active" | "done";

const STORAGE_KEY = "todoapp-todos";

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    const text = input.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: Date.now(), text, done: false }]);
    setInput("");
  };

  const toggleTodo = (id: number) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteTodo = (id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Todo App</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="Que faire ?"
          style={{ flex: 1, padding: 8, fontSize: 16 }}
        />
        <button onClick={addTodo} style={{ padding: "8px 16px", fontSize: 16 }}>
          Ajouter
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["all", "active", "done"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 12px",
              fontWeight: filter === f ? "bold" : "normal",
              textTransform: "capitalize",
            }}
          >
            {f === "all" ? "Tous" : f === "active" ? "Actifs" : "Terminés"}
          </button>
        ))}
      </div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {filtered.map((t) => (
          <li
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 0",
              borderBottom: "1px solid #ddd",
              textDecoration: t.done ? "line-through" : "none",
              color: t.done ? "#888" : "inherit",
            }}
          >
            <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} />
            <span style={{ flex: 1 }}>{t.text}</span>
            <button onClick={() => deleteTodo(t.id)} style={{ color: "red", cursor: "pointer" }}>
              ✕
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li style={{ color: "#888", padding: "8px 0" }}>Aucune tâche</li>}
      </ul>

      <p style={{ color: "#888", fontSize: 14, marginTop: 16 }}>
        {todos.filter((t) => !t.done).length} tâche(s) restante(s)
      </p>
    </main>
  );
}
