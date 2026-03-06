// src/Login.jsx
import React, { useState } from "react";

export default function Login({ setUser }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!username || !password) {
      setError("Please enter username and password.");
      return;
    }
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        setUser({ token: data.token, username: data.username });
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: "auto", padding: 20 }}>
      <h2>Login</h2>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />
      <button onClick={handleLogin} style={{ width: "100%", padding: 10 }}>
        Login
      </button>
      {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
