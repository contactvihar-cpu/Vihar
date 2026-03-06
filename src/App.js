import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import Home from "./Home";
import Planner from "./Planner";
import Map from "./Map";
import About from "./About";
import Contact from "./Contact";
import { useState, useEffect } from "react";
import './App.css';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const name = localStorage.getItem("name");

    if (token && username) {
      setUser({ token, username, name });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("name");
    setUser(null);
  };

  return (
    <Router>
      <nav className="main-nav">
        <Link to="/">Home</Link>
        <Link to="/planner">Planner</Link>
        <Link to="/map">Map</Link>
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>

        {user && (
          <>
            <span className="ml-4 font-bold text-green-300">
              Welcome, {user.name ? user.name : user.username}
            </span>

            <button
              onClick={handleLogout}
              className="logout-btn"
            >
              Logout
            </button>
          </>
        )}
      </nav>

      <Routes>
        <Route path="/" element={<Home user={user} setUser={setUser} />} />
        <Route
          path="/planner"
          element={
            user ? <Planner user={user} onAuthError={handleLogout} /> : <Navigate to="/" />
          }
        />
        <Route path="/map" element={user ? <Map user={user} /> : <Navigate to="/" />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
