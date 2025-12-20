import "./styles.css";

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { nanoid } from "nanoid";
import { usePartySocket } from "partysocket/react";
import { useSync } from "partysync/react";

import type { TodoAction, TodoRecord } from "./shared";

// let's use a WeakSet to track which records are being updated optimistically

const optimisticCache = new WeakSet<TodoRecord>();

function isOptimisticUpdate(todo: TodoRecord) {
  return optimisticCache.has(todo);
}

function setIsOptimisticUpdate(todo: TodoRecord) {
  optimisticCache.add(todo);
  return todo;
}

function App() {
  const [newTodo, setNewTodo] = useState("");
  const socket = usePartySocket({
    party: "todos",
    room: "default"
  });

  const [todos, sendAction] = useSync<TodoRecord, TodoAction>(
    "todos",
    socket,
    (todos, action): TodoRecord[] => {
      switch (action.type) {
        case "create": {
          const { id, text, completed } = action.payload;
          return [
            ...todos,
            setIsOptimisticUpdate([
              id,
              text,
              completed,
              Date.now(),
              Date.now(),
              null
            ])
          ];
        }
        case "update": {
          const { id, text, completed } = action.payload;
          return todos.map((todo) =>
            todo[0] === id
              ? setIsOptimisticUpdate([
                  id,
                  text,
                  completed,
                  todo[3],
                  Date.now(),
                  null
                ])
              : todo
          );
        }
        case "delete":
          return todos.filter((todo) => todo[0] !== action.payload.id);
        default:
          console.error("unknown action", action);
          return todos;
      }
    }
  );

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodo.trim()) {
      setNewTodo("");
      sendAction({
        type: "create",
        payload: {
          id: nanoid(8),
          text: newTodo.trim(),
          completed: 0
        }
      });
    }
  };

  const toggleTodo = (id: string) => {
    const todo = todos.find((todo) => todo[0] === id);
    if (!todo) return;
    sendAction({
      type: "update",
      payload: {
        id,
        text: todo[1],
        completed: todo[2] === 0 ? 1 : 0
      }
    });
  };

  const deleteTodo = (id: string) => {
    const todo = todos.find((todo) => todo[0] === id);
    if (!todo) return;
    sendAction({
      type: "delete",
      payload: { id }
    });
  };

  return (
    <div className="todo-container">
      <h1 className="todo-title">Todo App</h1>

      <form onSubmit={addTodo} className="todo-form">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new todo"
          className="todo-input"
        />
        <button type="submit" className="todo-add-button">
          Add
        </button>
      </form>

      <ul className="todo-list">
        {todos
          .filter((todo) => todo[5] === null)
          .map((todo) => (
            <li
              key={todo[0]}
              className="todo-item"
              style={{
                opacity: isOptimisticUpdate(todo) ? 0.5 : 1
              }}
            >
              <input
                type="checkbox"
                checked={todo[2] === 1}
                onChange={() => toggleTodo(todo[0])}
                className="todo-checkbox"
              />
              <span
                className={todo[2] === 1 ? "todo-text completed" : "todo-text"}
              >
                {todo[1]}
              </span>
              <button
                type="button"
                onClick={() => deleteTodo(todo[0])}
                className="todo-delete-button"
              >
                Delete
              </button>
            </li>
          ))}
      </ul>
      <div className="todo-controls">
        <button
          type="button"
          onClick={clearDatabase}
          className="todo-clear-button"
        >
          Clear Local Data
        </button>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

// clear the local database
function clearDatabase() {
  if (window.confirm("Are you sure you want to clear all local data?")) {
    const db = window.indexedDB.open("partysync");
    db.onsuccess = () => {
      const deleteRequest = window.indexedDB.deleteDatabase("partysync");
      deleteRequest.onsuccess = () => {
        window.location.reload();
      };
    };
  }
}
