import { createContext, useContext, useState, useEffect } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Load user on mount if token exists
  useEffect(() => {
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  async function loadUser() {
    try {
      const data = await api.getCurrentUser();
      setUser(data.user);
    } catch (err) {
      console.error('Failed to load user:', err);
      // Token invalid, clear it
      logout();
    } finally {
      setLoading(false);
    }
  }

  async function signup(email, password, name) {
    const data = await api.signup({ email, password, name });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function login(email, password) {
    const data = await api.login({ email, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  async function updateProfile(updates) {
    const data = await api.updateProfile(updates);
    setUser(data.user);
    return data;
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    signup,
    login,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}