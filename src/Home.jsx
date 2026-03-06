import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "./Home.css";
import MyTripsMockup from "./MyTripsMockup";
import { useNavigate } from "react-router-dom";




const API_URL = "https://vihar-vg29.onrender.com";


export default function Home({ user, setUser }) {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");

  async function handleLogin() {
    if (!loginUsername || !loginPassword) {
      setLoginError("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        setUser({ token: data.token, username: data.username });

        setLoginUsername("");
        setLoginPassword("");
        setLoginError("");
      } else {
        setLoginError(data.error || "Login failed");
      }
    } catch {
      setLoginError("Network error");
    }
  }
  async function handleGoogleSuccess(response) {
  try {
    const res = await fetch(`${API_URL}/api/google-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      localStorage.setItem("name", data.name);

      setUser({
        token: data.token,
        username: data.username,
        name: data.name,
      });
    } else {
      alert(data.error || "Google login failed");
    }
  } catch (err) {
    console.error(err);
    alert("Google login error");
  }
}

  async function handleSignup() {
    if (!signupUsername || !signupPassword) {
      setSignupError("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: signupUsername,
          password: signupPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setIsLogin(true);
        setSignupUsername("");
        setSignupPassword("");
        setSignupError("");
      } else {
        setSignupError(data.error || "Signup failed");
      }
    } catch {
      setSignupError("Network error");
    }
  }

  return (
  <div className="home-wrapper">

    {/* Main content (always visible) */}
    <div className={`home-card home-layout ${!user ? "blurred" : ""}`}>
      
      {/* LEFT */}
      <div className="home-left">
        <h1 className="hero-title">
          PLAN YOUR <br />
          <span>ESCAPE</span>
        </h1>

        <p className="hero-text">
          Plan smart trips with AI-powered itineraries, optimized routes,
          and interactive maps — all in one place.
        </p>

        <button
  className="get-started-btn"
  onClick={() => {
    if (user) {
      navigate("/planner");
    } else {
      alert("Please login to continue");
    }
  }}
>
  Get Started
</button>

        <p className="app-note">Mobile app coming soon</p>
      </div>

      {/* RIGHT */}
      <div className="home-right">
        <MyTripsMockup />
      </div>
    </div>

    {/* LOGIN OVERLAY */}
    {!user && (
      <div className="auth-overlay">
        <div className="auth-card centered-auth">
          <h3>{isLogin ? "Login" : "Sign Up"}</h3>

          <input
            placeholder="Username"
            value={isLogin ? loginUsername : signupUsername}
            onChange={(e) =>
              isLogin
                ? setLoginUsername(e.target.value)
                : setSignupUsername(e.target.value)
            }
          />

          <input
            type="password"
            placeholder="Password"
            value={isLogin ? loginPassword : signupPassword}
            onChange={(e) =>
              isLogin
                ? setLoginPassword(e.target.value)
                : setSignupPassword(e.target.value)
            }
          />

          <button onClick={isLogin ? handleLogin : handleSignup}>
            {isLogin ? "Login" : "Sign Up"}
          </button>

          {(loginError || signupError) && (
            <p className="error-text">
              {loginError || signupError}
            </p>
          )}

          <p
            className="toggle-text"
            onClick={() => {
              setIsLogin(!isLogin);
              setLoginError("");
              setSignupError("");
            }}
          >
            {isLogin ? "Create account" : "Already have an account?"}
          </p>

          <GoogleLogin
  onSuccess={handleGoogleSuccess}
  onError={() => alert("Google Login Failed")}
/>

        </div>
      </div>
    )}
  </div>
);
}