import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import './index.css'

// SAYFALAR
import App from './App.jsx'     // Harita (Ana Uygulama)
import Login from './Login.jsx' // Giriş Sayfası

// Router ve Auth Kontrolü Yapan Ana Bileşen
function MainRouter() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase dinleyicisi: Kullanıcı durumu değişince tetiklenir
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Component ölürse dinleyiciyi kapat
    return () => unsubscribe();
  }, []);

  // Firebase cevabı gelene kadar (milisaniyelik) bekleme ekranı
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Eğer kullanıcı varsa Ana Sayfaya (/), yoksa Login'e git */}
        <Route 
          path="/login" 
          element={!user ? <Login /> : <Navigate to="/" replace />} 
        />
        
        {/* Eğer kullanıcı varsa App'i (Harita) göster, yoksa Login'e at */}
        <Route 
          path="/" 
          element={user ? <App /> : <Navigate to="/login" replace />} 
        />
        
        {/* Bilinmeyen bir rota girilirse ana sayfaya at (o da login kontrolü yapar) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MainRouter />
  </StrictMode>,
)