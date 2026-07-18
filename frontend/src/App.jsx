import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { LogOut, Wrench, User as UserIcon, Shield, ClipboardList, Bell } from 'lucide-react';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import OfficerDashboard from './pages/OfficerDashboard';
import AdminDashboard from './pages/AdminDashboard';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082/api';

const getWsUrl = () => {
  const apiBase = API_URL.replace(/\/api$/, '');
  if (apiBase.startsWith('https://')) {
    return apiBase.replace(/^https:\/\//, 'wss://') + '/api/ws';
  } else if (apiBase.startsWith('http://')) {
    return apiBase.replace(/^http:\/\//, 'ws://') + '/api/ws';
  }
  return 'ws://localhost:8082/api/ws';
};

export const WS_URL = getWsUrl();

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [wsUpdateTrigger, setWsUpdateTrigger] = useState(0);
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);
  const navigate = useNavigate();

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchProfile(token);
      fetchNotifications(token);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (user && token) {
      // Connect to WebSocket
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification') {
            // Add new notification
            setNotifications(prev => [
              { id: Date.now(), message: data.message, read: false, created_at: new Date().toISOString() },
              ...prev
            ]);
          } else {
            // Trigger dashboard refetch
            setWsUpdateTrigger(prev => prev + 1);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
      };

      return () => {
        ws.close();
      };
    }
  }, [user]);

  const fetchProfile = async (token) => {
    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem('token');
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async (token) => {
    try {
      const res = await fetch(`${API_URL}/notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const handleMarkAsRead = async (id) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
    fetchNotifications(token);
    navigate('/');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setNotifications([]);
    if (wsRef.current) {
      wsRef.current.close();
    }
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ color: 'var(--primary)', fontSize: '1.5rem', fontWeight: 600 }}>Loading MIVA Maintenance...</div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {user && (
        <nav className="glass-card" style={{ margin: '1rem 1.5rem', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--radius-md)', position: 'relative', zIndex: 100 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
            <Wrench size={24} color="var(--primary)" />
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.03em' }}>MIVA <span style={{ color: 'var(--primary)' }}>Maintenance</span></span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </button>

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', backgroundColor: 'var(--danger)', color: 'white', fontSize: '10px', fontWeight: 'bold', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="glass-card" style={{ position: 'absolute', right: 0, top: '45px', width: '320px', maxHeight: '400px', overflowY: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', padding: '1rem', boxShadow: 'var(--shadow-lg)', zIndex: 1000 }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Notifications</span>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setShowNotifications(false)}>Close</button>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {notifications.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>No notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => !n.read && handleMarkAsRead(n.id)}
                          style={{
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: n.read ? 'transparent' : 'rgba(99, 102, 241, 0.08)',
                            border: '1px solid',
                            borderColor: n.read ? 'transparent' : 'var(--border-glass)',
                            cursor: n.read ? 'default' : 'pointer',
                            fontSize: '0.85rem',
                            transition: 'background-color var(--transition-fast)'
                          }}
                        >
                          <div style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{n.message}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {user.role === 'admin' && <Shield size={16} color="var(--danger)" />}
              {user.role === 'officer' && <ClipboardList size={16} color="var(--success)" />}
              {user.role === 'student' && <UserIcon size={16} color="var(--primary)" />}
              {user.role === 'staff' && <UserIcon size={16} color="var(--info)" />}
              <span>{user.name} ({user.role.toUpperCase()})</span>
            </div>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </nav>
      )}

      <main style={{ flex: 1 }}>
        <Routes>
          <Route
            path="/login"
            element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" />}
          />
          <Route
            path="/register"
            element={!user ? <Register /> : <Navigate to="/" />}
          />
          <Route
            path="/"
            element={
              user ? (
                user.role === 'admin' ? (
                  <AdminDashboard user={user} wsUpdateTrigger={wsUpdateTrigger} showToast={showToast} />
                ) : user.role === 'officer' ? (
                  <OfficerDashboard user={user} wsUpdateTrigger={wsUpdateTrigger} showToast={showToast} />
                ) : (
                  <StudentDashboard user={user} wsUpdateTrigger={wsUpdateTrigger} showToast={showToast} />
                )
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', marginTop: 'auto' }}>
        &copy; {new Date().getFullYear()} MIVA Open University. All Rights Reserved.
      </footer>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
